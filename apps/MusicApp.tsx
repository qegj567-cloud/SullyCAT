
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../context/OSContext';
import { Gear } from '@phosphor-icons/react';
import {
  C, Sparkle, MizuHeader, SearchBar, SongRow, MiniPlayer,
  VinylDisc, GlassProgress, PlayControls, BokehBg,
  MetaChip, SubActions,
} from './music/MusicUI';

// ------------------------- 本地存储 -------------------------
const LS_CFG_KEY = 'sully_music_cfg_v1';
const DEFAULT_WORKER = 'https://sully-n.qegj567.workers.dev';

interface MusicCfg {
  workerUrl: string;
  cookie: string;
  quality: 'standard' | 'higher' | 'exhigh' | 'lossless' | 'hires';
}

const defaultCfg: MusicCfg = { workerUrl: DEFAULT_WORKER, cookie: '', quality: 'exhigh' };

const loadCfg = (): MusicCfg => {
  try { const raw = localStorage.getItem(LS_CFG_KEY); if (!raw) return defaultCfg; return { ...defaultCfg, ...JSON.parse(raw) }; } catch { return defaultCfg; }
};
const saveCfg = (cfg: MusicCfg) => { try { localStorage.setItem(LS_CFG_KEY, JSON.stringify(cfg)); } catch {} };

// ------------------------- 数据类型 -------------------------
interface Song { id: number; name: string; artists: string; album: string; albumPic: string; duration: number; fee: number; }
interface LyricLine { t: number; text: string; }

// ------------------------- 工具 -------------------------
const fmtTime = (s: number) => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60); const ss = Math.floor(s % 60); return `${m}:${ss.toString().padStart(2, '0')}`; };

const parseLyric = (txt: string): LyricLine[] => {
  if (!txt) return [];
  const out: LyricLine[] = [];
  const re = /\[(\d+):(\d+)(?:\.(\d+))?\](.*)/;
  for (const line of txt.split(/\r?\n/)) {
    const m = re.exec(line); if (!m) continue;
    const mm = parseInt(m[1], 10), ss = parseInt(m[2], 10);
    const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
    const text = m[4].trim(); if (!text) continue;
    out.push({ t: mm * 60 + ss + ms / 1000, text });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
};

const normalizeCookie = (raw: string): string => {
  const s = (raw || '').trim(); if (!s) return '';
  if (s.toUpperCase().startsWith('MUSIC_U=')) return s;
  return `MUSIC_U=${s}`;
};

// ------------------------- API -------------------------
const api = {
  async call(cfg: MusicCfg, path: string, body: any) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const cookie = normalizeCookie(cfg.cookie);
    if (cookie) headers['X-Netease-Cookie'] = cookie;
    const res = await fetch(`${cfg.workerUrl.replace(/\/+$/, '')}/netease${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || j?.message || `HTTP ${res.status}`);
    return j;
  },
  search(cfg: MusicCfg, keyword: string, offset = 0) { return api.call(cfg, '/search', { keyword, limit: 30, offset, type: 1 }); },
  songUrl(cfg: MusicCfg, id: number) { return api.call(cfg, '/song/url', { ids: [id], level: cfg.quality }); },
  lyric(cfg: MusicCfg, id: number) { return api.call(cfg, '/lyric', { id }); },
  loginStatus(cfg: MusicCfg) { return api.call(cfg, '/login/status', {}); },
};

// ========================= 主组件 =========================
const MusicApp: React.FC = () => {
  const { closeApp, addToast } = useOS();
  const [cfg, setCfg] = useState<MusicCfg>(loadCfg);
  const [view, setView] = useState<'search' | 'settings' | 'player'>('search');

  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);

  const [queue, setQueue] = useState<Song[]>([]);
  const [idx, setIdx] = useState(-1);
  const current = idx >= 0 ? queue[idx] : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingSong, setLoadingSong] = useState(false);

  const [lyric, setLyric] = useState<LyricLine[]>([]);
  const [tlyric, setTlyric] = useState<LyricLine[]>([]);
  const lyricBoxRef = useRef<HTMLDivElement | null>(null);
  const activeLyricIdx = useMemo(() => {
    if (!lyric.length) return -1;
    let i = 0;
    for (let k = 0; k < lyric.length; k++) if (lyric[k].t <= progress) i = k; else break;
    return i;
  }, [lyric, progress]);

  const [userName, setUserName] = useState<string | null>(null);

  // audio init
  useEffect(() => {
    const a = new Audio(); a.preload = 'metadata';
    a.addEventListener('play', () => setPlaying(true));
    a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('timeupdate', () => setProgress(a.currentTime));
    a.addEventListener('loadedmetadata', () => setDuration(a.duration));
    a.addEventListener('ended', () => nextSong());
    a.addEventListener('error', () => { setPlaying(false); addToast('播放失败', 'error'); });
    audioRef.current = a;
    return () => { try { a.pause(); a.src = ''; } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cfg.cookie) { setUserName(null); return; }
    api.loginStatus(cfg).then(r => setUserName(r?.data?.profile?.nickname || null)).catch(() => setUserName(null));
  }, [cfg.cookie, cfg.workerUrl]);

  // 歌词自动滚动
  useEffect(() => {
    if (view !== 'player') return;
    const box = lyricBoxRef.current; if (!box || activeLyricIdx < 0) return;
    const el = box.querySelector<HTMLDivElement>(`[data-lyric-idx="${activeLyricIdx}"]`);
    if (el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [activeLyricIdx, view]);

  // ── actions ──
  const doSearch = useCallback(async () => {
    const kw = keyword.trim(); if (!kw) return;
    setSearching(true);
    try {
      const r = await api.search(cfg, kw);
      const songs: Song[] = (r?.result?.songs || []).map((s: any) => ({
        id: s.id, name: s.name,
        artists: (s.ar || s.artists || []).map((a: any) => a.name).join(' / '),
        album: s.al?.name || s.album?.name || '', albumPic: s.al?.picUrl || s.album?.picUrl || '',
        duration: (s.dt || s.duration || 0) / 1000, fee: s.fee ?? 0,
      }));
      setResults(songs);
      if (!songs.length) {
        const hint = r?.msg || r?.message || (r?.code != null ? `code=${r.code}` : '') || '无数据';
        addToast(`没找到: ${hint}`, 'info');
      }
    } catch (e: any) { addToast(`搜索失败：${e.message}`, 'error'); }
    finally { setSearching(false); }
  }, [keyword, cfg, addToast]);

  const playSong = useCallback(async (song: Song, alsoSetQueue = true) => {
    if (alsoSetQueue) {
      const existing = queue.findIndex(s => s.id === song.id);
      if (existing >= 0) setIdx(existing);
      else { setQueue(q => [...q, song]); setIdx(queue.length); }
    }
    setLoadingSong(true); setLyric([]); setTlyric([]); setProgress(0); setDuration(0);
    try {
      const [urlRes, lyricRes] = await Promise.all([api.songUrl(cfg, song.id), api.lyric(cfg, song.id).catch(() => null)]);
      const url: string | null = urlRes?.data?.[0]?.url || null;
      if (!url) { addToast(urlRes?.data?.[0]?.fee && !cfg.cookie ? '需要会员 cookie' : '暂无播放地址', 'error'); setLoadingSong(false); return; }
      const a = audioRef.current!; a.src = url.replace(/^http:\/\//i, 'https://'); a.play().catch(() => {});
      if (lyricRes) { setLyric(parseLyric(lyricRes?.lrc?.lyric || '')); setTlyric(parseLyric(lyricRes?.tlyric?.lyric || '')); }
    } catch (e: any) { addToast(`播放失败：${e.message}`, 'error'); }
    finally { setLoadingSong(false); }
  }, [cfg, queue, addToast]);

  const togglePlay = useCallback(() => { const a = audioRef.current; if (!a || !a.src) return; if (a.paused) a.play().catch(() => {}); else a.pause(); }, []);
  const nextSong = useCallback(() => { if (idx < 0 || !queue.length) return; const n = (idx + 1) % queue.length; setIdx(n); playSong(queue[n], false); }, [idx, queue, playSong]);
  const prevSong = useCallback(() => { if (idx < 0 || !queue.length) return; const n = (idx - 1 + queue.length) % queue.length; setIdx(n); playSong(queue[n], false); }, [idx, queue, playSong]);
  const seek = (pct: number) => { const a = audioRef.current; if (!a || !duration) return; a.currentTime = Math.max(0, Math.min(duration, duration * pct)); };

  // ════════════════ 搜索页 ════════════════
  const renderSearch = () => (
    <div className="flex flex-col h-full relative"
      style={{ background: `linear-gradient(160deg, ${C.bg} 0%, ${C.bgDeep} 50%, #d0e4f4 100%)` }}>
      <BokehBg />
      <MizuHeader
        title="未来音楽"
        onClose={closeApp}
        right={<button onClick={() => setView('settings')} className="p-1.5 rounded-full transition-all" style={{ color: C.primary }}><Gear size={16} weight="bold" /></button>}
      />
      <SearchBar value={keyword} onChange={setKeyword} onSearch={doSearch} searching={searching} />

      {/* 用户状态 — 玻璃标签 */}
      {userName && (
        <div className="px-5 -mt-1 mb-1.5 flex items-center gap-1.5 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] shizuku-glass"
            style={{ color: C.muted }}>
            <Sparkle size={6} color={C.sakura} delay={0.3} /> {userName} · {cfg.quality}
          </div>
        </div>
      )}
      {!cfg.cookie && (
        <div className="px-5 -mt-1 mb-1.5 relative z-10">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px]"
            style={{ background: `${C.vip}18`, color: C.vip, border: `1px solid ${C.vip}30` }}>
            未填 Cookie — 仅可播放免费歌曲
          </span>
        </div>
      )}

      {/* 歌曲列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-24 relative z-10 shizuku-scrollbar">
        {results.length === 0 && !searching && (
          <div className="text-center mt-16 space-y-4">
            <div className="relative inline-block">
              <Sparkle size={24} className="mx-auto" color={C.glow} delay={0} />
              <Sparkle size={12} className="absolute -top-1 -right-3" color={C.sakura} delay={0.8} />
              <Sparkle size={8} className="absolute -bottom-2 -left-2" color={C.lavender} delay={1.5} />
            </div>
            <div className="text-xs italic" style={{ color: C.faint, fontFamily: `'Georgia', serif` }}>搜一首想听的歌吧</div>
          </div>
        )}
        {results.map(s => (
          <SongRow key={s.id} name={s.name} artists={s.artists} album={s.album} albumPic={s.albumPic}
            duration={fmtTime(s.duration)} isVip={s.fee === 1} isActive={current?.id === s.id} onClick={() => playSong(s)} />
        ))}
      </div>

      {current && (
        <MiniPlayer name={current.name} artists={current.artists} albumPic={current.albumPic}
          playing={playing} onTap={() => setView('player')} onPrev={prevSong} onToggle={togglePlay} onNext={nextSong} />
      )}
    </div>
  );

  // ════════════════ 播放页 ════════════════
  const bitrateMap: Record<MusicCfg['quality'], string> = {
    standard: '128 kbps',
    higher:   '192 kbps',
    exhigh:   '320 kbps',
    lossless: '1411 kbps',
    hires:    '24bit · Hi-Res',
  };

  const renderPlayer = () => {
    if (!current) return null;
    return (
      <div className="flex flex-col h-full relative"
        style={{ background: `linear-gradient(170deg, ${C.bg} 0%, ${C.bgDeep} 40%, #c8dff0 100%)` }}>
        <BokehBg />
        <MizuHeader title="Now Playing" onBack={() => setView('search')} />

        <div className="flex-1 flex flex-col items-center px-5 pt-4 pb-3 relative z-10 overflow-hidden">
          {/* 唱片 — 带 bitrate chip */}
          <div className="shrink-0 mt-1">
            <VinylDisc albumPic={current.albumPic} playing={playing} size={150} bitrate={bitrateMap[cfg.quality]} />
          </div>

          {/* 元数据 — 衬线标题 + 大写副标 */}
          <section className="mt-5 text-center space-y-1.5 shrink-0 px-2">
            <h2 className="font-light tracking-tight leading-tight"
              style={{ color: C.primary, fontFamily: `'Noto Serif','Georgia',serif`, fontSize: '22px' }}>
              {current.name}
            </h2>
            <p className="text-[10px] uppercase opacity-70"
              style={{ color: C.muted, fontFamily: `'Space Grotesk','SF Mono',monospace`, letterSpacing: '0.2em' }}>
              {current.artists}
            </p>
          </section>

          {/* 歌词 — 柔化 strip */}
          <div
            ref={lyricBoxRef}
            className="flex-1 w-full my-3 min-h-0 overflow-y-auto text-center scroll-smooth shizuku-scrollbar px-2"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)',
            }}
          >
            {lyric.length === 0 ? (
              <div className="pt-6 flex flex-col items-center gap-2" style={{ color: C.faint }}>
                <Sparkle size={12} color={C.glow} />
                <span className="text-[11px] italic tracking-wider" style={{ fontFamily: `'Noto Serif','Georgia',serif` }}>
                  {loadingSong ? 'loading...' : 'no lyrics'}
                </span>
              </div>
            ) : (
              <div className="space-y-3 py-8">
                {lyric.map((l, i) => {
                  const tr = tlyric.find(t => Math.abs(t.t - l.t) < 0.2);
                  const active = i === activeLyricIdx;
                  return (
                    <div key={i} data-lyric-idx={i}
                      className="transition-all duration-500"
                      style={{
                        color: active ? C.primary : C.faint,
                        transform: active ? 'scale(1.06)' : 'scale(1)',
                        textShadow: active ? `0 0 22px ${C.glow}45` : 'none',
                        fontWeight: active ? 500 : 300,
                        opacity: active ? 1 : 0.55,
                      }}>
                      <div className="text-[13px]" style={{ fontFamily: `'Noto Serif','Georgia',serif` }}>{l.text}</div>
                      {tr && <div className="text-[10px] mt-0.5" style={{ opacity: active ? 0.75 : 0.4, color: active ? C.accent : C.faint }}>{tr.text}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 时间 chip + 进度条 */}
          <div className="w-full shrink-0 max-w-sm">
            <div className="flex justify-between items-center mb-2 px-0.5">
              <MetaChip>{fmtTime(progress)}</MetaChip>
              <MetaChip>{fmtTime(duration)}</MetaChip>
            </div>
            <GlassProgress progress={progress} duration={duration} fmtTime={fmtTime} onSeek={seek} />
          </div>

          {/* 主控制 — 带浮游 sparkle */}
          <div className="shrink-0 relative">
            <Sparkle size={9} className="absolute top-1 left-[30%]" color={C.sakura} delay={0} />
            <Sparkle size={7} className="absolute top-3 right-[28%]" color={C.lavender} delay={1.2} />
            <PlayControls playing={playing} loading={loadingSong} onPrev={prevSong} onToggle={togglePlay} onNext={nextSong} />
          </div>

          {/* 副操作行 */}
          <div className="shrink-0 mt-3 w-full">
            <SubActions
              onLike={() => addToast('喜欢 ♡', 'info')}
              onShuffle={() => addToast('随机播放', 'info')}
              onAdd={() => addToast('加入歌单', 'info')}
            />
          </div>

          {/* 系统碎片装饰 */}
          <div className="absolute bottom-1 left-2 pointer-events-none opacity-25 leading-tight"
            style={{
              color: C.muted,
              fontFamily: `'Space Grotesk','SF Mono',monospace`,
              fontSize: '7px',
              letterSpacing: '0.15em',
            }}>
            SYS · MIZU 1.0.4<br />
            BUFFER · OPTIMAL
          </div>
        </div>
      </div>
    );
  };

  // ════════════════ 设置页 ════════════════
  const renderSettings = () => {
    const setDraft = (updates: Partial<MusicCfg>) => setCfg({ ...cfg, ...updates });
    const commit = () => { saveCfg(cfg); addToast('已保存', 'success'); setView('search'); };
    return (
      <div className="flex flex-col h-full relative"
        style={{ background: `linear-gradient(160deg, ${C.bg} 0%, ${C.bgDeep} 60%, #c8dff0 100%)` }}>
        <BokehBg />
        <MizuHeader title="设置" onBack={() => setView('search')} />
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-sm relative z-10 shizuku-scrollbar">
          {/* Worker — 玻璃卡片 */}
          <div className="rounded-2xl p-3.5 shizuku-glass" style={{ boxShadow: `0 2px 16px ${C.glow}08` }}>
            <div className="text-[10px] mb-2 tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>
              <Sparkle size={6} color={C.glow} delay={0} /> 后端 Worker 地址
            </div>
            <input className="w-full rounded-xl px-3 py-2 outline-none text-xs shizuku-glass" value={cfg.workerUrl}
              onChange={e => setDraft({ workerUrl: e.target.value })} placeholder="https://..."
              style={{ color: C.text }} />
          </div>
          {/* Cookie — 玻璃卡片 */}
          <div className="rounded-2xl p-3.5 shizuku-glass" style={{ boxShadow: `0 2px 16px ${C.glow}08` }}>
            <div className="text-[10px] mb-2 tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>
              <Sparkle size={6} color={C.sakura} delay={0.5} /> 会员 Cookie (MUSIC_U)
            </div>
            <textarea className="w-full rounded-xl px-3 py-2 outline-none text-[10px] shizuku-glass" rows={3} value={cfg.cookie}
              onChange={e => setDraft({ cookie: e.target.value })} placeholder="MUSIC_U=xxx 或直接粘贴值..."
              style={{ color: C.text, fontFamily: 'monospace', resize: 'none' }} />
            <div className="text-[9px] mt-1.5 italic" style={{ color: C.faint }}>仅存本地 · music.163.com → F12 → Cookies → MUSIC_U</div>
          </div>
          {/* 音质 — 玻璃卡片 */}
          <div className="rounded-2xl p-3.5 shizuku-glass" style={{ boxShadow: `0 2px 16px ${C.glow}08` }}>
            <div className="text-[10px] mb-2 tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>
              <Sparkle size={6} color={C.lavender} delay={1} /> 音质
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {(['standard', 'higher', 'exhigh', 'lossless', 'hires'] as const).map(q => (
                <button key={q} onClick={() => setDraft({ quality: q })}
                  className="py-2 rounded-xl text-[10px] transition-all"
                  style={{
                    background: cfg.quality === q ? `linear-gradient(135deg, ${C.primary}, ${C.accent})` : C.glass,
                    color: cfg.quality === q ? 'white' : C.muted,
                    border: cfg.quality === q ? '1px solid transparent' : `1px solid rgba(255,255,255,0.3)`,
                    boxShadow: cfg.quality === q ? `0 2px 12px ${C.glow}30` : 'none',
                    backdropFilter: 'blur(8px)',
                  }}
                >{q}</button>
              ))}
            </div>
            <div className="text-[9px] mt-1.5 italic" style={{ color: C.faint }}>lossless / hires 需要黑胶 SVIP</div>
          </div>
          {/* 诊断 + 保存 */}
          <div className="space-y-3 pt-1">
            <button
              onClick={async () => {
                const lines: string[] = [];
                const ck = normalizeCookie(cfg.cookie);
                lines.push(`Worker: ${cfg.workerUrl}`);
                lines.push(`Cookie: ${ck ? ck.slice(0, 18) + '...(' + ck.length + 'c)' : '(未填)'}`);
                try {
                  const res = await fetch(`${cfg.workerUrl.replace(/\/+$/, '')}/netease/search`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', ...(ck ? { 'X-Netease-Cookie': ck } : {}) },
                    body: JSON.stringify({ keyword: '晴天', limit: 3 }),
                  });
                  lines.push(`HTTP ${res.status}`);
                  const txt = await res.text(); lines.push(txt.slice(0, 800));
                  try { const j = JSON.parse(txt); lines.push(`---\ncode=${j.code}  songs=${j?.result?.songs?.length ?? 'N/A'}`); } catch {}
                } catch (e: any) { lines.push(`异常: ${e.message}`); }
                alert(lines.join('\n'));
              }}
              className="w-full py-2.5 rounded-2xl text-[10px] tracking-wider shizuku-glass transition-all"
              style={{ color: C.vip, border: `1px solid ${C.vip}30` }}
            >诊断（搜索晴天）</button>
            <button onClick={commit}
              className="w-full py-3 rounded-2xl text-xs text-white tracking-wider transition-all relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, boxShadow: `0 3px 18px ${C.glow}30` }}>
              <span className="relative z-10">保存</span>
              <div className="absolute inset-0 pointer-events-none" style={{
                background: `linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)`,
                backgroundSize: '200% 100%', animation: 'shizuku-shimmer 3s ease-in-out infinite',
              }} />
            </button>
          </div>
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
