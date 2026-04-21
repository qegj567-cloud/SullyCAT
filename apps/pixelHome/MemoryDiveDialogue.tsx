/**
 * Memory Dive — 3DS 风格下屏
 *
 * 外层：3DS 式下半屏容器（~38vh），深色 + 装饰
 * 内层：小对话框（高度仅比头像框略大，约 110px），文本自动分页
 * 选项不再画在框内——由父组件渲染到房间视口的浮层里
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import type { DiveDialogue } from './memoryDiveTypes';

interface Props {
  current: DiveDialogue | null;
  /** 本句后还有多少条在排队 */
  queueRemaining: number;
  /** 是否正在等选项（如果是，框里 ▼ 改成 ◆ 提示即将出现选项） */
  choicesPending: boolean;
  charName: string;
  charAvatar?: string;
  isLoading: boolean;
  disabled: boolean;
  onAdvance: () => void;
}

const TYPE_SPEED_MS = 22;
// 每页最多显示的字符数。中文字符宽度一致，按字数切页即可。
// 头像右侧宽度大约能容纳 22 字 × 2 行 ≈ 44-48 字
const PAGE_CHAR_LIMIT = 46;

/** 按字数切页，优先在标点/换行处断 */
function paginate(text: string, limit: number): string[] {
  if (!text) return [];
  if (text.length <= limit) return [text];
  const breakChars = new Set(['。', '！', '？', '；', '\n', '……', '——', '，', '、', ',', '.', '!', '?']);
  const pages: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + limit, text.length);
    if (end < text.length) {
      // 从 end 往回找最近的标点（不超过 limit*0.5 的窗口）
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
  isLoading, disabled, onAdvance,
}) => {
  // ─── 分页 ─────────────────────────────────────────────
  const pages = useMemo(
    () => (current ? paginate(current.text, PAGE_CHAR_LIMIT) : []),
    [current?.id, current?.text],
  );
  const [pageIdx, setPageIdx] = useState(0);
  useEffect(() => { setPageIdx(0); }, [current?.id]);
  const currentPage = pages[pageIdx] || '';
  const isLastPage = pageIdx >= pages.length - 1;

  // ─── 打字机（每页独立） ───────────────────────────────
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

  const handleBoxTap = () => {
    if (disabled) return;
    if (!current) return;
    if (!isPageComplete) { setTyped(currentPage.length); return; }
    if (!isLastPage) { setPageIdx(i => i + 1); return; }
    // 最后一页打完 → 推进到下一条
    onAdvance();
  };

  const isEmojiAvatar = !!charAvatar && !charAvatar.startsWith('http') && !charAvatar.startsWith('data:') && !charAvatar.startsWith('/');
  const isImageAvatar = !!charAvatar && !isEmojiAvatar;

  // 箭头状态：
  //  - 页内未打完：隐藏
  //  - 非末页：▼（继续翻页）
  //  - 末页 + 后面还有对话排队：▼
  //  - 末页 + 后面有选项即将出现：◆（按下进入选项）
  //  - 末页 + 啥都没有：◆
  const advanceGlyph =
    !isLastPage ? '▼' :
    queueRemaining > 0 ? '▼' :
    choicesPending ? '◆' : '◆';

  return (
    <div
      className="shrink-0 w-full relative"
      style={{ height: '38vh', minHeight: 200 }}
    >
      {/* 3DS 下半屏背景（深色 + 像素星点装饰） */}
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-slate-900 via-slate-950 to-black">
        <DecorStars />
      </div>

      {/* 小对话框：底部内嵌，只比头像略高 */}
      <div className="absolute left-2 right-2 bottom-2">
        <div
          className="relative bg-slate-900/95 rounded-sm"
          style={{
            // 头像 64 + 上下 padding 各 10 + 底部箭头 14 ≈ 98；再留一点余量
            height: 108,
            boxShadow:
              'inset 0 0 0 2px #1e293b, inset 0 0 0 4px #475569, 0 0 0 1px #0f172a',
          }}
        >
          <CornerPx pos="tl" /><CornerPx pos="tr" />
          <CornerPx pos="bl" /><CornerPx pos="br" />

          {/* 头像：只在角色/旁白说话时显示；无 current 时为空 */}
          <div className="absolute left-1.5 top-1.5 w-16 h-16">
            {current?.speaker === 'character' && (
              <AvatarFace src={charAvatar} isEmoji={isEmojiAvatar} isImage={isImageAvatar}
                glyph="·" toneClass="border-violet-500/60 bg-violet-900/30" />
            )}
            {current?.speaker === 'narrator' && (
              <AvatarFace src={undefined} isEmoji={false} isImage={false}
                glyph="📖" toneClass="border-slate-600/60 bg-slate-800/60" />
            )}
            {!current && (
              <AvatarFace src={undefined} isEmoji={false} isImage={false}
                glyph=" " toneClass="border-slate-800/40 bg-slate-900/40" />
            )}
          </div>

          {/* 文本区域（头像右侧） */}
          <button
            type="button"
            onClick={handleBoxTap}
            disabled={disabled || !current}
            className="absolute left-[76px] right-2 top-1.5 bottom-1.5 text-left flex flex-col min-w-0"
          >
            {/* 说话人小标签 */}
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

            {/* 文本 */}
            <div className="flex-1 min-h-0 overflow-hidden text-[12.5px] leading-[1.5] text-slate-100 whitespace-pre-wrap">
              {current ? (
                <>
                  {currentPage.slice(0, typed)}
                  {!isPageComplete && (
                    <span className="ml-0.5 inline-block w-1.5 h-3 align-middle bg-slate-400 animate-pulse" />
                  )}
                </>
              ) : isLoading ? (
                <LoadingLine />
              ) : null}
            </div>

            {/* 底部状态行：页码 + 推进箭头 */}
            <div className="shrink-0 flex items-center justify-between pt-0.5">
              {current && pages.length > 1 ? (
                <span className="text-[9px] text-slate-600">{pageIdx + 1}/{pages.length}</span>
              ) : <span />}
              {current && isPageComplete && (
                <span className="text-[11px] text-amber-300/90 animate-bounce"
                  style={{ animationDuration: '1.2s' }}>
                  {advanceGlyph}
                </span>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── 头像圆框 ──────────────────────────────────────────

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

// ─── 背景像素星点装饰 ──────────────────────────────────

const DecorStars: React.FC = () => {
  // 固定坐标的星点，避免每次渲染都变化
  const stars = useMemo(() => {
    const out: Array<{ x: number; y: number; s: number; o: number }> = [];
    const rng = mulberry32(98742);
    for (let i = 0; i < 40; i++) {
      out.push({
        x: rng() * 100,
        y: rng() * 100,
        s: 1 + Math.round(rng() * 2),
        o: 0.2 + rng() * 0.4,
      });
    }
    return out;
  }, []);
  return (
    <div className="absolute inset-0 pointer-events-none">
      {stars.map((s, i) => (
        <div key={i} className="absolute bg-slate-400 rounded-sm"
          style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: s.s, height: s.s,
            opacity: s.o,
          }}
        />
      ))}
    </div>
  );
};

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const LoadingLine: React.FC = () => (
  <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 italic">
    记忆正在浮现
    <span className="inline-flex gap-0.5">
      <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  </span>
);

const CornerPx: React.FC<{ pos: 'tl' | 'tr' | 'bl' | 'br' }> = ({ pos }) => {
  const p: Record<string, string> = {
    tl: 'top-0 left-0', tr: 'top-0 right-0',
    bl: 'bottom-0 left-0', br: 'bottom-0 right-0',
  };
  return <div className={`absolute ${p[pos]} w-1.5 h-1.5 bg-amber-400/70 pointer-events-none`} />;
};

export default MemoryDiveDialogue;
