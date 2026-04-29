/**
 * 单片绝对定位的小卡 — "很多很多花样"版
 *
 * 皮肤变体 (按 seed 选,角色页和 user 页混合):
 *   sticky / sticky_lined / sticky_grid
 *   polaroid / polaroid_dark
 *   ripped     横线撕边
 *   tape_card  顶部 washi
 *   sticker    虚线边框
 *   handnote   手写斜体彩笔
 *   callout    深底白字 + 副语
 *   ticket     旧票根
 *   marker     强调荧光底
 *   plain_para 透明纸上直接写(原稿手感)
 *
 * 内容:
 *   - markdown-lite (粗/斜/高亮/code/[color:red]())
 *   - 部分皮肤叠彩色笔批注 (CardAnnotations)
 *   - role 决定字号 / 留白(margin/corner 更紧凑)
 */

import React from 'react';
import { HandbookFragment, HandbookPage, CharacterProfile, LayoutRole } from '../../types';
import {
    PAPER_TONES, CUTE_STACK, MONO_STACK,
    seedFloat,
} from './paper';
import JournalRichText from './JournalRichText';
import CardAnnotations from './JournalAnnotations';

type SkinKind =
    | 'sticky' | 'sticky_lined' | 'sticky_grid'
    | 'polaroid' | 'polaroid_dark'
    | 'ripped' | 'tape_card' | 'sticker' | 'handnote'
    | 'callout' | 'ticket' | 'marker' | 'plain_para';

const STICKY_PALETTES = [
    { bg: '#f5eef7', border: '#d6c8e8', accent: '#a98ec4' },
    { bg: '#eef4f9', border: '#b9d3e0', accent: '#7ea7be' },
    { bg: '#fff0f5', border: '#fbb8c8', accent: '#f29db0' },
    { bg: '#f0faf5', border: '#bfe1cf', accent: '#88c5a8' },
    { bg: '#fef9e0', border: '#f5e295', accent: '#d6b85a' },
    { bg: '#fff8e8', border: '#f0d27a', accent: '#c9a14a' },
];

// 不同 role 用不同皮肤集 — 主区皮肤大方,角落皮肤紧凑
function pickSkin(seed: string, role: LayoutRole, isUser: boolean): SkinKind {
    const ALL_MAIN: SkinKind[] = isUser
        ? ['sticky', 'sticky_lined', 'tape_card', 'plain_para', 'callout', 'marker', 'sticky_grid']
        : ['sticky', 'tape_card', 'ripped', 'plain_para', 'sticky_lined', 'callout'];
    const ALL_SIDE: SkinKind[] = ['sticky', 'sticker', 'tape_card', 'ripped', 'handnote', 'sticky_grid'];
    const ALL_CORNER: SkinKind[] = ['sticky', 'handnote', 'ripped', 'sticker', 'ticket', 'marker'];
    const ALL_MARGIN: SkinKind[] = ['handnote', 'sticker', 'ticket'];

    const bag = role === 'main' ? ALL_MAIN
        : role === 'side' ? ALL_SIDE
        : role === 'corner' ? ALL_CORNER
        : ALL_MARGIN;
    return bag[Math.floor(seedFloat(seed, 9001) * bag.length)];
}

// 每张卡是否带彩色笔批注 — main/side 概率高,corner/margin 几乎没有
function shouldAnnotate(seed: string, role: LayoutRole): 'none' | 'light' | 'medium' {
    if (role === 'margin') return 'none';
    const r = seedFloat(seed, 7777);
    if (role === 'main') return r > 0.4 ? 'light' : r > 0.18 ? 'medium' : 'none';
    if (role === 'side') return r > 0.55 ? 'light' : 'none';
    return r > 0.7 ? 'light' : 'none';
}

interface Props {
    fragment?: HandbookFragment;
    page: HandbookPage;
    char?: CharacterProfile;
    role: LayoutRole;
    onTap?: () => void;
}

const JournalFragmentCard: React.FC<Props> = ({ fragment, page, char, role, onTap }) => {
    const text = fragment?.text ?? page.content ?? '';
    const time = fragment?.time;
    const seedKey = fragment?.id ?? page.id;
    const isUser = page.type !== 'character_life';
    const skin = pickSkin(seedKey, role, isUser);
    const annotateLevel = shouldAnnotate(seedKey, role);

    const palIdx = Math.floor(seedFloat(seedKey, 13) * STICKY_PALETTES.length);
    const stickyColor = STICKY_PALETTES[palIdx];

    const authorLabel = isUser ? '我' : (char?.name || '');

    const fontSize = role === 'margin' ? 11.5 : role === 'corner' ? 12.5 : 13.5;
    const lineHeight = role === 'margin' ? '18px' : role === 'corner' ? '20px' : '23px';

    const richProps = {
        text,
        fontSize,
        lineHeight,
        opts: {
            color: PAPER_TONES.ink,
            accent: stickyColor.accent,
            muted: PAPER_TONES.inkSoft,
            boldColor: PAPER_TONES.ink,
            headColor: PAPER_TONES.ink,
        },
    };

    const Author: React.FC<{ accent?: string; mono?: boolean }> = ({ accent, mono }) => (
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
                    ...(mono ? MONO_STACK : CUTE_STACK),
                    fontSize: 9.5,
                    letterSpacing: '0.15em',
                    color: accent || stickyColor.accent,
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

    let body: React.ReactNode;

    switch (skin) {
        case 'sticky':
            body = (
                <div className="relative" style={{
                    background: stickyColor.bg,
                    border: `1px solid ${stickyColor.border}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    boxShadow: '0 1px 2px rgba(122,90,114,0.08), 0 4px 10px -8px rgba(122,90,114,0.18)',
                }}>
                    <Author />
                    <JournalRichText {...richProps} />
                    <CardAnnotations seed={seedKey} intensity={annotateLevel} />
                </div>
            );
            break;

        case 'sticky_lined':
            body = (
                <div className="relative" style={{
                    background: stickyColor.bg,
                    border: `1px solid ${stickyColor.border}`,
                    borderRadius: 6,
                    padding: '8px 10px',
                    backgroundImage: `repeating-linear-gradient(transparent, transparent ${parseInt(lineHeight) - 1}px, ${stickyColor.border}66 ${parseInt(lineHeight) - 1}px, ${stickyColor.border}66 ${parseInt(lineHeight)}px)`,
                    boxShadow: '0 1px 3px rgba(122,90,114,0.08)',
                }}>
                    <Author />
                    <JournalRichText {...richProps} />
                    <CardAnnotations seed={seedKey} intensity={annotateLevel} />
                </div>
            );
            break;

        case 'sticky_grid':
            body = (
                <div className="relative" style={{
                    background: '#fffdf6',
                    border: `1px solid ${stickyColor.border}`,
                    borderRadius: 4,
                    padding: '8px 10px',
                    backgroundImage: `linear-gradient(${stickyColor.border}55 1px, transparent 1px), linear-gradient(90deg, ${stickyColor.border}55 1px, transparent 1px)`,
                    backgroundSize: '14px 14px',
                    boxShadow: '0 1px 2px rgba(122,90,114,0.06)',
                }}>
                    <Author mono />
                    <JournalRichText {...richProps} />
                    <CardAnnotations seed={seedKey} intensity={annotateLevel} />
                </div>
            );
            break;

        case 'polaroid':
            body = (
                <div className="relative" style={{
                    background: '#fff',
                    padding: '8px 10px 14px 10px',
                    borderRadius: 3,
                    boxShadow: '0 1px 3px rgba(122,90,114,0.12), 0 6px 14px -8px rgba(122,90,114,0.22)',
                }}>
                    <div style={{
                        height: 28,
                        borderRadius: 2,
                        background: `linear-gradient(135deg, ${stickyColor.bg} 0%, ${stickyColor.border} 100%)`,
                        marginBottom: 8,
                    }} />
                    <Author />
                    <JournalRichText {...richProps} />
                    <CardAnnotations seed={seedKey} intensity={annotateLevel} />
                </div>
            );
            break;

        case 'polaroid_dark':
            body = (
                <div className="relative" style={{
                    background: '#2d2832',
                    padding: '8px 10px 14px 10px',
                    borderRadius: 3,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                }}>
                    <div style={{
                        height: 26, borderRadius: 2,
                        background: `linear-gradient(135deg, #4a3c4d 0%, #2d2832 100%)`,
                        marginBottom: 8,
                    }} />
                    <div className="flex items-center gap-1.5 mb-1.5">
                        {char?.avatar
                            ? <img src={char.avatar} alt="" className="rounded-full" style={{ width: 16, height: 16 }} />
                            : <span style={{ color: '#fcd2d8', fontSize: 9 }}>♡</span>
                        }
                        <span style={{ ...MONO_STACK, fontSize: 9.5, letterSpacing: '0.18em', color: '#fcd2d8' }}>
                            {authorLabel}
                        </span>
                    </div>
                    <JournalRichText
                        {...richProps}
                        opts={{ ...richProps.opts, color: '#f5ebef', muted: 'rgba(245,235,239,0.5)', boldColor: '#fff', headColor: '#fff', accent: '#fcd2d8' }}
                    />
                </div>
            );
            break;

        case 'ripped':
            body = (
                <div className="relative" style={{
                    background: '#fff',
                    padding: '8px 10px',
                    backgroundImage: `repeating-linear-gradient(transparent, transparent 21px, ${stickyColor.border}55 21px, ${stickyColor.border}55 22px)`,
                    boxShadow: '0 1px 2px rgba(122,90,114,0.08)',
                    clipPath: 'polygon(0 4px, 4% 0, 8% 3px, 12% 0, 16% 3px, 20% 0, 28% 1px, 38% 2px, 50% 0, 60% 2px, 70% 0, 80% 3px, 88% 0, 96% 2px, 100% 0, 100% 100%, 96% 98%, 88% 100%, 78% 97%, 66% 100%, 54% 98%, 42% 100%, 28% 97%, 14% 100%, 4% 98%, 0 100%)',
                }}>
                    <Author />
                    <JournalRichText {...richProps} />
                    <CardAnnotations seed={seedKey} intensity={annotateLevel} />
                </div>
            );
            break;

        case 'tape_card': {
            const tapeColors = ['#fbb8c8', '#b9d3e0', '#bfe1cf', '#f5e295', '#d6c8e8'];
            const tapeColor = tapeColors[Math.floor(seedFloat(seedKey, 17) * tapeColors.length)];
            body = (
                <div className="relative" style={{
                    background: '#fff',
                    padding: '14px 10px 8px 10px',
                    borderRadius: 3,
                    boxShadow: '0 1px 3px rgba(122,90,114,0.1), 0 4px 10px -8px rgba(122,90,114,0.18)',
                }}>
                    <div style={{
                        position: 'absolute',
                        top: -3, left: 14, width: '40%', height: 14,
                        background: `repeating-linear-gradient(135deg, ${tapeColor} 0 6px, rgba(255,255,255,0.45) 6px 10px)`,
                        clipPath: 'polygon(2% 0, 100% 6%, 99% 100%, 0 95%)',
                        transform: 'rotate(-3deg)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                    }} />
                    <Author />
                    <JournalRichText {...richProps} />
                    <CardAnnotations seed={seedKey} intensity={annotateLevel} />
                </div>
            );
            break;
        }

        case 'sticker':
            body = (
                <div className="relative" style={{
                    background: 'rgba(255,255,255,0.55)',
                    border: `1.5px dashed ${stickyColor.accent}`,
                    borderRadius: 14,
                    padding: '8px 10px',
                    backdropFilter: 'blur(2px)',
                }}>
                    <Author />
                    <JournalRichText {...richProps} />
                </div>
            );
            break;

        case 'handnote':
            body = (
                <div className="relative" style={{ padding: '4px 8px', color: stickyColor.accent }}>
                    <Author accent={stickyColor.accent} />
                    <JournalRichText
                        {...richProps}
                        italic
                        fontFamily='"Caveat", "Noto Serif SC", cursive'
                        fontSize={fontSize + 2}
                        opts={{ ...richProps.opts, color: stickyColor.accent, boldColor: stickyColor.accent }}
                    />
                </div>
            );
            break;

        case 'callout':
            body = (
                <div className="relative" style={{
                    background: '#2a2530',
                    color: '#fff',
                    padding: '12px 14px',
                    borderRadius: 4,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <span style={{ ...MONO_STACK, fontSize: 8.5, letterSpacing: '0.32em', color: stickyColor.accent }}>
                            ◆ {authorLabel.toUpperCase()} {time ? `· ${time}` : ''}
                        </span>
                    </div>
                    <JournalRichText
                        {...richProps}
                        fontFamily='"DM Serif Display", "Noto Serif SC", serif'
                        fontSize={fontSize + 2}
                        opts={{ ...richProps.opts, color: '#f5ebef', accent: stickyColor.accent, boldColor: '#fff', headColor: '#fff', muted: 'rgba(255,255,255,0.55)' }}
                    />
                </div>
            );
            break;

        case 'ticket':
            body = (
                <div className="relative" style={{
                    background: '#fffaf2',
                    border: `1px dashed ${stickyColor.accent}`,
                    borderRadius: 2,
                    padding: '8px 10px',
                    boxShadow: '0 1px 3px rgba(122,90,114,0.08)',
                    position: 'relative',
                }}>
                    <span style={{
                        position: 'absolute', top: '50%', left: -5, width: 10, height: 10,
                        background: PAPER_TONES.paper, borderRadius: '50%',
                        transform: 'translateY(-50%)',
                    }} />
                    <span style={{
                        position: 'absolute', top: '50%', right: -5, width: 10, height: 10,
                        background: PAPER_TONES.paper, borderRadius: '50%',
                        transform: 'translateY(-50%)',
                    }} />
                    <div className="flex items-center justify-between mb-1.5">
                        <span style={{ ...MONO_STACK, fontSize: 8.5, letterSpacing: '0.3em', color: stickyColor.accent }}>
                            ADM · {authorLabel}
                        </span>
                        <span style={{ ...MONO_STACK, fontSize: 8, color: PAPER_TONES.inkFaint }}>
                            {time || 'Nº ' + seedKey.slice(-4)}
                        </span>
                    </div>
                    <JournalRichText {...richProps} fontSize={fontSize - 0.5} />
                </div>
            );
            break;

        case 'marker':
            body = (
                <div className="relative" style={{
                    background: stickyColor.bg,
                    padding: '8px 10px',
                    borderRadius: 4,
                    backgroundImage: `linear-gradient(transparent 60%, ${stickyColor.accent}33 60%, ${stickyColor.accent}33 92%, transparent 92%)`,
                    backgroundSize: '100% 100%',
                    boxShadow: '0 1px 2px rgba(122,90,114,0.06)',
                }}>
                    <Author />
                    <JournalRichText
                        {...richProps}
                        opts={{ ...richProps.opts, accent: stickyColor.accent }}
                    />
                </div>
            );
            break;

        case 'plain_para':
            body = (
                <div className="relative" style={{ padding: '4px 6px' }}>
                    <Author />
                    <JournalRichText
                        {...richProps}
                        fontFamily={'"Noto Serif SC", "Songti SC", serif'}
                    />
                    <CardAnnotations seed={seedKey} intensity={annotateLevel} />
                </div>
            );
            break;

        default:
            body = <div>{text}</div>;
    }

    return (
        <div
            onClick={onTap}
            style={{
                cursor: onTap ? 'pointer' : 'default',
                width: '100%',
                opacity: page.excluded ? 0.35 : 1,
            }}
        >
            {body}
        </div>
    );
};

export { pickSkin };
export default JournalFragmentCard;
