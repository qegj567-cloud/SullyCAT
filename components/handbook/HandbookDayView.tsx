/**
 * 当日视图 = 一本"翻开的活页本"（糖果版）
 *
 * - 左侧 9 个银色金属穿孔环 + 缝线虚线
 * - 顶部页眉:大号 serif 日号 + 月份/星期 + 蕾丝边
 * - 散落贴纸装饰整页
 * - 底部页脚:页码 + 反完美主义提示 ♡
 */

import React from 'react';
import { HandbookEntry, HandbookPage, CharacterProfile } from '../../types';
import HandbookPageCard from './HandbookPageCard';
import {
    PAPER_TONES, SERIF_STACK, CUTE_STACK, BinderRings,
    dayOfWeekZh, monthEn, dayNum,
} from './paper';
import {
    LaceEdge, HeartSticker, StarSticker, SparkleDot, BowSticker, ScatteredStickers,
} from './stickers';
import { Notebook } from '@phosphor-icons/react';

interface DayViewProps {
    date: string;
    entry: HandbookEntry | null;
    characters: CharacterProfile[];
    editingPageId: string | null;
    regenPageId: string | null;
    onStartEdit: (pageId: string) => void;
    onSavePage: (pageId: string, content: string) => void;
    onCancelEdit: () => void;
    onToggleExclude: (pageId: string) => void;
    onDeletePage: (pageId: string) => void;
    onRegenerateLifestream: (page: HandbookPage) => void;
}

const HandbookDayView: React.FC<DayViewProps> = ({
    date, entry, characters, editingPageId, regenPageId,
    onStartEdit, onSavePage, onCancelEdit, onToggleExclude, onDeletePage, onRegenerateLifestream,
}) => {
    const pages = entry?.pages || [];

    return (
        <div
            className="flex-1 overflow-y-auto pb-32 relative"
            style={{
                background: `${PAPER_TONES.paperWarm} radial-gradient(circle at 15% 8%, rgba(251,184,200,0.16) 0%, transparent 35%), radial-gradient(circle at 85% 70%, rgba(185,211,224,0.16) 0%, transparent 35%)`,
            }}
        >
            {/* 整本书的纸张内层 */}
            <div
                className="relative mx-3 mt-2 rounded-r-2xl"
                style={{
                    background: PAPER_TONES.paper,
                    minHeight: 'calc(100vh - 120px)',
                    boxShadow: '0 6px 18px -4px rgba(122,90,114,0.2), inset 0 0 0 1.5px rgba(220,199,213,0.5)',
                    paddingLeft: '36px', // 给装订环留位
                }}
            >
                {/* 装订环列（银色） */}
                <BinderRings count={9} tone="silver" />

                {/* 装订线（穿过孔的纵向虚线） */}
                <div
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{
                        left: '13px',
                        width: '1.5px',
                        background: `repeating-linear-gradient(to bottom, ${PAPER_TONES.accentRose} 0 4px, transparent 4px 8px)`,
                        opacity: 0.5,
                    }}
                    aria-hidden
                />

                {/* 顶部蕾丝边 */}
                <div className="absolute top-0 left-9 right-2 pt-1 pointer-events-none">
                    <LaceEdge color={PAPER_TONES.accentRose} flip />
                </div>

                {/* ── 页眉 ────────────────────────────── */}
                <div className="pt-7 pb-3 pr-5 relative">
                    {/* 页眉装饰贴纸 */}
                    <div className="absolute top-3 right-4 pointer-events-none" style={{ transform: 'rotate(15deg)' }}>
                        <BowSticker size={28} color={PAPER_TONES.accentRose} />
                    </div>
                    <div className="absolute top-12 right-12 pointer-events-none" style={{ transform: 'rotate(-10deg)' }}>
                        <StarSticker size={16} color={PAPER_TONES.accentLemon} />
                    </div>

                    <div className="flex items-baseline gap-3" style={SERIF_STACK}>
                        <div
                            className="text-6xl font-bold leading-none"
                            style={{ color: PAPER_TONES.ink, letterSpacing: '-0.02em' }}
                        >
                            {dayNum(date)}
                        </div>
                        <div className="flex flex-col">
                            <span
                                className="text-[11px] tracking-[0.3em]"
                                style={{ ...CUTE_STACK, color: PAPER_TONES.inkSoft }}
                            >
                                {monthEn(date)} · {date.split('-')[0]}
                            </span>
                            <span
                                className="text-[13px] mt-0.5"
                                style={{ ...CUTE_STACK, color: PAPER_TONES.ink }}
                            >
                                星期{dayOfWeekZh(date)} ♡
                            </span>
                        </div>
                    </div>

                    {/* 装饰横线 + 心 */}
                    <div className="mt-3 mr-2 flex items-center gap-2">
                        <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.5 }} />
                        <HeartSticker size={12} color={PAPER_TONES.accentBlush} sparkle={false} />
                        <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.5 }} />
                        <SparkleDot size={10} color={PAPER_TONES.accentLemon} />
                        <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.5 }} />
                    </div>
                </div>

                {/* 整页背景散落小贴纸 */}
                <ScatteredStickers seed={`day-${date}`} count={5} zone="edges" />

                {/* ── 内容区 ─────────────────────────── */}
                <div className="pr-4 pl-1 relative z-10">
                    {pages.length === 0 ? (
                        <div className="py-16 text-center" style={{ color: PAPER_TONES.inkSoft }}>
                            <Notebook className="w-10 h-10 mx-auto mb-3 opacity-40" weight="thin" />
                            <div className="text-[14px]" style={CUTE_STACK}>这一页 · 还是空白 ♡</div>
                            <div className="text-[11px] mt-2 opacity-70 leading-relaxed" style={CUTE_STACK}>
                                点下方书签让 AI 替你写一份草稿<br />
                                或者按 + 自己写一页
                            </div>
                        </div>
                    ) : (
                        pages.map(p => (
                            <HandbookPageCard
                                key={p.id}
                                page={p}
                                char={p.charId ? characters.find(c => c.id === p.charId) : undefined}
                                isEditing={editingPageId === p.id}
                                onStartEdit={() => onStartEdit(p.id)}
                                onSave={(content) => onSavePage(p.id, content)}
                                onCancel={onCancelEdit}
                                onToggleExclude={() => onToggleExclude(p.id)}
                                onDelete={() => onDeletePage(p.id)}
                                onRegenerate={p.type === 'character_life' ? () => onRegenerateLifestream(p) : undefined}
                                isRegenerating={regenPageId === p.id}
                            />
                        ))
                    )}
                </div>

                {/* ── 页脚 ────────────────────────────── */}
                {pages.length > 0 && (
                    <div className="pb-6 pt-3 pr-5 text-center relative z-10">
                        <div className="flex items-center justify-center gap-2 mb-2 px-8">
                            <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.4 }} />
                            <SparkleDot size={10} color={PAPER_TONES.accentLemon} />
                            <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.4 }} />
                        </div>
                        <div
                            className="inline-block px-4"
                            style={{ ...CUTE_STACK, color: PAPER_TONES.inkSoft }}
                        >
                            <div className="text-[10px] tracking-widest">
                                {pages.filter(p => !p.excluded).length} / {pages.length} 页 ♡
                            </div>
                            <div className="text-[10px] mt-1 opacity-70">
                                断 了 也 无 妨
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HandbookDayView;
