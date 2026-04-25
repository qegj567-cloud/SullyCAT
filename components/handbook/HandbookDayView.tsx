/**
 * 当日视图 = 多个"翻页",一次显示一页
 *
 * 关键改动 (vs 上版):
 * - 不再把所有 pages 堆在同一个 collage 里 → 按 owner 分组成多个 spread:
 *     spread "me"   : 所有 user_diary / user_note / free 页面
 *     spread <char> : 该角色的 character_life 页面
 * - 顶部出现"翻页选项卡":一排圆形头像 + 一个"我"icon,点击切 spread
 * - 一次只渲染一个 spread,避免不同 owner 的内容互相挤
 * - 每个 spread 内的 pages 仍然以拼贴形式落到画面上
 */

import React, { useState, useMemo, useEffect } from 'react';
import { HandbookEntry, HandbookPage, CharacterProfile } from '../../types';
import HandbookPageCard from './HandbookPageCard';
import {
    PAPER_TONES, SERIF_STACK, CUTE_STACK, BinderRings,
    dayOfWeekZh, monthEn, dayNum, seedRange, seedCentered,
} from './paper';
import {
    LaceEdge, HeartSticker, StarSticker, SparkleDot, BowSticker,
    ScatteredStickers, DialogueBubble, KAWAII_INTERJECTIONS, PaperClip,
} from './stickers';
import { Notebook, CaretLeft, CaretRight } from '@phosphor-icons/react';

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

type SpreadKey = 'me' | string; // 'me' 或 charId

interface Spread {
    key: SpreadKey;
    label: string;       // "我" 或 角色名
    avatar?: string;     // 角色头像 url(me 用 ✦ icon)
    color: string;
    pages: HandbookPage[];
}

function groupIntoSpreads(pages: HandbookPage[], characters: CharacterProfile[]): Spread[] {
    const mePages: HandbookPage[] = [];
    const charBuckets: Record<string, HandbookPage[]> = {};
    for (const p of pages) {
        if (p.type === 'character_life' && p.charId) {
            if (!charBuckets[p.charId]) charBuckets[p.charId] = [];
            charBuckets[p.charId].push(p);
        } else {
            mePages.push(p);
        }
    }
    const spreads: Spread[] = [];
    spreads.push({
        key: 'me',
        label: '我',
        color: PAPER_TONES.accentRose,
        pages: mePages,
    });
    for (const charId of Object.keys(charBuckets)) {
        const c = characters.find(ch => ch.id === charId);
        if (!c) continue;
        spreads.push({
            key: charId,
            label: c.name,
            avatar: c.avatar,
            color: PAPER_TONES.accentBlue,
            pages: charBuckets[charId],
        });
    }
    return spreads;
}

// ─── 单个 page 在 spread 内的布局 ──────────────────
function layoutFor(page: HandbookPage, index: number, isEditing: boolean) {
    if (isEditing) {
        return { offsetXPct: 2, widthPct: 95, rotate: 0, marginTop: index === 0 ? 8 : 28, zIndex: 9999 };
    }
    const seed = page.id;
    const isMain = page.type === 'user_diary' || page.type === 'character_life';
    return {
        offsetXPct: isMain
            ? seedCentered(seed, 1, 4)
            : seedCentered(seed, 1, 12),
        widthPct: isMain
            ? seedRange(seed, 2, 86, 94)
            : seedRange(seed, 2, 70, 86),
        rotate: isMain
            ? seedCentered(seed, 3, 1.5)
            : seedCentered(seed, 3, 4),
        marginTop: index === 0
            ? 12
            : isMain
                ? Math.round(seedRange(seed, 4, 14, 32))
                : Math.round(seedCentered(seed, 4, 30) - 16),
        zIndex: 100 + index,
    };
}

// ─── 翻页选项卡 ─────────────────────────────────
const SpreadSelector: React.FC<{
    spreads: Spread[];
    activeKey: SpreadKey;
    onSwitch: (key: SpreadKey) => void;
}> = ({ spreads, activeKey, onSwitch }) => {
    if (spreads.length <= 1) return null;
    return (
        <div className="px-3 py-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2.5 px-1">
                {spreads.map(s => {
                    const active = s.key === activeKey;
                    return (
                        <button
                            key={s.key}
                            onClick={() => onSwitch(s.key)}
                            className="flex flex-col items-center shrink-0 active:scale-95 transition"
                            style={{ opacity: active ? 1 : 0.55 }}
                        >
                            <div
                                className="rounded-full overflow-hidden flex items-center justify-center"
                                style={{
                                    width: active ? 44 : 36,
                                    height: active ? 44 : 36,
                                    background: active ? '#fff' : 'rgba(253,246,231,0.7)',
                                    border: active ? `2.5px solid ${s.color}` : `1.5px solid ${PAPER_TONES.spine}`,
                                    boxShadow: active ? '0 2px 8px -2px rgba(122,90,114,0.3)' : 'none',
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                {s.avatar ? (
                                    <img src={s.avatar} alt={s.label} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-lg" style={{ color: s.color }}>✦</span>
                                )}
                            </div>
                            <span
                                className="text-[10px] mt-1 max-w-[44px] truncate"
                                style={{
                                    ...CUTE_STACK,
                                    color: active ? PAPER_TONES.ink : PAPER_TONES.inkSoft,
                                    fontWeight: active ? 700 : 400,
                                }}
                            >
                                {s.label}
                            </span>
                            {/* 角标:几页 */}
                            <span
                                className="text-[8px] tracking-widest"
                                style={{ ...CUTE_STACK, color: PAPER_TONES.inkFaint }}
                            >
                                {s.pages.length}页
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const HandbookDayView: React.FC<DayViewProps> = ({
    date, entry, characters, editingPageId, regenPageId,
    onStartEdit, onSavePage, onCancelEdit, onToggleExclude, onDeletePage, onRegenerateLifestream,
}) => {
    const allPages = entry?.pages || [];
    const spreads = useMemo(() => groupIntoSpreads(allPages, characters), [allPages, characters]);

    const [activeKey, setActiveKey] = useState<SpreadKey>(spreads[0]?.key ?? 'me');

    // entry 切换 / spreads 数量变化时,如果当前 key 不在 spread 列表里就回到第一个
    useEffect(() => {
        if (!spreads.find(s => s.key === activeKey)) {
            setActiveKey(spreads[0]?.key ?? 'me');
        }
    }, [spreads, activeKey]);

    // 编辑某页时:自动切到该页所在的 spread
    useEffect(() => {
        if (!editingPageId) return;
        const page = allPages.find(p => p.id === editingPageId);
        if (!page) return;
        const targetKey: SpreadKey = page.type === 'character_life' && page.charId ? page.charId : 'me';
        if (targetKey !== activeKey) setActiveKey(targetKey);
    }, [editingPageId]);

    const activeSpread = spreads.find(s => s.key === activeKey) || spreads[0];

    // 上下页箭头(在选项卡少时也能翻)
    const activeIdx = spreads.findIndex(s => s.key === activeKey);
    const goPrev = () => activeIdx > 0 && setActiveKey(spreads[activeIdx - 1].key);
    const goNext = () => activeIdx < spreads.length - 1 && setActiveKey(spreads[activeIdx + 1].key);

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
                <BinderRings count={9} tone="silver" />
                <div
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{
                        left: '13px', width: '1.5px',
                        background: `repeating-linear-gradient(to bottom, ${PAPER_TONES.accentRose} 0 4px, transparent 4px 8px)`,
                        opacity: 0.5,
                    }}
                    aria-hidden
                />
                <div className="absolute top-0 left-9 right-2 pt-1 pointer-events-none">
                    <LaceEdge color={PAPER_TONES.accentRose} flip />
                </div>

                {/* 页眉:大日期 */}
                <div className="pt-7 pb-2 pr-5 relative">
                    <div className="absolute top-3 right-4 pointer-events-none" style={{ transform: 'rotate(15deg)' }}>
                        <BowSticker size={26} color={PAPER_TONES.accentRose} />
                    </div>
                    <div className="absolute top-12 right-12 pointer-events-none" style={{ transform: 'rotate(-10deg)' }}>
                        <StarSticker size={14} color={PAPER_TONES.accentLemon} />
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
                        <HeartSticker size={11} color={PAPER_TONES.accentBlush} sparkle={false} />
                        <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.5 }} />
                        <SparkleDot size={9} color={PAPER_TONES.accentLemon} />
                        <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.5 }} />
                    </div>
                </div>

                {/* 翻页选项卡 */}
                <SpreadSelector
                    spreads={spreads}
                    activeKey={activeKey}
                    onSwitch={setActiveKey}
                />

                {/* 当前 spread 的页眉:谁的一页 + 翻页箭头 */}
                {activeSpread && allPages.length > 0 && (
                    <div className="px-4 pt-1 pb-2 flex items-center justify-between">
                        <button
                            onClick={goPrev}
                            disabled={activeIdx <= 0}
                            className="w-7 h-7 flex items-center justify-center rounded-full active:scale-95 transition disabled:opacity-30"
                            style={{ background: 'rgba(253,246,231,0.7)', color: PAPER_TONES.ink }}
                        >
                            <CaretLeft className="w-3 h-3" weight="bold" />
                        </button>
                        <div className="text-center" style={CUTE_STACK}>
                            <div className="text-[10px] tracking-[0.3em]" style={{ color: PAPER_TONES.inkFaint }}>
                                ✦ {activeIdx + 1} / {spreads.length} ✦
                            </div>
                            <div className="text-[12px] font-bold mt-0.5" style={{ color: activeSpread.color }}>
                                {activeKey === 'me' ? '我 的 一 天' : `${activeSpread.label} · 的 今 天`}
                            </div>
                        </div>
                        <button
                            onClick={goNext}
                            disabled={activeIdx >= spreads.length - 1}
                            className="w-7 h-7 flex items-center justify-center rounded-full active:scale-95 transition disabled:opacity-30"
                            style={{ background: 'rgba(253,246,231,0.7)', color: PAPER_TONES.ink }}
                        >
                            <CaretRight className="w-3 h-3" weight="bold" />
                        </button>
                    </div>
                )}

                {/* 整页背景散落小贴纸(只在 spread 内部) */}
                <ScatteredStickers seed={`day-${date}-${activeKey}`} count={4} zone="edges" />

                {/* 当前 spread 的内容 */}
                <div className="relative pr-3 pl-1 pt-1" style={{ minHeight: 200 }}>
                    {allPages.length === 0 ? (
                        <div className="py-16 text-center" style={{ color: PAPER_TONES.inkSoft }}>
                            <Notebook className="w-10 h-10 mx-auto mb-3 opacity-40" weight="thin" />
                            <div className="text-[14px]" style={CUTE_STACK}>这一页 · 还是空白 ♡</div>
                            <div className="text-[11px] mt-2 opacity-70 leading-relaxed" style={CUTE_STACK}>
                                点下方书签让 AI 替你写一份草稿<br />
                                或者按 + 自己写一页
                            </div>
                        </div>
                    ) : !activeSpread || activeSpread.pages.length === 0 ? (
                        <div className="py-12 text-center" style={{ color: PAPER_TONES.inkSoft }}>
                            <div className="text-[12px]" style={CUTE_STACK}>这一页空着 ♡</div>
                        </div>
                    ) : (
                        <>
                            {activeSpread.pages.map((p, i) => {
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

                            <SpreadGapFillers seed={`fillers-${date}-${activeKey}`} pageCount={activeSpread.pages.length} />
                        </>
                    )}
                </div>

                {/* 页脚 */}
                {allPages.length > 0 && (
                    <div className="pb-6 pt-6 pr-5 text-center relative z-10">
                        <div className="flex items-center justify-center gap-2 mb-2 px-8">
                            <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.4 }} />
                            <SparkleDot size={9} color={PAPER_TONES.accentLemon} />
                            <div style={{ flex: 1, height: 1, background: PAPER_TONES.accentRose, opacity: 0.4 }} />
                        </div>
                        <div className="inline-block px-4" style={{ ...CUTE_STACK, color: PAPER_TONES.inkSoft }}>
                            <div className="text-[10px] tracking-widest">
                                {allPages.filter(p => !p.excluded).length} / {allPages.length} 片 ♡
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

// 在 spread 内部散布的小填充元素
const SpreadGapFillers: React.FC<{ seed: string; pageCount: number }> = ({ seed, pageCount }) => {
    if (pageCount === 0) return null;
    const count = Math.min(Math.max(pageCount, 1), 3);
    const colors = [PAPER_TONES.accentRose, PAPER_TONES.accentBlue, PAPER_TONES.accentMint, PAPER_TONES.accentLemon];
    const items: React.ReactNode[] = [];
    for (let i = 0; i < count; i++) {
        const top = seedRange(seed, i * 13 + 1, 12, 88);
        const isLeft = i % 2 === 0;
        const left = isLeft ? seedRange(seed, i * 13 + 2, -2, 6) : seedRange(seed, i * 13 + 2, 84, 92);
        const rotate = seedCentered(seed, i * 13 + 3, 25);
        const kind = Math.floor(seedRange(seed, i * 13 + 4, 0, 3));
        let node: React.ReactNode;
        if (kind === 0) {
            const txt = KAWAII_INTERJECTIONS[Math.floor(seedRange(seed, i * 13 + 5, 0, KAWAII_INTERJECTIONS.length))];
            const color = colors[Math.floor(seedRange(seed, i * 13 + 6, 0, colors.length))];
            node = <DialogueBubble text={txt} color={color} direction={isLeft ? 'left' : 'right'} />;
        } else if (kind === 1) {
            node = <PaperClip color={PAPER_TONES.accentSilver} rotate={rotate} size={22} />;
        } else {
            node = <HeartSticker size={14} />;
        }
        items.push(
            <div
                key={i}
                style={{
                    position: 'absolute', top: `${top}%`, left: `${left}%`,
                    transform: `rotate(${rotate}deg)`, pointerEvents: 'none', zIndex: 50,
                }}
            >
                {node}
            </div>
        );
    }
    return <>{items}</>;
};

export default HandbookDayView;
