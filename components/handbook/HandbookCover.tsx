/**
 * 列表视图 = 全息透明手账封 + 丝带书签 + 散落贴纸 + tab 标签纸
 *
 * 视觉灵感：RosyPosy M5 透明烫银封 + 樱花游戏卡通糖果风
 */

import React from 'react';
import { HandbookEntry } from '../../types';
import {
    PAPER_TONES, SERIF_STACK, CUTE_STACK, HOLO_GRADIENT, HOLO_GRADIENT_SOFT,
    dayOfWeekZh, monthEn, dayNum, yearNum, tiltFor,
} from './paper';
import {
    HeartSticker, StarSticker, PawSticker, BowSticker, SparkleDot, Cloud,
    Ribbon, ScatteredStickers,
} from './stickers';
import { Sparkle, Notebook, CaretRight } from '@phosphor-icons/react';

interface CoverProps {
    today: string;
    todayEntry: HandbookEntry | null;
    entries: HandbookEntry[];
    userName: string;
    generating: boolean;
    onGenerateToday: () => void;
    onOpenDate: (date: string) => void;
}

const HandbookCover: React.FC<CoverProps> = ({
    today, todayEntry, entries, userName, generating, onGenerateToday, onOpenDate,
}) => {
    const otherEntries = entries.filter(e => e.date !== today);

    return (
        <div
            className="flex-1 overflow-y-auto pb-12 relative"
            style={{
                background: `${PAPER_TONES.paperWarm} radial-gradient(circle at 20% 10%, rgba(251,184,200,0.18) 0%, transparent 40%), radial-gradient(circle at 80% 60%, rgba(185,211,224,0.18) 0%, transparent 40%)`,
            }}
        >
            {/* 飘在背景的云朵 */}
            <div className="absolute top-12 right-4 opacity-40 pointer-events-none">
                <Cloud size={70} />
            </div>
            <div className="absolute top-44 left-6 opacity-30 pointer-events-none">
                <Cloud size={54} color="#ffe2ec" />
            </div>

            {/* ── 全息透明手账封 ─────────────────────────── */}
            <div
                className="mx-4 mt-2 rounded-[20px] px-6 py-9 relative overflow-hidden"
                style={{
                    background: HOLO_GRADIENT,
                    boxShadow: '0 6px 20px -4px rgba(242,157,176,0.3), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 6px rgba(122,90,114,0.08)',
                    border: '1.5px solid rgba(255,255,255,0.6)',
                }}
            >
                {/* 全息光晕层 */}
                <div
                    className="absolute inset-0 pointer-events-none mix-blend-screen"
                    style={{
                        background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.5) 45%, transparent 60%)',
                    }}
                />

                {/* 角落贴纸 */}
                <div className="absolute top-3 left-3 pointer-events-none"><StarSticker size={22} color={PAPER_TONES.accentLemon} /></div>
                <div className="absolute top-4 right-5 pointer-events-none"><HeartSticker size={20} /></div>
                <div className="absolute bottom-3 left-6 pointer-events-none"><SparkleDot size={14} color={PAPER_TONES.accentBlue} /></div>
                <div className="absolute bottom-5 right-3 pointer-events-none" style={{ transform: 'rotate(15deg)' }}>
                    <BowSticker size={26} color={PAPER_TONES.accentRose} />
                </div>

                <div className="relative z-10 text-center">
                    <div
                        className="text-[10px] tracking-[0.5em]"
                        style={{ ...CUTE_STACK, color: 'rgba(122,90,114,0.55)' }}
                    >
                        ★ HANDBOOK ★
                    </div>
                    <div
                        className="text-4xl font-black mt-1"
                        style={{
                            ...CUTE_STACK,
                            color: '#a85577',
                            letterSpacing: '0.2em',
                            textShadow: '0 2px 0 rgba(255,255,255,0.6)',
                        }}
                    >
                        手 账
                    </div>
                    <div
                        className="mt-3 text-[11px] tracking-widest"
                        style={{ ...CUTE_STACK, color: '#8a5570' }}
                    >
                        ♡ {userName} · {yearNum(today)}.{today.split('-')[1]} ♡
                    </div>
                </div>
            </div>

            {/* ── 今日丝带书签 ─────────────────────────────── */}
            <div className="mx-4 mt-6 relative">
                {/* 飘出的 ribbon 装饰 */}
                <div className="absolute -top-2 left-8 z-10 pointer-events-none">
                    <Ribbon size={32} color={PAPER_TONES.accentBlush} />
                </div>
                {/* 散落小贴纸 */}
                <div className="absolute -top-3 right-4 z-10 pointer-events-none" style={{ transform: 'rotate(20deg)' }}>
                    <PawSticker size={24} color={PAPER_TONES.accentRose} />
                </div>

                <div
                    className="rounded-2xl px-5 py-5 pl-12 relative"
                    style={{
                        background: PAPER_TONES.paper,
                        boxShadow: '0 3px 10px -2px rgba(122,90,114,0.18), 0 0 0 1.5px rgba(220,199,213,0.5)',
                    }}
                >
                    <div className="flex items-end gap-4">
                        {/* 大号衬线日期 */}
                        <div className="text-right shrink-0" style={SERIF_STACK}>
                            <div className="text-[10px] tracking-[0.3em]" style={{ color: PAPER_TONES.inkSoft }}>
                                {monthEn(today)}
                            </div>
                            <div className="text-5xl leading-none font-bold" style={{ color: PAPER_TONES.ink }}>
                                {dayNum(today)}
                            </div>
                            <div className="text-[10px] mt-1 tracking-widest" style={{ color: PAPER_TONES.inkSoft }}>
                                星期{dayOfWeekZh(today)}
                            </div>
                        </div>

                        <div className="flex-1 min-w-0">
                            <div
                                className="text-[12.5px] mb-2.5"
                                style={{ ...CUTE_STACK, color: PAPER_TONES.inkSoft }}
                            >
                                {todayEntry
                                    ? `今天已经记下 ${todayEntry.pages.length} 页 ♡`
                                    : `今天还没翻开 · 想写就写`}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={onGenerateToday}
                                    disabled={generating}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-[12px] font-bold active:scale-95 transition disabled:opacity-50"
                                    style={{
                                        ...CUTE_STACK,
                                        background: `linear-gradient(135deg, ${PAPER_TONES.accentBlush} 0%, ${PAPER_TONES.accentRose} 100%)`,
                                        color: '#fff',
                                        boxShadow: '0 2px 6px rgba(242,157,176,0.4)',
                                    }}
                                >
                                    <Sparkle weight="fill" className="w-3.5 h-3.5" />
                                    {generating ? '正在落笔…' : 'AI 替我写一份'}
                                </button>
                                <button
                                    onClick={() => onOpenDate(today)}
                                    className="px-4 py-2.5 rounded-full text-[12px] font-bold active:scale-95 transition"
                                    style={{
                                        ...CUTE_STACK,
                                        background: PAPER_TONES.paperMint,
                                        color: PAPER_TONES.ink,
                                        border: `1.5px solid ${PAPER_TONES.accentMint}`,
                                    }}
                                >
                                    翻开
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 回望书签列表 ──────────────────────────────── */}
            <div className="mt-8 px-4">
                <div
                    className="text-[12px] tracking-[0.4em] mb-4 px-2 text-center"
                    style={{ ...CUTE_STACK, color: PAPER_TONES.inkSoft }}
                >
                    ♡ ♡ ♡ &nbsp; 回 望 &nbsp; ♡ ♡ ♡
                </div>

                {otherEntries.length === 0 ? (
                    <div className="text-center py-10" style={{ color: PAPER_TONES.inkSoft }}>
                        <Notebook className="w-9 h-9 mx-auto mb-2 opacity-40" weight="thin" />
                        <div className="text-[13px]" style={CUTE_STACK}>之前还没有记过</div>
                        <div className="text-[11px] mt-1 opacity-70" style={CUTE_STACK}>
                            没关系 · 想翻的时候再翻 ♡
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {otherEntries.map((e, i) => {
                            const tilt = tiltFor(e.id);
                            const preview = e.pages.find(p => !p.excluded)?.content?.slice(0, 60) || '';
                            const visibleCount = e.pages.filter(p => !p.excluded).length;
                            const tabColors = [
                                PAPER_TONES.accentRose,
                                PAPER_TONES.accentLemon,
                                PAPER_TONES.accentMint,
                                PAPER_TONES.accentBlue,
                                PAPER_TONES.accentLavender,
                            ];
                            const tab = tabColors[i % tabColors.length];
                            return (
                                <button
                                    key={e.id}
                                    onClick={() => onOpenDate(e.date)}
                                    className="w-full text-left relative active:scale-[0.99] transition"
                                    style={{ transform: `rotate(${tilt * 0.3}deg)` }}
                                >
                                    {/* 散落贴纸 */}
                                    <ScatteredStickers seed={e.id} count={2} zone="corners" />

                                    {/* 侧出的 tab 标签 */}
                                    <div
                                        className="absolute right-0 top-3 px-2 py-0.5 text-[9px] font-bold tracking-widest z-10"
                                        style={{
                                            background: tab,
                                            color: PAPER_TONES.ink,
                                            clipPath: 'polygon(15% 0, 100% 0, 100% 100%, 15% 100%, 0 50%)',
                                            paddingLeft: '14px',
                                            ...CUTE_STACK,
                                        }}
                                    >
                                        {visibleCount}页 ♡
                                    </div>

                                    <div
                                        className="rounded-xl px-4 py-3 pr-16"
                                        style={{
                                            background: PAPER_TONES.paper,
                                            boxShadow: '0 2px 4px rgba(122,90,114,0.1), 0 6px 14px -8px rgba(122,90,114,0.18)',
                                            border: `1px solid ${PAPER_TONES.spine}`,
                                        }}
                                    >
                                        <div className="flex items-baseline gap-2 mb-1" style={SERIF_STACK}>
                                            <span
                                                className="text-2xl font-bold leading-none"
                                                style={{ color: PAPER_TONES.ink }}
                                            >
                                                {dayNum(e.date)}
                                            </span>
                                            <span className="text-[10px] tracking-widest" style={{ color: PAPER_TONES.inkSoft }}>
                                                {monthEn(e.date)} · 周{dayOfWeekZh(e.date)}
                                            </span>
                                            <CaretRight className="w-3 h-3 ml-auto" style={{ color: PAPER_TONES.inkSoft }} />
                                        </div>
                                        {preview && (
                                            <div
                                                className="text-[12px] leading-snug line-clamp-2"
                                                style={{ ...SERIF_STACK, color: PAPER_TONES.inkSoft }}
                                            >
                                                {preview}{preview.length >= 60 ? '…' : ''}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default HandbookCover;
