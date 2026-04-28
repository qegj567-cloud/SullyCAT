/**
 * ACE-Step song synthesis via Replicate (lucataco/ace-step).
 *
 * Flow:
 *   1. POST /replicate/models/lucataco/ace-step/predictions  → start a prediction
 *   2. GET  /replicate/predictions/:id                       → poll until succeeded
 *   3. GET  /replicate/file?url=...                          → download the produced
 *      audio through the worker (replicate.delivery is slow / blocked in CN).
 *
 * The user's Replicate token is sent as Authorization: Bearer; the worker
 * forwards it untouched. We never persist it anywhere — same trust model as
 * MiniMax TTS.
 */

import { SongSheet, SongLine, APIConfig } from '../types';
import { SECTION_LABELS } from './songPrompts';
import { DB } from './db';

// ── Endpoint config ──
// Same Cloudflare Worker domain that hosts /netease, /xhs, /webdav etc.
const WORKER_BASE = 'https://sullymeow.ccwu.cc';
// Replicate model slug. Using the model-prediction endpoint means we always
// pick up the latest published version automatically — no manual pinning.
const MODEL_OWNER = 'lucataco';
const MODEL_NAME = 'ace-step';

// Replicate predictions can take a while on cold starts; bound the total wait.
const POLL_TIMEOUT_MS = 5 * 60 * 1000;     // 5 min hard cap
const POLL_INTERVAL_MS = 2000;             // start at 2s
const POLL_INTERVAL_MAX_MS = 5000;         // cap at 5s

// ── Cache helpers (mirrors ttsCache.ts shape) ──

function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function stableStringify(value: any): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

export function hashSongInputs(input: AceStepInput): string {
  return 'acestep_' + cyrb53(stableStringify(input));
}

// ── Voice presets ──
// Tag-based voice control. ACE-Step responds well to natural-language voice
// descriptors mixed into the style tag string. We're explicitly NOT exposing
// the experimental ref_audio_input (audio2audio) field on lucataco's Replicate
// build — community reports it's flaky as of late 2025.

export interface VoicePreset {
  id: string;
  label: string;
  emoji: string;
  tags: string;
  /** When set, this preset is auto-picked from a CharacterProfile.gender. */
  autoFromGender?: 'male' | 'female';
}

export const VOICE_PRESETS: VoicePreset[] = [
  { id: 'auto',         label: '随风格', emoji: '🎲', tags: '' },
  { id: 'female-sweet', label: '甜美女声', emoji: '🎀', tags: 'female vocal, sweet, clear, bright', autoFromGender: 'female' },
  { id: 'female-soft',  label: '气声女声', emoji: '🌸', tags: 'female vocal, breathy, soft, whisper' },
  { id: 'female-rock',  label: '摇滚女声', emoji: '🔥', tags: 'female vocal, powerful, rock, energetic' },
  { id: 'male-deep',    label: '磁性男声', emoji: '🎙️', tags: 'male vocal, deep, mellow, husky', autoFromGender: 'male' },
  { id: 'male-high',    label: '高亢男声', emoji: '⚡', tags: 'male vocal, high pitch, clear, bright' },
  { id: 'male-soft',    label: '气声男声', emoji: '🌊', tags: 'male vocal, breathy, soft, intimate' },
  { id: 'child',        label: '童声',     emoji: '🍬', tags: 'child vocal, innocent, light' },
  { id: 'duet',         label: '男女对唱', emoji: '💕', tags: 'duet, male and female vocals, harmony' },
];

export const getVoicePreset = (id: string | undefined | null): VoicePreset =>
  VOICE_PRESETS.find(p => p.id === id) || VOICE_PRESETS[0];

/** Pick a sensible default voice from a character's gender. Falls back to 'auto'. */
export const inferVoicePresetFromGender = (gender: string | undefined): string => {
  const g = (gender || '').toLowerCase();
  if (g === 'female' || g === 'f' || g === '女' || g.includes('female')) return 'female-sweet';
  if (g === 'male' || g === 'm' || g === '男' || g.includes('male')) return 'male-deep';
  return 'auto';
};

interface CacheEntry {
  blob: Blob;
  mimeType: string;
  createdAt: number;
  lastUsedAt: number;
}

async function getCachedSong(key: string): Promise<CacheEntry | null> {
  try {
    const entry = (await DB.getAssetRaw(key)) as CacheEntry | null;
    if (!entry || !(entry.blob instanceof Blob)) return null;
    DB.saveAssetRaw(key, { ...entry, lastUsedAt: Date.now() }).catch(() => { /* ignore */ });
    return entry;
  } catch {
    return null;
  }
}

async function saveCachedSong(key: string, blob: Blob, mimeType: string): Promise<void> {
  try {
    const now = Date.now();
    const entry: CacheEntry = { blob, mimeType, createdAt: now, lastUsedAt: now };
    await DB.saveAssetRaw(key, entry);
  } catch (e) {
    console.warn('[ACE-Step cache] save failed', e);
  }
}

/** Read a previously-saved audio blob (used by Songwriting App on app reload). */
export async function loadSongAudioBlob(assetKey: string): Promise<{ blob: Blob; mimeType: string } | null> {
  const entry = await getCachedSong(assetKey);
  if (!entry) return null;
  return { blob: entry.blob, mimeType: entry.mimeType };
}

// ── Lyric / tag formatting ──

const GENRE_TAG_HINTS: Record<string, string> = {
  pop: 'pop',
  rock: 'rock',
  ballad: 'ballad, soft, emotional',
  rap: 'rap, hip-hop',
  folk: 'folk, acoustic',
  electronic: 'electronic, edm, synth',
  jazz: 'jazz, smooth',
  rnb: 'r&b, soul',
  free: '',
};

const MOOD_TAG_HINTS: Record<string, string> = {
  happy: 'upbeat, bright',
  sad: 'melancholy, sad',
  romantic: 'romantic, tender',
  angry: 'intense, aggressive',
  chill: 'chill, lo-fi, relaxed',
  epic: 'epic, cinematic',
  nostalgic: 'nostalgic, vintage',
  dreamy: 'dreamy, ambient',
};

/**
 * Build the comma-separated style tag string ACE-Step expects from the song's
 * genre / mood / bpm / key, with an optional voice preset prepended so the
 * timbre tags dominate the prompt.
 */
export function buildAceStepTags(song: SongSheet, voicePresetId?: string): string {
  const parts: string[] = [];
  const voice = getVoicePreset(voicePresetId);
  if (voice.tags) parts.push(voice.tags);
  const genre = GENRE_TAG_HINTS[song.genre];
  if (genre) parts.push(genre);
  const mood = MOOD_TAG_HINTS[song.mood];
  if (mood) parts.push(mood);
  if (song.bpm && song.bpm > 0) parts.push(`${song.bpm} bpm`);
  if (song.key) parts.push(song.key.toLowerCase());
  return parts.join(', ');
}

/**
 * Convert SongLines into the "[section]\nline\nline\n[section]\nline\n" lyric
 * format ACE-Step expects. Draft lines are excluded so previews and final
 * renders share the same source of truth as the booklet view.
 */
export function buildAceStepLyrics(lines: SongLine[]): string {
  const finalLines = lines.filter(l => !l.isDraft);
  if (finalLines.length === 0) return '';

  let out = '';
  let currentSection = '';
  for (const line of finalLines) {
    if (line.section !== currentSection) {
      currentSection = line.section;
      // ACE-Step recognizes inline tags like [verse], [chorus], [bridge]…
      // Map our internal labels through the simplest token Replicate's docs use.
      const tag = currentSection === 'pre-chorus' ? 'pre-chorus' : currentSection;
      out += `${out ? '\n\n' : ''}[${tag}]\n`;
    }
    out += `${line.content}\n`;
  }
  return out.trim();
}

// ── Public API ──

export interface AceStepInput {
  tags: string;
  lyrics: string;
  duration?: number; // seconds; -1 = auto
  scheduler?: string;
  guidance_scale?: number;
  infer_step?: number;
  seed?: number;
}

export interface SynthesizeOptions {
  signal?: AbortSignal;
  /** Called with the latest Replicate prediction status while polling. */
  onStatus?: (status: string, progress?: number) => void;
}

export interface SynthesizeResult {
  /** A blob: URL ready for <audio src=...>. Revoke with URL.revokeObjectURL when done. */
  url: string;
  blob: Blob;
  mimeType: string;
  /** IndexedDB key under which the blob is persisted (also serves as cache key). */
  assetKey: string;
  /** True if the result came from cache and no Replicate call was made. */
  cached: boolean;
}

class AbortError extends Error {
  constructor() { super('aborted'); this.name = 'AbortError'; }
}

const checkAbort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new AbortError();
};

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new AbortError());
  const t = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  const onAbort = () => { clearTimeout(t); reject(new AbortError()); };
  signal?.addEventListener('abort', onAbort, { once: true });
});

const guessMimeFromUrl = (url: string): string => {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return 'audio/mpeg';
};

const extractOutputUrl = (output: unknown): string | null => {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (typeof item === 'string') return item;
    }
  }
  if (typeof output === 'object') {
    const o = output as Record<string, unknown>;
    for (const key of ['audio', 'audio_url', 'url', 'path']) {
      const v = o[key];
      if (typeof v === 'string') return v;
    }
  }
  return null;
};

// ── Resolve the latest version hash for a community model ──
// Replicate's simplified `/v1/models/{owner}/{name}/predictions` endpoint
// only works for "official models" (FLUX etc.). For community models like
// lucataco/ace-step we have to:
//   1. GET /v1/models/{owner}/{name}    → pull latest_version.id
//   2. POST /v1/predictions { version, input } → start
// Cache the version hash for 24h so we don't pay an extra round-trip per call.
const VERSION_CACHE_KEY = `ace-step:version:${MODEL_OWNER}/${MODEL_NAME}`;
const VERSION_CACHE_TTL = 24 * 60 * 60 * 1000;

async function resolveModelVersion(authHeader: string, signal?: AbortSignal): Promise<string> {
  try {
    const raw = localStorage.getItem(VERSION_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version && Date.now() - (parsed.fetchedAt || 0) < VERSION_CACHE_TTL) {
        return String(parsed.version);
      }
    }
  } catch { /* ignore — refetch */ }

  const res = await fetch(`${WORKER_BASE}/replicate/models/${MODEL_OWNER}/${MODEL_NAME}`, {
    method: 'GET',
    headers: { 'Authorization': authHeader },
    signal,
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`获取模型信息失败 (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const detail = data?.detail || data?.error || `HTTP ${res.status}`;
    throw new Error(`无法访问 ${MODEL_OWNER}/${MODEL_NAME}: ${detail}`);
  }
  const version: string | undefined = data?.latest_version?.id;
  if (!version) {
    throw new Error('Replicate 没返回模型版本信息');
  }
  try {
    localStorage.setItem(VERSION_CACHE_KEY, JSON.stringify({ version, fetchedAt: Date.now() }));
  } catch { /* ignore — non-fatal */ }
  return version;
}

/**
 * Generate a full song with vocals + accompaniment via ACE-Step on Replicate.
 * Throws AbortError if `options.signal` is aborted, or Error with a human-readable
 * message on any failure.
 */
export async function synthesizeSong(
  input: AceStepInput,
  apiConfig: APIConfig,
  options: SynthesizeOptions = {},
): Promise<SynthesizeResult> {
  const { signal, onStatus } = options;
  const apiKey = (apiConfig.aceStepApiKey || '').trim();
  if (!apiKey) throw new Error('请先在「设置」里填 Replicate API Token (r8_xxx)');
  if (!input.tags && !input.lyrics) {
    throw new Error('歌词和风格至少需要一个');
  }

  const cacheKey = hashSongInputs(input);
  const cached = await getCachedSong(cacheKey);
  if (cached) {
    onStatus?.('cached', 1);
    return {
      url: URL.createObjectURL(cached.blob),
      blob: cached.blob,
      mimeType: cached.mimeType,
      assetKey: cacheKey,
      cached: true,
    };
  }

  const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;

  // ── 0. Resolve latest model version (cached 24h) ──
  onStatus?.('resolving', 0);
  const version = await resolveModelVersion(authHeader, signal);

  // ── 1. Start the prediction via /v1/predictions (version-pinned) ──
  onStatus?.('starting', 0);
  checkAbort(signal);

  const startBody = {
    version,
    input: {
      tags: input.tags,
      lyrics: input.lyrics,
      ...(typeof input.duration === 'number' ? { duration: input.duration } : {}),
      ...(input.scheduler ? { scheduler: input.scheduler } : {}),
      ...(typeof input.guidance_scale === 'number' ? { guidance_scale: input.guidance_scale } : {}),
      ...(typeof input.infer_step === 'number' ? { infer_step: input.infer_step } : {}),
      ...(typeof input.seed === 'number' ? { seed: input.seed } : {}),
    },
  };

  const startRes = await fetch(`${WORKER_BASE}/replicate/predictions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify(startBody),
    signal,
  });
  let startData: any;
  try {
    startData = await startRes.json();
  } catch {
    const text = await startRes.text().catch(() => '');
    throw new Error(`Replicate 起任务返回非 JSON (HTTP ${startRes.status}): ${text.slice(0, 200)}`);
  }
  if (!startRes.ok) {
    const detail = startData?.detail || startData?.error || JSON.stringify(startData).slice(0, 200);
    throw new Error(`Replicate 起任务失败 (HTTP ${startRes.status}): ${detail}`);
  }
  const predictionId: string | undefined = startData?.id;
  if (!predictionId) throw new Error('Replicate 没返回 prediction id');

  // ── 2. Poll until succeeded / failed / canceled ──
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let interval = POLL_INTERVAL_MS;
  let outputUrl: string | null = null;

  while (true) {
    checkAbort(signal);
    if (Date.now() > deadline) {
      throw new Error('Replicate 任务超时（>5 分钟）');
    }
    await sleep(interval, signal);
    interval = Math.min(interval + 500, POLL_INTERVAL_MAX_MS);

    const pollRes = await fetch(`${WORKER_BASE}/replicate/predictions/${encodeURIComponent(predictionId)}`, {
      method: 'GET',
      headers: { 'Authorization': authHeader },
      signal,
    });
    let pollData: any;
    try {
      pollData = await pollRes.json();
    } catch {
      // Transient parse failures shouldn't kill the whole job
      continue;
    }
    const status = String(pollData?.status || '');
    onStatus?.(status);

    if (status === 'succeeded') {
      outputUrl = extractOutputUrl(pollData?.output);
      if (!outputUrl) {
        throw new Error('Replicate 任务成功但没找到音频 URL');
      }
      break;
    }
    if (status === 'failed') {
      throw new Error(`Replicate 任务失败: ${pollData?.error || 'unknown'}`);
    }
    if (status === 'canceled') {
      throw new Error('Replicate 任务被取消');
    }
    // 'starting' / 'processing' → keep polling
  }

  // ── 3. Download the produced audio through the worker ──
  onStatus?.('downloading');
  checkAbort(signal);
  const fileRes = await fetch(`${WORKER_BASE}/replicate/file?url=${encodeURIComponent(outputUrl)}`, {
    method: 'GET',
    signal,
  });
  if (!fileRes.ok) {
    throw new Error(`下载音频失败 (HTTP ${fileRes.status})`);
  }
  const mimeType = fileRes.headers.get('Content-Type') || guessMimeFromUrl(outputUrl);
  const blob = await fileRes.blob();
  if (!blob.size) throw new Error('下载音频为空文件');

  // ── 4. Cache & return ──
  saveCachedSong(cacheKey, blob, mimeType).catch(() => { /* ignore */ });
  onStatus?.('done', 1);

  return {
    url: URL.createObjectURL(blob),
    blob,
    mimeType,
    assetKey: cacheKey,
    cached: false,
  };
}
