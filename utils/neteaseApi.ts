// Netease 音乐解析 API 封装
// 上游：https://nextmusic.toubiec.cn （wyapi.toubiec.cn 的后端，开放 CORS）
// 接口形态与 Suxiaoqinx/Netease_url 不同，但最终效果相同：搜索 + 拿可播放 URL + 歌词。

const BASE_KEY = 'music:neteaseApiBase';
const TOKEN_KEY = 'music:neteaseToken';

// 走项目自己的 Cloudflare Worker 代理，由 worker 注入 Referer/Origin
// 绕开 nextmusic.toubiec.cn 的 401 鉴权。
// 直接从第三方域名（如 github.io）调用会被拒。
const DEFAULT_BASE = 'https://sully-n.qegj567.workers.dev/netease';
// 前端写死在 wyapi UI 里的 token。如果将来失效，用户可在电波小屋设置里覆盖。
const DEFAULT_TOKEN = 'ac22b96d9b8f0d156354609c57a78eae';

export const getNeteaseApiBase = (): string => {
  try {
    const v = localStorage.getItem(BASE_KEY);
    if (v && v.trim()) return v.trim().replace(/\/+$/, '');
  } catch {}
  return DEFAULT_BASE;
};

export const setNeteaseApiBase = (base: string) => {
  try {
    const v = (base || '').trim().replace(/\/+$/, '');
    if (v) localStorage.setItem(BASE_KEY, v);
    else localStorage.removeItem(BASE_KEY);
  } catch {}
};

export const getNeteaseToken = (): string => {
  try {
    const v = localStorage.getItem(TOKEN_KEY);
    if (v && v.trim()) return v.trim();
  } catch {}
  return DEFAULT_TOKEN;
};

export const setNeteaseToken = (tok: string) => {
  try {
    const v = (tok || '').trim();
    if (v) localStorage.setItem(TOKEN_KEY, v);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
};

export interface NeteaseSearchResult {
  id: string | number;
  name: string;
  artists: string[];
  artist_string?: string;
  album?: string;
  duration?: number;       // ms（尽量填；如果上游只有 "4:36" 字符串，这里会是 0）
  durationText?: string;   // 原始字符串（用于显示）
  pic?: string;
  free?: boolean;
}

export interface NeteaseSongDetail {
  id: string | number;
  name: string;
  artist: string;
  album?: string;
  pic?: string;
  url: string;
  lyric?: string;
  tlyric?: string;
}

const postJson = async (path: string, body: any, timeoutMs = 15000): Promise<any> => {
  const base = getNeteaseApiBase();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const txt = await res.text();
    let data: any = null;
    try { data = txt ? JSON.parse(txt) : null; } catch { /* 非 JSON 返回 */ }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || txt || `HTTP ${res.status}`;
      throw new Error(`${path} 失败：${msg}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
};

const durationStrToMs = (s: string | number | undefined): number => {
  if (typeof s === 'number') return s;
  if (!s || typeof s !== 'string') return 0;
  const m = s.match(/^(\d+):(\d+)(?:\.(\d+))?$/);
  if (!m) return 0;
  return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000 + (m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0);
};

// ── 搜索 ──
export const searchNeteaseSongs = async (keyword: string, limit = 30): Promise<NeteaseSearchResult[]> => {
  const kw = (keyword || '').trim();
  if (!kw) return [];
  const data = await postJson('/api/search', {
    keyword: kw,
    type: 1,
    limit,
    offset: 0,
    token: getNeteaseToken(),
  });

  // 兼容多种可能的外层结构
  const raw: any[] =
    (Array.isArray(data?.songs) && data.songs) ||
    (Array.isArray(data?.data?.songs) && data.data.songs) ||
    (Array.isArray(data?.result?.songs) && data.result.songs) ||
    (Array.isArray(data?.data) && data.data) ||
    [];

  return raw.map((s: any): NeteaseSearchResult => {
    const singer: string = s.singer || s.artist || (Array.isArray(s.artists) ? s.artists.map((a: any) => typeof a === 'string' ? a : a?.name).filter(Boolean).join(' / ') : '');
    const artists = singer ? singer.split(/[,\/、]+/).map((x: string) => x.trim()).filter(Boolean) : [];
    const durText = typeof s.duration === 'string' ? s.duration : undefined;
    return {
      id: s.id ?? s.songId ?? s.song_id,
      name: s.name || s.title || '未命名',
      artists,
      artist_string: singer,
      album: typeof s.album === 'string' ? s.album : s?.album?.name,
      duration: typeof s.duration === 'number' ? s.duration : durationStrToMs(durText),
      durationText: durText,
      pic: s.picing || s.pic || s.picUrl || s?.album?.picUrl,
      free: typeof s.free === 'boolean' ? s.free : undefined,
    };
  }).filter(s => s.id != null);
};

// ── 单曲解析 ──
export const getNeteaseSong = async (id: string | number, hintMeta?: Partial<NeteaseSongDetail>): Promise<NeteaseSongDetail> => {
  const data = await postJson('/api/getSongInfo', {
    id: String(id),
    token: getNeteaseToken(),
  });

  // 可能的几种外层
  const d = data?.data || data?.result || data || {};

  // url 字段尽可能兼容
  const url: string =
    d.url || d.mp3_url || d.song_url || d.songUrl ||
    d?.data?.url || d?.song?.url || '';

  if (!url) {
    const msg = d.message || d.error || data?.message || '未获取到可播放链接（可能是 VIP / 版权受限）';
    throw new Error(msg);
  }

  // 歌词字段：可能是字符串，也可能是 {lyric:string}
  const pickLrc = (v: any) => typeof v === 'string' ? v : (v?.lyric || v?.lrc || '');
  const lyric = pickLrc(d.lyric) || pickLrc(d.lrc) || '';
  const tlyric = pickLrc(d.tlyric) || pickLrc(d.tlrc) || '';

  return {
    id: d.id ?? id,
    name: d.name || d.song_name || hintMeta?.name || '未命名',
    artist: d.singer || d.ar_name || d.artist || d.artists || hintMeta?.artist || '',
    album: d.album || d.al_name || hintMeta?.album || '',
    pic: d.picing || d.pic || d.picUrl || d.album_pic || hintMeta?.pic || '',
    url,
    lyric,
    tlyric,
  };
};

// ── LRC 解析（不变） ──
export interface LyricLine {
  time: number;   // 秒
  text: string;
  trans?: string;
}

const parseOneLrc = (lrc: string): LyricLine[] => {
  if (!lrc) return [];
  const lines: LyricLine[] = [];
  const re = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;
  lrc.split(/\r?\n/).forEach((raw) => {
    const text = raw.replace(re, '').trim();
    re.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      stamps.push(min * 60 + sec + ms / 1000);
    }
    if (stamps.length && text) {
      stamps.forEach((t) => lines.push({ time: t, text }));
    }
  });
  lines.sort((a, b) => a.time - b.time);
  return lines;
};

export const parseLyric = (lrc: string, tlrc?: string): LyricLine[] => {
  const main = parseOneLrc(lrc || '');
  const trans = parseOneLrc(tlrc || '');
  if (trans.length === 0) return main;
  const transMap = new Map<string, string>();
  trans.forEach((t) => transMap.set(t.time.toFixed(2), t.text));
  return main.map((l) => {
    const tr = transMap.get(l.time.toFixed(2));
    return tr ? { ...l, trans: tr } : l;
  });
};

export const findCurrentLyricIndex = (lines: LyricLine[], t: number): number => {
  if (!lines.length) return -1;
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
};
