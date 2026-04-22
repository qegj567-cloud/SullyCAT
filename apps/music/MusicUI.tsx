/**
 * 雫 (shizuku) 主题 — 音乐 App 视觉组件
 * 水滴般清澈 + 二次元装饰: 玻璃拟态, 浮游粒子, 星芒, 柔光, 梦幻渐变
 */
import React, { useEffect } from 'react';
import {
  ArrowLeft, X, MagnifyingGlass,
  Play, Pause, SkipBack, SkipForward,
} from '@phosphor-icons/react';

/* ══════════ 色板 — 水滴 × 星空 ══════════ */
export const C = {
  bg:       '#f7fafe',       // 几乎纯白 (一抹蓝灰)
  bgDeep:   '#eef2f6',       // 轻微更深的雾白
  bgTint:   '#e8eef3',       // 最深层也只是浅雾
  primary:  '#30628a',       // 深水蓝 (强调)
  accent:   '#6ba4d0',       // 天光蓝
  soft:     '#cae6fc',       // secondary container
  glow:     '#9bcbf8',       // 发光蓝
  sakura:   '#f2b8c6',       // 樱花粉 (装饰)
  lavender: '#c5b3e6',       // 薰衣草 (装饰)
  surface:  'rgba(255,255,255,0.65)',
  glass:    'rgba(255,255,255,0.35)',
  text:     '#181c1f',       // 正文
  muted:    '#6a7f8f',       // 弱文字
  faint:    '#aeb8c2',       // 超弱
  vip:      '#d4a06a',       // VIP
  danger:   '#ba1a1a',
} as const;

/* ══════════ 全局 CSS 动画 (注入一次) ══════════ */
const STYLE_ID = '__shizuku_anims';
const injectStyles = () => {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@keyframes shizuku-float{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-18px) scale(1.08)}}
@keyframes shizuku-drift{0%{transform:translateX(0) translateY(0) rotate(0deg)}25%{transform:translateX(12px) translateY(-10px) rotate(5deg)}50%{transform:translateX(-6px) translateY(-20px) rotate(-3deg)}75%{transform:translateX(8px) translateY(-8px) rotate(4deg)}100%{transform:translateX(0) translateY(0) rotate(0deg)}}
@keyframes shizuku-twinkle{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:.9;transform:scale(1.2)}}
@keyframes shizuku-ripple{0%{transform:scale(0);opacity:.6}100%{transform:scale(4);opacity:0}}
@keyframes shizuku-glow{0%,100%{box-shadow:0 0 15px ${C.glow}30,0 0 40px ${C.glow}10}50%{box-shadow:0 0 25px ${C.glow}50,0 0 60px ${C.glow}20}}
@keyframes shizuku-vinyl{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes shizuku-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes shizuku-drop{0%{transform:translateY(-30px) scale(0);opacity:0}40%{opacity:.7}100%{transform:translateY(100vh) scale(1);opacity:0}}
.shizuku-glass{background:rgba(255,255,255,0.22);backdrop-filter:blur(16px) saturate(1.4);-webkit-backdrop-filter:blur(16px) saturate(1.4);border:1px solid rgba(255,255,255,0.35)}
.shizuku-glass-strong{background:rgba(255,255,255,0.45);backdrop-filter:blur(24px) saturate(1.6);-webkit-backdrop-filter:blur(24px) saturate(1.6);border:1px solid rgba(255,255,255,0.5)}
.shizuku-scrollbar::-webkit-scrollbar{width:3px}
.shizuku-scrollbar::-webkit-scrollbar-thumb{background:${C.faint}60;border-radius:3px}
.shizuku-scrollbar::-webkit-scrollbar-track{background:transparent}
`;
  document.head.appendChild(style);
};

/* ══════════ 星芒 kirakira ✦ (带闪烁动画) ══════════ */
export const Sparkle: React.FC<{ className?: string; size?: number; color?: string; delay?: number }> = ({
  className = '', size = 10, color = C.accent, delay = 0,
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" className={className} fill={color}
    style={{ opacity: 0.7, animation: `shizuku-twinkle 2.5s ease-in-out ${delay}s infinite` }}>
    <path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" />
  </svg>
);

/* ══════════ 十字四芒星 ✦ (窄瘦版, 用于歌词两侧) ══════════ */
export const CrossStar: React.FC<{ className?: string; size?: number; color?: string; delay?: number; solid?: boolean }> = ({
  className = '', size = 12, color = C.accent, delay = 0, solid = true,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill={color}
    style={{
      opacity: solid ? 1 : 0.5,
      filter: `drop-shadow(0 0 6px ${color})`,
      animation: `shizuku-twinkle 1.8s ease-in-out ${delay}s infinite`,
    }}>
    {/* 四角星:瘦长菱形+横向菱形叠加 */}
    <path d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z" />
  </svg>
);

/* ══════════ 水滴装饰 ══════════ */
const WaterDrop: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 8 }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 10 14" className={className} fill={C.glow} style={{ opacity: 0.4 }}>
    <path d="M5 0 C5 0 0 7 0 9.5 C0 12 2.2 14 5 14 C7.8 14 10 12 10 9.5 C10 7 5 0 5 0Z" />
  </svg>
);

/* ══════════ Header — 毛玻璃导航条 ══════════ */
export const MizuHeader: React.FC<{
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: React.ReactNode;
}> = ({ title, onBack, onClose, right }) => (
  <div className="flex items-center justify-between px-4 h-12 shrink-0 shizuku-glass-strong relative z-20"
    style={{ borderBottom: `1px solid rgba(255,255,255,0.3)` }}>
    <button
      className="w-8 h-8 flex items-center justify-center rounded-full transition-all"
      style={{ color: C.primary }}
      onClick={onBack || onClose}
    >
      {onBack ? <ArrowLeft size={16} weight="bold" /> : <X size={16} weight="bold" />}
    </button>
    <div className="flex items-center gap-2">
      <Sparkle size={7} delay={0} />
      <WaterDrop size={5} />
      <span className="text-xs tracking-[0.2em] font-light" style={{ color: C.primary, fontFamily: `'Georgia', serif`, letterSpacing: '0.2em' }}>{title}</span>
      <WaterDrop size={5} />
      <Sparkle size={7} delay={1.2} />
    </div>
    <div className="w-8 flex justify-end">{right}</div>
  </div>
);

/* ══════════ 搜索栏 — 水晶胶囊 ══════════ */
export const SearchBar: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  searching: boolean;
}> = ({ value, onChange, onSearch, searching }) => (
  <div className="flex gap-2 px-4 py-3 relative z-10">
    <div className="flex-1 flex items-center gap-2.5 rounded-2xl px-4 py-2 shizuku-glass transition-all"
      style={{
        boxShadow: `0 2px 20px ${C.glow}15, inset 0 1px 0 rgba(255,255,255,0.4)`,
      }}>
      <MagnifyingGlass size={15} color={C.muted} weight="bold" />
      <input
        className="flex-1 bg-transparent outline-none text-sm placeholder:italic"
        style={{ color: C.text }}
        placeholder="搜一首想听的歌..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
      />
      <Sparkle size={6} color={C.sakura} delay={0.5} />
    </div>
    <button
      onClick={onSearch}
      disabled={searching}
      className="px-4 py-2 rounded-2xl text-xs text-white disabled:opacity-50 transition-all relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
        boxShadow: `0 3px 15px ${C.primary}30`,
      }}
    >
      <span className="relative z-10">{searching ? '...' : '搜索'}</span>
      {/* shimmer 扫光 */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)`,
        backgroundSize: '200% 100%',
        animation: 'shizuku-shimmer 3s ease-in-out infinite',
      }} />
    </button>
  </div>
);

/* ══════════ 歌曲列表项 — 玻璃卡片 ══════════ */
export const SongRow: React.FC<{
  name: string;
  artists: string;
  album: string;
  albumPic: string;
  duration: string;
  isVip: boolean;
  isActive: boolean;
  onClick: () => void;
}> = ({ name, artists, album, albumPic, duration, isVip, isActive, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all mb-1.5 mx-1"
    style={{
      background: isActive
        ? `linear-gradient(135deg, ${C.glass}, rgba(137,212,255,0.15))`
        : 'rgba(255,255,255,0.08)',
      backdropFilter: isActive ? 'blur(12px)' : 'none',
      border: isActive ? `1px solid rgba(255,255,255,0.4)` : '1px solid transparent',
      boxShadow: isActive ? `0 2px 16px ${C.glow}15` : 'none',
    }}
  >
    {/* 封面 — 圆角 + 水光边框 */}
    <div className="relative shrink-0">
      <img src={albumPic} alt="" className="w-11 h-11 rounded-xl object-cover"
        style={{ border: `1.5px solid ${isActive ? C.accent + '60' : C.faint + '40'}` }} />
      {isActive && <div className="absolute -top-0.5 -right-0.5"><Sparkle size={8} color={C.glow} delay={0.3} /></div>}
    </div>
    <div className="flex-1 min-w-0 text-left">
      <div className="flex items-center gap-1.5 text-sm truncate" style={{ color: C.text }}>
        {isVip && (
          <span className="text-[8px] px-1.5 py-[1px] rounded-full text-white font-medium shrink-0"
            style={{ background: `linear-gradient(135deg, ${C.vip}, #e0b88a)`, letterSpacing: '0.05em' }}>VIP</span>
        )}
        <span className="truncate font-normal">{name}</span>
      </div>
      <div className="text-[11px] truncate mt-0.5" style={{ color: C.muted }}>{artists} · {album}</div>
    </div>
    <div className="text-[10px] shrink-0 tabular-nums" style={{ color: C.faint }}>{duration}</div>
  </button>
);

/* ══════════ 小头像 — 处理 emoji / URL / data: 三种 avatar ══════════ */
const TinyAvatar: React.FC<{
  avatar?: string;
  name: string;
  size?: number;
  ring?: string;
}> = ({ avatar, name, size = 28, ring = C.sakura }) => {
  const isImg = !!avatar && (avatar.startsWith('http') || avatar.startsWith('data:'));
  const style: React.CSSProperties = {
    width: size,
    height: size,
    border: `1.5px solid ${ring}`,
    boxShadow: `0 0 0 2px ${ring}22, 0 2px 8px ${ring}40`,
  };
  if (isImg) {
    return <img src={avatar} alt="" className="rounded-full object-cover shrink-0" style={style} />;
  }
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-medium"
      style={{
        ...style,
        background: `linear-gradient(135deg, ${C.sakura}, ${C.lavender})`,
        color: 'white',
        fontSize: Math.round(size * 0.42),
      }}
    >
      {avatar && avatar.length <= 4 ? avatar : (name || '·').slice(0, 1)}
    </div>
  );
};

/* ══════════ 一起听徽章 — 居中 · 两个头像 · 粉紫高级感 ══════════ */
const TogetherHeader: React.FC<{
  userAvatar?: string;
  userName?: string;
  companions: { id: string; name: string; avatar?: string }[];
  onKick?: (id: string) => void;
}> = ({ userAvatar, userName = '你', companions, onKick }) => {
  // 目前最多和一个 char 一起听 —— 居中两头像是刚好的"小情侣"结构；
  // 万一哪天同时和多个 char 听，改成主头像 + 叠头像组还能自然兼容。
  const main = companions[0];
  const extraCount = companions.length - 1;
  return (
    <div className="relative mb-2 pt-1 pb-2 rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${C.sakura}18 0%, ${C.lavender}16 50%, ${C.glow}12 100%)`,
        border: `1px solid ${C.sakura}35`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 12px ${C.sakura}20`,
      }}
    >
      {/* 背景光晕 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(ellipse at 30% 40%, ${C.sakura}40 0%, transparent 45%),
                       radial-gradient(ellipse at 70% 60%, ${C.lavender}38 0%, transparent 50%)`,
        }} />
      {/* 居中两头像 + 中间的心 */}
      <div className="relative flex items-center justify-center gap-2">
        <TinyAvatar avatar={userAvatar} name={userName} size={30} ring={C.glow} />
        <div className="flex flex-col items-center justify-center -mx-1"
          style={{ color: C.sakura }}>
          <svg width="16" height="14" viewBox="0 0 24 22" fill="none"
            style={{ filter: `drop-shadow(0 0 4px ${C.sakura})`, animation: 'shizuku-glow 2.2s ease-in-out infinite' }}>
            <path d="M12 21s-8-5.3-8-11.5C4 6 6.5 3.5 9.5 3.5c1.6 0 3 .8 2.5 2.2C11.5 4.3 12.9 3.5 14.5 3.5 17.5 3.5 20 6 20 9.5 20 15.7 12 21 12 21z"
              fill="currentColor" />
          </svg>
        </div>
        <TinyAvatar avatar={main?.avatar} name={main?.name || ''} size={30} ring={C.sakura} />
        {extraCount > 0 && (
          <span className="ml-0.5 text-[9px] px-1.5 py-0.5 rounded-full"
            style={{ background: `${C.lavender}33`, color: C.primary, border: `1px solid ${C.lavender}55` }}>
            +{extraCount}
          </span>
        )}
      </div>
      {/* 文案 */}
      <div className="relative mt-1 flex items-center justify-center gap-1.5">
        <div className="text-[10px] tracking-[0.25em] uppercase font-semibold"
          style={{ color: C.primary, opacity: 0.75 }}>
          Listening Together
        </div>
      </div>
      <div className="relative mt-0.5 text-center text-[11px]"
        style={{ color: C.primary, fontFamily: `'Noto Serif', serif` }}>
        <span className="font-medium">{userName}</span>
        <span className="mx-1 opacity-60">·</span>
        <span className="font-medium">{main?.name || ''}</span>
        {extraCount > 0 && <span className="opacity-70"> 等 {companions.length} 人</span>}
      </div>
      {/* 结束一起听 —— 右上角小 × */}
      {onKick && main && (
        <button
          onClick={(e) => { e.stopPropagation(); onKick(main.id); }}
          aria-label={`结束和 ${main.name} 的一起听`}
          className="absolute top-1 right-1.5 p-0.5 rounded-full transition-colors"
          style={{ color: C.primary, background: 'rgba(255,255,255,0.5)' }}
          title="结束一起听"
        >
          <X size={10} weight="bold" />
        </button>
      )}
    </div>
  );
};

/* ══════════ Mini 播放器 — 浮游玻璃条 ══════════ */
export const MiniPlayer: React.FC<{
  name: string;
  artists: string;
  albumPic: string;
  playing: boolean;
  onTap: () => void;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
  userAvatar?: string;   // 当前用户的头像（给"一起听"顶部用）
  userName?: string;     // 当前用户昵称
  companions?: { id: string; name: string; avatar?: string }[];   // 正在一起听的 char（切歌自动清空）
  // 点 × 立刻把该 char 从"一起听"名单里移除；下次 chat 发送时
  // 氛围/工具提示词都会掉回旁观措辞。
  onKickCompanion?: (charId: string) => void;
  charsWithSong?: { id: string; name: string; playlistTitle: string }[]; // 歌单里也有这首歌的 char
}> = ({ name, artists, albumPic, playing, onTap, onPrev, onToggle, onNext, userAvatar, userName, companions, onKickCompanion, charsWithSong }) => (
  <div
    onClick={onTap}
    className="absolute left-3 right-3 bottom-3 z-30 rounded-2xl px-3 py-2.5 cursor-pointer shizuku-glass-strong"
    style={{
      boxShadow: `0 4px 30px ${C.glow}20, 0 1px 0 inset rgba(255,255,255,0.4)`,
      animation: 'shizuku-glow 4s ease-in-out infinite',
    }}
  >
    {/* 伴听徽章 — 居中两个头像 + 心 */}
    {(companions && companions.length > 0) && (
      <TogetherHeader
        userAvatar={userAvatar}
        userName={userName}
        companions={companions}
        onKick={onKickCompanion}
      />
    )}
    <div className="flex items-center gap-3">
      {/* 封面 — 水滴圆角 */}
      <div className="relative">
        <img src={albumPic} alt="" className="w-10 h-10 rounded-xl object-cover"
          style={{ border: `1.5px solid ${C.accent}40` }} />
        {playing && <div className="absolute -bottom-1 -right-1"><Sparkle size={6} color={C.glow} /></div>}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-xs font-normal truncate" style={{ color: C.text }}>{name}</div>
        <div className="text-[10px] truncate" style={{ color: C.muted }}>{artists}</div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className="p-1.5 rounded-full transition-colors" style={{ color: C.muted }}><SkipBack size={14} weight="fill" /></button>
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="p-2 rounded-full transition-all"
          style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, boxShadow: `0 2px 10px ${C.primary}30` }}>
          {playing ? <Pause size={14} weight="fill" color="white" /> : <Play size={14} weight="fill" color="white" />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onNext(); }} className="p-1.5 rounded-full transition-colors" style={{ color: C.muted }}><SkipForward size={14} weight="fill" /></button>
      </div>
    </div>
    {/* 同款歌单提示 */}
    {(!companions || companions.length === 0) && charsWithSong && charsWithSong.length > 0 && (
      <div className="mt-1.5 text-[9px] italic truncate" style={{ color: C.muted }}>
        🎵 {charsWithSong[0].name} 的《{charsWithSong[0].playlistTitle}》里也有
        {charsWithSong.length > 1 && ` · 还有 ${charsWithSong.length - 1} 位`}
      </div>
    )}
  </div>
);

/* ══════════ 唱片 — iridescent 星云版 ══════════ */
export const VinylDisc: React.FC<{
  albumPic: string;
  playing: boolean;
  size?: number;
  bitrate?: string;
}> = ({ albumPic, playing, size = 180, bitrate }) => (
  <div className="relative" style={{ width: size, height: size }}>
    {/* 巨型模糊光晕 (aura) */}
    <div className="absolute rounded-full pointer-events-none"
      style={{
        inset: -size * 0.15,
        background: `radial-gradient(circle, ${C.glow}35 0%, ${C.sakura}15 40%, ${C.lavender}10 60%, transparent 75%)`,
        filter: 'blur(28px)',
        transform: 'scale(1.1)',
        animation: playing ? 'shizuku-float 6s ease-in-out infinite' : 'none',
      }} />

    {/* 唱片本体 */}
    <div className="relative w-full h-full rounded-full overflow-hidden flex items-center justify-center shizuku-glass"
      style={{
        animation: playing ? 'shizuku-vinyl 18s linear infinite' : 'none',
        border: `1px solid rgba(255,255,255,0.5)`,
        boxShadow: `0 0 50px ${C.glow}30, 0 0 100px ${C.sakura}10, inset 0 0 40px rgba(255,255,255,0.1)`,
      }}>
      {/* 底层封面 — 虹彩混色叠加 */}
      <img src={albumPic} alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.55, mixBlendMode: 'overlay', transform: 'rotate(30deg) scale(1.15)' }} />
      {/* 主封面 — 柔透 */}
      <img src={albumPic} alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.35 }} />
      {/* 环纹 */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `repeating-radial-gradient(circle at center, transparent 0px, transparent 10px, rgba(255,255,255,0.07) 11px, transparent 12px)` }} />
      {/* 内圈标签 */}
      <div className="z-10 rounded-full flex items-center justify-center backdrop-blur-md"
        style={{
          width: size * 0.36,
          height: size * 0.36,
          background: `rgba(255,255,255,0.75)`,
          border: `1px solid rgba(255,255,255,0.7)`,
          boxShadow: `inset 0 2px 8px rgba(255,255,255,0.6), 0 4px 12px ${C.primary}15`,
        }}>
        <div className="rounded-full"
          style={{
            width: size * 0.045,
            height: size * 0.045,
            background: C.soft,
            boxShadow: `inset 0 1px 2px rgba(0,0,0,0.1)`,
          }} />
      </div>
      {/* 表面反光 */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)' }} />
    </div>

    {/* 比特率徽章 (chip) */}
    {bitrate && (
      <div className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-sm text-[9px] tracking-[0.2em] shizuku-glass-strong"
        style={{
          color: C.primary,
          fontFamily: `'Space Grotesk', 'SF Mono', monospace`,
          letterSpacing: '0.18em',
          border: `1px solid ${C.primary}20`,
        }}>
        {bitrate}
      </div>
    )}

    {/* 装饰粒子 */}
    <Sparkle size={13} className="absolute -top-3 right-2" color={C.glow} delay={0} />
    <Sparkle size={9} className="absolute top-1/4 -left-4" color={C.sakura} delay={0.8} />
    <Sparkle size={7} className="absolute -bottom-1 left-6" color={C.lavender} delay={1.5} />
    <WaterDrop size={6} className="absolute top-[60%] -right-3" />
  </div>
);

/* ══════════ 时间 / 元数据 chip ══════════ */
export const MetaChip: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`px-2 py-0.5 text-[9px] tracking-[0.15em] ${className}`}
    style={{
      color: C.primary,
      background: 'rgba(255,255,255,0.55)',
      border: `1px solid ${C.faint}40`,
      fontFamily: `'Space Grotesk', 'SF Mono', monospace`,
    }}>
    {children}
  </span>
);

/* ══════════ 子操作行 (Like / Shuffle / Add) ══════════ */
export const SubActions: React.FC<{
  onLike?: () => void;
  onAdd?: () => void;
  liked?: boolean;
}> = ({ onLike, onAdd, liked }) => {
  const Item = ({ icon, label, onClick, active }: any) => (
    <button onClick={onClick}
      className="flex flex-col items-center gap-1 transition-opacity"
      style={{ opacity: active ? 1 : 0.45 }}>
      <div className="flex items-center justify-center w-8 h-8">{icon}</div>
      <span className="text-[8px] uppercase tracking-[0.15em]"
        style={{ color: C.primary, fontFamily: `'Space Grotesk', 'SF Mono', monospace` }}>{label}</span>
    </button>
  );
  return (
    <div className="grid grid-cols-2 gap-10 max-w-[180px] mx-auto">
      <Item onClick={onLike} active={liked} label="Like"
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? C.sakura : 'none'} stroke={C.primary} strokeWidth="1.5"><path d="M12 21s-7-4.5-7-11a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 6.5-7 11-7 11z"/></svg>} />
      <Item onClick={onAdd} label="Add"
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5"><path d="M3 6h13M3 12h13M3 18h9M17 15v6M14 18h6"/></svg>} />
    </div>
  );
};

/* ══════════ 玻璃进度条 — 水滴指示器 ══════════ */
export const GlassProgress: React.FC<{
  progress: number;
  duration: number;
  fmtTime: (s: number) => string;
  onSeek: (pct: number) => void;
}> = ({ progress, duration, fmtTime, onSeek }) => {
  const pct = duration ? (progress / duration) * 100 : 0;
  return (
    <div className="w-full">
      <div className="relative h-[6px] rounded-full cursor-pointer shizuku-glass"
        style={{ boxShadow: `inset 0 1px 3px rgba(0,0,0,0.06)` }}
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          onSeek((e.clientX - rect.left) / rect.width);
        }}>
        {/* 已播进度 */}
        <div className="absolute top-0 left-0 h-full rounded-full transition-[width] duration-150"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${C.primary}, ${C.glow})`,
            boxShadow: `0 0 10px ${C.glow}40`,
          }} />
        {/* 水滴指示点 */}
        <div className="absolute top-1/2 -translate-y-1/2 transition-[left] duration-150"
          style={{ left: `${pct}%`, transform: `translateX(-50%) translateY(-50%)` }}>
          <div className="w-3 h-3 rounded-full"
            style={{
              background: `radial-gradient(circle at 35% 35%, white, ${C.glow})`,
              boxShadow: `0 0 8px ${C.glow}60`,
            }} />
        </div>
      </div>
      <div className="flex justify-between mt-1.5 px-0.5">
        <span className="text-[9px] tracking-wider" style={{ color: C.muted, fontFamily: 'monospace' }}>{fmtTime(progress)}</span>
        <span className="text-[9px] tracking-wider" style={{ color: C.muted, fontFamily: 'monospace' }}>{fmtTime(duration)}</span>
      </div>
    </div>
  );
};

/* ══════════ 播放控制 — 发光按钮组 ══════════ */
export const PlayControls: React.FC<{
  playing: boolean;
  loading: boolean;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
}> = ({ playing, loading, onPrev, onToggle, onNext }) => (
  <div className="flex items-center justify-center gap-8 mt-3 mb-1">
    <button onClick={onPrev} className="p-2 rounded-full transition-all"
      style={{ color: C.muted }}>
      <SkipBack size={22} weight="fill" />
    </button>
    <button
      onClick={onToggle}
      className="w-[56px] h-[56px] rounded-full flex items-center justify-center transition-transform active:scale-95 relative"
      style={{
        background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
        boxShadow: `0 4px 24px ${C.glow}40, 0 0 60px ${C.glow}15`,
        animation: playing ? 'shizuku-glow 3s ease-in-out infinite' : 'none',
      }}
    >
      {loading ? (
        <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : playing ? (
        <Pause size={22} weight="fill" color="white" />
      ) : (
        <Play size={22} weight="fill" color="white" />
      )}
      {/* 外圈装饰 */}
      <div className="absolute inset-[-3px] rounded-full pointer-events-none"
        style={{ border: `1px solid rgba(255,255,255,0.2)` }} />
    </button>
    <button onClick={onNext} className="p-2 rounded-full transition-all"
      style={{ color: C.muted }}>
      <SkipForward size={22} weight="fill" />
    </button>
  </div>
);

/* ══════════ 背景装饰 — 浮游粒子 + 光斑 + 水滴 ══════════ */
export const BokehBg: React.FC = () => {
  useEffect(() => { injectStyles(); }, []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* 白色柔光 bokeh (主力) */}
      <div className="absolute top-[8%] right-[5%] w-32 h-32 rounded-full"
        style={{ background: `radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 70%)`, animation: 'shizuku-float 8s ease-in-out infinite' }} />
      <div className="absolute bottom-[25%] left-[0%] w-48 h-48 rounded-full"
        style={{ background: `radial-gradient(circle, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 70%)`, animation: 'shizuku-float 10s ease-in-out 2s infinite' }} />
      <div className="absolute top-[45%] left-[25%] w-16 h-16 rounded-full"
        style={{ background: `radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 70%)`, animation: 'shizuku-float 7s ease-in-out 1s infinite' }} />
      <div className="absolute top-[25%] right-[32%] w-24 h-24 rounded-full"
        style={{ background: `radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 70%)`, animation: 'shizuku-drift 12s ease-in-out infinite' }} />
      {/* 轻微彩色点缀 (极低饱和) */}
      <div className="absolute top-[65%] right-[10%] w-20 h-20 rounded-full"
        style={{ background: `radial-gradient(circle, ${C.sakura}18 0%, transparent 70%)`, filter: 'blur(8px)' }} />
      <div className="absolute top-[15%] left-[20%] w-16 h-16 rounded-full"
        style={{ background: `radial-gradient(circle, ${C.lavender}15 0%, transparent 70%)`, filter: 'blur(8px)' }} />
      {/* 浮游星芒 */}
      <Sparkle size={10} className="absolute top-[12%] left-[15%]" color={C.glow} delay={0} />
      <Sparkle size={7} className="absolute top-[30%] right-[20%]" color={C.sakura} delay={1} />
      <Sparkle size={5} className="absolute bottom-[40%] left-[30%]" color={C.lavender} delay={2} />
      <Sparkle size={8} className="absolute bottom-[15%] right-[12%]" color={C.accent} delay={0.5} />
      <Sparkle size={6} className="absolute top-[55%] left-[8%]" color={C.glow} delay={1.8} />
      {/* 水滴粒子 */}
      <WaterDrop size={5} className="absolute top-[20%] right-[35%]" />
      <WaterDrop size={4} className="absolute bottom-[35%] left-[45%]" />
      <WaterDrop size={6} className="absolute top-[65%] right-[8%]" />
    </div>
  );
};
