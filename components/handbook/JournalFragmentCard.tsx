/**
 * 单片小卡（绝对定位用）
 *
 * 不负责"放在哪",只负责一片小内容的视觉:
 * - 皮肤变体: sticky / polaroid / ripped / sticker / washi_card / handnote
 * - 顶部作者条: user 走 ♡ 字样,角色走头像 + name 小标
 * - 长文小卡显示完,中文 line-height 23px
 *
 * 父级 (JournalCanvas) 通过 transform/旋转把它落到坐标。
 */

import React from 'react';
import { HandbookFragment, HandbookPage, CharacterProfile, LayoutRole } from '../../types';
import {
    PAPER_TONES, SERIF_STACK, CUTE_STACK, MONO_STACK, seedFloat,
} from './paper';

type SkinKind = 'sticky' | 'polaroid' | 'ripped' | 'sticker' | 'washi_card' | 'handnote';

const STICKY_PALETTES = [
    { bg: '#f5eef7', border: '#d6c8e8', accent: '#a98ec4' },
    { bg: '#eef4f9', border: '#b9d3e0', accent: '#7ea7be' },
    { bg: '#fff0f5', border: '#fbb8c8', accent: '#f29db0' },
    { bg: '#f0faf5', border: '#bfe1cf', accent: '#88c5a8' },
    { bg: '#fef9e0', border: '#f5e295', accent: '#d6b85a' },
];

function pickSkinFromSeed(seed: string, role: LayoutRole): SkinKind {
    // margin / corner 优先选小尺寸友好的皮肤
    if (role === 'margin') return 'handnote';
    const bag: SkinKind[] = role === 'corner'
        ? ['sticky', 'sticker', 'handnote', 'ripped']
        : ['sticky', 'sticky', 'polaroid', 'washi_card', 'ripped', 'sticker', 'handnote'];
    return bag[Math.floor(seedFloat(seed, 9001) * bag.length)];
}

interface Props {
    fragment?: HandbookFragment;     // 没有就拿 page.content 作整体文本(user_note)
    page: HandbookPage;
    char?: CharacterProfile;
    role: LayoutRole;
    onTap?: () => void;
}

const JournalFragmentCard: React.FC<Props> = ({ fragment, page, char, role, onTap }) => {
    const text = fragment?.text ?? page.content ?? '';
    const time = fragment?.time;
    const seedKey = fragment?.id ?? page.id;
    const skin = pickSkinFromSeed(seedKey, role);

    const palIdx = Math.floor(seedFloat(seedKey, 13) * STICKY_PALETTES.length);
    const stickyColor = STICKY_PALETTES[palIdx];

    const isUser = page.type !== 'character_life';
    const authorLabel = isUser ? '我' : (char?.name || '');

    const fontSize = role === 'margin' ? 11.5 : role === 'corner' ? 12.5 : 13.5;
    const lineHeight = role === 'margin' ? '18px' : role === 'corner' ? '20px' : '23px';

    const baseTextStyle: React.CSSProperties = {
        ...SERIF_STACK,
        fontSize,
        lineHeight,
        color: PAPER_TONES.ink,
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
    };

    const authorTag = (
        <div className="flex items-center gap-1.5 mb-1.5">
            {char?.avatar ? (
                <img
                    src={char.avatar}
                    alt={authorLabel}
                    className="rounded-full object-cover shrink-0"
                    style={{
                        width: 16, height: 16,
                        boxShadow: '0 0 0 1.5px #fff',
                    }}
                />
            ) : (
                <span
                    className="inline-flex items-center justify-center rounded-full shrink-0"
                    style={{
                        width: 16, height: 16,
                        background: PAPER_TONES.accentRose,
                        color: '#fff',
                        fontSize: 9,
                        ...CUTE_STACK,
                    }}
                >♡</span>
            )}
            <span
                className="truncate"
                style={{
                    ...CUTE_STACK,
                    fontSize: 9.5,
                    letterSpacing: '0.15em',
                    color: stickyColor.accent,
                    fontWeight: 700,
                }}
            >
                {authorLabel}
            </span>
            {time && (
                <span
                    className="ml-auto truncate"
                    style={{
                        ...MONO_STACK,
                        fontSize: 9,
                        letterSpacing: '0.1em',
                        color: PAPER_TONES.inkFaint,
                    }}
                >
                    {time}
                </span>
            )}
        </div>
    );

    const inner = (() => {
        if (skin === 'polaroid') {
            return (
                <div
                    style={{
                        background: '#fff',
                        padding: '8px 10px 12px 10px',
                        borderRadius: 3,
                        boxShadow: '0 1px 3px rgba(122,90,114,0.12), 0 6px 14px -8px rgba(122,90,114,0.22)',
                    }}
                >
                    <div
                        style={{
                            height: 26,
                            borderRadius: 2,
                            background: `linear-gradient(135deg, ${stickyColor.bg} 0%, ${stickyColor.border} 100%)`,
                            marginBottom: 6,
                        }}
                    />
                    {authorTag}
                    <p style={baseTextStyle}>{text}</p>
                </div>
            );
        }

        if (skin === 'ripped') {
            return (
                <div
                    style={{
                        background: '#fff',
                        backgroundImage: `repeating-linear-gradient(transparent, transparent 21px, ${stickyColor.border}55 21px, ${stickyColor.border}55 22px)`,
                        padding: '8px 10px',
                        boxShadow: '0 1px 2px rgba(122,90,114,0.08)',
                        clipPath: 'polygon(0 4px, 4% 0, 8% 3px, 12% 0, 16% 3px, 20% 0, 24% 3px, 30% 0, 38% 2px, 50% 0, 60% 2px, 70% 0, 80% 3px, 88% 0, 96% 2px, 100% 0, 100% 100%, 96% 98%, 88% 100%, 80% 97%, 70% 100%, 60% 98%, 50% 100%, 40% 97%, 30% 100%, 20% 97%, 10% 100%, 4% 98%, 0 100%)',
                    }}
                >
                    {authorTag}
                    <p style={baseTextStyle}>{text}</p>
                </div>
            );
        }

        if (skin === 'sticker') {
            return (
                <div
                    style={{
                        background: 'rgba(255,255,255,0.55)',
                        border: `1.5px dashed ${stickyColor.accent}`,
                        borderRadius: 14,
                        padding: '8px 10px',
                        backdropFilter: 'blur(2px)',
                    }}
                >
                    {authorTag}
                    <p style={baseTextStyle}>{text}</p>
                </div>
            );
        }

        if (skin === 'washi_card') {
            return (
                <div
                    style={{
                        position: 'relative',
                        background: '#fff',
                        padding: '14px 10px 8px 10px',
                        borderRadius: 3,
                        boxShadow: '0 1px 3px rgba(122,90,114,0.1), 0 4px 10px -8px rgba(122,90,114,0.18)',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            top: -3, left: 8, right: 8, height: 8,
                            background: `repeating-linear-gradient(135deg, ${stickyColor.bg} 0 7px, ${stickyColor.border}cc 7px 12px)`,
                            clipPath: 'polygon(2% 0, 99% 6%, 100% 100%, 0 95%)',
                        }}
                    />
                    {authorTag}
                    <p style={baseTextStyle}>{text}</p>
                </div>
            );
        }

        if (skin === 'handnote') {
            return (
                <div
                    style={{
                        padding: '6px 8px',
                        color: stickyColor.accent,
                    }}
                >
                    {authorTag}
                    <p
                        style={{
                            ...baseTextStyle,
                            color: stickyColor.accent,
                            fontStyle: 'italic',
                        }}
                    >
                        {text}
                    </p>
                </div>
            );
        }

        // sticky 默认
        return (
            <div
                style={{
                    background: stickyColor.bg,
                    border: `1px solid ${stickyColor.border}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    boxShadow: '0 1px 2px rgba(122,90,114,0.08), 0 4px 10px -8px rgba(122,90,114,0.18)',
                }}
            >
                {authorTag}
                <p style={baseTextStyle}>{text}</p>
            </div>
        );
    })();

    return (
        <div
            onClick={onTap}
            style={{
                cursor: onTap ? 'pointer' : 'default',
                width: '100%',
                opacity: page.excluded ? 0.35 : 1,
            }}
        >
            {inner}
        </div>
    );
};

export default JournalFragmentCard;
