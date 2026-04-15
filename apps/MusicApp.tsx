import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlass, Play, Pause, SkipBack, SkipForward, X, Gear, CaretLeft } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import {
  NeteaseSearchResult,
  NeteaseSongDetail,
  LyricLine,
  searchNeteaseSongs,
  getNeteaseSong,
  parseLyric,
  findCurrentLyricIndex,
  getNeteaseApiBase,
  setNeteaseApiBase,
  getNeteaseToken,
  setNeteaseToken,
} from '../utils/neteaseApi';

const fmt = (sec: number) => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const MusicApp: React.FC = () => {
  const { closeApp } = useOS();

  // ── 搜索 ──
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NeteaseSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  // ── 播放 ──
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [song, setSong] = useState<NeteaseSongDetail | null>(null);
  const [loadingSong, setLoadingSong] = useState(false);
  const [playErr, setPlayErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  // ── 歌词 ──
  const lyrics = useMemo<LyricLine[]>(() => song ? parseLyric(song.lyric || '', song.tlyric) : [], [song]);
  const curLineIdx = useMemo(() => findCurrentLyricIndex(lyrics, cur), [lyrics, cur]);
  const lyricBoxRef = useRef<HTMLDivElement | null>(null);

  // ── 设置 API Base ──
  const [showSettings, setShowSettings] = useState(false);
  const [apiBase, setApiBaseState] = useState(getNeteaseApiBase());
  const [token, setTokenState] = useState(getNeteaseToken());

  // 搜索
  const doSearch = async () => {
    const kw = query.trim();
    if (!kw) return;
    setSearching(true);
    setSearchErr(null);
    try {
      const list = await searchNeteaseSongs(kw, 25);
      setResults(list);
      if (list.length === 0) setSearchErr('没找到相关歌曲');
    } catch (e: any) {
      setSearchErr(e?.message || '搜索失败');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  // 选中一首歌 → 获取 URL → 播放
  const pickSong = async (item: NeteaseSearchResult) => {
    setLoadingSong(true);
    setPlayErr(null);
    try {
      const detail = await getNeteaseSong(item.id, {
        name: item.name,
        artist: item.artist_string || item.artists.join(' / '),
        album: item.album,
        pic: item.pic,
      });
      setSong(detail);
      // 等待 <audio> 加载后 play
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = detail.url;
          audioRef.current.play().catch((err) => setPlayErr(err?.message || '播放失败'));
        }
      }, 0);
    } catch (e: any) {
      setPlayErr(e?.message || '获取歌曲链接失败');
    } finally {
      setLoadingSong(false);
    }
  };

  // 绑定音频事件
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCur(a.currentTime);
    const onMeta = () => setDur(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => setPlaying(false);
    const onErr = () => setPlayErr('音频加载失败');
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnd);
    a.addEventListener('error', onErr);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('error', onErr);
    };
  }, []);

  // 当前行滚到视图中央
  useEffect(() => {
    const box = lyricBoxRef.current;
    if (!box || curLineIdx < 0) return;
    const el = box.querySelector<HTMLDivElement>(`[data-idx="${curLineIdx}"]`);
    if (el) {
      const offset = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
      box.scrollTo({ top: offset, behavior: 'smooth' });
    }
  }, [curLineIdx]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a || !song) return;
    if (a.paused) a.play().catch((err) => setPlayErr(err?.message || '播放失败'));
    else a.pause();
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const t = Number(e.target.value);
    a.currentTime = t;
    setCur(t);
  };

  // 换歌（列表跳转）
  const jumpSong = (delta: number) => {
    if (!song) return;
    const idx = results.findIndex((r) => String(r.id) === String(song.id));
    if (idx < 0) return;
    const next = results[idx + delta];
    if (next) pickSong(next);
  };

  return (
    <div className="absolute inset-0 bg-[#f5f1e8] text-stone-800 font-sans flex flex-col"
      style={{ backgroundImage: 'radial-gradient(rgba(120,90,60,0.08) 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
      {/* 顶栏 */}
      <header className="flex items-center gap-2 px-4 pt-2 pb-2 border-b border-stone-300/60">
        <button onClick={closeApp} className="p-1.5 rounded-full hover:bg-stone-200/60">
          <CaretLeft size={18} />
        </button>
        <div className="text-[13px] tracking-[0.3em] font-semibold text-stone-500">电波小屋 · SIGNAL</div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setShowSettings((s) => !s)} className="p-1.5 rounded-full hover:bg-stone-200/60">
            <Gear size={16} />
          </button>
        </div>
      </header>

      {/* 搜索 */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 bg-white/70 border border-stone-300/70 rounded-full px-3 py-1.5 shadow-sm">
          <MagnifyingGlass size={16} className="text-stone-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
            placeholder="搜一首歌、一个人、一种心情…"
            className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-stone-400"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); setSearchErr(null); }}>
              <X size={14} className="text-stone-400" />
            </button>
          )}
          <button onClick={doSearch} disabled={searching}
            className="text-[11px] px-2 py-0.5 rounded-full bg-stone-800 text-stone-100 disabled:opacity-50">
            {searching ? '…' : '搜索'}
          </button>
        </div>
        {searchErr && <div className="text-[11px] text-rose-500 mt-1 px-2">{searchErr}</div>}
      </div>

      {/* 设置浮层 */}
      {showSettings && (
        <div className="mx-4 mb-2 bg-white/90 border border-stone-300/70 rounded-2xl p-3 text-[12px] shadow space-y-2">
          <div>
            <div className="text-stone-500 mb-1 tracking-wider">上游 API 地址</div>
            <input value={apiBase} onChange={(e) => setApiBaseState(e.target.value)}
              className="w-full bg-stone-100 rounded-md px-2 py-1 outline-none" />
            <div className="text-[10px] text-stone-400 mt-1">默认走 worker 代理（注入 Referer 绕 401）。也可改为直连 https://nextmusic.toubiec.cn</div>
          </div>
          <div>
            <div className="text-stone-500 mb-1 tracking-wider">Token</div>
            <input value={token} onChange={(e) => setTokenState(e.target.value)}
              className="w-full bg-stone-100 rounded-md px-2 py-1 outline-none font-mono text-[11px]" />
            <div className="text-[10px] text-stone-400 mt-1">上游作者写死的前端 token，失效时可替换</div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => { setNeteaseApiBase(apiBase); setNeteaseToken(token); setShowSettings(false); }}
              className="px-3 py-1 rounded-md bg-stone-800 text-white">保存</button>
          </div>
        </div>
      )}

      {/* 主体：左搜索结果 / 右播放+歌词 */}
      <div className="flex-1 min-h-0 flex gap-3 px-4 pb-4">
        {/* 搜索结果 */}
        <aside className="w-[38%] min-w-[140px] max-w-[260px] flex flex-col bg-white/50 border border-stone-300/60 rounded-2xl overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] tracking-[0.3em] text-stone-500 border-b border-stone-200/80">INDEX CARD</div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {results.length === 0 && !searching && (
              <div className="px-3 py-4 text-[11px] text-stone-400 leading-relaxed">
                还没有搜索结果。<br />试试「稻香」「坂本龍一」「盛夏」…
              </div>
            )}
            {results.map((r) => {
              const active = song && String(song.id) === String(r.id);
              return (
                <button key={String(r.id)} onClick={() => pickSong(r)}
                  className={`w-full text-left px-3 py-2 border-b border-stone-200/70 text-[12px] transition ${active ? 'bg-amber-100/70' : 'hover:bg-stone-100/60'}`}>
                  <div className="font-semibold truncate">{r.name}</div>
                  <div className="text-[10px] text-stone-500 truncate">{r.artist_string || r.artists.join(' / ')}{r.album ? ` · ${r.album}` : ''}</div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* 播放 + 歌词 */}
        <main className="flex-1 flex flex-col bg-white/60 border border-stone-300/60 rounded-2xl overflow-hidden">
          {/* 唱片 */}
          <div className="px-4 py-4 flex items-center gap-3 border-b border-stone-200/80">
            <div className="relative w-16 h-16 rounded-full bg-stone-900 flex items-center justify-center shadow-inner"
              style={{ animation: playing ? 'spin 6s linear infinite' : 'none' }}>
              {song?.pic ? (
                <img src={song.pic} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-stone-700" />
              )}
              <div className="absolute w-2 h-2 rounded-full bg-stone-100" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{song?.name || (loadingSong ? '加载中…' : '还没有在播放')}</div>
              <div className="text-[11px] text-stone-500 truncate">{song?.artist || (song?.album ? song.album : '')}</div>
              {playErr && <div className="text-[10px] text-rose-500 truncate mt-0.5">{playErr}</div>}
            </div>
          </div>

          {/* 进度 + 控制 */}
          <div className="px-4 pt-3">
            <input type="range" min={0} max={dur || 0} step={0.1} value={cur}
              onChange={seek} disabled={!song}
              className="w-full accent-stone-800" />
            <div className="flex justify-between text-[10px] text-stone-500 mt-0.5">
              <span>{fmt(cur)}</span>
              <span>{fmt(dur)}</span>
            </div>
            <div className="flex items-center justify-center gap-4 mt-2">
              <button onClick={() => jumpSong(-1)} className="p-2 rounded-full hover:bg-stone-200/60" disabled={!song}>
                <SkipBack size={18} weight="fill" />
              </button>
              <button onClick={togglePlay} disabled={!song}
                className="w-11 h-11 rounded-full bg-stone-800 text-stone-50 flex items-center justify-center disabled:opacity-40">
                {playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
              </button>
              <button onClick={() => jumpSong(1)} className="p-2 rounded-full hover:bg-stone-200/60" disabled={!song}>
                <SkipForward size={18} weight="fill" />
              </button>
            </div>
          </div>

          {/* 歌词 —— 飘浮纸条样式 */}
          <div ref={lyricBoxRef}
            className="flex-1 min-h-0 mt-3 overflow-y-auto no-scrollbar px-6 py-4 text-center">
            {lyrics.length === 0 ? (
              <div className="text-[12px] text-stone-400 mt-8">
                {song ? '这首歌没有歌词数据' : '选一首歌，让词一句句落下来'}
              </div>
            ) : (
              lyrics.map((l, i) => {
                const active = i === curLineIdx;
                return (
                  <div key={i} data-idx={i}
                    className={`transition-all duration-300 py-1 ${active
                      ? 'text-stone-900 text-[15px] font-semibold'
                      : 'text-stone-400 text-[12px]'}`}>
                    <div>{l.text}</div>
                    {l.trans && <div className={`text-[10px] ${active ? 'text-stone-600' : 'text-stone-300'}`}>{l.trans}</div>}
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>

      {/* 不加 crossOrigin，让 <audio> 以普通资源方式加载 m*.music.126.net */}
      <audio ref={audioRef} preload="metadata" />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default MusicApp;
