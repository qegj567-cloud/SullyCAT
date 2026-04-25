/**
 * 列表视图 = 一本"皮质封面手账"封面 + 露在外面的日期书签
 *
 * 视觉：
 * - 上方:皮质封面长条，烫金"手账"+ user 名 + 当前年月
 * - 中间:今日"丝带书签"——抽出的 ribbon，点击可生成/翻开今日
 * - 下方:回望列表，每个 entry 是一片插着的卡片标签（tab 风）
 */

import React from 'react';
import { HandbookEntry } from '../../types';
import {
    PAPER_TONES, SERIF_STACK, dayOfWeekZh, monthEn, dayNum, yearNum, tiltFor,
} from './paper';
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
        <div className="flex-1 overflow-y-auto pb-12" style={{ background: PAPER_TONES.paperCool }}>
            {/* ── 皮质封面 ─────────────────────────────────── */}
            <div
                className="mx-4 mt-2 rounded-2xl px-6 py-8 relative overflow-hidden"
                style={{
                    background: `linear-gradient(135deg, ${PAPER_TONES.cover} 0%, ${PAPER_TONES.coverDark} 100%)`,
                    boxShadow: '0 4px 16px -4px rgba(58,47,37,0.3), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -2px 4px rgba(0,0,0,0.15)',
                }}
            >
                {/* 烫金细线装饰边框 */}
                <div
                    className="absolute inset-3 rounded-xl pointer-events-none"
                    style={{ border: '1px solid rgba(233,209,139,0.35)' }}
                />
                {/* 缝线 */}
                <div
                    className="absolute inset-3 rounded-xl pointer-events-none"
                    style={{ border: '1px dashed rgba(233,209,139,0.25)', margin: '6px' }}
                />

                <div className="relative z-10 text-center">
                    <div
                        className="text-[10px] tracking-[0.5em]"
                        style={{ ...SERIF_STACK, color: 'rgba(255,247,230,0.55)' }}
                    >
                        HANDBOOK
                    </div>
                    <div
                        className="text-3xl font-bold mt-1"
                        style={{ ...SERIF_STACK, color: '#f5e6c5', letterSpacing: '0.2em' }}
                    >
                        手账
                    </div>
                    <div
                        className="mt-3 text-[11px] tracking-widest"
                        style={{ color: 'rgba(245,230,197,0.7)' }}
                    >
                        {userName} · {yearNum(today)}.{today.split('-')[1]}
                    </div>
                </div>
            </div>

            {/* ── 今日丝带书签 ─────────────────────────────── */}
            <div className="mx-4 mt-5 relative">
                <div
                    className="rounded-xl px-5 py-4 relative"
                    style={{
                        background: PAPER_TONES.paper,
                        boxShadow: '0 2px 8px -2px rgba(58,47,37,0.15), 0 0 0 1px rgba(168,140,100,0.12)',
                    }}
                >
                    {/* 丝带飘出顶部 */}
                    <div
                        className="absolute -top-2 left-6 w-10 h-6"
                        style={{
                            background: PAPER_TONES.accentRose,
                            clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 70%, 0 100%)',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        }}
                        aria-hidden
                    />

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
                                className="text-[12px] mb-2 italic"
                                style={{ ...SERIF_STACK, color: PAPER_TONES.inkSoft }}
                            >
                                {todayEntry
                                    ? `今天已经记下 ${todayEntry.pages.length} 页。`
                                    : `今天还没翻开 · 想写就写。`}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={onGenerateToday}
                                    disabled={generating}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] active:scale-95 transition disabled:opacity-50"
                                    style={{
                                        background: PAPER_TONES.cover,
                                        color: '#fdf6e7',
                                        ...SERIF_STACK,
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                    }}
                                >
                                    <Sparkle weight="fill" className="w-3 h-3" />
                                    {generating ? '正在落笔…' : '让 AI 替我写一份'}
                                </button>
                                <button
                                    onClick={() => onOpenDate(today)}
                                    className="px-3 py-2 rounded-lg text-[12px] active:scale-95 transition"
                                    style={{
                                        background: 'transparent',
                                        color: PAPER_TONES.ink,
                                        border: `1px solid ${PAPER_TONES.spine}`,
                                        ...SERIF_STACK,
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
            <div className="mt-7 px-4">
                <div
                    className="text-[11px] tracking-[0.3em] mb-3 px-2"
                    style={{ ...SERIF_STACK, color: PAPER_TONES.inkSoft }}
                >
                    · 回 望 ·
                </div>

                {otherEntries.length === 0 ? (
                    <div className="text-center py-10" style={{ color: PAPER_TONES.inkSoft }}>
                        <Notebook className="w-9 h-9 mx-auto mb-2 opacity-40" weight="thin" />
                        <div className="text-[13px]" style={SERIF_STACK}>之前还没有记过</div>
                        <div className="text-[11px] mt-1 opacity-70" style={SERIF_STACK}>
                            没关系 · 想翻的时候再翻
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {otherEntries.map((e, i) => {
                            const tilt = tiltFor(e.id);
                            const preview = e.pages.find(p => !p.excluded)?.content?.slice(0, 60) || '';
                            const visibleCount = e.pages.filter(p => !p.excluded).length;
                            // 标签突出方向交替（左右切换 tab 颜色）
                            const tabColors = [PAPER_TONES.accentRose, PAPER_TONES.accentHoney, PAPER_TONES.accentGreen, PAPER_TONES.accentBlue];
                            const tab = tabColors[i % tabColors.length];
                            return (
                                <button
                                    key={e.id}
                                    onClick={() => onOpenDate(e.date)}
                                    className="w-full text-left relative active:scale-[0.99] transition"
                                    style={{ transform: `rotate(${tilt * 0.4}deg)` }}
                                >
                                    {/* 侧出的 tab 标签 */}
                                    <div
                                        className="absolute right-0 top-3 px-2 py-0.5 text-[9px] font-bold tracking-widest"
                                        style={{
                                            background: tab,
                                            color: PAPER_TONES.ink,
                                            clipPath: 'polygon(15% 0, 100% 0, 100% 100%, 15% 100%, 0 50%)',
                                            paddingLeft: '14px',
                                            ...SERIF_STACK,
                                        }}
                                    >
                                        {visibleCount}页
                                    </div>

                                    <div
                                        className="rounded-lg px-4 py-3 pr-16"
                                        style={{
                                            background: PAPER_TONES.paper,
                                            boxShadow: '0 1px 2px rgba(58,47,37,0.08), 0 4px 10px -6px rgba(58,47,37,0.12)',
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
                                                className="text-[12px] leading-snug line-clamp-2 italic"
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
