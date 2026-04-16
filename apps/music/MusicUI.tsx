/**
 * 水色 (mizuiro) 主题 — 音乐 App 视觉组件
 * 亚文化 / 二次元风格: 淡水蓝渐变, 柔光, 星芒装饰, 轻字体
 */
import React from 'react';
import {
  ArrowLeft, X, Gear, MagnifyingGlass,
  Play, Pause, SkipBack, SkipForward,
} from '@phosphor-icons/react';

// ──────── 色板 ────────
export const C = {
  bg:       '#eef5fa',       // 底色
  bgDeep:   '#dfeaf4',       // 深一点
  primary:  '#4a8db7',       // 主色 — 水色
  accent:   '#7eb8d8',       // 亮水色
  soft:     '#a8cfe0',       // 极淡
  surface:  'rgba(255,255,255,0.65)',
  text:     '#2b4d63',       // 正文
  muted:    '#7a9bb0',       // 弱文字
  faint:    '#b4cedc',       // 超弱
  vip:      '#c9956a',       // VIP 标签
  danger:   '#c75450',
} as const;

// ──────── 星芒 kirakira ✦ ────────
export const Sparkle: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 10 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" className={className} fill={C.accent} style={{ opacity: 0.6 }}>
    <path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" />
  </svg>
);

// ──────── Header ────────
export const MizuHeader: React.FC<{
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: React.ReactNode;
}> = ({ title, onBack, onClose, right }) => (
  <div className="flex items-center justify-between px-4 h-11 shrink-0" style={{ borderBottom: `1px solid ${C.faint}40` }}>
    <button
      className="w-8 h-8 flex items-center justify-center rounded-full"
      style={{ color: C.primary }}
      onClick={onBack || onClose}
    >
      {onBack ? <ArrowLeft size={18} weight="regular" /> : <X size={18} weight="regular" />}
    </button>
    <div className="flex items-center gap-1.5">
      <Sparkle size={8} />
      <span className="text-xs tracking-[0.15em] font-light italic" style={{ color: C.primary, fontFamily: 'serif' }}>{title}</span>
      <Sparkle size={8} />
    </div>
    <div className="w-8 flex justify-end">{right}</div>
  </div>
);

// ──────── 搜索栏 ────────
export const SearchBar: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  searching: boolean;
}> = ({ value, onChange, onSearch, searching }) => (
  <div className="flex gap-2 px-4 py-3">
    <div
      className="flex-1 flex items-center gap-2 rounded-full px-3 py-1.5"
      style={{ background: C.surface, border: `1px solid ${C.faint}` }}
    >
      <MagnifyingGlass size={14} color={C.muted} />
      <input
        className="flex-1 bg-transparent outline-none text-sm"
        style={{ color: C.text }}
        placeholder="搜索歌曲 / 歌手..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
      />
    </div>
    <button
      onClick={onSearch}
      disabled={searching}
      className="px-3.5 py-1.5 rounded-full text-xs text-white disabled:opacity-50 transition-opacity"
      style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})` }}
    >{searching ? '...' : '搜索'}</button>
  </div>
);

// ──────── 歌曲列表项 ────────
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
    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors"
    style={{ background: isActive ? `${C.soft}30` : 'transparent' }}
  >
    <img src={albumPic} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" style={{ border: `1px solid ${C.faint}` }} />
    <div className="flex-1 min-w-0 text-left">
      <div className="flex items-center gap-1 text-sm truncate" style={{ color: C.text }}>
        {isVip && (
          <span className="text-[9px] px-1 rounded text-white font-medium" style={{ background: C.vip }}>VIP</span>
        )}
        <span className="truncate">{name}</span>
      </div>
      <div className="text-xs truncate" style={{ color: C.muted }}>{artists} · {album}</div>
    </div>
    <div className="text-[10px] shrink-0" style={{ color: C.faint }}>{duration}</div>
  </button>
);

// ──────── Mini 播放器 ────────
export const MiniPlayer: React.FC<{
  name: string;
  artists: string;
  albumPic: string;
  playing: boolean;
  onTap: () => void;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
}> = ({ name, artists, albumPic, playing, onTap, onPrev, onToggle, onNext }) => (
  <div
    onClick={onTap}
    className="absolute left-2 right-2 bottom-2 z-30 flex items-center gap-3 rounded-2xl px-3 py-2 shadow-sm cursor-pointer"
    style={{ background: `${C.surface}`, border: `1px solid ${C.faint}60` }}
  >
    <img src={albumPic} alt="" className="w-9 h-9 rounded-lg object-cover" />
    <div className="flex-1 min-w-0 text-left">
      <div className="text-xs truncate" style={{ color: C.text }}>{name}</div>
      <div className="text-[10px] truncate" style={{ color: C.muted }}>{artists}</div>
    </div>
    <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className="p-1" style={{ color: C.muted }}><SkipBack size={16} weight="fill" /></button>
    <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="p-1" style={{ color: C.primary }}>
      {playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
    </button>
    <button onClick={(e) => { e.stopPropagation(); onNext(); }} className="p-1" style={{ color: C.muted }}><SkipForward size={16} weight="fill" /></button>
  </div>
);

// ──────── 唱片 (播放页中央) ────────
export const VinylDisc: React.FC<{ albumPic: string; playing: boolean }> = ({ albumPic, playing }) => (
  <div className="relative">
    {/* 光晕 */}
    <div
      className="absolute inset-0 rounded-full scale-110"
      style={{ background: `radial-gradient(circle, ${C.soft}60 0%, transparent 70%)` }}
    />
    {/* 唱片本体 */}
    <div
      className="relative w-48 h-48 rounded-full overflow-hidden flex items-center justify-center"
      style={{
        border: `1px solid ${C.faint}`,
        boxShadow: `0 0 40px ${C.soft}50`,
      }}
    >
      <img
        src={albumPic} alt=""
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700"
        style={{ opacity: 0.7, transform: playing ? 'scale(1.05)' : 'scale(1)' }}
      />
      {/* 中心圆 */}
      <div
        className="z-10 w-16 h-16 rounded-full flex items-center justify-center"
        style={{ background: `${C.bg}cc`, border: `1px solid ${C.faint}80` }}
      >
        <div className="w-3 h-3 rounded-full" style={{ background: C.soft }} />
      </div>
      {/* 表面反光 */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)' }} />
    </div>
    {/* 星芒装饰 */}
    <Sparkle size={12} className="absolute -top-2 -right-1" />
    <Sparkle size={8} className="absolute -bottom-1 -left-3" />
  </div>
);

// ──────── 玻璃管进度条 ────────
export const GlassProgress: React.FC<{
  progress: number;
  duration: number;
  fmtTime: (s: number) => string;
  onSeek: (pct: number) => void;
}> = ({ progress, duration, fmtTime, onSeek }) => {
  const pct = duration ? (progress / duration) * 100 : 0;
  return (
    <div className="w-full">
      <div
        className="relative h-[3px] rounded-full cursor-pointer overflow-hidden"
        style={{ background: `${C.faint}40`, border: `1px solid ${C.faint}30` }}
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          onSeek((e.clientX - rect.left) / rect.width);
        }}
      >
        <div
          className="absolute top-0 left-0 h-full rounded-full transition-[width] duration-100"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${C.primary}80, ${C.primary})`,
            boxShadow: `0 0 6px ${C.primary}40`,
          }}
        />
      </div>
      <div className="flex justify-between mt-1 px-0.5">
        <span className="text-[9px] tracking-wider" style={{ color: C.faint, fontFamily: 'monospace' }}>{fmtTime(progress)}</span>
        <span className="text-[9px] tracking-wider" style={{ color: C.faint, fontFamily: 'monospace' }}>{fmtTime(duration)}</span>
      </div>
    </div>
  );
};

// ──────── 播放控制按钮组 ────────
export const PlayControls: React.FC<{
  playing: boolean;
  loading: boolean;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
}> = ({ playing, loading, onPrev, onToggle, onNext }) => (
  <div className="flex items-center justify-center gap-8 mt-4">
    <button onClick={onPrev} style={{ color: C.muted }}><SkipBack size={24} weight="fill" /></button>
    <button
      onClick={onToggle}
      className="w-14 h-14 rounded-full flex items-center justify-center transition-transform active:scale-95"
      style={{
        background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
        boxShadow: `0 4px 16px ${C.primary}30`,
      }}
    >
      {loading ? (
        <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : playing ? (
        <Pause size={24} weight="fill" color="white" />
      ) : (
        <Play size={24} weight="fill" color="white" />
      )}
    </button>
    <button onClick={onNext} style={{ color: C.muted }}><SkipForward size={24} weight="fill" /></button>
  </div>
);

// ──────── 背景装饰 (bokeh 光斑) ────────
export const BokehBg: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    <div className="absolute top-[15%] right-[10%] w-24 h-24 rounded-full" style={{ background: `radial-gradient(circle, ${C.soft}30 0%, transparent 70%)` }} />
    <div className="absolute bottom-[30%] left-[5%] w-32 h-32 rounded-full" style={{ background: `radial-gradient(circle, ${C.accent}15 0%, transparent 70%)` }} />
    <div className="absolute top-[50%] right-[30%] w-12 h-12 rounded-full" style={{ background: `radial-gradient(circle, ${C.faint}40 0%, transparent 70%)` }} />
  </div>
);
