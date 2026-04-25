/**
 * 当日视图 = "拼贴跨页"
 *
 * 关键改动(vs 上版):
 * - 不再是垂直 stack,而是 collage —— 每页用 page id 作种子,
 *   随机化:横向偏移 ±12% / 宽度 65~85% / 旋转 ±4° / 垂直重叠 -10~-40px
 * - z-index 递增,后写的盖在前面（手账翻页"贴上去"的层次感）
 * - 每页之间散落 dialog bubble / 小贴纸做"碎片整理"感
 * - 整体布局不像日记一条直线,像翻开拼贴本
 */

import React from 'react';
import { HandbookEntry, HandbookPage, CharacterProfile } from '../../types';
import HandbookPageCard from './HandbookPageCard';
import {
    PAPER_TONES, SERIF_STACK, CUTE_STACK, BinderRings,
    dayOfWeekZh, monthEn, dayNum, seedRange, seedCentered,
} from './paper';
import {
    LaceEdge, HeartSticker, StarSticker, SparkleDot, BowSticker,
    ScatteredStickers, ScatterFillers, DialogueBubble, KAWAII_INTERJECTIONS,
    PaperClip,
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

// 计算单页的拼贴布局（位置/宽度/旋转/重叠）
function layoutFor(page: HandbookPage, index: number, isEditing: boolean) {
    // 编辑中的页面：归正、放大、置顶。让用户输入时不晕
    if (isEditing) {
        return {
            offsetXPct: 0,
            widthPct: 92,
            rotate: 0,
            marginTop: index === 0 ? 8 : 28,
            zIndex: 9999,
        };
    }
    const seed = page.id;
    // user_diary 是"主体"（更宽更端正）；其他偏 sticky
    const isMain = page.type === 'user_diary';
    return {
        offsetXPct: isMain
            ? seedCentered(seed, 1, 5)            // 主体偏移小
            : seedCentered(seed, 1, 14),          // 配菜偏移大
        widthPct: isMain
            ? seedRange(seed, 2, 84, 92)
            : seedRange(seed, 2, 64, 80),
        rotate: isMain
            ? seedCentered(seed, 3, 1.5)          // 主体几乎不歪
            : seedCentered(seed, 3, 4.5),         // 配菜歪 ±4.5°
        marginTop: index === 0
            ? 12
            : isMain
                ? Math.round(seedRange(seed, 4, 10, 30))   // 主体之间留点距
                : Math.round(seedCentered(seed, 4, 30) - 18), // 配菜常常重叠 -18~+12
        zIndex: 100 + index,
    };
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
            <div
                className="relative mx-3 mt-2 rounded-r-2xl"
                style={{
                    background: PAPER_TONES.paper,
                    minHeight: 'calc(100vh - 120px)',
                    boxShadow: '0 6px 18px -4px rgba(122,90,114,0.2), inset 0 0 0 1.5px rgba(220,199,213,0.5)',
                    paddingLeft: '36px',
                }}
            >
                {/* 装订环 + 缝线 */}
                <BinderRings count={9} tone="silver" />
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

                {/* 顶部蕾丝 */}
                <div className="absolute top-0 left-9 right-2 pt-1 pointer-events-none">
                    <LaceEdge color={PAPER_TONES.accentRose} flip />
                </div>

                {/* ── 页眉:大日期 + 装饰 ──────────────────── */}
                <div className="pt-7 pb-2 pr-5 relative">
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
                            <span className="text-[11px] tracking-[0.3em]" style={{ ...CUTE_STACK, color: PAPER_TONES.inkSoft }}>
                                {monthEn(date)} · {date.split('-')[0]}
                            </span>
                            <span className="text-[13px] mt-0.5" style={{ ...CUTE_STACK, color: PAPER_TONES.ink }}>
                                星期{dayOfWeekZh(date)} ♡
                            </span>
                        </div>
                    </div>
                    <div className="mt-2 mr-2 flex items-center gap-2">
                        <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.5 }} />
                        <HeartSticker size={12} color={PAPER_TONES.accentBlush} sparkle={false} />
                        <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.5 }} />
                        <SparkleDot size={10} color={PAPER_TONES.accentLemon} />
                        <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.5 }} />
                    </div>
                    {/* 副标题:今日碎片 */}
                    <div className="mt-2 text-center pr-2">
                        <span
                            className="text-[10px] tracking-[0.3em] italic"
                            style={{ ...CUTE_STACK, color: PAPER_TONES.inkFaint }}
                        >
                            ✦ 今 日 碎 片 ✦
                        </span>
                    </div>
                </div>

                {/* 整页背景散落小贴纸 */}
                <ScatteredStickers seed={`day-${date}`} count={5} zone="edges" />

                {/* ── 拼贴内容区 ─────────────────────── */}
                <div className="relative pr-3 pl-1 pt-2" style={{ minHeight: 200 }}>
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
                        <>
                            {pages.map((p, i) => {
                                const L = layoutFor(p, i, editingPageId === p.id);
                                return (
                                    <div
                                        key={p.id}
                                        style={{
                                            position: 'relative',
                                            width: `${L.widthPct}%`,
                                            marginLeft: `${L.offsetXPct}%`,
                                            marginTop: L.marginTop,
                                            transform: `rotate(${L.rotate}deg)`,
                                            transformOrigin: 'center top',
                                            zIndex: L.zIndex,
                                            transition: 'transform 0.25s ease, margin 0.25s ease, width 0.25s ease',
                                        }}
                                    >
                                        <HandbookPageCard
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
                                    </div>
                                );
                            })}

                            {/* 拼贴空隙的"碎片填充":对话气泡 + 散落贴纸 */}
                            <PageGapFillers seed={`fillers-${date}`} pageCount={pages.length} />
                        </>
                    )}
                </div>

                {/* ── 页脚 ────────────────────────────── */}
                {pages.length > 0 && (
                    <div className="pb-6 pt-6 pr-5 text-center relative z-10">
                        <div className="flex items-center justify-center gap-2 mb-2 px-8">
                            <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.4 }} />
                            <SparkleDot size={10} color={PAPER_TONES.accentLemon} />
                            <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.4 }} />
                        </div>
                        <div className="inline-block px-4" style={{ ...CUTE_STACK, color: PAPER_TONES.inkSoft }}>
                            <div className="text-[10px] tracking-widest">
                                {pages.filter(p => !p.excluded).length} / {pages.length} 片 ♡
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

// ─── 在拼贴页之间散落"碎片填充"(对话气泡 + clip + 小贴纸) ──
const PageGapFillers: React.FC<{ seed: string; pageCount: number }> = ({ seed, pageCount }) => {
    if (pageCount === 0) return null;
    // 数量随页数走
    const count = Math.min(Math.max(pageCount, 2), 5);
    const colors = [PAPER_TONES.accentRose, PAPER_TONES.accentBlue, PAPER_TONES.accentMint, PAPER_TONES.accentLemon];
    const items: React.ReactNode[] = [];

    for (let i = 0; i < count; i++) {
        const top = seedRange(seed, i * 13 + 1, 8, 92); // 全屏散布
        const isLeft = i % 2 === 0;
        const left = isLeft
            ? seedRange(seed, i * 13 + 2, -2, 8)
            : seedRange(seed, i * 13 + 2, 80, 92);
        const rotate = seedCentered(seed, i * 13 + 3, 25);
        const kind = Math.floor(seedRange(seed, i * 13 + 4, 0, 4));

        let node: React.ReactNode;
        if (kind === 0) {
            const txt = KAWAII_INTERJECTIONS[Math.floor(seedRange(seed, i * 13 + 5, 0, KAWAII_INTERJECTIONS.length))];
            const color = colors[Math.floor(seedRange(seed, i * 13 + 6, 0, colors.length))];
            node = <DialogueBubble text={txt} color={color} direction={isLeft ? 'left' : 'right'} />;
        } else if (kind === 1) {
            node = <PaperClip color={PAPER_TONES.accentSilver} rotate={rotate} size={26} />;
        } else if (kind === 2) {
            node = <HeartSticker size={18} />;
        } else {
            node = <StarSticker size={16} color={PAPER_TONES.accentLemon} />;
        }

        items.push(
            <div
                key={i}
                style={{
                    position: 'absolute',
                    top: `${top}%`,
                    left: `${left}%`,
                    transform: `rotate(${rotate}deg)`,
                    pointerEvents: 'none',
                    zIndex: 50,
                }}
            >
                {node}
            </div>
        );
    }
    return <>{items}</>;
};

export default HandbookDayView;
