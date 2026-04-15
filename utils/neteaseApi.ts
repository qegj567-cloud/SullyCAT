// Netease 音乐解析 API 封装
// 目标上游：原版 Suxiaoqinx/Netease_url（你自己部署的实例）
// - POST /search  body: {keywords, limit}
// - POST /song    body: {id, level?, type?} （可选传 cookie 或在服务端 cookie.txt 配置）
// - 如果用户提供 MUSIC_U，则随请求带上，能解锁 VIP / 无损

const BASE_KEY = 'music:neteaseApiBase';
const COOKIE_KEY = 'music:neteaseMusicU';

// 默认空，强制用户填自己部署的后端（wyapi 等公共站点鉴权机制不通用，走不通）
const DEFAULT_BASE = '';

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

export const getMusicUCookie = (): string => {
  try {
    const v = localStorage.getItem(COOKIE_KEY);
    if (v && v.trim()) return v.trim();
  } catch {}
  return '';
};

export const setMusicUCookie = (c: string) => {
  try {
    const v = (c || '').trim();
    if (v) localStorage.setItem(COOKIE_KEY, v);
    else localStorage.removeItem(COOKIE_KEY);
  } catch {}
};

export interface NeteaseSearchResult {
  id: string | number;
  name: string;
  artists: string[];
  artist_string?: string;
  album?: string;
  duration?: number;       // ms
  durationText?: string;
  pic?: string;
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
  level?: string;
}

class MissingBaseError extends Error {
  constructor() { super('尚未配置后端地址。请在电波小屋 → 齿轮 → 填入你自己部署的 Netease_url 地址。'); }
}

const postJson = async (path: string, body: any, timeoutMs = 20000): Promise<any> => {
  const base = getNeteaseApiBase();
  if (!base) throw new MissingBaseError();
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
    try { data = txt ? JSON.parse(txt) : null; } catch {}
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
  const data = await postJson('/search', { keywords: kw, keyword: kw, limit });

  // 兼容不同版本的外层结构
  const raw: any[] =
    (Array.isArray(data?.data) && data.data) ||
    (Array.isArray(data?.data?.songs) && data.data.songs) ||
    (Array.isArray(data?.result?.songs) && data.result.songs) ||
    (Array.isArray(data?.songs) && data.songs) ||
    [];

  return raw.map((s: any): NeteaseSearchResult => {
    // 艺人
    const artistNames: string[] = Array.isArray(s.artists)
      ? s.artists.map((a: any) => (typeof a === 'string' ? a : a?.name)).filter(Boolean)
      : (typeof s.singer === 'string' ? s.singer.split(/[,\/、]+/).map((x: string) => x.trim()).filter(Boolean)
      : (typeof s.artist_string === 'string' ? s.artist_string.split(/[,\/、]+/).map((x: string) => x.trim()).filter(Boolean) : []));

    const durRaw = s.duration ?? s.dt;
    const durNum = typeof durRaw === 'number' ? durRaw : durationStrToMs(durRaw);

    return {
      id: s.id ?? s.songId ?? s.song_id,
      name: s.name || s.title || '未命名',
      artists: artistNames,
      artist_string: artistNames.join(' / ') || s.singer || s.artist_string,
      album: typeof s.album === 'string' ? s.album : s?.album?.name,
      duration: durNum,
      durationText: typeof durRaw === 'string' ? durRaw : undefined,
      pic: s.pic || s.picUrl || s.picing || s?.album?.picUrl,
    };
  }).filter(s => s.id != null);
};

// ── 单曲解析 ──
export const getNeteaseSong = async (id: string | number, hintMeta?: Partial<NeteaseSongDetail>): Promise<NeteaseSongDetail> => {
  const cookie = getMusicUCookie();

  // 音质降级链：从高到低依次尝试，总有一个能出 URL
  const levels = ['lossless', 'exhigh', 'standard'];
  let lastData: any = null;
  let lastMsg = '';

  // 注意：原版 Netease_url 只从服务器 cookie.txt 读 MUSIC_U，不接受 body 里的 cookie。
  // 我们配套的 Dockerfile 用 monkey-patch 改了这个行为：优先读 body 里的 cookie 字段，
  // 这样每个用户可以填自己的 MUSIC_U。如果用了未打补丁的部署，这个字段会被忽略。
  for (const level of levels) {
    const body: any = { id: String(id), type: 'json', level };
    if (cookie) body.cookie = cookie;

    let data: any;
    try {
      data = await postJson('/song', body);
    } catch (e: any) {
      lastMsg = e?.message || '请求失败';
      continue;
    }
    lastData = data;

    const d = data?.data || data?.result || data || {};
    const url: string =
      d.url || d.mp3_url || d.song_url || d.songUrl ||
      d?.data?.url || d?.song?.url || '';

    if (url) {
      const pickLrc = (v: any) => typeof v === 'string' ? v : (v?.lyric || v?.lrc || '');
      return {
        id: d.id ?? id,
        name: d.name || hintMeta?.name || '未命名',
        artist: d.ar_name || d.singer || d.artist || d.artists || hintMeta?.artist || '',
        album: d.al_name || d.album || hintMeta?.album || '',
        pic: d.pic || d.picUrl || d.picing || d.album_pic || hintMeta?.pic || '',
        url,
        lyric: pickLrc(d.lyric) || pickLrc(d.lrc) || '',
        tlyric: pickLrc(d.tlyric) || pickLrc(d.tlrc) || '',
        level: d.level || level,
      };
    }
    // 本级无 URL，继续降级
    lastMsg = (d.message || d.error || data?.message || '') as string;
  }

  // 三级都没拿到 URL
  const looksSuccess = /成功|success|ok/i.test(lastMsg);
  if (looksSuccess || !lastMsg) {
    throw new Error(cookie
      ? '这首歌即使降级到标准音质也拿不到 URL（可能纯版权受限 / 已下架 / 区域限制）'
      : '拿不到可播放链接。如果是 VIP 歌，去齿轮填 MUSIC_U；否则可能已下架或区域限制。');
  }
  throw new Error(lastMsg);
};

// ── LRC 解析 ──
export interface LyricLine {
  time: number;
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
