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
    // wabi-sabi · 唱片机空寂 — 静止的黑胶 + 待命的唱臂，留白与宋体文案
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
        {/* 远处一抹暖琥珀薄雾，像机身灯 */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(140% 100% at 92% 95%, rgba(251,191,36,0.12), transparent 55%),' +
              'radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.04), transparent 60%)',
          }}
        />

        {/* 唱片机：左侧 80×80 的 SVG，黑胶静止，唱臂停在外侧待命 */}
        <svg
          className="absolute pointer-events-none"
          width="80" height="80"
          viewBox="0 0 80 80"
          style={{ left: '4px', top: '50%', transform: 'translateY(-50%)' }}
        >
          <defs>
            {/* 黑胶本体：深碳黑 + 中心偏亮，模拟哑光反射 */}
            <radialGradient id="npw_vinyl" cx="40%" cy="38%" r="62%">
              <stop offset="0%"  stopColor="#2a2630" />
              <stop offset="55%" stopColor="#0d0b10" />
              <stop offset="100%" stopColor="#050408" />
            </radialGradient>
            {/* 弧形高光（侧向一缕光） */}
            <linearGradient id="npw_sheen" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.22" />
              <stop offset="40%" stopColor="#ffffff" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            {/* 中心标签：奶油复古色 */}
            <radialGradient id="npw_label" cx="35%" cy="35%" r="70%">
              <stop offset="0%"  stopColor="#f2dcb0" />
              <stop offset="60%" stopColor="#d4a574" />
              <stop offset="100%" stopColor="#8e5a2e" />
            </radialGradient>
            {/* 黄铜轴承 */}
            <radialGradient id="npw_brass" cx="30%" cy="30%" r="80%">
              <stop offset="0%"  stopColor="#ffe8b8" />
              <stop offset="50%" stopColor="#c89658" />
              <stop offset="100%" stopColor="#6d4820" />
            </radialGradient>
            {/* 唱臂金属 */}
            <linearGradient id="npw_arm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#e5cf9a" />
              <stop offset="100%" stopColor="#8c6a3a" />
            </linearGradient>
          </defs>

          {/* 盘下柔光垫 */}
          <ellipse cx="36" cy="66" rx="26" ry="3" fill="#000" opacity="0.35" />

          {/* 黑胶本体 */}
          <circle cx="36" cy="40" r="27" fill="url(#npw_vinyl)" />
          {/* 沟槽 — 极细同心圆 */}
          {[25, 23.2, 21.4, 19.6, 17.8, 16, 14.2, 12.4, 10.6].map((r, i) => (
            <circle
              key={i} cx="36" cy="40" r={r}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={i % 2 === 0 ? 0.07 : 0.04}
              strokeWidth="0.35"
            />
          ))}
          {/* 侧向反光高光 */}
          <path
            d="M 18 28 A 27 27 0 0 1 54 26"
            fill="none"
            stroke="url(#npw_sheen)"
            strokeWidth="1.2"
            opacity="0.9"
          />

          {/* 中心奶油标签 */}
          <circle cx="36" cy="40" r="8.5" fill="url(#npw_label)" />
          {/* 标签细描边，强化复古印刷感 */}
          <circle cx="36" cy="40" r="8.5" fill="none" stroke="#4a2a12" strokeOpacity="0.35" strokeWidth="0.4" />
          <circle cx="36" cy="40" r="6.2" fill="none" stroke="#4a2a12" strokeOpacity="0.25" strokeWidth="0.3" />
          {/* 主轴孔 */}
          <circle cx="36" cy="40" r="1.1" fill="#0a0608" />

          {/* 唱臂：轴承（右上角外侧） */}
          <circle cx="71" cy="11" r="3.6" fill="url(#npw_brass)" stroke="rgba(0,0,0,0.4)" strokeWidth="0.3" />
          <circle cx="71" cy="11" r="1.2" fill="#2a1a08" />
          {/* 配重（轴后一段短粗） */}
          <rect x="71.6" y="7.2" width="5.4" height="3" rx="1.4" fill="url(#npw_brass)" transform="rotate(-18 74.3 8.7)" />

          {/* 臂杆：从轴承指向右外侧待命位，不压在盘上 */}
          <line
            x1="71" y1="11" x2="66" y2="38"
            stroke="url(#npw_arm)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          {/* 唱头（cartridge）— 小方块，斜向下 */}
          <g transform="rotate(-8 66 38)">
            <rect x="63.2" y="37" width="5.6" height="3.2" rx="0.6" fill="#e8d4a8" />
            <rect x="63.2" y="39.2" width="5.6" height="1.2" fill="#3a2410" opacity="0.8" />
            {/* 针尖 */}
            <path d="M 66 40.4 L 65.6 42.6 L 66.4 42.6 Z" fill="#f5e4bc" />
          </g>

          {/* 唱臂静候时的一点呼吸光（在轴承处） */}
          <circle cx="71" cy="11" r="5" fill="#fbbf24" opacity="0.18">
            <animate attributeName="opacity" values="0.10;0.28;0.10" dur="3.6s" repeatCount="indefinite" />
          </circle>
        </svg>

        {/* 细竖线分隔 */}
        <div
          className="absolute"
          style={{
            left: '88px', top: '18px', bottom: '18px', width: '1px',
            background: `linear-gradient(180deg, transparent, ${contentColor}, transparent)`,
            opacity: 0.18,
          }}
        />

        {/* 右侧文案：宋体「等一首歌」 */}
        <div className="absolute" style={{ left: '100px', right: '14px', top: '50%', transform: 'translateY(-50%)', color: contentColor }}>
          <div className="flex items-center gap-1.5">
            <span
              className="w-1 h-1 rounded-full"
              style={{
                background: '#fbbf24',
                boxShadow: '0 0 6px rgba(251,191,36,0.7)',
                animation: 'pulse 3.2s ease-in-out infinite',
              }}
            />
            <span className="text-[8.5px] uppercase font-medium" style={{ letterSpacing: '0.4em', opacity: 0.5 }}>
              standby
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
            等一首歌
          </div>
          <div className="mt-1 text-[9.5px] truncate" style={{ opacity: 0.42, letterSpacing: '0.12em', fontWeight: 300 }}>
            — 落针即起，轻触进入
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
