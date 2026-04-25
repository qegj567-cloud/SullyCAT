/**
 * 角色筛选 bottom sheet
 * 设计：从底部抽出的"夹页",米白纸 + 棕褐字 + 头像贴纸感
 */

import React from 'react';
import { CharacterProfile } from '../../types';
import { PAPER_TONES, SERIF_STACK, WashiTape } from './paper';
import { Sparkle, X } from '@phosphor-icons/react';

interface PickerProps {
    visible: boolean;
    chatChars: CharacterProfile[];      // 今天聊过的角色（user 视角页素材）
    lifeChars: CharacterProfile[];      // 生活系角色（陪伴页）
    excludedChat: Set<string>;
    excludedLife: Set<string>;
    onToggleChat: (charId: string) => void;
    onToggleLife: (charId: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
    generating: boolean;
}

const HandbookCharPicker: React.FC<PickerProps> = ({
    visible, chatChars, lifeChars, excludedChat, excludedLife,
    onToggleChat, onToggleLife, onCancel, onConfirm, generating,
}) => {
    if (!visible) return null;

    const renderRow = (
        c: CharacterProfile,
        excluded: boolean,
        onToggle: () => void,
        accent: string,
    ) => (
        <button
            key={c.id}
            onClick={onToggle}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition active:scale-[0.99]"
            style={{
                background: excluded ? 'rgba(168,140,100,0.06)' : 'rgba(253,246,231,0.7)',
                border: `1px solid ${excluded ? 'rgba(168,140,100,0.15)' : accent}`,
                opacity: excluded ? 0.5 : 1,
            }}
        >
            <img
                src={c.avatar}
                className="w-9 h-9 rounded-full object-cover shrink-0"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.15), 0 0 0 2px #fdf6e7' }}
                alt=""
            />
            <span
                className="flex-1 text-left text-[14px]"
                style={{ ...SERIF_STACK, color: PAPER_TONES.ink }}
            >
                {c.name}
            </span>
            <span
                className="text-[10px] tracking-widest"
                style={{ ...SERIF_STACK, color: excluded ? PAPER_TONES.inkSoft : accent }}
            >
                {excluded ? '已 排 除' : '入 册'}
            </span>
        </button>
    );

    return (
        <div
            className="absolute inset-0 z-50 flex items-end justify-center"
            style={{ background: 'rgba(58,47,37,0.45)', backdropFilter: 'blur(4px)' }}
            onClick={onCancel}
        >
            <div
                className="w-full max-h-[85%] overflow-y-auto rounded-t-3xl"
                style={{
                    background: PAPER_TONES.paper,
                    boxShadow: '0 -8px 28px rgba(58,47,37,0.25)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* 顶部把手 */}
                <div className="flex justify-center pt-3 pb-1">
                    <div style={{ width: 36, height: 4, borderRadius: 2, background: PAPER_TONES.spine, opacity: 0.5 }} />
                </div>

                {/* 标题 */}
                <div className="px-5 pt-2 pb-3 text-center">
                    <WashiTape color="cream" rotate={-1.2}>生 成 今 日</WashiTape>
                    <div
                        className="text-[11px] mt-3 italic"
                        style={{ ...SERIF_STACK, color: PAPER_TONES.inkSoft }}
                    >
                        默认全部入册 · 想跳过的单独勾掉就好
                    </div>
                </div>

                {/* 我的一天 · 取材自 */}
                <div className="px-5 mt-2">
                    <div
                        className="text-[11px] tracking-[0.3em] mb-2"
                        style={{ ...SERIF_STACK, color: PAPER_TONES.inkSoft }}
                    >
                        · 我 的 一 天 · 取 材 自 ·
                    </div>
                    {chatChars.length === 0 ? (
                        <div
                            className="text-[12px] py-2 italic"
                            style={{ ...SERIF_STACK, color: PAPER_TONES.inkSoft }}
                        >
                            今天还没和谁说过话
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {chatChars.map(c => renderRow(
                                c, excludedChat.has(c.id), () => onToggleChat(c.id), '#c4954a',
                            ))}
                        </div>
                    )}
                </div>

                {/* 陪伴页 */}
                <div className="px-5 mt-5 pb-3">
                    <div
                        className="text-[11px] tracking-[0.3em] mb-2"
                        style={{ ...SERIF_STACK, color: PAPER_TONES.inkSoft }}
                    >
                        · 陪 伴 页 · 角 色 们 的 小 生 活 ·
                    </div>
                    {lifeChars.length === 0 ? (
                        <div
                            className="text-[12px] py-2 italic"
                            style={{ ...SERIF_STACK, color: PAPER_TONES.inkSoft }}
                        >
                            还没有"生活系"角色
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {lifeChars.map(c => renderRow(
                                c, excludedLife.has(c.id), () => onToggleLife(c.id), '#c47c8a',
                            ))}
                        </div>
                    )}
                </div>

                {/* 底部操作 */}
                <div
                    className="sticky bottom-0 px-5 py-3 flex gap-2"
                    style={{
                        background: PAPER_TONES.paper,
                        borderTop: `1px solid ${PAPER_TONES.spine}`,
                    }}
                >
                    <button
                        onClick={onCancel}
                        className="px-4 py-3 rounded-lg text-[13px] active:scale-95 transition flex items-center gap-1"
                        style={{
                            ...SERIF_STACK,
                            color: PAPER_TONES.inkSoft,
                            border: `1px solid ${PAPER_TONES.spine}`,
                        }}
                    >
                        <X className="w-3.5 h-3.5" /> 算了
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={generating || (chatChars.length === 0 && lifeChars.length === 0)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-[13px] active:scale-95 transition disabled:opacity-50"
                        style={{
                            ...SERIF_STACK,
                            background: PAPER_TONES.cover,
                            color: '#fdf6e7',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        }}
                    >
                        <Sparkle weight="fill" className="w-3.5 h-3.5" />
                        {generating ? '正在落笔…' : '开始落笔'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HandbookCharPicker;
