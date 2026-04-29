/**
 * 一张"纸"的画布
 *
 * - 容器自适应父宽 + 父高,默认填满,但用 maxWidth 限制宽屏不要无限拉
 * - 内部坐标系: 整张纸 = 100% x 100%, 每个 placement 用 % 落位
 * - 装饰: 左侧装订环 + 顶部 lace + 散落贴纸(由父级传入)
 *
 * 不负责日期头/翻页/编辑 — 只画一张纸的内容。
 */

import React from 'react';
import {
    HandbookPage, CharacterProfile, HandbookLayout, HandbookFragment,
} from '../../types';
import {
    PAPER_TONES, BinderRings, MONO_STACK, DISPLAY_STACK, SCRIPT_STACK,
    JP_STACK, dayNum, monthEn, dayOfWeekZh, seedFloat, seasonOf, seasonLabel,
} from './paper';
import { LaceEdge, HeartSticker, SparkleDot, BowSticker, StarSticker } from './stickers';
import JournalFragmentCard from './JournalFragmentCard';

interface Props {
    date: string;
    layout: HandbookLayout;
    pages: HandbookPage[];
    characters: CharacterProfile[];
    /** 点击某个 placement → 父级决定怎么处理(打开编辑/操作菜单) */
    onPickPlacement?: (pageId: string, fragmentId?: string) => void;
    /** 是否显示日期页眉(只有第一张纸显示) */
    showHeader?: boolean;
    pageNumberLabel?: string;     // "1 / 3" 之类,显示在右下角
}

const JournalCanvas: React.FC<Props> = ({
    date, layout, pages, characters, onPickPlacement, showHeader = true, pageNumberLabel,
}) => {
    // 把 pageId → page,fragmentId → fragment 建索引
    const pageMap = new Map<string, HandbookPage>();
    pages.forEach(p => pageMap.set(p.id, p));
    const fragMap = new Map<string, HandbookFragment>();
    pages.forEach(p => p.fragments?.forEach(f => fragMap.set(f.id, f)));

    return (
        <div
            className="relative mx-auto"
            style={{
                width: '100%',
                height: '100%',
                maxWidth: 480,
                background: PAPER_TONES.paper,
                boxShadow: '0 6px 22px -6px rgba(122,90,114,0.25), inset 0 0 0 1.5px rgba(220,199,213,0.5)',
                borderRadius: 6,
                paddingLeft: 30,             // 给装订环让位
                overflow: 'hidden',
            }}
        >
            <BinderRings count={11} tone="silver" />

            {/* 左侧装订线 */}
            <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                    left: 13, width: 1.5,
                    background: `repeating-linear-gradient(to bottom, ${PAPER_TONES.accentRose} 0 4px, transparent 4px 8px)`,
                    opacity: 0.5,
                }}
                aria-hidden
            />
            {/* 顶部 lace 边 */}
            <div className="absolute top-0 left-9 right-2 pt-1 pointer-events-none">
                <LaceEdge color={PAPER_TONES.accentRose} flip />
            </div>

            {/* 装饰贴纸(克制 2~3 颗) */}
            <div className="absolute top-3 right-3 pointer-events-none" style={{ transform: 'rotate(15deg)' }}>
                <BowSticker size={22} color={PAPER_TONES.accentRose} />
            </div>
            <div className="absolute pointer-events-none" style={{ top: 60, right: 14, transform: 'rotate(-12deg)' }}>
                <StarSticker size={12} color={PAPER_TONES.accentLemon} />
            </div>
            <div className="absolute pointer-events-none" style={{ bottom: 70, left: 36, transform: 'rotate(8deg)' }}>
                <HeartSticker size={11} color={PAPER_TONES.accentLavender} sparkle={false} />
            </div>
            <div className="absolute pointer-events-none" style={{ bottom: 24, right: 18 }}>
                <SparkleDot size={9} color={PAPER_TONES.accentBlue} />
            </div>

            {/* 日期页眉 — 1_files 风格,courier 顶戳 + 大数字 + caveat 心情 */}
            {showHeader && (
                <div className="absolute pointer-events-none" style={{ top: 12, left: 38, right: 12 }}>
                    <div
                        className="flex items-center justify-between"
                        style={{
                            ...MONO_STACK,
                            fontSize: 9.5,
                            letterSpacing: '0.28em',
                            color: PAPER_TONES.inkFaint,
                        }}
                    >
                        <span>
                            DATE · {date.split('-').slice(1).join(' / ')} ·{' '}
                            {dayOfWeekZh(date) === '日' ? 'SUN'
                                : dayOfWeekZh(date) === '一' ? 'MON'
                                : dayOfWeekZh(date) === '二' ? 'TUE'
                                : dayOfWeekZh(date) === '三' ? 'WED'
                                : dayOfWeekZh(date) === '四' ? 'THU'
                                : dayOfWeekZh(date) === '五' ? 'FRI' : 'SAT'}
                        </span>
                        <span style={{ ...SCRIPT_STACK, fontSize: 16, color: PAPER_TONES.accentBlush, letterSpacing: 'normal' }}>
                            {(() => {
                                const moods = ['晴れ ☀', 'くもり ☁', '心地よい ♡', 'good day ✿', 'just right'];
                                return moods[Math.floor(seedFloat(date, 1) * moods.length)];
                            })()}
                        </span>
                    </div>

                    <div className="flex items-end gap-2 mt-0.5">
                        <div
                            style={{
                                ...DISPLAY_STACK,
                                fontSize: 48,
                                lineHeight: 0.85,
                                color: PAPER_TONES.ink,
                                letterSpacing: '-0.02em',
                            }}
                        >
                            {dayNum(date)}
                        </div>
                        <div className="flex flex-col mb-0.5">
                            <span
                                style={{
                                    ...MONO_STACK,
                                    fontSize: 9,
                                    letterSpacing: '0.3em',
                                    color: PAPER_TONES.inkSoft,
                                }}
                            >
                                {monthEn(date)} · {date.split('-')[0]}
                            </span>
                            <span
                                style={{
                                    ...JP_STACK,
                                    fontSize: 9,
                                    letterSpacing: '0.3em',
                                    color: PAPER_TONES.inkFaint,
                                    marginTop: 1,
                                }}
                            >
                                {seasonLabel(seasonOf(date)).jp} の 一 日
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* 画布 — 可摆 fragment 的整页 */}
            <div
                className="absolute"
                style={{
                    left: 30,
                    right: 0,
                    top: showHeader ? 76 : 16,
                    bottom: 28,
                }}
            >
                {layout.placements.map((pl, i) => {
                    const page = pageMap.get(pl.pageId);
                    if (!page) return null;
                    const fragment = pl.fragmentId ? fragMap.get(pl.fragmentId) : undefined;
                    const char = page.charId ? characters.find(c => c.id === page.charId) : undefined;

                    return (
                        <div
                            key={`${pl.pageId}-${pl.fragmentId ?? 'page'}-${i}`}
                            style={{
                                position: 'absolute',
                                left: `${pl.xPct}%`,
                                top: `${pl.yPct}%`,
                                width: `${pl.widthPct}%`,
                                transform: `rotate(${pl.rotate}deg)`,
                                transformOrigin: 'top left',
                                zIndex: pl.zIndex,
                            }}
                        >
                            <JournalFragmentCard
                                fragment={fragment}
                                page={page}
                                char={char}
                                role={pl.role}
                                onTap={onPickPlacement ? () => onPickPlacement(pl.pageId, pl.fragmentId) : undefined}
                            />
                        </div>
                    );
                })}
            </div>

            {/* 右下角页码 */}
            {pageNumberLabel && (
                <div
                    className="absolute pointer-events-none"
                    style={{
                        bottom: 8, right: 14,
                        ...MONO_STACK,
                        fontSize: 9,
                        letterSpacing: '0.3em',
                        color: PAPER_TONES.inkFaint,
                    }}
                >
                    {pageNumberLabel}
                </div>
            )}
        </div>
    );
};

export default JournalCanvas;
