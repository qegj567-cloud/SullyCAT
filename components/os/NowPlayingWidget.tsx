/**
 * Launcher 首页「正在播放」小组件
 * — 全局 Music Context 驱动，点击跳到 Music App。
 * — 没歌时：展示一个精致的"发现音乐"空状态。
 */
import React from 'react';
import { Play, Pause } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { useMusic } from '../../context/MusicContext';
import { AppID } from '../../types';

const NowPlayingWidget: React.FC<{ contentColor: string }> = ({ contentColor }) => {
  const { openApp } = useOS();
  const { current, playing, progress, duration, togglePlay } = useMusic();

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  if (!current) {
    // 封套 + 黑胶偏出的经典视觉 —— 紧凑 240×80，不强占桌面整行
    return (
      <div
        onClick={() => openApp(AppID.Music)}
        className="relative h-20 rounded-2xl overflow-hidden cursor-pointer animate-fade-in group transition-transform active:scale-[0.99]"
        style={{
          width: '240px',
          background: 'rgba(18,16,20,0.34)',
          backdropFilter: 'blur(28px) saturate(1.2)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* 远处一抹暖琥珀薄雾 */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(140% 100% at 92% 95%, rgba(251,191,36,0.10), transparent 55%),' +
              'radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.04), transparent 60%)',
          }}
        />

        {/* 黑胶：在封套后方偏出一截 — 紧凑版 */}
        <svg
          className="absolute pointer-events-none"
          width="100" height="80"
          viewBox="0 0 100 80"
          style={{ left: 0, top: 0, zIndex: 1 }}
        >
          <defs>
            <radialGradient id="npw_vinyl" cx="40%" cy="38%" r="62%">
              <stop offset="0%"  stopColor="#2a2630" />
              <stop offset="55%" stopColor="#0d0b10" />
              <stop offset="100%" stopColor="#050408" />
            </radialGradient>
            <linearGradient id="npw_sheen" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.22" />
              <stop offset="40%" stopColor="#ffffff" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="npw_label" cx="35%" cy="35%" r="70%">
              <stop offset="0%"  stopColor="#f2dcb0" />
              <stop offset="60%" stopColor="#d4a574" />
              <stop offset="100%" stopColor="#8e5a2e" />
            </radialGradient>
          </defs>

          {/* 盘下柔光投影 */}
          <ellipse cx="68" cy="70" rx="22" ry="2" fill="#000" opacity="0.35" />

          {/* 黑胶本体 — 中心 (68,40) r=22 */}
          <circle cx="68" cy="40" r="22" fill="url(#npw_vinyl)" />
          {[20, 18.5, 17, 15.5, 14, 12.5, 11].map((r, i) => (
            <circle key={i} cx="68" cy="40" r={r} fill="none"
              stroke="#ffffff" strokeOpacity={i % 2 === 0 ? 0.08 : 0.04} strokeWidth="0.3" />
          ))}
          <path d="M 52 28 A 22 22 0 0 1 84 27" fill="none" stroke="url(#npw_sheen)" strokeWidth="1" />
          <circle cx="68" cy="40" r="6.8" fill="url(#npw_label)" />
          <circle cx="68" cy="40" r="6.8" fill="none" stroke="#4a2a12" strokeOpacity="0.35" strokeWidth="0.4" />
          <circle cx="68" cy="40" r="4.8" fill="none" stroke="#4a2a12" strokeOpacity="0.25" strokeWidth="0.3" />
          <circle cx="68" cy="40" r="0.9" fill="#0a0608" />
        </svg>

        {/* 封套 — 覆盖黑胶左半 */}
        <div
          className="absolute overflow-hidden"
          style={{
            left: '6px', top: '14px', width: '52px', height: '52px',
            borderRadius: '3px',
            background: `linear-gradient(135deg, #f5ead0 0%, #e6d1a3 55%, #c9a769 100%)`,
            boxShadow:
              '0 5px 14px rgba(0,0,0,0.32), ' +
              'inset 0 1px 0 rgba(255,255,255,0.55), ' +
              'inset 0 -1px 0 rgba(0,0,0,0.12), ' +
              'inset -1px 0 0 rgba(0,0,0,0.08)',
            zIndex: 2,
          }}
        >
          <div className="absolute left-0 right-0 text-center"
            style={{ top: '3px', color: '#5c3a18', fontSize: '6px', letterSpacing: '0.3em', fontWeight: 800 }}>
            SIDE A
          </div>
          <div className="absolute" style={{ left: '6px', right: '6px', top: '11px', height: '1px', background: '#5c3a18', opacity: 0.35 }} />

          <div className="absolute"
            style={{ left: '50%', top: '54%', transform: 'translate(-50%,-50%)', width: '22px', height: '22px' }}>
            <div className="w-full h-full rounded-full" style={{
              background: 'radial-gradient(circle at 35% 30%, #d4a574 0%, #7a4a20 60%, #3a1f08 100%)',
              boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.35), 0 1px 1px rgba(255,255,255,0.4)',
            }} />
            <div className="absolute" style={{
              left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
              width: '6px', height: '6px', borderRadius: '50%',
              background: '#f2dcb0',
              boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.3)',
            }} />
          </div>

          <div className="absolute left-0 right-0 text-center"
            style={{ bottom: '3px', color: '#5c3a18', fontSize: '5.5px', letterSpacing: '0.15em', fontWeight: 700, opacity: 0.75 }}>
            33⅓ · NETEASE
          </div>

          <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-[0.12]"
            style={{
              backgroundImage: 'radial-gradient(rgba(92,58,24,0.6) 0.5px, transparent 0.7px)',
              backgroundSize: '3px 3px',
            }}
          />
        </div>

        {/* 右侧文案：紧凑版 */}
        <div
          className="absolute"
          style={{ left: '100px', right: '10px', top: '50%', transform: 'translateY(-50%)', color: contentColor, zIndex: 3 }}
        >
          <div className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full"
              style={{
                background: '#fbbf24',
                boxShadow: '0 0 6px rgba(251,191,36,0.7)',
                animation: 'pulse 3.2s ease-in-out infinite',
              }}
            />
            <span className="text-[8px] uppercase font-medium" style={{ letterSpacing: '0.3em', opacity: 0.5 }}>
              standby
            </span>
          </div>
          <div
            className="mt-0.5 truncate"
            style={{
              fontFamily: `'Songti SC', 'STSong', 'Source Han Serif SC', 'Noto Serif CJK SC', serif`,
              fontWeight: 300,
              fontSize: '15px',
              letterSpacing: '0.12em',
              lineHeight: 1.15,
            }}
          >
            抽一张来听
          </div>
          <div className="mt-0.5 text-[8.5px] truncate" style={{ opacity: 0.42, letterSpacing: '0.08em', fontWeight: 300 }}>
            — 轻触，进入
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => openApp(AppID.Music)}
      className="relative h-20 rounded-2xl overflow-hidden cursor-pointer animate-fade-in group transition-transform active:scale-[0.98]"
      style={{
        width: '240px',
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

      <div className="relative flex items-center gap-2.5 px-2.5 h-full" style={{ color: contentColor }}>
        {/* 封面 */}
        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 relative shadow-lg"
          style={{ border: '1px solid rgba(255,255,255,0.25)' }}>
          <img src={current.albumPic} alt="" className="w-full h-full object-cover"
            style={{ animation: playing ? 'spin 14s linear infinite' : 'none' }} />
        </div>

        {/* 文字 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full shrink-0"
              style={{
                background: playing ? '#4ade80' : '#fbbf24',
                boxShadow: playing ? '0 0 6px #4ade80' : 'none',
                animation: playing ? 'pulse 2s ease-in-out infinite' : 'none',
              }} />
            <div className="text-[8px] uppercase tracking-[0.18em] opacity-55 font-bold">
              {playing ? 'Now Playing' : 'Paused'}
            </div>
          </div>
          <div className="text-[13px] font-semibold truncate mt-0.5 leading-tight">{current.name}</div>
          <div className="text-[10px] opacity-60 truncate">{current.artists}</div>
        </div>

        {/* 单一播放/暂停按钮（skip 到播放器里按） */}
        <button
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0"
          style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          {playing ? <Pause size={13} weight="fill" /> : <Play size={13} weight="fill" />}
        </button>
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
