/**
 * Memory Dive — 3DS 风格对话框（下屏）
 *
 * 模拟复古 RPG / 3DS 下屏：
 *   - 像素双层边框
 *   - 打字机逐字显示
 *   - 文本打完后显示「▼」提示点按继续
 *   - 队列走完出现选项
 */

import React, { useEffect, useState, useRef } from 'react';
import type { DiveDialogue, DiveChoice } from './memoryDiveTypes';

interface Props {
  current: DiveDialogue | null;
  /** 本句后面还有多少句在排队（用来决定显示▼还是 END） */
  queueRemaining: number;
  pendingChoices: DiveChoice[] | null;
  charName: string;
  charSprite?: string;
  isLoading: boolean;
  disabled: boolean;
  onAdvance: () => void;
  onChoice: (c: DiveChoice) => void;
}

const TYPE_SPEED_MS = 22;

const MemoryDiveDialogue: React.FC<Props> = ({
  current, queueRemaining, pendingChoices, charName, charSprite,
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
    // 第一次点击：跳过打字机直接显示全文
    if (!isComplete) { setTyped(fullText.length); return; }
    // 已完整：推进队列
    onAdvance();
  };

  // 选项阶段（当前无文本或已显示完）
  const showChoices = !!pendingChoices && !current && !isLoading;

  return (
    <div className="shrink-0 w-full bg-slate-950/95 border-t-2 border-slate-700">
      {/* 外层像素边框 */}
      <div className="relative m-2 rounded-sm bg-slate-900"
        style={{
          boxShadow:
            'inset 0 0 0 2px #1e293b, inset 0 0 0 4px #475569, 0 0 0 1px #0f172a',
        }}
      >
        {/* 四角像素装饰 */}
        <CornerPx pos="tl" />
        <CornerPx pos="tr" />
        <CornerPx pos="bl" />
        <CornerPx pos="br" />

        {current && (
          <button
            type="button"
            onClick={handleBoxTap}
            disabled={disabled}
            className="w-full text-left px-4 pt-3 pb-4 min-h-[120px]"
          >
            <SpeakerLabel speaker={current.speaker} charName={charName} charSprite={charSprite} />
            <div className="text-[13px] leading-relaxed text-slate-100 whitespace-pre-wrap font-[system-ui]"
              style={{ minHeight: 64 }}
            >
              {fullText.slice(0, typed)}
              {!isComplete && <span className="ml-0.5 inline-block w-1.5 h-3 align-middle bg-slate-400 animate-pulse" />}
            </div>
            {isComplete && !showChoices && (
              <div className="flex justify-end mt-1.5">
                <span className="text-[11px] text-amber-300/90 animate-bounce" style={{ animationDuration: '1.2s' }}>
                  {queueRemaining > 0 ? '▼' : '◆'}
                </span>
              </div>
            )}
          </button>
        )}

        {/* 选项列表（队列清空后显示） */}
        {showChoices && (
          <div className="p-3 space-y-1.5">
            <div className="text-[10px] text-amber-300/80 uppercase tracking-widest mb-1 pl-1">你的回应</div>
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
        )}

        {/* loading 占位 */}
        {!current && !showChoices && isLoading && (
          <div className="px-4 py-6 flex items-center gap-2">
            <span className="text-[11px] text-slate-500 italic">记忆正在浮现</span>
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}

        {/* 空闲占位 */}
        {!current && !showChoices && !isLoading && (
          <div className="px-4 py-6 text-[11px] text-slate-600 italic">……</div>
        )}
      </div>
    </div>
  );
};

// ─── 小组件 ────────────────────────────────────────────

const SpeakerLabel: React.FC<{
  speaker: DiveDialogue['speaker'];
  charName: string;
  charSprite?: string;
}> = ({ speaker, charName, charSprite }) => {
  if (speaker === 'narrator') {
    return (
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[9px] text-slate-500 uppercase tracking-[0.2em]">旁白</span>
      </div>
    );
  }
  if (speaker === 'character') {
    return (
      <div className="flex items-center gap-1.5 mb-1.5">
        {charSprite ? (
          <img src={charSprite} className="w-4 h-4"
            style={{ imageRendering: 'pixelated', objectFit: 'contain' }} alt="" />
        ) : <span className="text-[10px]">💬</span>}
        <span className="text-[11px] font-bold text-violet-300">{charName}</span>
      </div>
    );
  }
  // user_choice（已选）—— 回显用
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="text-[11px] font-bold text-emerald-300">你</span>
    </div>
  );
};

const CornerPx: React.FC<{ pos: 'tl' | 'tr' | 'bl' | 'br' }> = ({ pos }) => {
  const p: Record<string, string> = {
    tl: 'top-0 left-0',
    tr: 'top-0 right-0',
    bl: 'bottom-0 left-0',
    br: 'bottom-0 right-0',
  };
  return <div className={`absolute ${p[pos]} w-1.5 h-1.5 bg-amber-400/70`} />;
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
