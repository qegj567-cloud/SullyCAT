/**
 * Config + wire-up for the optional Cloudflare Worker that accelerates
 * Proactive Chat via Web Push.  All state lives in localStorage so the
 * Service Worker and the main thread can both read it synchronously.
 *
 * When disabled or misconfigured, every function becomes a no-op and the
 * existing local-timer path in proactiveChat.ts keeps working unchanged.
 *
 * Worker URL / VAPID public key / client token are baked in here as
 * constants — end users never see them.  After deploying the Worker via
 * the Cloudflare dashboard (see worker/proactive-push/README.md), fill
 * these three values and rebuild.  VAPID public keys are meant to be
 * public; the client token is weak "through obscurity" gating for a
 * personal-scale deployment.
 */

// ═══════════════════════════════════════════════════════════════════
//   FILL THESE IN AFTER DEPLOYING THE CLOUDFLARE WORKER
//   (all three are safe to ship in the client bundle)
// ═══════════════════════════════════════════════════════════════════
const WORKER_URL = 'https://tiny-credit-9ad1.gv157167.workers.dev';
const VAPID_PUBLIC_KEY = 'BAKnuYYBsb6LXnpGApVCpMkumFqDLjZOSDmzjVPx32jIA5fbz-OWaRdk0RH8qftpVuNwzNO-l49CBEwieyezh0g';
const CLIENT_TOKEN = 'weqwqewqeqwdcsccagdgs32132';
// ═══════════════════════════════════════════════════════════════════

const ENABLED_STORAGE_KEY = 'proactive_push_enabled_v1';

export interface ProactivePushConfig {
  enabled: boolean;
  workerUrl: string;
  vapidPublicKey: string;
  clientToken: string;
}

export function loadPushConfig(): ProactivePushConfig {
  let enabled = false;
  try {
    enabled = localStorage.getItem(ENABLED_STORAGE_KEY) === 'true';
  } catch { /* ignore */ }
  return {
    enabled,
    workerUrl: WORKER_URL.trim().replace(/\/+$/, ''),
    vapidPublicKey: VAPID_PUBLIC_KEY.trim(),
    clientToken: CLIENT_TOKEN.trim(),
  };
}

/** Only the user-controlled enabled flag is persisted. URL/keys come from constants. */
export function savePushConfig(enabled: boolean) {
  try {
    localStorage.setItem(ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch { /* ignore */ }
}

/** True if constants are filled AND the user toggle is on. */
export function isPushConfigReady(cfg: ProactivePushConfig = loadPushConfig()): boolean {
  return cfg.enabled
    && cfg.workerUrl.startsWith('https://')
    && cfg.vapidPublicKey.length > 80;
}

/** True if the deployment constants have been filled in (regardless of toggle). */
export function isPushConfigAvailable(): boolean {
  return WORKER_URL.startsWith('https://') && VAPID_PUBLIC_KEY.length > 80;
}

// ---------- Web Push subscription helpers ----------

/** Convert base64url string to Uint8Array (for VAPID applicationServerKey). */
function b64uToBytes(b64u: string): Uint8Array {
  const padded = b64u.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (b64u.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64u(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface SubscriptionInfo {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function getOrCreateSubscription(vapidPublicKey: string): Promise<SubscriptionInfo | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  if (sub) {
    // If an old subscription exists with a different VAPID key, we'd get
    // errors on send — re-subscribe in that case.
    try {
      const existingKey = bytesToB64u(sub.options.applicationServerKey);
      if (existingKey && existingKey !== vapidPublicKey) {
        await sub.unsubscribe();
        sub = null;
      }
    } catch {
      // Fall through; try to reuse.
    }
  }

  if (!sub) {
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return null;
    } else if (Notification.permission === 'denied') {
      return null;
    }
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64uToBytes(vapidPublicKey),
      });
    } catch (e) {
      console.warn('[ProactivePush] pushManager.subscribe failed', e);
      return null;
    }
  }

  const p256dh = bytesToB64u(sub.getKey('p256dh'));
  const auth = bytesToB64u(sub.getKey('auth'));
  if (!p256dh || !auth) return null;
  return { endpoint: sub.endpoint, p256dh, auth };
}

function buildHeaders(cfg: ProactivePushConfig): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.clientToken) headers['X-Client-Token'] = cfg.clientToken;
  return headers;
}

/**
 * Register or update a schedule on the Worker.  Returns true on success.
 * Failures are swallowed — the local-timer path still works regardless.
 */
export async function registerScheduleOnWorker(charId: string, intervalMs: number): Promise<boolean> {
  const cfg = loadPushConfig();
  if (!isPushConfigReady(cfg)) return false;

  const sub = await getOrCreateSubscription(cfg.vapidPublicKey);
  if (!sub) return false;

  try {
    const res = await fetch(`${cfg.workerUrl}/subscribe`, {
      method: 'POST',
      headers: buildHeaders(cfg),
      body: JSON.stringify({
        subscription: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        charId,
        intervalMs,
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn('[ProactivePush] /subscribe failed', e);
    return false;
  }
}

export async function unregisterScheduleOnWorker(charId: string): Promise<boolean> {
  const cfg = loadPushConfig();
  if (!isPushConfigReady(cfg)) return false;

  const reg = await navigator.serviceWorker?.ready?.catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return false;

  try {
    const res = await fetch(`${cfg.workerUrl}/unsubscribe`, {
      method: 'POST',
      headers: buildHeaders(cfg),
      body: JSON.stringify({ endpoint: sub.endpoint, charId }),
    });
    return res.ok;
  } catch (e) {
    console.warn('[ProactivePush] /unsubscribe failed', e);
    return false;
  }
}

async function sendHeartbeat(cfg: ProactivePushConfig): Promise<void> {
  const reg = await navigator.serviceWorker?.ready?.catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;

  try {
    await fetch(`${cfg.workerUrl}/heartbeat`, {
      method: 'POST',
      headers: buildHeaders(cfg),
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch {
    // Heartbeat failures are expected occasionally (offline, Worker restart);
    // the Worker will simply stop firing after the window closes and pick
    // back up when the next successful heartbeat arrives.
  }
}

// ---------- Heartbeat timer (2-min cadence while any schedule is active) ----------

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let visListener: (() => void) | null = null;

function shouldHeartbeat(): boolean {
  const cfg = loadPushConfig();
  if (!isPushConfigReady(cfg)) return false;
  // Only heartbeat while the tab is visible — the whole point is "app is alive".
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
  return true;
}

async function heartbeatTick() {
  if (!shouldHeartbeat()) return;
  const cfg = loadPushConfig();
  await sendHeartbeat(cfg);
}

export function startHeartbeat() {
  if (heartbeatTimer) return;
  const cfg = loadPushConfig();
  if (!isPushConfigReady(cfg)) return;

  // Fire one immediately so the Worker knows we're alive right now.
  void heartbeatTick();
  heartbeatTimer = setInterval(heartbeatTick, HEARTBEAT_INTERVAL_MS);

  if (typeof document !== 'undefined' && !visListener) {
    visListener = () => {
      if (document.visibilityState === 'visible') void heartbeatTick();
    };
    document.addEventListener('visibilitychange', visListener);
  }
}

export function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (visListener && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visListener);
    visListener = null;
  }
}
