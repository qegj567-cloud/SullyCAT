/**
 * 当日视图 — 一张固定比例的"纸"
 *
 * 与旧版 (一个 char 一个 spread + 顶部头像翻 spread) 完全不同:
 *   - 整页 = 一张纸,瘦长比例,尽量铺满移动端可视区
 *   - 所有 fragment(user diary + 各 char lifestream + user_note) 散落在同一张纸上
 *   - 位置由二次 LLM 调用 (generatePageLayout) 决定,存进 entry.layouts
 *   - 一张装不下 → entry.layouts 有多张,顶部有翻纸 nav (Page 1 / 2 / 3)
 *
 * 失败不兜底: 只显示报错 + "重新排版"按钮,user 自己点。
 */

import React, { useMemo, useState, useEffect } from 'react';
import { HandbookEntry, HandbookPage, CharacterProfile } from '../../types';
import JournalCanvas from './JournalCanvas';
import JournalPageEditor from './JournalPageEditor';
import { PAPER_TONES, CUTE_STACK, MONO_STACK } from './paper';
import { Notebook, CaretLeft, CaretRight, Sparkle, Warning, ArrowsClockwise } from '@phosphor-icons/react';

interface DayViewProps {
    date: string;
    entry: HandbookEntry | null;
    characters: CharacterProfile[];
    editingPageId: string | null;
    regenPageId: string | null;
    onStartEdit: (pageId: string) => void;
    onSavePage: (pageId: string, content: string, paperStyle?: string) => void;
    onCancelEdit: () => void;
    onToggleExclude: (pageId: string) => void;
    onDeletePage: (pageId: string) => void;
    onRegenerateLifestream: (page: HandbookPage) => void;
    /** 让 AI 重新排版(把已有 fragments 重新摆到纸上) */
    onGenerateLayout?: () => void;
    layoutGenerating?: boolean;
    layoutError?: string | null;
}

const HandbookDayView: React.FC<DayViewProps> = ({
    date, entry, characters, editingPageId, regenPageId,
    onStartEdit, onSavePage, onCancelEdit, onToggleExclude, onDeletePage, onRegenerateLifestream,
    onGenerateLayout, layoutGenerating, layoutError,
}) => {
    const allPages = entry?.pages || [];
    const layouts = entry?.layouts || [];

    const [paperIdx, setPaperIdx] = useState(0);

    // entry / layouts 切换 → 回到第一张纸
    useEffect(() => { setPaperIdx(0); }, [entry?.id, layouts.length]);

    const activeLayout = layouts[paperIdx] || null;

    // 编辑某页时:取出 page
    const editingPage = editingPageId ? allPages.find(p => p.id === editingPageId) : null;
    const editingChar = editingPage?.charId ? characters.find(c => c.id === editingPage.charId) : undefined;

    // 排版还需要做吗? (有 page 但 layouts 为空)
    const needsLayout = useMemo(() => {
        if (allPages.length === 0) return false;
        return layouts.length === 0;
    }, [allPages, layouts]);

    return (
        <div
            className="flex-1 flex flex-col overflow-hidden relative"
            style={{
                background: `${PAPER_TONES.paperWarm} radial-gradient(circle at 15% 8%, rgba(251,184,200,0.16) 0%, transparent 35%), radial-gradient(circle at 85% 70%, rgba(185,211,224,0.16) 0%, transparent 35%)`,
            }}
        >
            {/* 翻纸 nav (仅多张时显示) */}
            {layouts.length > 1 && (
                <div className="flex items-center justify-center gap-3 px-4 pt-2 pb-1 shrink-0">
                    <button
                        onClick={() => setPaperIdx(i => Math.max(0, i - 1))}
                        disabled={paperIdx === 0}
                        className="w-8 h-8 flex items-center justify-center rounded-full active:scale-95 transition disabled:opacity-25"
                        style={{ background: 'rgba(255,255,255,0.7)', color: PAPER_TONES.ink, border: `1px solid ${PAPER_TONES.spine}` }}
                    >
                        <CaretLeft className="w-3.5 h-3.5" weight="bold" />
                    </button>
                    <span
                        style={{
                            ...MONO_STACK,
                            fontSize: 10,
                            letterSpacing: '0.4em',
                            color: PAPER_TONES.inkFaint,
                        }}
                    >
                        ✦ PAGE {paperIdx + 1} / {layouts.length} ✦
                    </span>
                    <button
                        onClick={() => setPaperIdx(i => Math.min(layouts.length - 1, i + 1))}
                        disabled={paperIdx >= layouts.length - 1}
                        className="w-8 h-8 flex items-center justify-center rounded-full active:scale-95 transition disabled:opacity-25"
                        style={{ background: 'rgba(255,255,255,0.7)', color: PAPER_TONES.ink, border: `1px solid ${PAPER_TONES.spine}` }}
                    >
                        <CaretRight className="w-3.5 h-3.5" weight="bold" />
                    </button>
                </div>
            )}

            {/* 主画布区 — 自适应填满,留 12px 边距 */}
            <div className="flex-1 px-3 pb-3 pt-2 min-h-0">
                {allPages.length === 0 ? (
                    <EmptyDay />
                ) : needsLayout ? (
                    <NeedsLayoutCTA
                        onGenerateLayout={onGenerateLayout}
                        layoutGenerating={!!layoutGenerating}
                        layoutError={layoutError ?? null}
                    />
                ) : !activeLayout ? (
                    <EmptyDay />
                ) : (
                    <JournalCanvas
                        date={date}
                        layout={activeLayout}
                        pages={allPages}
                        characters={characters}
                        showHeader={paperIdx === 0}
                        pageNumberLabel={layouts.length > 1 ? `${paperIdx + 1} / ${layouts.length}` : undefined}
                        onPickPlacement={(pageId) => onStartEdit(pageId)}
                    />
                )}
            </div>

            {/* 排版报错条 (placement 阶段抛错时常驻显示一条 + 重试) */}
            {!needsLayout && layoutError && (
                <div
                    className="mx-3 mb-3 px-3 py-2 rounded-lg flex items-center gap-2 shrink-0"
                    style={{
                        background: '#fff5f3',
                        border: '1.5px solid #f5b8c0',
                        color: '#9a3a4f',
                        ...CUTE_STACK,
                    }}
                >
                    <Warning weight="fill" className="w-4 h-4 shrink-0" />
                    <span className="text-[11.5px] flex-1">{layoutError}</span>
                    {onGenerateLayout && (
                        <button
                            onClick={onGenerateLayout}
                            disabled={layoutGenerating}
                            className="px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 disabled:opacity-50"
                            style={{ background: PAPER_TONES.accentBlush, color: '#fff' }}
                        >
                            <ArrowsClockwise className={`w-3 h-3 ${layoutGenerating ? 'animate-spin' : ''}`} weight="bold" />
                            重试
                        </button>
                    )}
                </div>
            )}

            {/* 单页编辑覆盖层 */}
            {editingPage && (
                <JournalPageEditor
                    page={editingPage}
                    char={editingChar}
                    isRegenerating={regenPageId === editingPage.id}
                    onClose={onCancelEdit}
                    onSave={(content, paperStyle) => onSavePage(editingPage.id, content, paperStyle)}
                    onToggleExclude={() => onToggleExclude(editingPage.id)}
                    onDelete={() => { onDeletePage(editingPage.id); onCancelEdit(); }}
                    onRegenerate={editingPage.type === 'character_life'
                        ? () => onRegenerateLifestream(editingPage)
                        : undefined}
                />
            )}
        </div>
    );
};

// ─── 空状态 ──────────────────────────────────────
const EmptyDay: React.FC = () => (
    <div
        className="h-full w-full flex flex-col items-center justify-center text-center"
        style={{ color: PAPER_TONES.inkSoft }}
    >
        <Notebook className="w-12 h-12 mb-3 opacity-40" weight="thin" />
        <div className="text-[14px]" style={CUTE_STACK}>这一页 · 还是空白 ♡</div>
        <div className="text-[11px] mt-2 opacity-70 leading-relaxed px-8" style={CUTE_STACK}>
            点下方书签让 AI 替你写一份草稿<br />
            或者按 + 自己写一页
        </div>
    </div>
);

// ─── 需要排版 (有 page 但还没 layout) ─────────────
const NeedsLayoutCTA: React.FC<{
    onGenerateLayout?: () => void;
    layoutGenerating: boolean;
    layoutError: string | null;
}> = ({ onGenerateLayout, layoutGenerating, layoutError }) => (
    <div
        className="h-full w-full flex flex-col items-center justify-center text-center px-8"
        style={{ color: PAPER_TONES.inkSoft }}
    >
        <Sparkle className="w-10 h-10 mb-3 opacity-50" weight="fill" />
        <div className="text-[14px] font-bold" style={{ ...CUTE_STACK, color: PAPER_TONES.ink }}>
            还差一步 · 让 AI 排个版
        </div>
        <div className="text-[11px] mt-2 opacity-80 leading-relaxed" style={CUTE_STACK}>
            内容已经攒好,需要再调一次 AI 把它们摆到纸上,<br />
            user 和角色们就能"挤"在同一页里
        </div>
        {layoutError && (
            <div
                className="mt-3 px-3 py-2 rounded-lg flex items-center gap-2 max-w-full"
                style={{
                    background: '#fff5f3',
                    border: '1px solid #f5b8c0',
                    color: '#9a3a4f',
                    ...CUTE_STACK,
                    fontSize: 11,
                }}
            >
                <Warning weight="fill" className="w-3.5 h-3.5 shrink-0" />
                <span className="text-left flex-1 break-words">{layoutError}</span>
            </div>
        )}
        {onGenerateLayout && (
            <button
                onClick={onGenerateLayout}
                disabled={layoutGenerating}
                className="mt-4 px-5 py-2.5 rounded-full text-[13px] font-bold active:scale-95 transition disabled:opacity-50 flex items-center gap-2"
                style={{
                    ...CUTE_STACK,
                    background: PAPER_TONES.accentBlush,
                    color: '#fff',
                    boxShadow: '0 2px 6px rgba(242,157,176,0.4)',
                }}
            >
                <Sparkle weight="fill" className="w-3.5 h-3.5" />
                {layoutGenerating ? '正在拼贴…' : '排 版 ♡'}
            </button>
        )}
    </div>
);

export default HandbookDayView;
