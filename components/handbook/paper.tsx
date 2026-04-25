/**
 * 手账视觉原语：纸张样式 + 装饰小部件（装订环、胶带、贴纸感）
 *
 * 全部用 Tailwind class + inline style + SVG 实现，零额外依赖。
 */

import React from 'react';

// ─── 米白色调色板（避免 fuchsia/pink 渐变 app 风）─────
export const PAPER_TONES = {
    cover: '#a87f5d',        // 牛皮书封
    coverDark: '#7d5a3e',
    spine: '#d9c39b',        // 装订线/标签底
    paper: '#fdf6e7',        // 主纸张色
    paperWarm: '#fbf0d6',
    paperCool: '#f4f1e6',
    ink: '#3a2f25',          // 主文字色（不用纯黑）
    inkSoft: '#6b5c4d',
    accentGreen: '#a8b59f',  // 鼠尾草
    accentRose:  '#e9bcc0',  // 樱粉
    accentHoney: '#e9d18b',  // 蜜黄
    accentBlue:  '#a9b8bf',  // 雾蓝
};

// 中文衬线 fontStack（用 inline style 注入,避开 tailwind 配置改动）
export const SERIF_STACK: React.CSSProperties = {
    fontFamily: '"Noto Serif SC", "Songti SC", "Source Han Serif SC", "STSong", "STZhongsong", serif',
};

// ─── 纸张图案（每页背景）─────────────────────────────
export type PaperKind = 'plain' | 'lined' | 'grid' | 'dot' | 'cream' | 'sage' | 'rose';

export const PAPERS: Record<PaperKind, { bg: string; style?: React.CSSProperties }> = {
    plain: { bg: PAPER_TONES.paper },
    lined: {
        bg: PAPER_TONES.paper,
        style: { backgroundImage: 'repeating-linear-gradient(transparent, transparent 25px, rgba(168,140,100,0.18) 25px, rgba(168,140,100,0.18) 26px)' },
    },
    grid: {
        bg: PAPER_TONES.paper,
        style: { backgroundImage: 'linear-gradient(rgba(168,140,100,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(168,140,100,0.12) 1px, transparent 1px)', backgroundSize: '22px 22px' },
    },
    dot: {
        bg: PAPER_TONES.paperWarm,
        style: { backgroundImage: 'radial-gradient(rgba(168,140,100,0.25) 1.2px, transparent 1.2px)', backgroundSize: '20px 20px' },
    },
    cream: { bg: PAPER_TONES.paperWarm },
    sage:  { bg: '#e9eee2' },
    rose:  { bg: '#f7e6e6' },
};

// ─── 装订环列（左侧穿孔 + 金属环）─────────────────────
// SVG 渲染一列圆形装订环，固定在父容器左侧，父容器需 position:relative。
export const BinderRings: React.FC<{ count?: number; tone?: 'brass' | 'silver' | 'dark' }> = ({
    count = 7, tone = 'brass',
}) => {
    const ringColor = tone === 'brass' ? '#c9a66b' : tone === 'silver' ? '#bcbcbc' : '#5a4632';
    const holeColor = '#2c2117';
    return (
        <div
            className="absolute left-0 top-0 bottom-0 w-7 flex flex-col items-center justify-around py-3 pointer-events-none"
            aria-hidden
        >
            {Array.from({ length: count }).map((_, i) => (
                <svg key={i} viewBox="0 0 24 24" className="w-5 h-5">
                    {/* 阴影 */}
                    <ellipse cx="12" cy="13" rx="8" ry="2.5" fill="rgba(0,0,0,0.18)" />
                    {/* 穿孔（更深的色） */}
                    <circle cx="12" cy="12" r="6" fill={holeColor} />
                    {/* 金属环 */}
                    <circle cx="12" cy="12" r="6" fill="none" stroke={ringColor} strokeWidth="2.2" />
                    {/* 高光 */}
                    <path d="M 8 9 A 6 6 0 0 1 13 6.2" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1" strokeLinecap="round" />
                </svg>
            ))}
        </div>
    );
};

// ─── Washi tape 胶带（页眉装饰 + 页面分隔）─────────────
type TapeColor = 'sage' | 'rose' | 'honey' | 'blue' | 'cream';
export const WashiTape: React.FC<{
    color?: TapeColor;
    children?: React.ReactNode;
    className?: string;
    rotate?: number;
    style?: React.CSSProperties;
}> = ({ color = 'sage', children, className = '', rotate = -1, style }) => {
    const palette: Record<TapeColor, { base: string; stripe: string; text: string }> = {
        sage:  { base: 'rgba(168,181,159,0.85)', stripe: 'rgba(255,255,255,0.25)', text: '#3a4a36' },
        rose:  { base: 'rgba(233,188,192,0.85)', stripe: 'rgba(255,255,255,0.3)',  text: '#7a3845' },
        honey: { base: 'rgba(233,209,139,0.85)', stripe: 'rgba(255,255,255,0.3)',  text: '#6a4a18' },
        blue:  { base: 'rgba(169,184,191,0.85)', stripe: 'rgba(255,255,255,0.3)',  text: '#324651' },
        cream: { base: 'rgba(245,232,200,0.9)',  stripe: 'rgba(255,255,255,0.3)',  text: '#5a4825' },
    };
    const p = palette[color];
    return (
        <span
            className={`inline-block px-3 py-1 text-[11px] font-bold tracking-wider relative ${className}`}
            style={{
                background: `repeating-linear-gradient(135deg, ${p.base} 0 8px, ${p.stripe} 8px 12px, ${p.base} 12px 20px)`,
                color: p.text,
                transform: `rotate(${rotate}deg)`,
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                clipPath: 'polygon(2% 0, 100% 5%, 99% 100%, 0 95%)',
                ...style,
            }}
        >
            {children}
        </span>
    );
};

// ─── 纸的边缘阴影（"页面厚度"）─────────────────────
export const PAPER_SHADOW: React.CSSProperties = {
    boxShadow: '0 1px 2px rgba(58,47,37,0.08), 0 6px 14px -8px rgba(58,47,37,0.16), 0 0 0 1px rgba(168,140,100,0.08) inset',
};

// 倾斜的便签贴角度（lifestream/note 卡片用）
export const TILT_ANGLES = [-1.5, -0.8, 0.6, 1.4, -1.1, 1.0];
export function tiltFor(seed: string): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    return TILT_ANGLES[Math.abs(h) % TILT_ANGLES.length];
}

// ─── 中文星期 + 日期格式化 helpers ────────────────────
export const dayOfWeekZh = (date: string): string => {
    const d = new Date(date.replace(/-/g, '/'));
    return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
};

export const monthEn = (date: string): string => {
    const d = new Date(date.replace(/-/g, '/'));
    return ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
};

export const dayNum = (date: string): string => {
    const [, , d] = date.split('-');
    return d;
};

export const yearNum = (date: string): string => date.split('-')[0];
