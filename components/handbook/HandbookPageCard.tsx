/**
 * 手账单页卡片（糖果 + 拍立得 + 贴纸版）
 *
 * - user_diary：横线纸 + 蕾丝顶边 + lemon washi（heart pattern）+ 散落小贴纸
 * - character_life：拍立得相框（白边相片 + 底部留白手写）+ 角色头像作主图
 *                   外加 paper clip / bow / heart 贴纸
 * - user_note：dot 纸 + mint washi（dot pattern）+ 散落贴纸
 */

import React, { useState, useEffect } from 'react';
import { HandbookPage, CharacterProfile } from '../../types';
import {
    PAPERS, PAPER_SHADOW, POLAROID_SHADOW, WashiTape, tiltFor,
    SERIF_STACK, CUTE_STACK, PAPER_TONES,
} from './paper';
import {
    ScatteredStickers, LaceEdge, PaperClip, HeartSticker, BowSticker,
} from './stickers';
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

    // 默认纸张：按类型挑
    const defaultPaper = page.type === 'character_life' ? 'cream'
        : page.type === 'user_note' ? 'dot'
        : page.type === 'user_diary' ? 'lined'
        : 'plain';
    const paperKind = (page.paperStyle as keyof typeof PAPERS) || defaultPaper;
    const paper = PAPERS[paperKind] || PAPERS.plain;

    // 类型 → 胶带 + 文案
    const tape = (() => {
        switch (page.type) {
            case 'user_diary':     return { color: 'lemon' as const,  pattern: 'heart' as const, label: '我 的 一 天 ♡' };
            case 'character_life': return { color: 'rose' as const,   pattern: 'star' as const,  label: char ? `${char.name} ★` : '小生活' };
            case 'user_note':      return { color: 'mint' as const,   pattern: 'dot' as const,   label: '我 写 的' };
            case 'free':           return { color: 'lavender' as const, pattern: 'plain' as const, label: '便 签' };
        }
    })();

    // 倾斜
    const tilt = page.type === 'character_life' ? tiltFor(page.id) :
                 page.type === 'user_note'      ? tiltFor(page.id) * 0.5 : 0;

    // ─── character_life 走拍立得相框 ───────────────────────
    if (page.type === 'character_life') {
        return (
            <div
                className={`relative my-7 transition-opacity ${page.excluded ? 'opacity-35' : ''}`}
                style={{ transform: `rotate(${tilt}deg)` }}
            >
                {/* 顶部回形针 */}
                <div className="absolute -top-3 left-8 z-20 pointer-events-none">
                    <PaperClip color={PAPER_TONES.accentSilver} rotate={-15} size={26} />
                </div>
                {/* 散落贴纸 */}
                <ScatteredStickers seed={page.id} count={3} zone="corners" />

                {/* 拍立得相框 */}
                <div
                    className="relative mx-2"
                    style={POLAROID_SHADOW}
                >
                    {/* 主图区：角色头像 + 胶带标签 */}
                    <div
                        className="relative overflow-hidden"
                        style={{
                            background: paper.bg,
                            ...paper.style,
                            minHeight: 90,
                            borderRadius: 2,
                        }}
                    >
                        {/* 胶带在主图区上 */}
                        <div className="absolute -top-2 left-3 z-10 pointer-events-none">
                            <WashiTape color={tape.color} pattern={tape.pattern} rotate={-3}>
                                {tape.label}
                            </WashiTape>
                        </div>
                        {/* 角色头像作主图（大头贴风）*/}
                        {char && (
                            <div className="flex items-center justify-center py-5 px-4">
                                <img
                                    src={char.avatar}
                                    alt={char.name}
                                    className="rounded-full object-cover"
                                    style={{
                                        width: 76, height: 76,
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 0 0 4px #fff',
                                    }}
                                />
                                <div className="ml-3 flex-1 min-w-0">
                                    <div
                                        className="text-[12px] font-bold"
                                        style={{ ...CUTE_STACK, color: PAPER_TONES.ink }}
                                    >
                                        {char.name}
                                    </div>
                                    <div
                                        className="text-[10px] mt-0.5"
                                        style={{ ...SERIF_STACK, color: PAPER_TONES.inkSoft }}
                                    >
                                        ta 的今天
                                    </div>
                                </div>
                                <BowSticker size={22} color={PAPER_TONES.accentRose} />
                            </div>
                        )}
                    </div>

                    {/* 拍立得底部留白 = 内容区 */}
                    <div className="pt-4 px-1">
                        {isEditing ? (
                            <textarea
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                className="w-full bg-transparent outline-none resize-none text-[14px] leading-[24px] min-h-[100px]"
                                style={{ ...SERIF_STACK, color: PAPER_TONES.ink }}
                                autoFocus
                            />
                        ) : (
                            <p
                                className="whitespace-pre-wrap text-[14px] leading-[24px] break-words"
                                style={{ ...SERIF_STACK, color: PAPER_TONES.ink }}
                            >
                                {page.content || (
                                    <span style={{ color: PAPER_TONES.inkSoft, fontStyle: 'italic', opacity: 0.6 }}>
                                        ta 今天还没有故事…
                                    </span>
                                )}
                            </p>
                        )}
                        {page.generatedBy === 'llm' && (
                            <div
                                className="text-[9px] mt-2 italic tracking-widest"
                                style={{ ...CUTE_STACK, color: PAPER_TONES.inkFaint }}
                            >
                                · AI 草稿 ·
                            </div>
                        )}

                        <ActionRow
                            isEditing={isEditing}
                            onCancel={onCancel}
                            onSave={() => onSave(draft)}
                            onStartEdit={onStartEdit}
                            onToggleExclude={onToggleExclude}
                            onDelete={onDelete}
                            onRegenerate={onRegenerate}
                            isRegenerating={isRegenerating}
                            excluded={!!page.excluded}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // ─── 其他类型：普通纸张卡片 ─────────────────────────────
    return (
        <div
            className={`relative my-6 transition-opacity ${page.excluded ? 'opacity-35' : ''}`}
            style={{ transform: `rotate(${tilt}deg)` }}
        >
            {/* 胶带 */}
            <div className="absolute -top-3 left-4 z-10 pointer-events-none">
                <WashiTape color={tape.color} pattern={tape.pattern} rotate={-2}>
                    {tape.label}
                </WashiTape>
            </div>

            {/* 散落贴纸 */}
            <ScatteredStickers seed={page.id} count={page.type === 'user_diary' ? 4 : 2} zone="corners" />

            {/* user_diary 顶部蕾丝边 */}
            {page.type === 'user_diary' && (
                <div className="absolute top-0 left-0 right-0 z-[5] pointer-events-none px-2 pt-1">
                    <LaceEdge color={PAPER_TONES.accentRose} flip />
                </div>
            )}

            <div
                className="relative px-5 pt-6 pb-3"
                style={{
                    background: paper.bg,
                    color: PAPER_TONES.ink,
                    borderRadius: 6,
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
                        style={{ ...SERIF_STACK, color: PAPER_TONES.ink }}
                        autoFocus
                    />
                ) : (
                    <p
                        className="whitespace-pre-wrap text-[14.5px] leading-[26px] break-words tracking-wide"
                        style={{ ...SERIF_STACK, color: PAPER_TONES.ink, minHeight: '60px' }}
                    >
                        {page.content || (
                            <span style={{ color: PAPER_TONES.inkSoft, fontStyle: 'italic', opacity: 0.6 }}>
                                这一页还是空白的…
                            </span>
                        )}
                    </p>
                )}

                {page.generatedBy === 'llm' && !isEditing && (
                    <div
                        className="text-[9px] mt-2 italic tracking-widest text-right"
                        style={{ ...CUTE_STACK, color: PAPER_TONES.inkFaint }}
                    >
                        · AI 草稿 ·
                    </div>
                )}

                <ActionRow
                    isEditing={isEditing}
                    onCancel={onCancel}
                    onSave={() => onSave(draft)}
                    onStartEdit={onStartEdit}
                    onToggleExclude={onToggleExclude}
                    onDelete={onDelete}
                    onRegenerate={onRegenerate}
                    isRegenerating={isRegenerating}
                    excluded={!!page.excluded}
                />
            </div>
        </div>
    );
};

// ─── 操作行（小铁夹按钮）────────────────────────────
const ActionRow: React.FC<{
    isEditing: boolean;
    onCancel: () => void;
    onSave: () => void;
    onStartEdit: () => void;
    onToggleExclude: () => void;
    onDelete: () => void;
    onRegenerate?: () => void;
    isRegenerating?: boolean;
    excluded: boolean;
}> = ({ isEditing, onCancel, onSave, onStartEdit, onToggleExclude, onDelete, onRegenerate, isRegenerating, excluded }) => (
    <div
        className="mt-3 pt-2 flex justify-end items-center gap-1"
        style={{ borderTop: `1px dashed ${PAPER_TONES.spine}` }}
    >
        {isEditing ? (
            <>
                <button
                    onClick={onCancel}
                    className="text-[11px] px-2 py-1 rounded active:scale-95 transition flex items-center gap-1"
                    style={{ ...CUTE_STACK, color: PAPER_TONES.inkSoft }}
                >
                    <X className="w-3 h-3" /> 取消
                </button>
                <button
                    onClick={onSave}
                    className="text-[11px] px-3 py-1 rounded-full active:scale-95 transition flex items-center gap-1"
                    style={{
                        ...CUTE_STACK,
                        background: PAPER_TONES.accentBlush,
                        color: '#fff',
                        boxShadow: '0 1px 3px rgba(122,90,114,0.18)',
                    }}
                >
                    <FloppyDisk className="w-3 h-3" /> 收下 ♡
                </button>
            </>
        ) : (
            <>
                {onRegenerate && (
                    <IconBtn onClick={onRegenerate} disabled={isRegenerating} title="再写一次"
                             Icon={ArrowsClockwise} spin={isRegenerating} />
                )}
                <IconBtn onClick={onStartEdit} title="改写" Icon={PencilSimple} />
                <IconBtn onClick={onToggleExclude} title={excluded ? '让它入册' : '不入册'}
                         Icon={excluded ? EyeSlash : Eye} />
                <IconBtn onClick={onDelete} title="撕掉这页" Icon={Trash} danger />
            </>
        )}
    </div>
);

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
            color: danger ? '#c4708a' : PAPER_TONES.inkSoft,
            background: 'transparent',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(242,157,176,0.15)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
        <Icon className={`w-3.5 h-3.5 ${spin ? 'animate-spin' : ''}`} weight="bold" />
    </button>
);

export default HandbookPageCard;
