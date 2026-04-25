/**
 * 手账单页卡片
 *
 * 设计：每页 = 一张贴在活页纸上的"内容"
 * - user_diary：横线纸 + cream washi tape 标记
 * - character_life：倾斜的便签纸（sticky note 风），honey/rose 胶带 + 角色头像贴纸
 * - user_note：dot 纸 + sage 胶带
 *
 * 操作按钮藏在右下角的"小铁夹"区，不喧宾夺主。
 */

import React, { useState, useEffect } from 'react';
import { HandbookPage, CharacterProfile } from '../../types';
import { PAPERS, PAPER_SHADOW, WashiTape, tiltFor, SERIF_STACK, PAPER_TONES } from './paper';
import { PencilSimple, Trash, Eye, EyeSlash, ArrowsClockwise, FloppyDisk, X } from '@phosphor-icons/react';

interface PageCardProps {
    page: HandbookPage;
    char?: CharacterProfile;
    isEditing: boolean;
    onStartEdit: () => void;
    onSave: (newContent: string) => void;
    onCancel: () => void;
    onToggleExclude: () => void;
    onDelete: () => void;
    onRegenerate?: () => void;
    isRegenerating?: boolean;
}

const HandbookPageCard: React.FC<PageCardProps> = ({
    page, char, isEditing, onStartEdit, onSave, onCancel,
    onToggleExclude, onDelete, onRegenerate, isRegenerating,
}) => {
    const [draft, setDraft] = useState(page.content);
    useEffect(() => { setDraft(page.content); }, [page.content, isEditing]);

    // 默认纸张：按类型挑选
    const defaultPaper = page.type === 'character_life' ? 'cream'
        : page.type === 'user_note' ? 'dot'
        : page.type === 'user_diary' ? 'lined'
        : 'plain';
    const paperKind = (page.paperStyle as keyof typeof PAPERS) || defaultPaper;
    const paper = PAPERS[paperKind] || PAPERS.plain;

    // 类型 → 胶带配色 + 文案
    const tape = (() => {
        switch (page.type) {
            case 'user_diary':     return { color: 'cream' as const, label: '我的一天' };
            case 'character_life': return { color: 'rose' as const,  label: char ? `${char.name}` : '小生活' };
            case 'user_note':      return { color: 'sage' as const,  label: '我写的' };
            case 'free':           return { color: 'blue' as const,  label: '便签' };
        }
    })();

    // 倾斜：character_life 和 user_note 有手贴感；user_diary 端正放
    const tilt = page.type === 'character_life' ? tiltFor(page.id) :
                 page.type === 'user_note'      ? tiltFor(page.id) * 0.5 : 0;

    return (
        <div
            className={`relative my-5 transition-opacity ${page.excluded ? 'opacity-35' : ''}`}
            style={{ transform: `rotate(${tilt}deg)` }}
        >
            {/* 胶带 + 角色头像贴纸（伸出到纸外，制造"贴上去"的层次感）*/}
            <div className="absolute -top-3 left-4 z-10 flex items-center gap-2 pointer-events-none">
                <WashiTape color={tape.color} rotate={page.type === 'character_life' ? -3 : -1.5}>
                    {tape.label}
                </WashiTape>
                {page.generatedBy === 'llm' && (
                    <span
                        className="text-[9px] tracking-widest"
                        style={{ ...SERIF_STACK, color: PAPER_TONES.inkSoft, transform: 'rotate(-2deg)' }}
                    >
                        · AI 草稿
                    </span>
                )}
            </div>
            {char && page.type === 'character_life' && (
                <img
                    src={char.avatar}
                    alt={char.name}
                    className="absolute -top-4 -right-2 z-10 w-10 h-10 rounded-full object-cover pointer-events-none"
                    style={{
                        boxShadow: '0 2px 6px rgba(0,0,0,0.18), 0 0 0 3px #fdf6e7',
                        transform: 'rotate(6deg)',
                    }}
                />
            )}

            {/* 纸张主体 */}
            <div
                className="relative px-5 pt-5 pb-3 rounded-[3px]"
                style={{
                    background: paper.bg,
                    color: PAPER_TONES.ink,
                    ...paper.style,
                    ...PAPER_SHADOW,
                }}
            >
                {/* 正文 */}
                {isEditing ? (
                    <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        className="w-full bg-transparent outline-none resize-none text-[14.5px] leading-[26px] min-h-[140px] tracking-wide"
                        style={{ color: PAPER_TONES.ink }}
                        autoFocus
                    />
                ) : (
                    <p
                        className="whitespace-pre-wrap text-[14.5px] leading-[26px] break-words tracking-wide"
                        style={{ color: PAPER_TONES.ink, minHeight: '60px' }}
                    >
                        {page.content || (
                            <span style={{ color: PAPER_TONES.inkSoft, fontStyle: 'italic', opacity: 0.6 }}>
                                这一页还是空白的……
                            </span>
                        )}
                    </p>
                )}

                {/* 底部小铁夹：操作按钮区 */}
                <div className="mt-3 pt-2 flex justify-end items-center gap-1"
                     style={{ borderTop: `1px dashed rgba(168,140,100,0.25)` }}>
                    {isEditing ? (
                        <>
                            <button
                                onClick={onCancel}
                                className="text-[11px] px-2 py-1 rounded active:scale-95 transition flex items-center gap-1"
                                style={{ color: PAPER_TONES.inkSoft }}
                            >
                                <X className="w-3 h-3" /> 取消
                            </button>
                            <button
                                onClick={() => onSave(draft)}
                                className="text-[11px] px-3 py-1 rounded active:scale-95 transition flex items-center gap-1"
                                style={{ background: PAPER_TONES.cover, color: '#fff7e6' }}
                            >
                                <FloppyDisk className="w-3 h-3" /> 收下
                            </button>
                        </>
                    ) : (
                        <>
                            {onRegenerate && (
                                <IconBtn
                                    onClick={onRegenerate}
                                    disabled={isRegenerating}
                                    title="再写一次"
                                    Icon={ArrowsClockwise}
                                    spin={isRegenerating}
                                />
                            )}
                            <IconBtn onClick={onStartEdit} title="改写" Icon={PencilSimple} />
                            <IconBtn
                                onClick={onToggleExclude}
                                title={page.excluded ? '让它入册' : '不入册（保留但隐去）'}
                                Icon={page.excluded ? EyeSlash : Eye}
                            />
                            <IconBtn onClick={onDelete} title="撕掉这页" Icon={Trash} danger />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── 小铁夹按钮（统一尺寸/颜色）────────────────────
const IconBtn: React.FC<{
    onClick: () => void;
    title: string;
    Icon: React.ComponentType<{ className?: string; weight?: any }>;
    disabled?: boolean;
    spin?: boolean;
    danger?: boolean;
}> = ({ onClick, title, Icon, disabled, spin, danger }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className="p-1.5 rounded-full active:scale-90 transition disabled:opacity-30"
        style={{
            color: danger ? '#a85050' : PAPER_TONES.inkSoft,
            background: 'transparent',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(168,140,100,0.12)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
        <Icon className={`w-3.5 h-3.5 ${spin ? 'animate-spin' : ''}`} weight="bold" />
    </button>
);

export default HandbookPageCard;
