/**
 * Launcher 首页「正在播放」小组件
 * — 全局 Music Context 驱动，点击跳到 Music App。
 * — 没歌时：展示一个精致的"发现音乐"空状态。
 */
import React from 'react';
import { Play, Pause, SkipForward, MusicNotes, ArrowUpRight } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { useMusic } from '../../context/MusicContext';
import { AppID } from '../../types';

const NowPlayingWidget: React.FC<{ contentColor: string }> = ({ contentColor }) => {
  const { openApp } = useOS();
  const { current, playing, progress, duration, togglePlay, nextSong } = useMusic();

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  if (!current) {
    return (
      <div
        onClick={() => openApp(AppID.Music)}
        className="relative h-20 w-full rounded-2xl overflow-hidden cursor-pointer animate-fade-in group transition-transform active:scale-[0.98]"
        style={{
          background: 'rgba(16,16,20,0.32)',
          backdropFilter: 'blur(24px) saturate(1.4)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 10px 32px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {/* 底噪渐变：cool 色调，避免通用 UI-kit 粉紫感 */}
        <div className="absolute inset-0 opacity-80 pointer-events-none"
          style={{
            background:
              'radial-gradient(120% 80% at 0% 0%, rgba(99,102,241,0.18), transparent 55%),' +
              'radial-gradient(120% 80% at 100% 100%, rgba(244,114,182,0.12), transparent 55%)',
          }}
        />
        {/* 细栅格（editorial 纸张感） */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '14px 14px',
          }}
        />

        <div className="relative flex items-center gap-3.5 px-3.5 h-full" style={{ color: contentColor }}>
          {/* 艺术封面占位：叠层卡片 + 光晕 + 居中音符 */}
          <div className="relative w-14 h-14 shrink-0">
            {/* 后层偏移卡片，做"黑胶 + 封套"的暗示 */}
            <div className="absolute -left-1 top-1 w-14 h-14 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))',
                border: '1px solid rgba(255,255,255,0.08)',
                transform: 'rotate(-6deg)',
              }}
            />
            {/* 前层主卡片 */}
            <div className="absolute inset-0 rounded-xl overflow-hidden flex items-center justify-center"
              style={{
                background:
                  'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.22), rgba(255,255,255,0.04) 60%),' +
                  'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 55%, #831843 100%)',
                border: '1px solid rgba(255,255,255,0.18)',
                boxShadow: '0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
              }}
            >
              {/* 呼吸光晕 */}
              <div className="absolute inset-0" style={{
                background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.35), transparent 55%)',
                animation: 'pulse 3.2s ease-in-out infinite',
                filter: 'blur(6px)',
              }} />
              <MusicNotes size={22} weight="duotone" style={{ color: '#ffffff', position: 'relative' }} />
            </div>
          </div>

          {/* 文案：editorial 层级 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full shrink-0" style={{ background: '#fbbf24' }} />
              <div className="text-[9px] uppercase tracking-[0.24em] opacity-60 font-bold">
                Discover · Offline
              </div>
            </div>
            <div
              className="text-[15px] font-semibold truncate mt-0.5"
              style={{ fontFamily: `'Space Grotesk', 'SF Pro Display', -apple-system, sans-serif`, letterSpacing: '-0.01em' }}
            >
              网易云音乐
            </div>
            <div className="text-[10px] opacity-55 truncate mt-0.5" style={{ letterSpacing: '0.02em' }}>
              登录账号 · 私人 FM · 每日推荐
            </div>
          </div>

          {/* CTA：带细微光边的胶囊 */}
          <div className="shrink-0 flex items-center gap-1 px-2.5 h-7 rounded-full"
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.18)',
              backdropFilter: 'blur(8px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
            }}
          >
            <span className="text-[10px] font-semibold tracking-wider uppercase">Sign in</span>
            <ArrowUpRight size={11} weight="bold" />
          </div>
        </div>

        {/* 底部:极细金线替代俗套进度条 */}
        <div className="absolute left-3 right-3 bottom-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
          }}
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => openApp(AppID.Music)}
      className="relative h-20 w-full rounded-2xl overflow-hidden cursor-pointer animate-fade-in group transition-transform active:scale-[0.98]"
      style={{
        background: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(24px) saturate(1.4)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      {/* 背景：模糊封面 */}
      <div className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: `url(${current.albumPic})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(30px) saturate(1.4)',
          transform: 'scale(1.4)',
        }}
      />

      <div className="relative flex items-center gap-3 px-3 h-full" style={{ color: contentColor }}>
        {/* 封面 */}
        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 relative shadow-lg"
          style={{ border: '1px solid rgba(255,255,255,0.25)' }}>
          <img src={current.albumPic} alt="" className="w-full h-full object-cover"
            style={{ animation: playing ? 'spin 14s linear infinite' : 'none' }} />
        </div>

        {/* 文字 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: playing ? '#4ade80' : '#fbbf24',
                boxShadow: playing ? '0 0 8px #4ade80' : 'none',
                animation: playing ? 'pulse 2s ease-in-out infinite' : 'none',
              }} />
            <div className="text-[9px] uppercase tracking-[0.18em] opacity-60 font-bold">
              {playing ? 'Now Playing' : 'Paused'}
            </div>
          </div>
          <div className="text-sm font-semibold truncate mt-0.5">{current.name}</div>
          <div className="text-[10px] opacity-60 truncate">{current.artists}</div>
        </div>

        {/* 控制 */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            {playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); nextSong(); }}
            className="w-8 h-8 rounded-full flex items-center justify-center opacity-80 active:scale-90 transition-transform"
          >
            <SkipForward size={12} weight="fill" />
          </button>
        </div>
      </div>

      {/* 底部细进度条 */}
      <div className="absolute left-0 bottom-0 h-[2px] transition-all duration-150"
        style={{
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #60a5fa, #c084fc)',
          boxShadow: '0 0 6px rgba(192,132,252,0.6)',
        }}
      />
    </div>
  );
};

export default NowPlayingWidget;
