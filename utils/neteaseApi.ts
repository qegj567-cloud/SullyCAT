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
  const body: any = {
    id: String(id),
    type: 'json',
    level: 'lossless', // 没会员服务端会自动降级
  };
  if (cookie) body.cookie = cookie;

  const data = await postJson('/song', body);
  const d = data?.data || data?.result || data || {};

  const url: string =
    d.url || d.mp3_url || d.song_url || d.songUrl ||
    d?.data?.url || d?.song?.url || '';

  if (!url) {
    const serverMsg = d.message || d.error || data?.message || '';
    // 服务端返回"成功"但没给 URL —— 多半是 VIP / 版权受限
    const looksSuccess = /成功|success|ok/i.test(serverMsg);
    const msg = looksSuccess
      ? `没拿到可播放链接${cookie ? '' : '（这首可能需要会员，去齿轮填 MUSIC_U Cookie 试试）'}`
      : (serverMsg || '未获取到可播放链接（可能是 VIP / 版权受限）');
    throw new Error(msg);
  }

  const pickLrc = (v: any) => typeof v === 'string' ? v : (v?.lyric || v?.lrc || '');
  const lyric = pickLrc(d.lyric) || pickLrc(d.lrc) || '';
  const tlyric = pickLrc(d.tlyric) || pickLrc(d.tlrc) || '';

  return {
    id: d.id ?? id,
    name: d.name || d.ar_name ? (d.name || '') : (hintMeta?.name || '未命名'),
    artist: d.ar_name || d.singer || d.artist || d.artists || hintMeta?.artist || '',
    album: d.al_name || d.album || hintMeta?.album || '',
    pic: d.pic || d.picUrl || d.picing || d.album_pic || hintMeta?.pic || '',
    url,
    lyric,
    tlyric,
    level: d.level,
  };
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
