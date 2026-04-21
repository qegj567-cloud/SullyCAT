/**
 * Memory Dive — 3DS 风格对话框（下屏）
 *
 * 固定高度，不随文本内容伸缩。
 * 左侧角色大头像 + 右侧文字区：
 *   - 旁白：无头像，居中斜体
 *   - 角色：头像 + 名字 + 打字机文本
 *   - 选项：占满文字区滚动列表
 */

import React, { useEffect, useState, useRef } from 'react';
import type { DiveDialogue, DiveChoice } from './memoryDiveTypes';

interface Props {
  current: DiveDialogue | null;
  queueRemaining: number;
  pendingChoices: DiveChoice[] | null;
  charName: string;
  /** 角色头像（profile.avatar，可为 emoji 或 URL） */
  charAvatar?: string;
  /** 像素素材（备选） */
  charSprite?: string;
  userName: string;
  isLoading: boolean;
  disabled: boolean;
  onAdvance: () => void;
  onChoice: (c: DiveChoice) => void;
}

const TYPE_SPEED_MS = 22;

const MemoryDiveDialogue: React.FC<Props> = ({
  current, queueRemaining, pendingChoices, charName, charAvatar, charSprite, userName,
  isLoading, disabled, onAdvance, onChoice,
}) => {
  const [typed, setTyped] = useState(0);
  const timerRef = useRef<number | null>(null);
  const fullText = current?.text || '';
  const isComplete = typed >= fullText.length;

  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setTyped(0);
    if (!current || !fullText) return;
    let i = 0;
    timerRef.current = window.setInterval(() => {
      i++;
      setTyped(i);
      if (i >= fullText.length && timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, TYPE_SPEED_MS);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [current?.id]);

  const handleBoxTap = () => {
    if (disabled) return;
    if (!isComplete) { setTyped(fullText.length); return; }
    onAdvance();
  };

  const showChoices = !!pendingChoices && !current && !isLoading;

  // ─── 头像源：优先 profile.avatar（大图/emoji），备选像素 sprite ──
  const avatarForCharacter = charAvatar || charSprite;
  const avatarForUser = undefined; // 用户选项用 emoji 代替

  return (
    // 下屏：固定高度，不随内容撑开
    <div
      className="shrink-0 w-full bg-slate-950/95 border-t-2 border-slate-700"
      style={{ height: '42vh', minHeight: 240 }}
    >
      {/* 外层像素边框 */}
      <div className="relative h-full m-2 rounded-sm bg-slate-900 flex"
        style={{
          height: 'calc(100% - 1rem)',
          boxShadow:
            'inset 0 0 0 2px #1e293b, inset 0 0 0 4px #475569, 0 0 0 1px #0f172a',
        }}
      >
        {/* 四角像素装饰 */}
        <CornerPx pos="tl" />
        <CornerPx pos="tr" />
        <CornerPx pos="bl" />
        <CornerPx pos="br" />

        {/* 头像区（左侧） —— 在叙事/角色阶段展示；选项阶段可收起 */}
        {current && current.speaker === 'character' && (
          <AvatarBox src={avatarForCharacter} name={charName} tone="violet" />
        )}
        {current && current.speaker === 'narrator' && (
          <AvatarBox src={undefined} name="旁白" tone="slate" glyph="📖" />
        )}
        {showChoices && (
          <AvatarBox src={avatarForUser} name={userName} tone="emerald" glyph="🙂" />
        )}

        {/* 右侧内容区 */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* 当前台词 */}
          {current && (
            <button
              type="button"
              onClick={handleBoxTap}
              disabled={disabled}
              className="flex-1 text-left px-4 pt-3 pb-2 overflow-hidden flex flex-col min-h-0"
            >
              <SpeakerLabel speaker={current.speaker} charName={charName} />
              <div
                className="flex-1 overflow-y-auto text-[13px] leading-relaxed text-slate-100 whitespace-pre-wrap pr-1"
                // iOS 上 button 内滚动要显式允许
                style={{ WebkitOverflowScrolling: 'touch' as any }}
              >
                {fullText.slice(0, typed)}
                {!isComplete && (
                  <span className="ml-0.5 inline-block w-1.5 h-3 align-middle bg-slate-400 animate-pulse" />
                )}
              </div>
              {isComplete && !showChoices && (
                <div className="shrink-0 flex justify-end pt-1">
                  <span className="text-[11px] text-amber-300/90 animate-bounce" style={{ animationDuration: '1.2s' }}>
                    {queueRemaining > 0 ? '▼' : '◆'}
                  </span>
                </div>
              )}
            </button>
          )}

          {/* 选项列表 */}
          {showChoices && (
            <div className="flex-1 overflow-y-auto p-3 min-h-0" style={{ WebkitOverflowScrolling: 'touch' as any }}>
              <div className="text-[10px] text-amber-300/80 uppercase tracking-widest mb-1.5 pl-1">你的回应</div>
              <div className="space-y-1.5">
                {pendingChoices!.map(choice => (
                  <button key={choice.id}
                    onClick={() => onChoice(choice)}
                    disabled={disabled}
                    className="block w-full text-left px-3 py-2 rounded-sm bg-slate-800/70 hover:bg-emerald-700/40 border border-slate-700 hover:border-emerald-500/60 text-[12px] text-slate-200 hover:text-emerald-100 transition-colors active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className="text-amber-400 mr-2">▸</span>
                    {choice.text}
                    {choice.action && (
                      <span className="ml-2 text-[9px] text-slate-500">
                        ({labelForAction(choice.action)})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 加载态 */}
          {!current && !showChoices && isLoading && (
            <div className="flex-1 flex items-center gap-2 px-4">
              <span className="text-[11px] text-slate-500 italic">记忆正在浮现</span>
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          )}

          {/* 空闲 */}
          {!current && !showChoices && !isLoading && (
            <div className="flex-1 flex items-center px-4 text-[11px] text-slate-600 italic">……</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── 左侧头像框 ────────────────────────────────────────

const AvatarBox: React.FC<{
  src?: string;
  name: string;
  tone: 'violet' | 'emerald' | 'slate';
  glyph?: string;
}> = ({ src, name, tone, glyph }) => {
  const toneClass = tone === 'violet' ? 'border-violet-500/60 bg-violet-900/30'
    : tone === 'emerald' ? 'border-emerald-500/60 bg-emerald-900/30'
    : 'border-slate-600/60 bg-slate-800/60';
  const labelClass = tone === 'violet' ? 'text-violet-200'
    : tone === 'emerald' ? 'text-emerald-200'
    : 'text-slate-400';

  const isEmoji = !!src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('/');
  const isImage = !!src && !isEmoji;

  return (
    <div className="shrink-0 w-[72px] p-2 flex flex-col items-center justify-start gap-1 border-r border-slate-800">
      <div
        className={`w-16 h-16 rounded-sm border-2 overflow-hidden flex items-center justify-center ${toneClass}`}
        style={{ imageRendering: 'pixelated' as any }}
      >
        {isImage && (
          <img src={src} alt={name}
            className="w-full h-full object-cover"
            style={{ imageRendering: 'pixelated' as any }}
            draggable={false}
          />
        )}
        {isEmoji && (
          <span className="text-3xl">{src}</span>
        )}
        {!src && (
          <span className="text-2xl opacity-80">{glyph || '·'}</span>
        )}
      </div>
      <span className={`text-[9px] font-bold truncate max-w-full ${labelClass}`}>{name}</span>
    </div>
  );
};

const SpeakerLabel: React.FC<{
  speaker: DiveDialogue['speaker'];
  charName: string;
}> = ({ speaker, charName }) => {
  if (speaker === 'narrator') {
    return <div className="shrink-0 text-[9px] text-slate-500 uppercase tracking-[0.2em] mb-1">旁白</div>;
  }
  if (speaker === 'character') {
    return <div className="shrink-0 text-[11px] font-bold text-violet-300 mb-1">{charName}</div>;
  }
  return null;
};

const CornerPx: React.FC<{ pos: 'tl' | 'tr' | 'bl' | 'br' }> = ({ pos }) => {
  const p: Record<string, string> = {
    tl: 'top-0 left-0',
    tr: 'top-0 right-0',
    bl: 'bottom-0 left-0',
    br: 'bottom-0 right-0',
  };
  return <div className={`absolute ${p[pos]} w-1.5 h-1.5 bg-amber-400/70 pointer-events-none`} />;
};

function labelForAction(a: DiveChoice['action']): string {
  switch (a) {
    case 'comfort': return '安慰';
    case 'question': return '追问';
    case 'observe': return '观察';
    case 'leave': return '离开';
    case 'unlock': return '解锁';
    default: return '';
  }
}

export default MemoryDiveDialogue;
