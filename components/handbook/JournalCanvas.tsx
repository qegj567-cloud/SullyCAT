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
    JP_STACK, dayNum, monthEn, dayOfWeekZh, seedFloat, seedRange,
} from './paper';
import { LaceEdge, HeartSticker, SparkleDot, BowSticker, StarSticker, PaperClip } from './stickers';
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

            {/* 装饰贴纸(克制 2 颗,放在不会挡 placement 的极角) */}
            <div className="absolute pointer-events-none" style={{ top: 6, right: 6, transform: 'rotate(15deg)', zIndex: 1 }}>
                <BowSticker size={20} color={PAPER_TONES.accentRose} />
            </div>
            <div className="absolute pointer-events-none" style={{ bottom: 14, right: 10, zIndex: 1 }}>
                <SparkleDot size={9} color={PAPER_TONES.accentBlue} />
            </div>

            {/* 日期页眉 — 1_files "rainy thoughts" 风, kicker + 大花体标题 + 副标 */}
            {showHeader && (
                <div className="absolute pointer-events-none" style={{ top: 8, left: 38, right: 14, zIndex: 1 }}>
                    {/* courier kicker 顶戳 */}
                    <div
                        className="flex items-center justify-between"
                        style={{
                            ...MONO_STACK,
                            fontSize: 9,
                            letterSpacing: '0.32em',
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

                    {/* SECTION 副标 */}
                    <div
                        className="mt-1"
                        style={{
                            ...MONO_STACK,
                            fontSize: 8,
                            letterSpacing: '0.32em',
                            color: PAPER_TONES.inkFaint,
                        }}
                    >
                        SECTION · {monthEn(date)} / {dayNum(date)}
                    </div>

                    {/* 杂志感大花体标题 (随种子选 8 选 1) */}
                    <h1
                        style={{
                            ...DISPLAY_STACK,
                            fontStyle: 'italic',
                            fontSize: 30,
                            lineHeight: 1.0,
                            color: PAPER_TONES.ink,
                            margin: '2px 0 0',
                            letterSpacing: '-0.01em',
                            fontWeight: 400,
                        }}
                    >
                        {(() => {
                            const titles = [
                                'rainy thoughts', 'soft morning', 'small things',
                                'one more day', 'tea & quiet', 'between hours',
                                'this little life', 'a usual tuesday',
                            ];
                            return titles[Math.floor(seedFloat(date, 91) * titles.length)];
                        })()}
                    </h1>

                    {/* 副标:日文 + 大数字 */}
                    <div className="flex items-end justify-between mt-1">
                        <span
                            style={{
                                ...JP_STACK,
                                fontSize: 11,
                                letterSpacing: '0.18em',
                                color: PAPER_TONES.inkSoft,
                            }}
                        >
                            {(() => {
                                const sub = ['雨の日のメモ', '春の一日', 'ささやかな日記', '今日のかけら', '小さな瞬間'];
                                return sub[Math.floor(seedFloat(date, 92) * sub.length)];
                            })()}
                        </span>
                        <span
                            style={{
                                ...DISPLAY_STACK,
                                fontSize: 26,
                                lineHeight: 1,
                                color: PAPER_TONES.accentBlush,
                                fontStyle: 'italic',
                            }}
                        >
                            {dayNum(date)}
                        </span>
                    </div>

                    {/* 装饰条 */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                        <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.5 }} />
                        <SparkleDot size={8} color={PAPER_TONES.accentLemon} />
                        <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.5 }} />
                    </div>
                </div>
            )}

            {/* 第二张及以后,顶部用一个简洁 jolt + 翻页装饰 */}
            {!showHeader && (
                <div className="absolute pointer-events-none" style={{ top: 8, left: 38, right: 14, zIndex: 1 }}>
                    <div
                        className="flex items-center justify-between"
                        style={{ ...MONO_STACK, fontSize: 9, letterSpacing: '0.32em', color: PAPER_TONES.inkFaint }}
                    >
                        <span>cont. · {monthEn(date)} {dayNum(date)}</span>
                        <PaperClip size={18} color={PAPER_TONES.accentSilver} rotate={-15} />
                    </div>
                </div>
            )}

            {/* 画布 — 可摆 fragment 的整页 */}
            <div
                className="absolute"
                style={{
                    left: 32,
                    right: 4,
                    top: showHeader ? 130 : 32,
                    bottom: 36,
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

            {/* 页脚 — tagline + 大数字 030 */}
            <div
                className="absolute pointer-events-none flex items-end justify-between"
                style={{ bottom: 8, left: 38, right: 14, zIndex: 1 }}
            >
                <span
                    style={{
                        ...SCRIPT_STACK,
                        fontSize: 11,
                        color: PAPER_TONES.inkFaint,
                        opacity: 0.75,
                    }}
                >
                    {(() => {
                        const taglines = [
                            'this is why i love this world',
                            'small things, kept gently',
                            'just a usual tuesday ♡',
                            'let the day stay',
                            'to remember, softly',
                        ];
                        return taglines[Math.floor(seedFloat(date, 99) * taglines.length)];
                    })()}
                </span>
                <span
                    style={{
                        ...DISPLAY_STACK,
                        fontStyle: 'italic',
                        fontSize: 18,
                        lineHeight: 1,
                        color: PAPER_TONES.inkSoft,
                    }}
                >
                    {pageNumberLabel
                        ? pageNumberLabel
                        : String(Math.floor(seedRange(date, 88, 10, 99))).padStart(3, '0')}
                </span>
            </div>

            {/* 装订处中段一颗小心心 */}
            <div className="absolute pointer-events-none" style={{ top: '50%', left: 4, transform: 'translateY(-50%) rotate(-12deg)', zIndex: 1 }}>
                <HeartSticker size={11} color={PAPER_TONES.accentBlush} sparkle={false} />
            </div>
            <div className="absolute pointer-events-none" style={{ top: 110, right: 8, transform: 'rotate(-8deg)', zIndex: 1 }}>
                <StarSticker size={11} color={PAPER_TONES.accentLemon} />
            </div>
        </div>
    );
};

export default JournalCanvas;
