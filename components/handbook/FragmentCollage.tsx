/**
 * 碎片拼贴(杂志风重写版)
 *
 * 核心改动:
 * - 不再全是一种圆角彩色便签 → 6 种"卡片皮肤"由 fragment.id 种子随机分配
 *   1) sticky_*  彩色便签(最基础,5 色循环)
 *   2) polaroid  拍立得相片(白边 + 顶部色块作"图")
 *   3) ripped    撕边横线纸(顶/底 zigzag 撕边)
 *   4) sticker   透明贴纸标签(无背景,只有外圈虚线)
 *   5) washi_card 白卡 + 顶部彩色 washi 横条
 *   6) handnote  手写感小卡(浅色斜纸,字体歪一点)
 * - 尺寸 4 档(xs / sm / md / lg),按 text 长度自动:
 *     xs <20 字 → 方形 / 椭圆,~50% 宽
 *     sm 20~40 → 窄 ~60%
 *     md 40~70 → 中 ~75%
 *     lg >70   → 宽 ~88%
 * - 真正重叠:相邻片段 30~50% 概率给一个负 margin -20~-50px
 * - 段间偶尔插入:整条 washi 胶带 / 横跨两片回形针 / 小贴纸串 / 手绘箭头
 * - 横向偏移更大幅(±18%),不再只是左右两列
 */

import React from 'react';
import { HandbookFragment } from '../../types';
import {
    PAPER_TONES, SERIF_STACK, CUTE_STACK, WashiTape,
    seedRange, seedCentered, seedFloat,
} from './paper';
import {
    HeartSticker, StarSticker, SparkleDot, PaperClip,
} from './stickers';

// ─── 卡片皮肤 ───────────────────────────────────
type SkinKind = 'sticky' | 'polaroid' | 'ripped' | 'sticker' | 'washi_card' | 'handnote';

const STICKY_PALETTES = [
    { bg: '#fff0f5', border: '#fbb8c8', accent: '#f29db0' },
    { bg: '#f0faf5', border: '#bfe1cf', accent: '#88c5a8' },
    { bg: '#fef9e0', border: '#f5e295', accent: '#d6b85a' },
    { bg: '#eef4f9', border: '#b9d3e0', accent: '#7ea7be' },
    { bg: '#f5eef7', border: '#d6c8e8', accent: '#a98ec4' },
];

const HANDNOTE_PALETTES = [
    { bg: '#fffaf2', tint: '#e8a8b4' },  // 暖米
    { bg: '#f6fbf9', tint: '#88c5a8' },  // 冷绿
    { bg: '#fdf9eb', tint: '#d6b85a' },  // 蜜
    { bg: '#f4f7fb', tint: '#7ea7be' },  // 雾蓝
];

function pickSkin(id: string): SkinKind {
    const skins: SkinKind[] = [
        'sticky', 'sticky', 'sticky',         // 便签出现频率最高
        'polaroid',                            // 偶尔拍立得
        'washi_card', 'washi_card',
        'ripped',
        'sticker',
        'handnote',
    ];
    const idx = Math.floor(seedFloat(id, 9) * skins.length);
    return skins[idx];
}

// 按 text 长度选尺寸档
function pickSize(text: string): 'xs' | 'sm' | 'md' | 'lg' {
    const len = text.length;
    if (len < 20) return 'xs';
    if (len < 40) return 'sm';
    if (len < 70) return 'md';
    return 'lg';
}

const SIZE_TO_WIDTH: Record<'xs' | 'sm' | 'md' | 'lg', [number, number]> = {
    xs: [42, 56],
    sm: [54, 68],
    md: [68, 82],
    lg: [80, 92],
};

// ─── 单个 fragment 的卡片渲染 ─────────────────────
const FragmentCard: React.FC<{
    fragment: HandbookFragment;
    skin: SkinKind;
}> = ({ fragment, skin }) => {
    const { id, text, time } = fragment;
    const stickyIdx = Math.floor(seedFloat(id, 13) * STICKY_PALETTES.length);
    const stickyColor = STICKY_PALETTES[stickyIdx];

    // 时间标签(各 skin 通用,但样式微调)
    const timeBadge = time && (
        <div
            className="inline-block px-1.5 py-0 mb-1 rounded"
            style={{
                ...CUTE_STACK,
                fontSize: 9,
                letterSpacing: '0.1em',
                color: PAPER_TONES.inkSoft,
                background: 'rgba(255,255,255,0.55)',
                border: `1px solid ${stickyColor.border}`,
            }}
        >
            ◆ {time}
        </div>
    );

    const textStyle: React.CSSProperties = {
        ...SERIF_STACK,
        fontSize: 13,
        lineHeight: '21px',
        color: PAPER_TONES.ink,
        margin: 0,
    };

    if (skin === 'sticky') {
        return (
            <div
                className="px-3 py-2.5 rounded-md"
                style={{
                    background: stickyColor.bg,
                    border: `1px solid ${stickyColor.border}`,
                    boxShadow: '0 1px 3px rgba(122,90,114,0.1), 0 4px 10px -6px rgba(122,90,114,0.18)',
                }}
            >
                {timeBadge}
                <p className="whitespace-pre-wrap break-words" style={textStyle}>{text}</p>
            </div>
        );
    }

    if (skin === 'polaroid') {
        // 顶部色块"图" + 底部白边
        const blockHeight = Math.min(60, 32 + text.length * 0.4);
        return (
            <div
                className="rounded-sm"
                style={{
                    background: '#fff',
                    padding: '8px 8px 18px 8px',
                    boxShadow: '0 2px 4px rgba(122,90,114,0.12), 0 8px 18px -8px rgba(122,90,114,0.22)',
                }}
            >
                <div
                    style={{
                        height: blockHeight,
                        borderRadius: 2,
                        background: `linear-gradient(135deg, ${stickyColor.bg} 0%, ${stickyColor.border} 100%)`,
                        marginBottom: 8,
                        position: 'relative',
                    }}
                >
                    {time && (
                        <span
                            className="absolute top-1 left-1.5 px-1 py-0 rounded text-[9px]"
                            style={{
                                ...CUTE_STACK,
                                background: 'rgba(255,255,255,0.85)',
                                color: PAPER_TONES.inkSoft,
                                letterSpacing: '0.1em',
                            }}
                        >
                            ◆ {time}
                        </span>
                    )}
                </div>
                <p className="whitespace-pre-wrap break-words" style={textStyle}>{text}</p>
            </div>
        );
    }

    if (skin === 'ripped') {
        // 上下 zigzag 撕边的横线纸
        return (
            <div className="relative">
                <ZigzagEdge color="#fff" flip={false} />
                <div
                    className="px-3 py-3"
                    style={{
                        background: '#fff',
                        backgroundImage: `repeating-linear-gradient(transparent, transparent 21px, ${stickyColor.border} 21px, ${stickyColor.border} 22px)`,
                        boxShadow: '0 1px 2px rgba(122,90,114,0.1)',
                    }}
                >
                    {timeBadge}
                    <p className="whitespace-pre-wrap break-words" style={{ ...textStyle, color: PAPER_TONES.ink }}>{text}</p>
                </div>
                <ZigzagEdge color="#fff" flip={true} />
            </div>
        );
    }

    if (skin === 'sticker') {
        // 透明贴纸:无 bg,只有虚线圆角外框 + 一点 accent 描边
        return (
            <div
                className="px-3 py-2"
                style={{
                    background: 'rgba(255,255,255,0.4)',
                    border: `1.5px dashed ${stickyColor.accent}`,
                    borderRadius: 18,
                    backdropFilter: 'blur(2px)',
                }}
            >
                {time && (
                    <span
                        className="inline-block mb-1 text-[9px] tracking-widest"
                        style={{ ...CUTE_STACK, color: stickyColor.accent }}
                    >
                        ◆ {time}
                    </span>
                )}
                <p className="whitespace-pre-wrap break-words" style={textStyle}>{text}</p>
            </div>
        );
    }

    if (skin === 'washi_card') {
        // 白卡 + 顶部彩色 washi 横条
        const tapeColors: Array<'rose' | 'mint' | 'lemon' | 'blue' | 'lavender'> = ['rose','mint','lemon','blue','lavender'];
        const tapeColor = tapeColors[Math.floor(seedFloat(id, 17) * tapeColors.length)];
        return (
            <div
                className="relative pt-5 pb-3 px-3 rounded-sm"
                style={{
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(122,90,114,0.1), 0 4px 10px -6px rgba(122,90,114,0.16)',
                }}
            >
                <div className="absolute -top-2 left-3 right-3 h-3.5 pointer-events-none">
                    <div
                        style={{
                            height: '100%',
                            background: `repeating-linear-gradient(135deg, ${stickyColor.bg} 0 8px, ${stickyColor.border}aa 8px 14px)`,
                            transform: 'rotate(-1deg)',
                            clipPath: 'polygon(2% 0, 99% 6%, 100% 100%, 0 95%)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                        }}
                    />
                </div>
                {timeBadge}
                <p className="whitespace-pre-wrap break-words" style={textStyle}>{text}</p>
            </div>
        );
    }

    if (skin === 'handnote') {
        // 手写感斜纸,字色用 tint
        const palIdx = Math.floor(seedFloat(id, 19) * HANDNOTE_PALETTES.length);
        const pal = HANDNOTE_PALETTES[palIdx];
        return (
            <div
                className="px-3 py-2.5"
                style={{
                    background: pal.bg,
                    border: `1px solid ${pal.tint}55`,
                    borderRadius: 4,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
            >
                {time && (
                    <span
                        className="inline-block mb-1 text-[9px] tracking-widest italic"
                        style={{ ...CUTE_STACK, color: pal.tint }}
                    >
                        ◆ {time}
                    </span>
                )}
                <p
                    className="whitespace-pre-wrap break-words"
                    style={{
                        ...SERIF_STACK,
                        fontSize: 13,
                        lineHeight: '22px',
                        color: pal.tint,
                        margin: 0,
                        fontStyle: 'italic',
                    }}
                >
                    {text}
                </p>
            </div>
        );
    }

    return null;
};

// ─── zigzag 撕边小工具(ripped skin 用) ───────────
const ZigzagEdge: React.FC<{ color: string; flip: boolean }> = ({ color, flip }) => (
    <svg
        viewBox="0 0 100 6"
        preserveAspectRatio="none"
        style={{ width: '100%', height: 6, display: 'block', transform: flip ? 'scaleY(-1)' : undefined }}
        aria-hidden
    >
        <polygon
            points="0,6 4,0 8,6 12,0 16,6 20,0 24,6 28,0 32,6 36,0 40,6 44,0 48,6 52,0 56,6 60,0 64,6 68,0 72,6 76,0 80,6 84,0 88,6 92,0 96,6 100,0 100,6"
            fill={color}
        />
    </svg>
);

// ─── 段间装饰(整条 washi / 回形针 / 箭头 / 心串) ─
const InterleaveDeco: React.FC<{ kind: 'washi' | 'clipchain' | 'arrow' | 'sparkles' | 'heartstrip'; seed: string }> = ({ kind, seed }) => {
    if (kind === 'washi') {
        const tapes: Array<'rose' | 'mint' | 'lemon' | 'blue' | 'lavender'> = ['rose','mint','lemon','blue','lavender'];
        const c = tapes[Math.floor(seedFloat(seed, 1) * tapes.length)];
        const widthPct = seedRange(seed, 2, 60, 95);
        const offsetX = seedCentered(seed, 3, 8);
        const rotate = seedCentered(seed, 4, 4);
        return (
            <div
                style={{
                    width: `${widthPct}%`,
                    marginLeft: `${50 + offsetX - widthPct / 2}%`,
                    marginTop: 6,
                    marginBottom: 4,
                    transform: `rotate(${rotate}deg)`,
                }}
            >
                <WashiTape color={c} pattern="dot" rotate={0}>
                    {' · '}
                </WashiTape>
            </div>
        );
    }
    if (kind === 'clipchain') {
        return (
            <div
                style={{
                    marginTop: -6,
                    marginBottom: 4,
                    paddingLeft: `${seedRange(seed, 1, 5, 60)}%`,
                    transform: `rotate(${seedCentered(seed, 2, 8)}deg)`,
                }}
            >
                <PaperClip color={PAPER_TONES.accentSilver} rotate={seedCentered(seed, 3, 30)} size={26} />
            </div>
        );
    }
    if (kind === 'arrow') {
        return (
            <div
                style={{
                    marginTop: 2, marginBottom: 2,
                    paddingLeft: `${seedRange(seed, 1, 10, 70)}%`,
                    transform: `rotate(${seedCentered(seed, 2, 15)}deg)`,
                }}
            >
                <svg viewBox="0 0 32 12" width={32} height={12}>
                    <path
                        d="M 1 6 Q 8 1 16 6 Q 24 11 30 6 L 26 4 M 30 6 L 26 8"
                        fill="none"
                        stroke={PAPER_TONES.accentBlush}
                        strokeWidth="1.4"
                        strokeLinecap="round"
                    />
                </svg>
            </div>
        );
    }
    if (kind === 'heartstrip') {
        const count = 3 + Math.floor(seedFloat(seed, 1) * 4);
        return (
            <div
                className="flex items-center gap-1"
                style={{
                    paddingLeft: `${seedRange(seed, 2, 5, 50)}%`,
                    marginTop: 2, marginBottom: 2,
                    transform: `rotate(${seedCentered(seed, 3, 6)}deg)`,
                }}
            >
                {Array.from({ length: count }).map((_, i) => (
                    <HeartSticker key={i} size={10 + Math.floor(seedFloat(seed, i + 4) * 4)} sparkle={false} />
                ))}
            </div>
        );
    }
    if (kind === 'sparkles') {
        return (
            <div
                className="flex items-center gap-2"
                style={{
                    paddingLeft: `${seedRange(seed, 1, 10, 60)}%`,
                    marginTop: 2, marginBottom: 2,
                }}
            >
                <StarSticker size={12} color={PAPER_TONES.accentLemon} />
                <SparkleDot size={10} color={PAPER_TONES.accentBlue} />
                <StarSticker size={10} color={PAPER_TONES.accentRose} />
            </div>
        );
    }
    return null;
};

// ─── 主组件 ──────────────────────────────────────
const FragmentCollage: React.FC<{
    fragments: HandbookFragment[];
    /** 顶级容器内的左右"画布"宽度,默认占满 */
    compact?: boolean;
}> = ({ fragments, compact: _compact = false }) => {
    if (!fragments || fragments.length === 0) return null;

    return (
        <div className="relative pt-2 pb-2">
            {fragments.map((f, i) => {
                const skin = pickSkin(f.id);
                const size = pickSize(f.text);
                const [wMin, wMax] = SIZE_TO_WIDTH[size];
                const widthPct = seedRange(f.id, 21, wMin, wMax);
                // 横向偏移更大幅,真正打散感
                const offsetX = seedCentered(f.id, 22, 18);
                const marginLeftPct = Math.max(-2, Math.min(98 - widthPct,
                    50 + offsetX - widthPct / 2,
                ));
                const rotate = seedCentered(f.id, 23, skin === 'sticker' ? 2 : 5);

                // 重叠概率:30~40% 概率拉大负 margin,与上一片重叠
                const wantsOverlap = i > 0 && seedFloat(f.id, 24) > 0.6;
                const marginTop = i === 0
                    ? 6
                    : wantsOverlap
                        ? Math.round(seedRange(f.id, 25, -50, -20))
                        : Math.round(seedRange(f.id, 25, 4, 22));

                // 偶尔顶部加 paper clip
                const hasClip = seedFloat(f.id, 26) > 0.78;
                // z-index 递增让后写的盖前面
                const zIndex = 10 + i;

                // 段间装饰:每 ~2 片之间偶尔插一个 deco(不影响 fragment 本身渲染)
                const insertDecoBefore = i > 0 && i % 2 === 0 && seedFloat(f.id, 27) > 0.5;
                const decoKinds = ['washi', 'clipchain', 'arrow', 'sparkles', 'heartstrip'] as const;
                const decoKind = decoKinds[Math.floor(seedFloat(f.id, 28) * decoKinds.length)];

                return (
                    <React.Fragment key={f.id}>
                        {insertDecoBefore && (
                            <InterleaveDeco kind={decoKind} seed={f.id + ':deco'} />
                        )}
                        <div
                            style={{
                                position: 'relative',
                                width: `${widthPct}%`,
                                marginLeft: `${marginLeftPct}%`,
                                marginTop,
                                transform: `rotate(${rotate}deg)`,
                                transformOrigin: 'center top',
                                zIndex,
                                transition: 'transform 0.2s ease',
                            }}
                        >
                            {hasClip && (
                                <div
                                    className="absolute -top-2.5 z-10 pointer-events-none"
                                    style={{
                                        [marginLeftPct < 30 ? 'right' : 'left']: 12,
                                    } as React.CSSProperties}
                                >
                                    <PaperClip
                                        color={PAPER_TONES.accentSilver}
                                        rotate={marginLeftPct < 30 ? 25 : -25}
                                        size={22}
                                    />
                                </div>
                            )}
                            <FragmentCard fragment={f} skin={skin} />
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default FragmentCollage;
