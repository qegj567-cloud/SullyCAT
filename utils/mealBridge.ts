// SullyOS 侧 → Chrome 扩展（SullyOS Meal Bridge）的 thin client
//
// 协议见 extension/bridge/sullyos-bridge.js。这边负责：
//   1. 检测扩展是否已注入（看 <html data-sully-meal-bridge>）
//   2. 通过 window.postMessage 发 dispatch 请求 + 收响应
//   3. 监听 progress 事件回灌给调用方
//
// 调用方拿到的是 Promise<job> + 一个 onProgress 监听机制。

export type MealBridgeStatus = 'opened' | 'searching' | 'adding' | 'done' | 'error';

export interface MealBridgeOrderItem {
  itemId: string;
  name: string;
  quantity: number;
}

export interface MealBridgeDispatchPayload {
  platform: 'eleme' | 'meituan' | 'hema';
  storeId: string;
  storeName?: string;
  items: MealBridgeOrderItem[];
}

export interface MealBridgeProgress {
  jobTabId?: number;
  status: MealBridgeStatus;
  message?: string;
  data?: any;
}

const REQ_SOURCE = 'sullyos-meal';
const RES_SOURCE = 'sullyos-meal-bridge';

export function isMealBridgeReady(): { ready: boolean; version?: string } {
  if (typeof document === 'undefined') return { ready: false };
  const ver = document.documentElement.getAttribute('data-sully-meal-bridge');
  return { ready: !!ver, version: ver || undefined };
}

let reqCounter = 0;
const newReqId = () => `mb_${Date.now().toString(36)}_${(reqCounter++).toString(36)}`;

function postOnce<T>(message: Record<string, any>, expectType: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    const requestId = newReqId();
    const handler = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== RES_SOURCE) return;
      if (d.requestId !== requestId) return;
      if (d.type !== expectType) return;
      window.removeEventListener('message', handler);
      clearTimeout(timer);
      resolve(d as T);
    };
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error(`bridge timeout: ${expectType}`));
    }, timeoutMs);
    window.addEventListener('message', handler);
    window.postMessage({ source: REQ_SOURCE, requestId, ...message }, window.location.origin);
  });
}

export async function pingMealBridge(): Promise<{ ok: boolean; version?: string; error?: string }> {
  if (!isMealBridgeReady().ready) return { ok: false, error: 'extension not detected' };
  try {
    const resp = await postOnce<{ ok: boolean; version?: string; error?: string }>(
      { type: 'ping' },
      'pong',
      2000
    );
    return resp;
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export interface MealStoredLocation {
  lat: string;
  lng: string;
  addr: string | null;
  savedAt?: number;
}

/** 拿当前扩展端持久化的 meituan 定位，没有返回 null。 */
export async function getStoredMeituanLocation(): Promise<MealStoredLocation | null> {
  if (!isMealBridgeReady().ready) return null;
  try {
    const resp = await postOnce<{ ok: boolean; data?: MealStoredLocation | null }>(
      { type: 'get_location' },
      'location_result',
      2000
    );
    return resp.ok ? resp.data || null : null;
  } catch {
    return null;
  }
}

/** 清掉扩展端持久化的 meituan 定位。下次让 char 搜店时会重新捕获。 */
export async function clearStoredMeituanLocation(): Promise<boolean> {
  if (!isMealBridgeReady().ready) return false;
  try {
    const resp = await postOnce<{ ok: boolean }>({ type: 'clear_location' }, 'location_cleared', 2000);
    return !!resp.ok;
  } catch {
    return false;
  }
}

/**
 * 让扩展打开 meituan H5 主页，用户在新 tab 里手动选地址。
 * 选完后，下次任何 scrape 都会通过 platform_location 自动回灌到 storage —
 * 用户不用做任何额外操作，回 SullyOS 让 char 搜一次店即可。
 */
export async function openMeituanForAddress(): Promise<boolean> {
  if (!isMealBridgeReady().ready) return false;
  try {
    const resp = await postOnce<{ ok: boolean }>(
      { type: 'open_for_address' },
      'opened_for_address',
      3000
    );
    return !!resp.ok;
  } catch {
    return false;
  }
}

export type MealBridgeReadTask = 'meituan_search' | 'meituan_menu';

/**
 * 走扩展在用户已登录浏览器里"读"数据。background 后台 tab 打开 H5 页面，
 * 平台 content script 抓 DOM 把结构化结果回灌过来。**完全跳过 mtgsig**。
 */
export async function readViaBridge<T = any>(
  task: MealBridgeReadTask,
  payload: any,
  timeoutMs = 25000
): Promise<T> {
  if (!isMealBridgeReady().ready) throw new Error('extension not installed');
  return new Promise<T>((resolve, reject) => {
    const requestId = newReqId();
    let settled = false;

    const handler = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== RES_SOURCE) return;
      if (d.requestId !== requestId) return;
      if (d.type !== 'read_result') return;
      if (settled) return;
      settled = true;
      cleanup();
      if (d.ok) resolve(d.data as T);
      else {
        const err: any = new Error(d.error || 'read failed');
        // 把诊断信息挂到 error 对象上，toolRunner 会读
        err.diagnostic = d.data?.diagnostic;
        reject(err);
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`read timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      window.removeEventListener('message', handler);
      clearTimeout(timer);
    }

    window.addEventListener('message', handler);
    window.postMessage(
      { source: REQ_SOURCE, requestId, type: 'read', task, payload },
      window.location.origin
    );
  });
}

export interface DispatchHandle {
  jobTabId: number;
  /** 取消监听，不影响已开标签 */
  off(): void;
}

export async function dispatchMealOrder(
  payload: MealBridgeDispatchPayload,
  onProgress: (p: MealBridgeProgress) => void
): Promise<DispatchHandle> {
  if (!isMealBridgeReady().ready) {
    throw new Error('extension not installed');
  }
  const resp = await postOnce<{ ok: boolean; jobTabId?: number; error?: string }>(
    { type: 'dispatch', payload },
    'dispatched',
    5000
  );
  if (!resp.ok || resp.jobTabId == null) {
    throw new Error(resp.error || 'dispatch failed');
  }
  const jobTabId = resp.jobTabId;

  const handler = (e: MessageEvent) => {
    const d = e.data;
    if (!d || d.source !== RES_SOURCE) return;
    if (d.type !== 'progress') return;
    if (d.jobTabId !== jobTabId) return;
    onProgress({
      jobTabId,
      status: d.status,
      message: d.message,
      data: d.data,
    });
  };
  window.addEventListener('message', handler);

  return {
    jobTabId,
    off: () => window.removeEventListener('message', handler),
  };
}
