/**
 * 全局悬浮 Mini 播放器
 * 仅在 非 Music / 非 Launcher 应用里 显示，表示「后台正在放歌」。
 * Launcher 页让位给已有的 Dock，Music 页让位给页面内自带的 MiniPlayer。
 *
 * 默认折叠：只显示一个带封面的小圆球，点开才展开完整控制条；
 * 这样不会挡住下面应用的内容。
 */
import React, { useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, CaretDown } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { useMusic } from '../../context/MusicContext';
import { AppID } from '../../types';

const GlobalMiniPlayer: React.FC = () => {
  const { activeApp, openApp } = useOS();
  const { current, playing, togglePlay, nextSong, prevSong, progress, duration } = useMusic();
  const [expanded, setExpanded] = useState(false); // 默认折叠，避免挡住下面 app

  if (!current) return null;
  if (activeApp === AppID.Music) return null;
  if (activeApp === AppID.Launcher) return null; // Launcher 的 dock 够用了
  if (activeApp === AppID.Call) return null;     // 通话中不打扰

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  // 折叠态：右下角一个带封面的小圆球
  if (!expanded) {
    return (
      <div className="absolute right-3 bottom-3 z-[55] pointer-events-none">
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          className="pointer-events-auto relative w-10 h-10 rounded-full overflow-hidden active:scale-95 transition-transform"
          style={{
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.25)',
          }}
          aria-label="展开播放器"
        >
          <img
            src={current.albumPic}
            alt=""
            className="w-full h-full object-cover"
          />
          {/* 播放/暂停小指示 */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.25)' }}
          >
            {playing
              ? <Pause size={14} weight="fill" color="#fff" />
              : <Play size={14} weight="fill" color="#fff" />}
          </div>
          {/* 进度环底色条 */}
          <div className="absolute left-0 bottom-0 w-full h-[2px] bg-white/20">
            <div
              className="h-full bg-gradient-to-r from-sky-400 to-indigo-400 transition-all duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
        </button>
      </div>
    );
  }

  // 展开态：原来的完整 Mini 播放器
  return (
    <div className="absolute left-3 right-3 bottom-3 z-[55] pointer-events-none">
      <div
        onClick={() => openApp(AppID.Music)}
        className="pointer-events-auto flex items-center gap-2.5 rounded-2xl px-2.5 py-2 cursor-pointer relative overflow-hidden animate-fade-in"
        style={{
          background: 'rgba(20, 24, 35, 0.65)',
          backdropFilter: 'blur(24px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        }}
      >
        {/* 封面 */}
        <img
          src={current.albumPic}
          alt=""
          className="w-9 h-9 rounded-lg object-cover shrink-0"
          style={{ border: '1px solid rgba(255,255,255,0.2)' }}
        />

        {/* 文字 */}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[11px] font-medium truncate text-white">{current.name}</div>
          <div className="text-[9px] truncate text-white/60">{current.artists}</div>
        </div>

        {/* 控制 */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); prevSong(); }}
            className="p-1.5 rounded-full text-white/80 active:scale-95 transition-transform"
          >
            <SkipBack size={14} weight="fill" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="p-1.5 rounded-full text-white active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,0.15)' }}
          >
            {playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); nextSong(); }}
            className="p-1.5 rounded-full text-white/80 active:scale-95 transition-transform"
          >
            <SkipForward size={14} weight="fill" />
          </button>
          {/* 折叠按钮 */}
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            className="p-1.5 rounded-full text-white/70 active:scale-95 transition-transform ml-0.5"
            aria-label="收起播放器"
          >
            <CaretDown size={14} weight="bold" />
          </button>
        </div>

        {/* 底部细进度条 */}
        <div className="absolute left-0 bottom-0 h-[2px] bg-gradient-to-r from-sky-400 to-indigo-400 transition-all duration-150"
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export default GlobalMiniPlayer;
