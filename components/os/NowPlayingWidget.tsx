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
    // 「唱片从封套里抽出半片」经典封套 + 偏出黑胶视觉
    return (
      <div
        onClick={() => openApp(AppID.Music)}
        className="relative h-20 w-full rounded-2xl overflow-hidden cursor-pointer animate-fade-in group transition-transform active:scale-[0.99]"
        style={{
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

        {/* 黑胶：在封套后方偏出一截 */}
        <svg
          className="absolute pointer-events-none"
          width="128" height="80"
          viewBox="0 0 128 80"
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
          <ellipse cx="86" cy="70" rx="28" ry="2.2" fill="#000" opacity="0.35" />

          {/* 黑胶本体 — 中心 (86,40) r=28 */}
          <g>
            <circle cx="86" cy="40" r="28" fill="url(#npw_vinyl)" />
            {/* 同心沟槽 */}
            {[25, 23.2, 21.4, 19.6, 17.8, 16, 14.2, 12.4, 10.6].map((r, i) => (
              <circle key={i} cx="86" cy="40" r={r} fill="none"
                stroke="#ffffff" strokeOpacity={i % 2 === 0 ? 0.08 : 0.04} strokeWidth="0.35" />
            ))}
            {/* 弧形高光 */}
            <path d="M 66 26 A 28 28 0 0 1 106 24" fill="none" stroke="url(#npw_sheen)" strokeWidth="1.2" />
            {/* 奶油标签 */}
            <circle cx="86" cy="40" r="8.5" fill="url(#npw_label)" />
            <circle cx="86" cy="40" r="8.5" fill="none" stroke="#4a2a12" strokeOpacity="0.35" strokeWidth="0.4" />
            <circle cx="86" cy="40" r="6.2" fill="none" stroke="#4a2a12" strokeOpacity="0.25" strokeWidth="0.3" />
            {/* 主轴孔 */}
            <circle cx="86" cy="40" r="1.1" fill="#0a0608" />
          </g>
        </svg>

        {/* 封套 — 覆盖黑胶左半，露出右侧一截 */}
        <div
          className="absolute overflow-hidden"
          style={{
            left: '8px', top: '8px', width: '64px', height: '64px',
            borderRadius: '3px',
            background: `
              linear-gradient(135deg, #f5ead0 0%, #e6d1a3 55%, #c9a769 100%)`,
            boxShadow:
              '0 6px 18px rgba(0,0,0,0.32), ' +
              'inset 0 1px 0 rgba(255,255,255,0.55), ' +
              'inset 0 -1px 0 rgba(0,0,0,0.12), ' +
              'inset -1px 0 0 rgba(0,0,0,0.08)',
            zIndex: 2,
          }}
        >
          {/* 顶部印刷条 */}
          <div className="absolute left-0 right-0 text-center"
            style={{ top: '5px', color: '#5c3a18', fontSize: '7px', letterSpacing: '0.32em', fontWeight: 800 }}>
            SIDE A
          </div>
          {/* 双细线分隔 */}
          <div className="absolute" style={{ left: '8px', right: '8px', top: '14px', height: '1px', background: '#5c3a18', opacity: 0.35 }} />
          <div className="absolute" style={{ left: '8px', right: '8px', top: '16px', height: '1px', background: '#5c3a18', opacity: 0.18 }} />

          {/* 中央印章：模拟封套上的艺术图 */}
          <div className="absolute"
            style={{ left: '50%', top: '54%', transform: 'translate(-50%,-50%)', width: '30px', height: '30px' }}>
            <div className="w-full h-full rounded-full" style={{
              background: 'radial-gradient(circle at 35% 30%, #d4a574 0%, #7a4a20 60%, #3a1f08 100%)',
              boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.35), 0 1px 1px rgba(255,255,255,0.4)',
            }} />
            {/* 印章里套一个圆眼 */}
            <div className="absolute" style={{
              left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
              width: '8px', height: '8px', borderRadius: '50%',
              background: '#f2dcb0',
              boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.3)',
            }} />
          </div>

          {/* 底部信息条 */}
          <div className="absolute left-0 right-0 text-center"
            style={{ bottom: '4px', color: '#5c3a18', fontSize: '6px', letterSpacing: '0.18em', fontWeight: 700, opacity: 0.75 }}>
            33⅓ · NETEASE
          </div>

          {/* 纸感斑驳纹理：薄薄一层噪点 */}
          <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-[0.12]"
            style={{
              backgroundImage:
                'radial-gradient(rgba(92,58,24,0.6) 0.5px, transparent 0.7px)',
              backgroundSize: '3px 3px',
            }}
          />
        </div>

        {/* 右侧文案 */}
        <div
          className="absolute"
          style={{ left: '128px', right: '14px', top: '50%', transform: 'translateY(-50%)', color: contentColor, zIndex: 3 }}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full"
              style={{
                background: '#fbbf24',
                boxShadow: '0 0 6px rgba(251,191,36,0.7)',
                animation: 'pulse 3.2s ease-in-out infinite',
              }}
            />
            <span className="text-[8.5px] uppercase font-medium" style={{ letterSpacing: '0.4em', opacity: 0.5 }}>
              side a · standby
            </span>
          </div>
          <div
            className="mt-1 truncate"
            style={{
              fontFamily: `'Songti SC', 'STSong', 'Source Han Serif SC', 'Noto Serif CJK SC', serif`,
              fontWeight: 300,
              fontSize: '17px',
              letterSpacing: '0.18em',
              lineHeight: 1.1,
            }}
          >
            抽一张来听
          </div>
          <div className="mt-1 text-[9.5px] truncate" style={{ opacity: 0.42, letterSpacing: '0.12em', fontWeight: 300 }}>
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
