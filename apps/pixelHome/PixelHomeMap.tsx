/**
 * Pixel Home — 7房间俯瞰地图
 *
 * 星露谷风格的俯视平面图。房间以瓦片地板渲染，
 * 墙壁作为房间边框，家具显示为像素精灵。
 * 支持缩放和平移。
 */

import React, { useRef, useState, useCallback } from 'react';
import type { PixelHomeState, PixelAsset } from './types';
import type { MemoryRoom } from '../../utils/memoryPalace/types';
import { ROOM_META, ROOM_SLOTS } from './roomTemplates';
import { defaultFurniturePixelSrc } from './roomPixelRenderer';

interface Props {
  homeState: PixelHomeState;
  assets: PixelAsset[];
  onEnterRoom: (roomId: MemoryRoom) => void;
}

// 房间平面图布局（像素坐标，单位：格子 = 16px 渲染）
// 模拟一个不规则的家庭平面图
const FLOOR_PLAN: {
  roomId: MemoryRoom;
  x: number; y: number; w: number; h: number;
}[] = [
  // 二楼
  { roomId: 'attic',       x: 3,  y: 0,  w: 6,  h: 5 },
  // 一楼
  { roomId: 'bedroom',     x: 0,  y: 6,  w: 6,  h: 5 },
  { roomId: 'study',       x: 6,  y: 6,  w: 6,  h: 5 },
  // 底楼
  { roomId: 'living_room', x: 0,  y: 12, w: 7,  h: 5 },
  { roomId: 'self_room',   x: 7,  y: 12, w: 5,  h: 5 },
  // 地下/侧翼
  { roomId: 'user_room',   x: 0,  y: 18, w: 5,  h: 4 },
  { roomId: 'windowsill',  x: 5,  y: 18, w: 7,  h: 4 },
];

const CELL = 28; // 每格像素大小
const WALL = 4;  // 墙壁厚度

// 地板瓦片纹理模式
const FLOOR_PATTERNS: Record<MemoryRoom, { base: string; alt: string; pattern: 'wood' | 'tile' | 'stone' }> = {
  living_room: { base: '#c4a882', alt: '#b89b75', pattern: 'wood' },
  bedroom:     { base: '#d4b896', alt: '#c9ab87', pattern: 'wood' },
  study:       { base: '#8b6f47', alt: '#7d6340', pattern: 'wood' },
  attic:       { base: '#706050', alt: '#655545', pattern: 'stone' },
  self_room:   { base: '#d4a8c0', alt: '#c99db5', pattern: 'tile' },
  user_room:   { base: '#a8c4b0', alt: '#9db9a5', pattern: 'tile' },
  windowsill:  { base: '#92a89c', alt: '#879d91', pattern: 'stone' },
};

const WALL_COLOR = '#3d2b1f';
const WALL_LIGHT = '#5c4332';
const BG_COLOR = '#1a1410';

const PixelHomeMap: React.FC<Props> = ({ homeState, assets, onEnterRoom }) => {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTouchDist = useRef(0);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(s => Math.max(0.4, Math.min(3, s + delta)));
  }, []);

  // 拖拽平移
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-room]')) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // 触摸缩放
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1) {
      isDragging.current = true;
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: offset.x, oy: offset.y };
    }
  }, [offset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDist.current > 0) {
        setScale(s => Math.max(0.4, Math.min(3, s * (dist / lastTouchDist.current))));
      }
      lastTouchDist.current = dist;
    } else if (e.touches.length === 1 && isDragging.current) {
      setOffset({
        x: dragStart.current.ox + (e.touches[0].clientX - dragStart.current.x),
        y: dragStart.current.oy + (e.touches[0].clientY - dragStart.current.y),
      });
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    lastTouchDist.current = 0;
    isDragging.current = false;
  }, []);

  // 计算总平面图尺寸
  const totalW = Math.max(...FLOOR_PLAN.map(r => r.x + r.w)) * CELL + WALL * 2;
  const totalH = Math.max(...FLOOR_PLAN.map(r => r.y + r.h)) * CELL + WALL * 2;

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden touch-none"
      style={{ backgroundColor: BG_COLOR }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        <div className="relative" style={{ width: totalW, height: totalH }}>
          {FLOOR_PLAN.map(({ roomId, x, y, w, h }) => {
            const meta = ROOM_META[roomId];
            const roomLayout = homeState.rooms.find(r => r.roomId === roomId);
            const fp = FLOOR_PATTERNS[roomId];
            const px = x * CELL + WALL;
            const py = y * CELL + WALL;
            const pw = w * CELL;
            const ph = h * CELL;

            return (
              <button
                key={roomId}
                data-room={roomId}
                onClick={() => onEnterRoom(roomId)}
                className="absolute group"
                style={{ left: px, top: py, width: pw, height: ph }}
              >
                {/* 墙壁（外边框） */}
                <div className="absolute -inset-[4px] rounded-sm" style={{ backgroundColor: WALL_COLOR }}>
                  <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-sm" style={{ backgroundColor: WALL_LIGHT }} />
                  <div className="absolute inset-y-0 left-0 w-[2px] rounded-l-sm" style={{ backgroundColor: WALL_LIGHT }} />
                </div>

                {/* 地板 */}
                <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: fp.base }}>
                  {/* 瓦片纹理 */}
                  {fp.pattern === 'wood' && (
                    <div className="absolute inset-0" style={{
                      backgroundImage: `repeating-linear-gradient(90deg, ${fp.alt} 0px, ${fp.alt} 1px, transparent 1px, transparent ${CELL}px), repeating-linear-gradient(0deg, transparent 0px, transparent ${CELL - 1}px, ${fp.alt} ${CELL - 1}px, ${fp.alt} ${CELL}px)`,
                    }} />
                  )}
                  {fp.pattern === 'tile' && (
                    <div className="absolute inset-0" style={{
                      backgroundImage: `linear-gradient(${fp.alt} 1px, transparent 1px), linear-gradient(90deg, ${fp.alt} 1px, transparent 1px)`,
                      backgroundSize: `${CELL}px ${CELL}px`,
                    }} />
                  )}
                  {fp.pattern === 'stone' && (
                    <div className="absolute inset-0" style={{
                      backgroundImage: `
                        linear-gradient(${fp.alt} 1px, transparent 1px),
                        linear-gradient(90deg, ${fp.alt} 1px, transparent 1px)
                      `,
                      backgroundSize: `${CELL * 1.5}px ${CELL}px`,
                      backgroundPosition: `0 0, ${CELL * 0.75}px 0`,
                    }} />
                  )}

                  {/* 家具精灵 */}
                  {roomLayout?.furniture.map(f => {
                    const asset = f.assetId ? assets.find(a => a.id === f.assetId) : null;
                    const imgSrc = asset ? asset.pixelImage : defaultFurniturePixelSrc(roomId, f.slotId);
                    const furnitureSize = Math.min(pw, ph) * 0.22 * f.scale;

                    return (
                      <img
                        key={f.slotId}
                        src={imgSrc}
                        alt={f.slotId}
                        className="absolute pointer-events-none"
                        style={{
                          left: `${f.x}%`,
                          top: `${f.y}%`,
                          width: furnitureSize,
                          height: furnitureSize,
                          transform: `translate(-50%, -50%) rotate(${f.rotation}deg)`,
                          imageRendering: 'pixelated',
                          opacity: f.assetId ? 1 : 0.85,
                        }}
                        draggable={false}
                      />
                    );
                  })}
                </div>

                {/* 房间名标签 */}
                <div className="absolute inset-x-0 bottom-1 flex justify-center pointer-events-none">
                  <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-black/60 text-white/90 whitespace-nowrap backdrop-blur-sm">
                    {meta.emoji} {meta.name}
                  </span>
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-150" />
              </button>
            );
          })}

          {/* 楼层之间的楼梯/走廊连接线 */}
          <StairConnector from={{ x: 6, y: 4.5 }} to={{ x: 6, y: 6 }} />
          <StairConnector from={{ x: 3, y: 11 }} to={{ x: 3, y: 12 }} />
          <StairConnector from={{ x: 8, y: 17 }} to={{ x: 8, y: 18 }} />
        </div>
      </div>
    </div>
  );
};

// 楼层间连接走廊
const StairConnector: React.FC<{ from: { x: number; y: number }; to: { x: number; y: number } }> = ({ from, to }) => {
  const x = Math.min(from.x, to.x) * CELL + WALL;
  const y = from.y * CELL + WALL;
  const h = (to.y - from.y) * CELL;
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        width: CELL * 2,
        height: h,
        background: `repeating-linear-gradient(180deg, ${WALL_COLOR} 0px, ${WALL_COLOR} 3px, ${FLOOR_PATTERNS.living_room.base} 3px, ${FLOOR_PATTERNS.living_room.base} ${CELL / 2}px)`,
        borderLeft: `${WALL}px solid ${WALL_COLOR}`,
        borderRight: `${WALL}px solid ${WALL_COLOR}`,
      }}
    />
  );
};

export default PixelHomeMap;
