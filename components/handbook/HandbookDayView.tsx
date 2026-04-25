/**
 * 当日视图 = 一本"翻开的活页本"
 *
 * - 左侧装订环列（金属穿孔环装饰）
 * - 顶部页眉:大号 serif 日期 + 月份/星期 + 装饰横线
 * - 中间堆叠多页 PageCard
 * - 底部页脚:总页数 + 反完美主义提示
 */

import React from 'react';
import { HandbookEntry, HandbookPage, CharacterProfile } from '../../types';
import HandbookPageCard from './HandbookPageCard';
import {
    PAPER_TONES, SERIF_STACK, BinderRings, dayOfWeekZh, monthEn, dayNum,
} from './paper';
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
            style={{ background: PAPER_TONES.paperCool }}
        >
            {/* 整本书的纸张内层 */}
            <div
                className="relative mx-3 mt-2 rounded-r-xl"
                style={{
                    background: PAPER_TONES.paper,
                    minHeight: 'calc(100vh - 120px)',
                    boxShadow: '0 4px 14px -4px rgba(58,47,37,0.18), inset 0 0 0 1px rgba(168,140,100,0.1)',
                    paddingLeft: '36px', // 给装订环留位
                }}
            >
                {/* 装订环列（左侧固定） */}
                <BinderRings count={9} tone="brass" />

                {/* 装订线（穿过孔的纵向虚线） */}
                <div
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{
                        left: '13px',
                        width: '1px',
                        background: `repeating-linear-gradient(to bottom, rgba(168,140,100,0.35) 0 4px, transparent 4px 8px)`,
                    }}
                    aria-hidden
                />

                {/* ── 页眉 ────────────────────────────── */}
                <div className="pt-5 pb-3 pr-5">
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
                                style={{ color: PAPER_TONES.inkSoft }}
                            >
                                {monthEn(date)} · {date.split('-')[0]}
                            </span>
                            <span
                                className="text-[13px] mt-0.5"
                                style={{ color: PAPER_TONES.ink }}
                            >
                                星期{dayOfWeekZh(date)}
                            </span>
                        </div>
                    </div>
                    {/* 装饰横线（双线） */}
                    <div className="mt-3 mr-2">
                        <div style={{ height: 1, background: PAPER_TONES.spine, opacity: 0.7 }} />
                        <div style={{ height: 1, background: PAPER_TONES.spine, opacity: 0.4, marginTop: 2 }} />
                    </div>
                </div>

                {/* ── 内容区 ─────────────────────────── */}
                <div className="pr-4 pl-1">
                    {pages.length === 0 ? (
                        <div className="py-16 text-center" style={{ color: PAPER_TONES.inkSoft }}>
                            <Notebook className="w-10 h-10 mx-auto mb-3 opacity-40" weight="thin" />
                            <div className="text-[14px]" style={SERIF_STACK}>这一页 · 还是空白</div>
                            <div className="text-[11px] mt-2 opacity-70 leading-relaxed" style={SERIF_STACK}>
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
                    <div className="pb-6 pt-3 pr-5 text-center" style={SERIF_STACK}>
                        <div
                            className="inline-block px-3"
                            style={{ color: PAPER_TONES.inkSoft, borderTop: `1px solid ${PAPER_TONES.spine}`, opacity: 0.7 }}
                        >
                            <div className="text-[10px] tracking-widest mt-2">
                                — {pages.filter(p => !p.excluded).length} / {pages.length} 页 —
                            </div>
                            <div className="text-[10px] mt-1 italic opacity-70">
                                断了也无妨
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HandbookDayView;
