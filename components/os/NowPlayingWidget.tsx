/**
 * Launcher 首页「正在播放」小组件
 * — 全局 Music Context 驱动，点击跳到 Music App。
 * — 没歌时：展示一个精致的"发现音乐"空状态。
 */
import React from 'react';
import { Play, Pause, SkipForward } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { useMusic } from '../../context/MusicContext';
import { AppID } from '../../types';

const NowPlayingWidget: React.FC<{ contentColor: string }> = ({ contentColor }) => {
  const { openApp } = useOS();
  const { current, playing, progress, duration, togglePlay, nextSong } = useMusic();

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  if (!current) {
    // wabi-sabi · 空寂 — 大留白，单字水印「靜」，一句安静文案，呼吸光点
    return (
      <div
        onClick={() => openApp(AppID.Music)}
        className="relative h-20 w-full rounded-2xl overflow-hidden cursor-pointer animate-fade-in group transition-transform active:scale-[0.99]"
        style={{
          background: 'rgba(20,20,24,0.28)',
          backdropFilter: 'blur(28px) saturate(1.2)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* 远处的薄雾光：右下角一抹暖琥珀，像窗外渐暗的天 */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(140% 100% at 88% 90%, rgba(251,191,36,0.10), transparent 55%),' +
              'radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.04), transparent 60%)',
          }}
        />

        {/* 单字水印「靜」— 巨大、压在右半边、只剩一线轮廓的存在感 */}
        <div
          className="absolute pointer-events-none select-none"
          style={{
            right: '-6px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '92px',
            lineHeight: 1,
            fontWeight: 200,
            fontFamily: `'Songti SC', 'STSong', 'Source Han Serif SC', 'Noto Serif CJK SC', serif`,
            color: contentColor,
            opacity: 0.07,
            letterSpacing: '-0.04em',
          }}
        >
          靜
        </div>

        {/* 左侧：极简黑胶轮廓（一个圆 + 中心点，全 hairline），不喧宾夺主 */}
        <svg
          className="absolute pointer-events-none"
          width="44" height="44"
          viewBox="0 0 44 44"
          style={{ left: '14px', top: '50%', transform: 'translateY(-50%)', color: contentColor, opacity: 0.55 }}
        >
          <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeWidth="0.6" />
          <circle cx="22" cy="22" r="13" fill="none" stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
          <circle cx="22" cy="22" r="6"  fill="none" stroke="currentColor" strokeWidth="0.4" opacity="0.35" />
          <circle cx="22" cy="22" r="1.2" fill="currentColor" />
        </svg>

        {/* 中部：竖线分隔 + 三行文案。typography 极简，不放任何按钮 */}
        <div className="absolute" style={{ left: '74px', top: '50%', transform: 'translateY(-50%)', color: contentColor }}>
          {/* 一根细竖线，把图与字分开 */}
          <div
            className="absolute"
            style={{
              left: '-12px', top: '-22px', width: '1px', height: '44px',
              background: `linear-gradient(180deg, transparent, ${contentColor}, transparent)`,
              opacity: 0.18,
            }}
          />

          {/* 顶行：极小英文 + 呼吸光点（唯一的"活气"） */}
          <div className="flex items-center gap-1.5">
            <span
              className="w-1 h-1 rounded-full"
              style={{
                background: '#fbbf24',
                boxShadow: '0 0 6px rgba(251,191,36,0.7)',
                animation: 'pulse 3.2s ease-in-out infinite',
              }}
            />
            <span
              className="text-[8.5px] uppercase font-medium"
              style={{ letterSpacing: '0.4em', opacity: 0.45 }}
            >
              silence
            </span>
          </div>

          {/* 主行：宋体大字「等一首歌」，留呼吸感的字距 */}
          <div
            className="mt-1"
            style={{
              fontFamily: `'Songti SC', 'STSong', 'Source Han Serif SC', 'Noto Serif CJK SC', serif`,
              fontWeight: 300,
              fontSize: '17px',
              letterSpacing: '0.18em',
              lineHeight: 1.1,
            }}
          >
            等一首歌
          </div>

          {/* 副行：极小，一行长破折号引导，含蓄 */}
          <div
            className="mt-1 text-[9.5px]"
            style={{ opacity: 0.4, letterSpacing: '0.12em', fontWeight: 300 }}
          >
            — 轻触，进入网易云
          </div>
        </div>
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
