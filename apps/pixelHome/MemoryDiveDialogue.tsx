/**
 * Memory Dive — 对话框（纯粹的像素框 + 分页 + 打字机）
 *
 * 本组件只负责一个像素边框的小对话框。外层容器（位置、宽高、
 * 背景、加载态浮层）由父组件负责——现在对话框悬浮在上屏房间
 * 的下沿，而下屏是独立的氛围面板。
 *
 * 选项出现 / 加载中 / 无内容时，父组件不渲染本组件。
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import type { DiveDialogue } from './memoryDiveTypes';

interface Props {
  current: DiveDialogue | null;
  /** 本句后还有多少条在排队（仅影响 ▼/◆ 提示） */
  queueRemaining: number;
  /** 这条说完后是否会立刻出选项（影响 ▼/◆ 提示） */
  choicesPending: boolean;
  charName: string;
  charAvatar?: string;
  disabled: boolean;
  onAdvance: () => void;
}

const TYPE_SPEED_MS = 22;
const PAGE_CHAR_LIMIT = 46;

function paginate(text: string, limit: number): string[] {
  if (!text) return [];
  if (text.length <= limit) return [text];
  const breakChars = new Set(['。', '！', '？', '；', '\n', '……', '——', '，', '、', ',', '.', '!', '?']);
  const pages: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + limit, text.length);
    if (end < text.length) {
      let found = -1;
      const minEnd = i + Math.floor(limit * 0.55);
      for (let j = end; j >= minEnd; j--) {
        if (breakChars.has(text[j]) || text[j] === '\n') { found = j + 1; break; }
      }
      if (found > 0) end = found;
    }
    pages.push(text.slice(i, end).replace(/^[\s]+/, ''));
    i = end;
  }
  return pages.filter(p => p.length > 0);
}

const MemoryDiveDialogue: React.FC<Props> = ({
  current, queueRemaining, choicesPending, charName, charAvatar,
  disabled, onAdvance,
}) => {
  const pages = useMemo(
    () => (current ? paginate(current.text, PAGE_CHAR_LIMIT) : []),
    [current?.id, current?.text],
  );
  const [pageIdx, setPageIdx] = useState(0);
  useEffect(() => { setPageIdx(0); }, [current?.id]);
  const currentPage = pages[pageIdx] || '';
  const isLastPage = pageIdx >= pages.length - 1;

  const [typed, setTyped] = useState(0);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setTyped(0);
    if (!currentPage) return;
    let i = 0;
    timerRef.current = window.setInterval(() => {
      i++;
      setTyped(i);
      if (i >= currentPage.length && timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, TYPE_SPEED_MS);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [currentPage]);
  const isPageComplete = typed >= currentPage.length;

  const handleTap = () => {
    if (disabled) return;
    if (!current) return;
    if (!isPageComplete) { setTyped(currentPage.length); return; }
    if (!isLastPage) { setPageIdx(i => i + 1); return; }
    onAdvance();
  };

  const isEmojiAvatar = !!charAvatar && !charAvatar.startsWith('http') && !charAvatar.startsWith('data:') && !charAvatar.startsWith('/');
  const isImageAvatar = !!charAvatar && !isEmojiAvatar;

  const advanceGlyph =
    !isLastPage ? '▼' :
    queueRemaining > 0 ? '▼' :
    choicesPending ? '◆' : '◆';

  return (
    <div
      className="relative bg-slate-900/95 rounded-sm"
      style={{
        height: 108,
        boxShadow:
          'inset 0 0 0 2px #1e293b, inset 0 0 0 4px #475569, 0 0 0 1px #0f172a, 0 4px 18px rgba(0,0,0,0.55)',
      }}
    >
      <CornerPx pos="tl" /><CornerPx pos="tr" />
      <CornerPx pos="bl" /><CornerPx pos="br" />

      {/* 头像 */}
      <div className="absolute left-1.5 top-1.5 w-16 h-16">
        {current?.speaker === 'character' && (
          <AvatarFace src={charAvatar} isEmoji={isEmojiAvatar} isImage={isImageAvatar}
            glyph="·" toneClass="border-violet-500/60 bg-violet-900/30" />
        )}
        {current?.speaker === 'narrator' && (
          <AvatarFace src={undefined} isEmoji={false} isImage={false}
            glyph="📖" toneClass="border-slate-600/60 bg-slate-800/60" />
        )}
      </div>

      {/* 文本区 */}
      <button
        type="button"
        onClick={handleTap}
        disabled={disabled || !current}
        className="absolute left-[76px] right-2 top-1.5 bottom-1.5 text-left flex flex-col min-w-0"
      >
        {current && (
          <div className="shrink-0 text-[10px] tracking-wider mb-0.5">
            {current.speaker === 'character' && (
              <span className="text-violet-300 font-bold">{charName}</span>
            )}
            {current.speaker === 'narrator' && (
              <span className="text-slate-500 uppercase tracking-[0.2em]">旁白</span>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden text-[12.5px] leading-[1.5] text-slate-100 whitespace-pre-wrap">
          {current && (
            <>
              {currentPage.slice(0, typed)}
              {!isPageComplete && (
                <span className="ml-0.5 inline-block w-1.5 h-3 align-middle bg-slate-400 animate-pulse" />
              )}
            </>
          )}
        </div>

        {/* 右下：页码 + ▼/◆ */}
        <div className="shrink-0 flex items-center justify-end gap-1.5 pt-0.5">
          {current && pages.length > 1 && (
            <span className="text-[9px] text-slate-600">{pageIdx + 1}/{pages.length}</span>
          )}
          {current && isPageComplete && (
            <span className="text-[11px] text-amber-300/90 animate-bounce"
              style={{ animationDuration: '1.2s' }}>
              {advanceGlyph}
            </span>
          )}
        </div>
      </button>
    </div>
  );
};

const AvatarFace: React.FC<{
  src?: string;
  isEmoji: boolean;
  isImage: boolean;
  glyph: string;
  toneClass: string;
}> = ({ src, isEmoji, isImage, glyph, toneClass }) => (
  <div
    className={`w-full h-full rounded-sm border-2 overflow-hidden flex items-center justify-center ${toneClass}`}
    style={{ imageRendering: 'pixelated' as any }}
  >
    {isImage && (
      <img src={src} className="w-full h-full object-cover"
        style={{ imageRendering: 'pixelated' as any }} draggable={false} alt="" />
    )}
    {isEmoji && <span className="text-3xl">{src}</span>}
    {!isImage && !isEmoji && (
      <span className="text-2xl opacity-70">{glyph}</span>
    )}
  </div>
);

const CornerPx: React.FC<{ pos: 'tl' | 'tr' | 'bl' | 'br' }> = ({ pos }) => {
  const p: Record<string, string> = {
    tl: 'top-0 left-0', tr: 'top-0 right-0',
    bl: 'bottom-0 left-0', br: 'bottom-0 right-0',
  };
  return <div className={`absolute ${p[pos]} w-1.5 h-1.5 bg-amber-400/70 pointer-events-none`} />;
};

export default MemoryDiveDialogue;
