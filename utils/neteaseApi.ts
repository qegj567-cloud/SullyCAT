// Netease 音乐解析 API 封装
// 上游：https://github.com/Suxiaoqinx/Netease_url （Flask）
// 默认使用官方示例 https://wyapi.toubiec.cn ，可由用户在 Music App 内覆盖。

const STORAGE_KEY = 'music:neteaseApiBase';
const DEFAULT_BASE = 'https://wyapi.toubiec.cn';

export const getNeteaseApiBase = (): string => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && v.trim()) return v.trim().replace(/\/+$/, '');
  } catch {}
  return DEFAULT_BASE;
};

export const setNeteaseApiBase = (base: string) => {
  try { localStorage.setItem(STORAGE_KEY, base.trim().replace(/\/+$/, '')); } catch {}
};

export interface NeteaseSearchResult {
  id: string | number;
  name: string;
  artists: string[];
  artist_string?: string;
  album?: string;
  duration?: number; // ms
  pic?: string;
}

export interface NeteaseSongDetail {
  id: string | number;
  name: string;
  artist: string;
  album?: string;
  pic?: string;
  url: string;
  lyric?: string;       // LRC 原文
  tlyric?: string;      // 翻译 LRC
  level?: string;
  size?: string | number;
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
    if (!res.ok) throw new Error(`API ${path} 返回 HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
};

// 搜索歌曲
export const searchNeteaseSongs = async (keyword: string, limit = 20): Promise<NeteaseSearchResult[]> => {
  const kw = keyword.trim();
  if (!kw) return [];
  const data = await postJson('/search', { keywords: kw, keyword: kw, limit });
  // 兼容 {data: [...]} 或 {result: {songs: [...]}}
  const raw: any[] =
    (Array.isArray(data?.data) && data.data) ||
    (Array.isArray(data?.data?.songs) && data.data.songs) ||
    (Array.isArray(data?.result?.songs) && data.result.songs) ||
    (Array.isArray(data?.songs) && data.songs) ||
    [];

  return raw.map((s: any): NeteaseSearchResult => {
    const artistNames: string[] = Array.isArray(s.artists)
      ? s.artists.map((a: any) => (typeof a === 'string' ? a : a?.name)).filter(Boolean)
      : (typeof s.artist_string === 'string' ? s.artist_string.split(/[,\/、]+/).map((x: string) => x.trim()).filter(Boolean) : []);
    return {
      id: s.id ?? s.songId ?? s.song_id,
      name: s.name || s.title || '未命名',
      artists: artistNames,
      artist_string: s.artist_string || artistNames.join(' / '),
      album: typeof s.album === 'string' ? s.album : s?.album?.name,
      duration: s.duration ?? s.dt,
      pic: s.pic || s?.album?.picUrl || s.picUrl,
    };
  }).filter(s => s.id != null);
};

// 获取歌曲详情（含可播放 URL / 歌词 / 封面）
export const getNeteaseSong = async (id: string | number, level = 'standard'): Promise<NeteaseSongDetail> => {
  const data = await postJson('/song', { id: String(id), level, type: 'json' });
  const d = data?.data || data;
  if (!d || !(d.url || d.mp3_url)) {
    throw new Error(data?.message || '未获取到可播放链接（可能为 VIP 歌曲或版权受限）');
  }
  return {
    id: d.id ?? id,
    name: d.name || d.song_name || '未命名',
    artist: d.ar_name || d.artist || d.artists || d.singer || '',
    album: d.al_name || d.album || '',
    pic: d.pic || d.picUrl || d.album_pic || '',
    url: d.url || d.mp3_url,
    lyric: typeof d.lyric === 'string' ? d.lyric : (d.lyric?.lyric || ''),
    tlyric: typeof d.tlyric === 'string' ? d.tlyric : (d.tlyric?.lyric || ''),
    level: d.level,
    size: d.size,
  };
};

// ── LRC 解析 ──
export interface LyricLine {
  time: number;   // 秒
  text: string;
  trans?: string; // 翻译
}

const parseOneLrc = (lrc: string): LyricLine[] => {
  if (!lrc) return [];
  const lines: LyricLine[] = [];
  const re = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;
  lrc.split(/\r?\n/).forEach((raw) => {
    const text = raw.replace(re, '').trim();
    if (!text) {
      // 纯时间标签也要收集，用来支持多个时间共享同一句
    }
    re.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const msRaw = m[3] ? m[3].padEnd(3, '0').slice(0, 3) : '0';
      const ms = parseInt(msRaw, 10);
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
  // 把翻译并入同一时间戳
  const transMap = new Map<string, string>();
  trans.forEach((t) => transMap.set(t.time.toFixed(2), t.text));
  return main.map((l) => {
    const tr = transMap.get(l.time.toFixed(2));
    return tr ? { ...l, trans: tr } : l;
  });
};

// 给定 LyricLine[] 和当前时间，返回当前索引（-1 表示还没到第一行）
export const findCurrentLyricIndex = (lines: LyricLine[], t: number): number => {
  if (!lines.length) return -1;
  // 二分
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
};
