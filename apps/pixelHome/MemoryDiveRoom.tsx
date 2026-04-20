/**
 * Memory Dive — 上屏房间渲染
 *
 * 修复 ROOM_SCALE 2.2 导致的家具错位问题：
 *   - 通过 ResizeObserver 测量容器，动态计算适配尺寸
 *   - 房间按宽高比完整放入视口，家具 % 坐标与编辑器完全一致
 *   - 角色 / 用户 sprite 按 tile 比例缩放
 *
 * 角色与用户小人使用 CSS transition 自动过渡到 charPos / playerPos，
 *   上层只需设置目标位置即可获得"行走"动画。
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { MemoryRoom } from '../../utils/memoryPalace/types';
import type { PixelHomeState, PixelRoomLayout, PixelAsset } from './types';
import { decodeColorField } from './types';
import { ROOM_SIZES, ROOM_SLOTS } from './roomTemplates';

const TILE_BASE = 28;

const FLOOR_STYLES: Record<string, { wallFace: string; floor: string }> = {
  living_room: { wallFace: '#e8d5b8', floor: '#c4a882' },
  bedroom:     { wallFace: '#e8ddd0', floor: '#d4b896' },
  study:       { wallFace: '#c9b99a', floor: '#8b6f47' },
  attic:       { wallFace: '#6b5d50', floor: '#706050' },
  self_room:   { wallFace: '#f0d0e0', floor: '#d4a8c0' },
  user_room:   { wallFace: '#c8e0d0', floor: '#a8c4b0' },
  windowsill:  { wallFace: '#a8bfb0', floor: '#92a89c' },
};

interface Props {
  roomId: MemoryRoom;
  layout: PixelRoomLayout | undefined;
  assets: PixelAsset[];
  charSprite?: string;
  playerSprite?: string;
  charName: string;
  userName: string;
  charPos: { x: number; y: number };
  playerPos: { x: number; y: number };
  visitedSlots: Set<string>;
  charWalking: boolean;
  charFlip: boolean;
  walkStep: 0 | 1;
  highlightedSlotId: string | null;
  transitionState: 'idle' | 'out' | 'in';
}

const MemoryDiveRoom: React.FC<Props> = ({
  roomId, layout, assets, charSprite, playerSprite, charName, userName,
  charPos, playerPos, visitedSlots, charWalking, charFlip, walkStep,
  highlightedSlotId, transitionState,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const roomSize = ROOM_SIZES[roomId] || { w: 10, h: 6 };

  // 关键：按宽高比适配视口，保证完整可见、不裁切
  const { pw, ph, tilePx } = useMemo(() => {
    if (size.w === 0 || size.h === 0) return { pw: 0, ph: 0, tilePx: TILE_BASE };
    const aspect = roomSize.w / roomSize.h;
    const viewportAspect = size.w / size.h;
    let width: number, height: number;
    if (viewportAspect > aspect) {
      // 视口更宽 → 以高度填满
      height = size.h;
      width = height * aspect;
    } else {
      // 视口更瘦 → 以宽度填满
      width = size.w;
      height = width / aspect;
    }
    // 离散化到整数像素，避免子像素渲染
    width = Math.floor(width);
    height = Math.floor(height);
    return { pw: width, ph: height, tilePx: width / roomSize.w };
  }, [size.w, size.h, roomSize.w, roomSize.h]);

  const roomStyle = FLOOR_STYLES[roomId] || FLOOR_STYLES.living_room;
  // 与编辑器 WALL_TOP_RATIO 保持一致，避免墙/地板分界线位置不同导致家具看起来错位
  const wallH = Math.round(ph * 0.38);
  // 家具尺寸：与编辑器保持同一公式
  const furBase = Math.min(pw, ph);
  // 角色：大约 1.4 个 tile 高
  const charSize = Math.max(22, Math.round(tilePx * 1.4));
  const playerSize = Math.max(20, Math.round(tilePx * 1.3));

  const slotDefs = ROOM_SLOTS[roomId] || [];

  const transitionOpacity = transitionState === 'out' ? 0 : 1;
  const transitionFilter = transitionState === 'out' ? 'brightness(0.3)' : 'brightness(1)';

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-hidden bg-slate-950 flex items-center justify-center">
      {/* 房间画布 —— 固定像素宽高，家具 % 定位自然对齐 */}
      {pw > 0 && (
        <div
          className="relative"
          style={{
            width: pw,
            height: ph,
            opacity: transitionOpacity,
            filter: transitionFilter,
            transition: 'opacity 350ms ease, filter 350ms ease',
          }}
        >
          {/* 墙面 */}
          <div className="absolute inset-x-0 top-0 overflow-hidden" style={{ height: wallH }}>
            <WallOrFloor
              field={layout?.wallColor}
              fillMode={layout?.wallFillMode}
              offsetX={layout?.wallOffsetX}
              offsetY={layout?.wallOffsetY}
              tileSize={tilePx * 2}
              fallback={roomStyle.wallFace}
            />
          </div>

          {/* 地板 */}
          <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: wallH }}>
            <WallOrFloor
              field={layout?.floorColor}
              fillMode={layout?.floorFillMode}
              offsetX={layout?.floorOffsetX}
              offsetY={layout?.floorOffsetY}
              tileSize={tilePx}
              fallback={roomStyle.floor}
            />
          </div>

          {/* 家具 */}
          {layout?.furniture.map(f => {
            const asset = f.assetId ? assets.find(a => a.id === f.assetId) : null;
            const imgSrc = asset?.pixelImage;
            if (!imgSrc) return null;

            const slot = slotDefs.find(s => s.id === f.slotId);
            const isVisited = visitedSlots.has(f.slotId);
            const isHighlighted = highlightedSlotId === f.slotId;
            const furSize = Math.round(furBase * 0.22 * f.scale);
            const isRug = !!asset?.tags?.includes('rug');

            // 与 PixelRoomEditor 保持同一 z 公式
            const autoZ = Math.round(f.y * 4) + 20;
            let zIdx: number;
            if (isRug) zIdx = 1;
            else if (f.zOrder === 'back') zIdx = 2 + Math.round(autoZ / 200);
            else if (f.zOrder === 'front') zIdx = 1000 + autoZ;
            else zIdx = autoZ;

            return (
              <div
                key={f.slotId}
                className="absolute pointer-events-none"
                style={{
                  left: `${f.x}%`, top: `${f.y}%`,
                  width: furSize,
                  transform: 'translate(-50%, -50%)',
                  zIndex: zIdx,
                }}
                title={slot?.name}
              >
                <img src={imgSrc} alt={slot?.name || f.slotId}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    imageRendering: 'pixelated',
                    transform: `rotate(${f.rotation || 0}deg)`,
                    filter: isVisited ? 'brightness(0.7) saturate(0.6)' : 'none',
                  }}
                  draggable={false}
                />
                {isHighlighted && (
                  <div className="absolute -inset-2 border-2 border-amber-300/70 rounded-sm animate-pulse pointer-events-none" />
                )}
                {!isVisited && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                )}
              </div>
            );
          })}

          {/* 用户小人（跟随，先绘制低 z，这样与角色重叠时在后） */}
          <SpritePerson
            pos={playerPos}
            size={playerSize}
            sprite={playerSprite}
            label={userName}
            labelColor="bg-emerald-600/60"
            walking={charWalking}
            flip={charFlip}
            step={walkStep}
            zBoost={0}
            defaultColor="emerald"
          />

          {/* 角色小人（NPC） */}
          <SpritePerson
            pos={charPos}
            size={charSize}
            sprite={charSprite}
            label={charName}
            labelColor="bg-violet-600/70"
            walking={charWalking}
            flip={charFlip}
            step={walkStep}
            zBoost={1}
            defaultColor="violet"
          />
        </div>
      )}

      {/* 场景转换黑幕（淡入时覆盖一层） */}
      {transitionState !== 'idle' && (
        <div
          className="absolute inset-0 pointer-events-none bg-black"
          style={{
            opacity: transitionState === 'out' ? 0.7 : 0,
            transition: 'opacity 350ms ease',
          }}
        />
      )}
    </div>
  );
};

// ─── 子组件：墙 / 地板背景 ────────────────────────────

const WallOrFloor: React.FC<{
  field: string | undefined;
  fillMode: 'tile' | 'stretch' | undefined;
  offsetX: number | undefined;
  offsetY: number | undefined;
  tileSize: number;
  fallback: string;
}> = ({ field, fillMode, offsetX, offsetY, tileSize, fallback }) => {
  const d = decodeColorField(field);
  if (d.kind === 'image') {
    const style: React.CSSProperties = fillMode === 'stretch'
      ? {
          backgroundImage: `url(${d.value})`,
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: `${offsetX ?? 50}% ${offsetY ?? 50}%`,
          imageRendering: 'pixelated',
        }
      : {
          backgroundImage: `url(${d.value})`,
          backgroundSize: `${tileSize}px ${tileSize}px`,
          backgroundRepeat: 'repeat',
          imageRendering: 'pixelated',
        };
    return <div className="absolute inset-0" style={style} />;
  }
  const color = d.kind === 'color' ? d.value : fallback;
  return <div className="absolute inset-0" style={{ backgroundColor: color }} />;
};

// ─── 子组件：像素小人（角色或用户） ───────────────────

const SpritePerson: React.FC<{
  pos: { x: number; y: number };
  size: number;
  sprite?: string;
  label: string;
  labelColor: string;
  walking: boolean;
  flip: boolean;
  step: 0 | 1;
  zBoost: number;
  defaultColor: 'emerald' | 'violet';
}> = ({ pos, size, sprite, label, labelColor, walking, flip, step, zBoost, defaultColor }) => {
  const bob = walking ? (step === 0 ? -1 : 0) : 0;
  const tilt = walking ? (step === 0 ? -4 : 4) : 0;
  const baseColor = defaultColor === 'emerald'
    ? 'linear-gradient(135deg, #6ee7b7 0%, #34d399 50%, #10b981 100%)'
    : 'linear-gradient(135deg, #c4b5fd 0%, #a78bfa 50%, #8b5cf6 100%)';

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        width: size,
        height: size,
        transform: 'translate(-50%, -100%)',
        transition: 'left 900ms ease-in-out, top 900ms ease-in-out',
        zIndex: Math.round(pos.y * 4) + 20 + zBoost,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: `scaleX(${flip ? -1 : 1}) rotate(${tilt}deg) translateY(${bob}px)`,
          transformOrigin: 'center bottom',
          transition: 'transform 200ms ease-out',
        }}
      >
        {sprite ? (
          <img src={sprite}
            style={{
              display: 'block', width: '100%', height: '100%',
              objectFit: 'contain', imageRendering: 'pixelated',
              filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.35))',
            }}
            draggable={false}
            alt={label}
          />
        ) : (
          <DefaultSprite bgGradient={baseColor} />
        )}
      </div>
      {/* 标签 */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-4">
        <span className={`text-[8px] px-1 rounded-sm text-white/90 whitespace-nowrap ${labelColor}`}>
          {label}
        </span>
      </div>
      {/* 脚下阴影 */}
      <div className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black/25"
        style={{ width: size * 0.55, height: 3, bottom: -2 }}
      />
    </div>
  );
};

const DefaultSprite: React.FC<{ bgGradient: string }> = ({ bgGradient }) => (
  <div className="relative w-full h-full">
    <div className="absolute inset-x-[15%] inset-y-[10%] rounded-sm border border-white/40"
      style={{ background: bgGradient, imageRendering: 'pixelated' }}>
      <div className="absolute top-[25%] left-[15%] w-1 h-1 rounded-full bg-white" />
      <div className="absolute top-[25%] right-[15%] w-1 h-1 rounded-full bg-white" />
      <div className="absolute top-[30%] left-[20%] w-[2px] h-[2px] rounded-full bg-slate-900" />
      <div className="absolute top-[30%] right-[20%] w-[2px] h-[2px] rounded-full bg-slate-900" />
    </div>
  </div>
);

export default MemoryDiveRoom;
