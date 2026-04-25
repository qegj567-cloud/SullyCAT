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

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { HandbookEntry, HandbookPage, CharacterProfile } from '../../types';
import HandbookPageCard from './HandbookPageCard';
import {
    PAPER_TONES, SERIF_STACK, CUTE_STACK, BinderRings,
    dayOfWeekZh, monthEn, dayNum, seedRange, seedCentered,
} from './paper';
import {
    LaceEdge, HeartSticker, StarSticker, SparkleDot, BowSticker,
    ScatteredStickers, PaperClip,
} from './stickers';
import { Notebook, CaretLeft, CaretRight } from '@phosphor-icons/react';

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
    // 角色 spread 用一组雅致 accent 色循环(避免全部一色)
    const charAccents = [
        PAPER_TONES.accentBlue,
        PAPER_TONES.accentMint,
        PAPER_TONES.accentBlush,
        PAPER_TONES.accentLemon,
        PAPER_TONES.accentSky,
    ];
    const spreads: Spread[] = [];
    spreads.push({
        key: 'me',
        label: '我',
        color: '#a98ec4', // 薰衣草紫(参考图配色)
        pages: mePages,
    });
    Object.keys(charBuckets).forEach((charId, idx) => {
        const c = characters.find(ch => ch.id === charId);
        if (!c) return;
        spreads.push({
            key: charId,
            label: c.name,
            avatar: c.avatar,
            color: charAccents[idx % charAccents.length],
            pages: charBuckets[charId],
        });
    });
    return spreads;
}

// ─── 单个 page 在 spread 内的布局(端正版) ─────────
function layoutFor(_page: HandbookPage, index: number, isEditing: boolean) {
    if (isEditing) {
        return { offsetXPct: 0, widthPct: 95, rotate: 0, marginTop: index === 0 ? 8 : 28, zIndex: 9999 };
    }
    // 端正布局:不旋转、居中、统一间距
    return {
        offsetXPct: 0,
        widthPct: 92,
        rotate: 0,
        marginTop: index === 0 ? 8 : 22,
        zIndex: 10 + index,
    };
}

// ─── 装饰花体页眉 ───────────────────────────────
// 居中大标题 + 两侧翻页 chevron + 装饰花/星
const SpreadDecoratedHeader: React.FC<{
    title: string;
    subtitle: string;
    accentColor: string;
    canPrev: boolean;
    canNext: boolean;
    onPrev: () => void;
    onNext: () => void;
}> = ({ title, subtitle, accentColor, canPrev, canNext, onPrev, onNext }) => {
    return (
        <div className="px-4 pt-3 pb-3 mb-1">
            <div className="flex items-center justify-between mb-2">
                <button
                    onClick={onPrev}
                    disabled={!canPrev}
                    className="w-7 h-7 flex items-center justify-center rounded-full active:scale-95 transition disabled:opacity-25"
                    style={{ background: 'rgba(255,255,255,0.7)', color: PAPER_TONES.ink, border: `1px solid ${PAPER_TONES.spine}` }}
                >
                    <CaretLeft className="w-3 h-3" weight="bold" />
                </button>
                <span
                    className="text-[10px] tracking-[0.4em]"
                    style={{ ...CUTE_STACK, color: PAPER_TONES.inkFaint }}
                >
                    ✦ {subtitle} ✦
                </span>
                <button
                    onClick={onNext}
                    disabled={!canNext}
                    className="w-7 h-7 flex items-center justify-center rounded-full active:scale-95 transition disabled:opacity-25"
                    style={{ background: 'rgba(255,255,255,0.7)', color: PAPER_TONES.ink, border: `1px solid ${PAPER_TONES.spine}` }}
                >
                    <CaretRight className="w-3 h-3" weight="bold" />
                </button>
            </div>

            {/* 装饰花体大标题 */}
            <div className="flex items-center justify-center gap-2 px-2">
                <span style={{ color: accentColor, fontSize: 14, lineHeight: 1 }}>❀</span>
                <div style={{ flex: 1, height: 1, background: accentColor, opacity: 0.4 }} />
                <h2
                    className="text-center px-3"
                    style={{
                        ...SERIF_STACK,
                        fontSize: 17,
                        fontWeight: 700,
                        color: accentColor,
                        letterSpacing: '0.15em',
                        margin: 0,
                        textShadow: '0 1px 0 rgba(255,255,255,0.6)',
                    }}
                >
                    {title}
                </h2>
                <div style={{ flex: 1, height: 1, background: accentColor, opacity: 0.4 }} />
                <span style={{ color: accentColor, fontSize: 14, lineHeight: 1 }}>❀</span>
            </div>
            {/* 副装饰带:两条细线 + 中点 */}
            <div className="flex items-center justify-center gap-2 mt-1.5 px-12">
                <div style={{ flex: 1, height: 1, background: accentColor, opacity: 0.25 }} />
                <span style={{ color: accentColor, fontSize: 8, opacity: 0.6 }}>· · ·</span>
                <div style={{ flex: 1, height: 1, background: accentColor, opacity: 0.25 }} />
            </div>
        </div>
    );
};

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

    // 翻页动画方向(next/prev),用 ref 记上一次 key 算方向
    const [flipDir, setFlipDir] = useState<'next' | 'prev' | null>(null);
    const prevKeyRef = useRef<SpreadKey>(activeKey);
    useEffect(() => {
        if (prevKeyRef.current === activeKey) return;
        const oldIdx = spreads.findIndex(s => s.key === prevKeyRef.current);
        const newIdx = spreads.findIndex(s => s.key === activeKey);
        if (oldIdx >= 0 && newIdx >= 0) {
            setFlipDir(newIdx >= oldIdx ? 'next' : 'prev');
        }
        prevKeyRef.current = activeKey;
    }, [activeKey, spreads]);

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

                {/* ── 翻页 3D flip 容器 ─── 切 spread 时整片"页"翻进来 */}
                <style>{`
                    @keyframes hb-flip-next {
                        from { transform: perspective(1200px) rotateY(-32deg) translateX(20%); opacity: 0; }
                        to   { transform: perspective(1200px) rotateY(0deg)  translateX(0);  opacity: 1; }
                    }
                    @keyframes hb-flip-prev {
                        from { transform: perspective(1200px) rotateY(32deg)  translateX(-20%); opacity: 0; }
                        to   { transform: perspective(1200px) rotateY(0deg)   translateX(0);   opacity: 1; }
                    }
                    .hb-flip-next { animation: hb-flip-next 0.45s cubic-bezier(0.22, 1, 0.36, 1); transform-origin: left center; }
                    .hb-flip-prev { animation: hb-flip-prev 0.45s cubic-bezier(0.22, 1, 0.36, 1); transform-origin: right center; }
                `}</style>
                <div
                    key={activeKey}
                    className={
                        flipDir === 'next' ? 'hb-flip-next'
                        : flipDir === 'prev' ? 'hb-flip-prev'
                        : ''
                    }
                    style={{ transformStyle: 'preserve-3d', position: 'relative' }}
                >
                {/* 当前 spread 的装饰花体页眉 */}
                {activeSpread && allPages.length > 0 && (
                    <SpreadDecoratedHeader
                        title={activeKey === 'me' ? '我 的 一 天' : `${activeSpread.label} · 的 今 天`}
                        subtitle={`${activeIdx + 1} / ${spreads.length}`}
                        accentColor={activeSpread.color}
                        canPrev={activeIdx > 0}
                        canNext={activeIdx < spreads.length - 1}
                        onPrev={goPrev}
                        onNext={goNext}
                    />
                )}

                {/* 整页背景两侧少量散落贴纸(雅致克制) */}
                <ScatteredStickers seed={`day-${date}-${activeKey}`} count={2} zone="edges" />

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
                                            onSave={(content, paperStyle) => onSavePage(p.id, content, paperStyle)}
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
                </div>{/* end hb-flip wrapper */}

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

// 在 spread 边缘散布的小填充元素(雅致版,数量克制)
// 只在两侧留白处放,不会盖到卡片;只用 sparkle/heart/clip,不用 dialogue bubble
const SpreadGapFillers: React.FC<{ seed: string; pageCount: number }> = ({ seed, pageCount }) => {
    if (pageCount === 0) return null;
    // 最多 2 个,不喧宾夺主
    const count = Math.min(pageCount, 2);
    const items: React.ReactNode[] = [];
    for (let i = 0; i < count; i++) {
        const top = seedRange(seed, i * 17 + 1, 18, 78);
        const isLeft = i % 2 === 0;
        // 严格放在两侧外缘
        const left = isLeft ? seedRange(seed, i * 17 + 2, -1, 4) : seedRange(seed, i * 17 + 2, 90, 95);
        const rotate = seedCentered(seed, i * 17 + 3, 20);
        const kind = Math.floor(seedRange(seed, i * 17 + 4, 0, 3));
        let node: React.ReactNode;
        if (kind === 0) {
            node = <PaperClip color={PAPER_TONES.accentSilver} rotate={rotate} size={20} />;
        } else if (kind === 1) {
            node = <HeartSticker size={14} color={PAPER_TONES.accentLavender} sparkle={false} />;
        } else {
            node = <SparkleDot size={10} color={PAPER_TONES.accentLavender} />;
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
