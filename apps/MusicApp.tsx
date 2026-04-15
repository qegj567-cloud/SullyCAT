
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../context/OSContext';
import {
  MagnifyingGlass,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  MusicNotes,
  Gear,
  X,
  Heart,
  ArrowLeft,
  Queue,
  CaretDown,
} from '@phosphor-icons/react';

// ------------------------- 本地存储 -------------------------
const LS_CFG_KEY = 'sully_music_cfg_v1';
const DEFAULT_WORKER = 'https://sully-n.qegj567.workers.dev';

interface MusicCfg {
  workerUrl: string;
  cookie: string;      // 只需 MUSIC_U=xxx
  quality: 'standard' | 'higher' | 'exhigh' | 'lossless' | 'hires';
}

const defaultCfg: MusicCfg = {
  workerUrl: DEFAULT_WORKER,
  cookie: '',
  quality: 'exhigh',
};

const loadCfg = (): MusicCfg => {
  try {
    const raw = localStorage.getItem(LS_CFG_KEY);
    if (!raw) return defaultCfg;
    return { ...defaultCfg, ...JSON.parse(raw) };
  } catch { return defaultCfg; }
};

const saveCfg = (cfg: MusicCfg) => {
  try { localStorage.setItem(LS_CFG_KEY, JSON.stringify(cfg)); } catch {}
};

// ------------------------- 数据类型 -------------------------
interface Song {
  id: number;
  name: string;
  artists: string;
  album: string;
  albumPic: string;
  duration: number;
  fee: number; // 0 免费 / 1 VIP / 4 专辑购买
}

interface LyricLine { t: number; text: string; }

// ------------------------- 工具 -------------------------
const fmtTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
};

const parseLyric = (txt: string): LyricLine[] => {
  if (!txt) return [];
  const out: LyricLine[] = [];
  const re = /\[(\d+):(\d+)(?:\.(\d+))?\](.*)/;
  for (const line of txt.split(/\r?\n/)) {
    const m = re.exec(line);
    if (!m) continue;
    const mm = parseInt(m[1], 10);
    const ss = parseInt(m[2], 10);
    const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
    const text = m[4].trim();
    if (!text) continue;
    out.push({ t: mm * 60 + ss + ms / 1000, text });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
};

// 自动补齐 MUSIC_U= 前缀, 容错用户只贴 value 的情况
const normalizeCookie = (raw: string): string => {
  const s = (raw || '').trim();
  if (!s) return '';
  if (s.toUpperCase().startsWith('MUSIC_U=')) return s;
  // 只贴了 value? 加个 key 进去
  return `MUSIC_U=${s}`;
};

// ------------------------- API 封装 -------------------------
const api = {
  async call(cfg: MusicCfg, path: string, body: any) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const cookie = normalizeCookie(cfg.cookie);
    if (cookie) headers['X-Netease-Cookie'] = cookie;
    const res = await fetch(`${cfg.workerUrl.replace(/\/+$/, '')}/netease${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || j?.message || `HTTP ${res.status}`);
    return j;
  },
  search(cfg: MusicCfg, keyword: string, offset = 0) {
    return api.call(cfg, '/search', { keyword, limit: 30, offset, type: 1 });
  },
  songUrl(cfg: MusicCfg, id: number) {
    return api.call(cfg, '/song/url', { ids: [id], level: cfg.quality });
  },
  lyric(cfg: MusicCfg, id: number) {
    return api.call(cfg, '/lyric', { id });
  },
  loginStatus(cfg: MusicCfg) {
    return api.call(cfg, '/login/status', {});
  },
};

// ------------------------- 主组件 -------------------------
const MusicApp: React.FC = () => {
  const { closeApp, addToast } = useOS();
  const [cfg, setCfg] = useState<MusicCfg>(loadCfg);
  const [view, setView] = useState<'search' | 'settings' | 'player'>('search');

  // 搜索
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);

  // 播放列表/当前播放
  const [queue, setQueue] = useState<Song[]>([]);
  const [idx, setIdx] = useState(-1);
  const current = idx >= 0 ? queue[idx] : null;

  // 播放器状态
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingSong, setLoadingSong] = useState(false);

  // 歌词
  const [lyric, setLyric] = useState<LyricLine[]>([]);
  const [tlyric, setTlyric] = useState<LyricLine[]>([]);
  const lyricBoxRef = useRef<HTMLDivElement | null>(null);
  const activeLyricIdx = useMemo(() => {
    if (!lyric.length) return -1;
    let i = 0;
    for (let k = 0; k < lyric.length; k++) if (lyric[k].t <= progress) i = k; else break;
    return i;
  }, [lyric, progress]);

  // 登录显示
  const [userName, setUserName] = useState<string | null>(null);

  // 初始化 audio
  useEffect(() => {
    const a = new Audio();
    a.preload = 'metadata';
    a.addEventListener('play', () => setPlaying(true));
    a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('timeupdate', () => setProgress(a.currentTime));
    a.addEventListener('loadedmetadata', () => setDuration(a.duration));
    a.addEventListener('ended', () => nextSong());
    a.addEventListener('error', () => {
      setPlaying(false);
      addToast('播放失败，可能需要会员或换个音质', 'error');
    });
    audioRef.current = a;
    return () => { try { a.pause(); a.src = ''; } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 检查登录
  useEffect(() => {
    if (!cfg.cookie) { setUserName(null); return; }
    api.loginStatus(cfg).then((r) => {
      const p = r?.data?.profile;
      setUserName(p?.nickname || null);
    }).catch(() => setUserName(null));
  }, [cfg.cookie, cfg.workerUrl]);

  // 歌词自动滚动
  useEffect(() => {
    if (view !== 'player') return;
    const box = lyricBoxRef.current;
    if (!box || activeLyricIdx < 0) return;
    const el = box.querySelector<HTMLDivElement>(`[data-lyric-idx="${activeLyricIdx}"]`);
    if (el) {
      const targetTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
      box.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
  }, [activeLyricIdx, view]);

  // ------ 动作 ------
  const doSearch = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) return;
    setSearching(true);
    try {
      const r = await api.search(cfg, kw);
      const songs: Song[] = (r?.result?.songs || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        artists: (s.ar || s.artists || []).map((a: any) => a.name).join(' / '),
        album: s.al?.name || s.album?.name || '',
        albumPic: s.al?.picUrl || s.album?.picUrl || '',
        duration: (s.dt || s.duration || 0) / 1000,
        fee: s.fee ?? 0,
      }));
      setResults(songs);
      if (!songs.length) {
        // 把网易云真实返回告诉用户, 方便排查 (code/msg/abroad 等)
        const hint = r?.msg || r?.message || (r?.code != null ? `code=${r.code}` : '') || (r?.error ? `error=${r.error}` : '') || '无数据';
        addToast(`没拿到歌: ${hint}`, 'info');
        try { console.warn('[MusicApp] search raw response:', r); } catch {}
      }
    } catch (e: any) {
      addToast(`搜索失败：${e.message}`, 'error');
    } finally {
      setSearching(false);
    }
  }, [keyword, cfg, addToast]);

  const playSong = useCallback(async (song: Song, alsoSetQueue = true) => {
    if (alsoSetQueue) {
      const existing = queue.findIndex(s => s.id === song.id);
      if (existing >= 0) {
        setIdx(existing);
      } else {
        setQueue(q => [...q, song]);
        setIdx(queue.length);
      }
    }
    setLoadingSong(true);
    setLyric([]); setTlyric([]); setProgress(0); setDuration(0);
    try {
      const [urlRes, lyricRes] = await Promise.all([
        api.songUrl(cfg, song.id),
        api.lyric(cfg, song.id).catch(() => null),
      ]);
      const entry = urlRes?.data?.[0];
      const url: string | null = entry?.url || null;
      if (!url) {
        const reason = entry?.fee && !cfg.cookie ? '这首歌需要会员 cookie' : '暂无可用播放地址';
        addToast(reason, 'error');
        setLoadingSong(false);
        return;
      }
      const a = audioRef.current!;
      a.src = url;
      a.play().catch(() => {});
      if (lyricRes) {
        setLyric(parseLyric(lyricRes?.lrc?.lyric || ''));
        setTlyric(parseLyric(lyricRes?.tlyric?.lyric || ''));
      }
    } catch (e: any) {
      addToast(`播放失败：${e.message}`, 'error');
    } finally {
      setLoadingSong(false);
    }
  }, [cfg, queue, addToast]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current; if (!a || !a.src) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }, []);

  const nextSong = useCallback(() => {
    if (idx < 0 || !queue.length) return;
    const n = (idx + 1) % queue.length;
    setIdx(n);
    playSong(queue[n], false);
  }, [idx, queue, playSong]);

  const prevSong = useCallback(() => {
    if (idx < 0 || !queue.length) return;
    const n = (idx - 1 + queue.length) % queue.length;
    setIdx(n);
    playSong(queue[n], false);
  }, [idx, queue, playSong]);

  const seek = (pct: number) => {
    const a = audioRef.current; if (!a || !duration) return;
    a.currentTime = Math.max(0, Math.min(duration, duration * pct));
  };

  // ------ 渲染 ------
  const Header: React.FC<{ title: string; right?: React.ReactNode; onBack?: () => void }> = ({ title, right, onBack }) => (
    <div className="flex items-center justify-between px-4 h-12 shrink-0 border-b border-white/10 bg-black/20 backdrop-blur">
      <button className="text-white/80 hover:text-white" onClick={onBack || closeApp}>
        {onBack ? <ArrowLeft size={22} weight="bold" /> : <X size={22} weight="bold" />}
      </button>
      <div className="text-white font-medium text-sm">{title}</div>
      <div className="w-6 flex justify-end">{right}</div>
    </div>
  );

  const renderSearch = () => (
    <div className="flex flex-col h-full bg-gradient-to-b from-rose-900 via-rose-950 to-black text-white">
      <Header
        title="网易云音乐"
        right={<button onClick={() => setView('settings')} className="text-white/80 hover:text-white"><Gear size={20} weight="bold" /></button>}
      />
      <div className="px-4 py-3 shrink-0">
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
            <MagnifyingGlass size={16} />
            <input
              className="flex-1 bg-transparent outline-none text-sm placeholder-white/40"
              placeholder="搜索歌曲 / 歌手"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
            />
          </div>
          <button
            onClick={doSearch}
            disabled={searching}
            className="px-4 py-2 rounded-full bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-sm font-medium"
          >{searching ? '…' : '搜'}</button>
        </div>
        {userName && <div className="mt-2 text-xs text-white/60">已登录：{userName} · 音质 {cfg.quality}</div>}
        {!cfg.cookie && <div className="mt-2 text-xs text-amber-300/80">未填会员 Cookie，仅能播放免费歌曲。点右上齿轮设置。</div>}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-28">
        {results.length === 0 && !searching && (
          <div className="text-center text-white/40 text-sm mt-16">输入关键词，回车搜索</div>
        )}
        {results.map((s) => (
          <button
            key={s.id}
            onClick={() => playSong(s)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 transition ${current?.id === s.id ? 'bg-white/10' : ''}`}
          >
            <img src={s.albumPic} alt="" className="w-11 h-11 rounded-md bg-white/10 object-cover shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1 text-sm text-white truncate">
                {s.fee === 1 && <span className="text-[10px] px-1 rounded bg-amber-500/80 text-black font-bold">VIP</span>}
                <span className="truncate">{s.name}</span>
              </div>
              <div className="text-xs text-white/50 truncate">{s.artists} · {s.album}</div>
            </div>
            <div className="text-xs text-white/40 shrink-0">{fmtTime(s.duration)}</div>
          </button>
        ))}
      </div>

      {/* MiniPlayer */}
      {current && (
        <button
          onClick={() => setView('player')}
          className="absolute left-2 right-2 bottom-2 flex items-center gap-3 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-2 shadow-lg"
        >
          <img src={current.albumPic} alt="" className="w-10 h-10 rounded-lg object-cover" />
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm text-white truncate">{current.name}</div>
            <div className="text-xs text-white/50 truncate">{current.artists}</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); prevSong(); }} className="p-1 text-white/70 hover:text-white"><SkipBack size={18} weight="fill" /></button>
          <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="p-1 text-white">
            {playing ? <Pause size={22} weight="fill" /> : <Play size={22} weight="fill" />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); nextSong(); }} className="p-1 text-white/70 hover:text-white"><SkipForward size={18} weight="fill" /></button>
        </button>
      )}
    </div>
  );

  const renderPlayer = () => {
    if (!current) return null;
    return (
      <div
        className="flex flex-col h-full text-white relative overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.9)), url(${current.albumPic})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <Header title="正在播放" onBack={() => setView('search')} />
        <div className="flex-1 flex flex-col items-center justify-between py-6 px-6">
          <div className="flex flex-col items-center gap-3 shrink-0">
            <img src={current.albumPic} alt="" className={`w-48 h-48 rounded-2xl object-cover shadow-2xl transition-transform ${playing ? 'scale-100' : 'scale-95'}`} />
            <div className="text-center">
              <div className="text-lg font-medium">{current.name}</div>
              <div className="text-sm text-white/60">{current.artists}</div>
            </div>
          </div>

          {/* 歌词 */}
          <div
            ref={lyricBoxRef}
            className="flex-1 w-full my-4 overflow-y-auto text-center text-sm scroll-smooth"
            style={{ maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)' }}
          >
            {lyric.length === 0 ? (
              <div className="text-white/40 pt-8">{loadingSong ? '加载中…' : '暂无歌词'}</div>
            ) : (
              <div className="space-y-3 py-16">
                {lyric.map((l, i) => {
                  const tr = tlyric.find(t => Math.abs(t.t - l.t) < 0.2);
                  return (
                    <div
                      key={i}
                      data-lyric-idx={i}
                      className={`transition-all duration-300 ${i === activeLyricIdx ? 'text-white text-base scale-105' : 'text-white/40'}`}
                    >
                      <div>{l.text}</div>
                      {tr && <div className="text-xs opacity-70">{tr.text}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 进度 */}
          <div className="w-full shrink-0">
            <div
              className="relative h-1 bg-white/20 rounded-full cursor-pointer"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                seek((e.clientX - rect.left) / rect.width);
              }}
            >
              <div className="absolute inset-y-0 left-0 bg-white/90 rounded-full" style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }} />
            </div>
            <div className="flex justify-between text-xs text-white/50 mt-1">
              <span>{fmtTime(progress)}</span>
              <span>{fmtTime(duration)}</span>
            </div>

            <div className="flex items-center justify-center gap-8 mt-4">
              <button onClick={prevSong} className="text-white/80 hover:text-white"><SkipBack size={28} weight="fill" /></button>
              <button onClick={togglePlay} className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90">
                {loadingSong ? (
                  <span className="w-5 h-5 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                ) : playing ? <Pause size={28} weight="fill" /> : <Play size={28} weight="fill" />}
              </button>
              <button onClick={nextSong} className="text-white/80 hover:text-white"><SkipForward size={28} weight="fill" /></button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => {
    const [draft, setDraft] = [cfg, (updates: Partial<MusicCfg>) => setCfg({ ...cfg, ...updates })];
    const commit = () => { saveCfg(cfg); addToast('已保存', 'success'); setView('search'); };
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-slate-900 to-black text-white">
        <Header title="音乐设置" onBack={() => setView('search')} />
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
          <div>
            <div className="text-white/60 mb-1">后端 Worker 地址</div>
            <input
              className="w-full bg-white/10 rounded-lg px-3 py-2 outline-none"
              value={draft.workerUrl}
              onChange={(e) => setDraft({ workerUrl: e.target.value })}
              placeholder="https://your-worker.workers.dev"
            />
            <div className="text-xs text-white/40 mt-1">默认用作者托管的 sully-n Worker。可自行部署 worker/index.js 到 Cloudflare Workers 免费账户后替换这里。</div>
          </div>

          <div>
            <div className="text-white/60 mb-1">会员 Cookie (MUSIC_U)</div>
            <textarea
              className="w-full bg-white/10 rounded-lg px-3 py-2 outline-none font-mono text-xs"
              rows={3}
              value={draft.cookie}
              onChange={(e) => setDraft({ cookie: e.target.value })}
              placeholder="MUSIC_U=xxxxxxxx..."
            />
            <div className="text-xs text-white/40 mt-1">
              只在你自己的浏览器里保存，不上传。获取方法：登录 music.163.com → F12 → Application → Cookies → 复制 MUSIC_U 的值，拼成 <code className="text-white/70">MUSIC_U=值</code> 粘贴到这里。
            </div>
          </div>

          <div>
            <div className="text-white/60 mb-1">音质</div>
            <div className="grid grid-cols-5 gap-1">
              {(['standard','higher','exhigh','lossless','hires'] as const).map(q => (
                <button
                  key={q}
                  onClick={() => setDraft({ quality: q })}
                  className={`py-1.5 rounded text-xs ${draft.quality === q ? 'bg-rose-500' : 'bg-white/10 hover:bg-white/20'}`}
                >{q}</button>
              ))}
            </div>
            <div className="text-xs text-white/40 mt-1">lossless / hires 需要黑胶 SVIP。</div>
          </div>

          <div className="pt-2 border-t border-white/10">
            <div className="text-white/60 mb-1">诊断</div>
            <button
              onClick={async () => {
                const lines: string[] = [];
                const ck = normalizeCookie(draft.cookie);
                lines.push(`Worker: ${draft.workerUrl}`);
                lines.push(`Cookie: ${ck ? ck.slice(0, 18) + '...(' + ck.length + 'c)' : '(未填)'}`);
                try {
                  const res = await fetch(`${draft.workerUrl.replace(/\/+$/, '')}/netease/search`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(ck ? { 'X-Netease-Cookie': ck } : {}) },
                    body: JSON.stringify({ keyword: '晴天', limit: 3 }),
                  });
                  lines.push(`HTTP ${res.status} ${res.statusText}`);
                  const txt = await res.text();
                  lines.push(`Body (前 800 字):`);
                  lines.push(txt.slice(0, 800));
                  try {
                    const j = JSON.parse(txt);
                    lines.push(`---`);
                    lines.push(`code=${j.code}  songs=${j?.result?.songs?.length ?? 'N/A'}  msg=${j.msg || j.message || ''}`);
                  } catch {}
                } catch (e: any) {
                  lines.push(`请求异常: ${e.message}`);
                }
                const out = lines.join('\n');
                try { console.log('[MusicApp/diag]\n' + out); } catch {}
                alert(out);
              }}
              className="w-full py-2 rounded-lg bg-amber-500/80 hover:bg-amber-500 text-black font-medium"
            >一键诊断（搜索晴天）</button>
            <div className="text-xs text-white/40 mt-1">把弹出的文本复制给作者就能定位问题。</div>
          </div>

          <button onClick={commit} className="w-full py-3 rounded-lg bg-rose-500 hover:bg-rose-400 font-medium">保存</button>
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 overflow-hidden">
      {view === 'search' && renderSearch()}
      {view === 'player' && renderPlayer()}
      {view === 'settings' && renderSettings()}
    </div>
  );
};

export default MusicApp;
