/**
 * 碎片拼贴 — 在角色/日记区域内,把 LLM 输出的多条 fragments
 * 渲染成一组互相错落、重叠、不同纸色的"小便签"
 *
 * 设计:
 * - 每条 fragment 用 fragment.id 作种子,稳定但拼贴感的随机化
 *   (横向偏移 / 旋转 / 纸色 / 宽度)
 * - 不同 fragment 之间允许小重叠,但不像段落那样压在一起
 * - 一些条会带 time 标签作为左上小标记(像便签上撕一角写时间)
 * - paperclip / 小心 / 星 散落在每条 fragment 边缘
 */

import React from 'react';
import { HandbookFragment } from '../../types';
import {
    PAPER_TONES, SERIF_STACK, CUTE_STACK, PAPER_SHADOW,
    seedRange, seedCentered, seedFloat,
} from './paper';
import { HeartSticker, StarSticker, SparkleDot, PaperClip } from './stickers';

// 5 种小便签纸色,按 fragment id 循环挑
const NOTE_COLORS = [
    { bg: '#fff0f5', border: '#fbb8c8' },  // 樱粉
    { bg: '#f0faf5', border: '#bfe1cf' },  // 薄荷
    { bg: '#fef9e0', border: '#f5e295' },  // 蜜黄
    { bg: '#eef4f9', border: '#b9d3e0' },  // 雾蓝
    { bg: '#f5eef7', border: '#d6c8e8' },  // 薰衣草
];

// 几种小贴纸(按 idx 决定每条用哪个)
const CORNER_DECOS = [
    () => <HeartSticker size={14} />,
    () => <StarSticker size={14} color={PAPER_TONES.accentLemon} />,
    () => <SparkleDot size={11} color={PAPER_TONES.accentBlue} />,
    null, // 有时不放贴纸
    () => <HeartSticker size={12} color={PAPER_TONES.accentBlush} sparkle={false} />,
    null,
];

interface Props {
    fragments: HandbookFragment[];
    /** 父容器宽度参考(用于横向偏移百分比的计算)。一般直接占满父级即可不传 */
    compact?: boolean;
}

const FragmentCollage: React.FC<Props> = ({ fragments, compact = false }) => {
    if (!fragments || fragments.length === 0) return null;

    return (
        <div className="relative" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {fragments.map((f, i) => {
                // 风格化随机
                const colorIdx = Math.floor(seedFloat(f.id, 1) * NOTE_COLORS.length);
                const decoIdx = Math.floor(seedFloat(f.id, 2) * CORNER_DECOS.length);
                const color = NOTE_COLORS[colorIdx];
                const Deco = CORNER_DECOS[decoIdx];

                const isLeft = i % 2 === 0;
                // 横向偏移:左/右两列错开,加些抖动
                const offsetX = isLeft
                    ? seedRange(f.id, 3, -1, 7)
                    : seedRange(f.id, 3, 8, 18);
                const widthPct = compact
                    ? seedRange(f.id, 4, 78, 92)
                    : seedRange(f.id, 4, 70, 88);
                const rotate = seedCentered(f.id, 5, 4);
                const marginTop = i === 0
                    ? 8
                    : Math.round(seedRange(f.id, 6, -10, 16)); // 偶尔重叠
                // 偶尔顶部贴个小回形针
                const hasClip = seedFloat(f.id, 7) > 0.7;

                return (
                    <div
                        key={f.id}
                        style={{
                            position: 'relative',
                            width: `${widthPct}%`,
                            marginLeft: `${offsetX}%`,
                            marginTop,
                            transform: `rotate(${rotate}deg)`,
                            zIndex: 10 + i,
                            transition: 'transform 0.2s ease',
                        }}
                    >
                        {/* 顶部回形针(随机) */}
                        {hasClip && (
                            <div
                                className="absolute -top-2.5 z-10 pointer-events-none"
                                style={{ [isLeft ? 'right' : 'left']: 12 } as React.CSSProperties}
                            >
                                <PaperClip
                                    color={PAPER_TONES.accentSilver}
                                    rotate={isLeft ? 25 : -25}
                                    size={20}
                                />
                            </div>
                        )}
                        {/* 角落小贴纸(随机) */}
                        {Deco && (
                            <div
                                className="absolute -top-2 -right-1 z-10 pointer-events-none"
                                style={{ transform: `rotate(${seedCentered(f.id, 8, 30)}deg)` }}
                            >
                                <Deco />
                            </div>
                        )}

                        {/* 便签主体 */}
                        <div
                            className="px-3 py-2.5 rounded-md"
                            style={{
                                background: color.bg,
                                border: `1px solid ${color.border}`,
                                ...PAPER_SHADOW,
                            }}
                        >
                            {/* time 标签(小角标) */}
                            {f.time && (
                                <div
                                    className="inline-block mb-1 px-1.5 py-0 rounded"
                                    style={{
                                        ...CUTE_STACK,
                                        fontSize: 9,
                                        letterSpacing: '0.1em',
                                        color: PAPER_TONES.inkSoft,
                                        background: 'rgba(255,255,255,0.6)',
                                        border: `1px solid ${color.border}`,
                                    }}
                                >
                                    ◆ {f.time}
                                </div>
                            )}
                            {/* 正文 */}
                            <p
                                className="whitespace-pre-wrap break-words"
                                style={{
                                    ...SERIF_STACK,
                                    fontSize: 13,
                                    lineHeight: '22px',
                                    color: PAPER_TONES.ink,
                                    margin: 0,
                                }}
                            >
                                {f.text}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default FragmentCollage;
