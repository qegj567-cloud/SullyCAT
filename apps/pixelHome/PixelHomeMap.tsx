/**
 * Pixel Home — 7房间俯瞰地图
 *
 * 星露谷风格俯视平面图。每个房间有：
 * - 上方墙面带（约25%高度，颜色较深）
 * - 下方地板区（瓦片纹理）
 * - 墙壁边框
 * - 家具精灵
 * 支持缩放和平移。
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { PixelHomeState, PixelAsset } from './types';
import type { MemoryRoom } from '../../utils/memoryPalace/types';
import { ROOM_META, ROOM_SLOTS } from './roomTemplates';
import { defaultFurniturePixelSrc } from './roomPixelRenderer';

interface Props {
  homeState: PixelHomeState;
  assets: PixelAsset[];
  onEnterRoom: (roomId: MemoryRoom) => void;
}

// 房间平面图布局
const FLOOR_PLAN: { roomId: MemoryRoom; x: number; y: number; w: number; h: number }[] = [
  { roomId: 'attic',       x: 3,  y: 0,  w: 6,  h: 5 },
  { roomId: 'bedroom',     x: 0,  y: 6,  w: 6,  h: 5 },
  { roomId: 'study',       x: 6,  y: 6,  w: 6,  h: 5 },
  { roomId: 'living_room', x: 0,  y: 12, w: 7,  h: 5 },
  { roomId: 'self_room',   x: 7,  y: 12, w: 5,  h: 5 },
  { roomId: 'user_room',   x: 0,  y: 18, w: 5,  h: 4 },
  { roomId: 'windowsill',  x: 5,  y: 18, w: 7,  h: 4 },
];

const CELL = 28;
const WALL_THICK = 5;
const WALL_TOP_RATIO = 0.28; // 墙面占房间高度比例

// 房间风格
const ROOM_STYLE: Record<MemoryRoom, {
  wallFace: string;   // 墙面颜色（上方带）
  wallFaceDark: string; // 墙面阴影
  floor: string;      // 地板主色
  floorAlt: string;   // 地板副色
  floorType: 'wood' | 'tile' | 'stone';
}> = {
  living_room: { wallFace: '#e8d5b8', wallFaceDark: '#d4c1a4', floor: '#c4a882', floorAlt: '#b89b75', floorType: 'wood' },
  bedroom:     { wallFace: '#e8ddd0', wallFaceDark: '#d8cdc0', floor: '#d4b896', floorAlt: '#c9ab87', floorType: 'wood' },
  study:       { wallFace: '#c9b99a', wallFaceDark: '#b5a586', floor: '#8b6f47', floorAlt: '#7d6340', floorType: 'wood' },
  attic:       { wallFace: '#6b5d50', wallFaceDark: '#5a4d42', floor: '#706050', floorAlt: '#655545', floorType: 'stone' },
  self_room:   { wallFace: '#f0d0e0', wallFaceDark: '#e0c0d0', floor: '#d4a8c0', floorAlt: '#c99db5', floorType: 'tile' },
  user_room:   { wallFace: '#c8e0d0', wallFaceDark: '#b8d0c0', floor: '#a8c4b0', floorAlt: '#9db9a5', floorType: 'tile' },
  windowsill:  { wallFace: '#a8bfb0', wallFaceDark: '#98af9f', floor: '#92a89c', floorAlt: '#879d91', floorType: 'stone' },
};

const WALL_BORDER = '#3d2b1f';
const WALL_BORDER_LIGHT = '#5c4332';
const BG_COLOR = '#1a1410';

const PixelHomeMap: React.FC<Props> = ({ homeState, assets, onEnterRoom }) => {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTouchDist = useRef(0);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // 用 native addEventListener 注册 wheel（non-passive），避免 passive 报错
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setScale(s => Math.max(0.4, Math.min(3, s + delta)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
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

  const handlePointerUp = useCallback(() => { isDragging.current = false; }, []);

  // 触摸
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
      if (lastTouchDist.current > 0) setScale(s => Math.max(0.4, Math.min(3, s * (dist / lastTouchDist.current))));
      lastTouchDist.current = dist;
    } else if (e.touches.length === 1 && isDragging.current) {
      setOffset({
        x: dragStart.current.ox + (e.touches[0].clientX - dragStart.current.x),
        y: dragStart.current.oy + (e.touches[0].clientY - dragStart.current.y),
      });
    }
  }, []);

  const handleTouchEnd = useCallback(() => { lastTouchDist.current = 0; isDragging.current = false; }, []);

  const totalW = Math.max(...FLOOR_PLAN.map(r => r.x + r.w)) * CELL + WALL_THICK * 2 + 20;
  const totalH = Math.max(...FLOOR_PLAN.map(r => r.y + r.h)) * CELL + WALL_THICK * 2 + 20;

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden touch-none"
      style={{ backgroundColor: BG_COLOR }}
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
            const style = ROOM_STYLE[roomId];
            const roomLayout = homeState.rooms.find(r => r.roomId === roomId);
            const px = x * CELL + WALL_THICK + 10;
            const py = y * CELL + WALL_THICK + 10;
            const pw = w * CELL;
            const ph = h * CELL;
            const wallH = Math.round(ph * WALL_TOP_RATIO);

            return (
              <button
                key={roomId}
                data-room={roomId}
                onClick={() => onEnterRoom(roomId)}
                className="absolute group"
                style={{ left: px, top: py, width: pw, height: ph }}
              >
                {/* 墙壁边框 */}
                <div className="absolute rounded-sm" style={{
                  inset: -WALL_THICK,
                  backgroundColor: WALL_BORDER,
                }}>
                  <div className="absolute inset-x-0 top-0 rounded-t-sm" style={{ height: 2, backgroundColor: WALL_BORDER_LIGHT }} />
                  <div className="absolute inset-y-0 left-0 rounded-l-sm" style={{ width: 2, backgroundColor: WALL_BORDER_LIGHT }} />
                </div>

                {/* 墙面带（上方） */}
                <div className="absolute inset-x-0 top-0 overflow-hidden" style={{
                  height: wallH,
                  backgroundColor: style.wallFace,
                }}>
                  {/* 墙面砖纹 */}
                  <div className="absolute inset-0" style={{
                    backgroundImage: `
                      linear-gradient(${style.wallFaceDark} 1px, transparent 1px),
                      linear-gradient(90deg, ${style.wallFaceDark}40 1px, transparent 1px)
                    `,
                    backgroundSize: `${CELL * 2}px ${CELL * 0.6}px`,
                  }} />
                  {/* 墙面底部阴影线 */}
                  <div className="absolute inset-x-0 bottom-0 h-[2px]" style={{
                    background: `linear-gradient(to bottom, ${style.wallFaceDark}, ${style.floor})`,
                  }} />
                </div>

                {/* 地板区（下方） */}
                <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{
                  top: wallH,
                  backgroundColor: style.floor,
                }}>
                  {/* 瓦片纹理 */}
                  {style.floorType === 'wood' && (
                    <div className="absolute inset-0" style={{
                      backgroundImage: `
                        repeating-linear-gradient(90deg, ${style.floorAlt} 0px, ${style.floorAlt} 1px, transparent 1px, transparent ${CELL}px),
                        repeating-linear-gradient(0deg, transparent 0px, transparent ${CELL - 1}px, ${style.floorAlt}80 ${CELL - 1}px, ${style.floorAlt}80 ${CELL}px)
                      `,
                    }} />
                  )}
                  {style.floorType === 'tile' && (
                    <div className="absolute inset-0" style={{
                      backgroundImage: `linear-gradient(${style.floorAlt} 1px, transparent 1px), linear-gradient(90deg, ${style.floorAlt} 1px, transparent 1px)`,
                      backgroundSize: `${CELL}px ${CELL}px`,
                    }} />
                  )}
                  {style.floorType === 'stone' && (
                    <div className="absolute inset-0" style={{
                      backgroundImage: `linear-gradient(${style.floorAlt} 1px, transparent 1px), linear-gradient(90deg, ${style.floorAlt} 1px, transparent 1px)`,
                      backgroundSize: `${Math.round(CELL * 1.5)}px ${CELL}px`,
                    }} />
                  )}
                </div>

                {/* 家具精灵 */}
                {roomLayout?.furniture.map(f => {
                  const asset = f.assetId ? assets.find(a => a.id === f.assetId) : null;
                  const imgSrc = asset ? asset.pixelImage : defaultFurniturePixelSrc(roomId, f.slotId);
                  const furSize = Math.min(pw, ph) * 0.22 * f.scale;
                  // 墙上的家具（y < 30%）放在墙面带上
                  const isOnWall = f.y < 30;

                  return (
                    <img
                      key={f.slotId}
                      src={imgSrc}
                      alt={f.slotId}
                      className="absolute pointer-events-none"
                      style={{
                        left: `${f.x}%`,
                        top: `${f.y}%`,
                        width: furSize,
                        height: furSize,
                        transform: `translate(-50%, -50%) rotate(${f.rotation}deg)`,
                        imageRendering: 'pixelated' as any,
                        opacity: f.assetId ? 1 : 0.9,
                        zIndex: isOnWall ? 5 : Math.round(f.y),
                      }}
                      draggable={false}
                    />
                  );
                })}

                {/* 房间名标签 */}
                <div className="absolute inset-x-0 bottom-1 flex justify-center pointer-events-none z-40">
                  <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white/90 whitespace-nowrap">
                    {meta.emoji} {meta.name}
                  </span>
                </div>

                {/* Hover */}
                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-150 z-30" />
              </button>
            );
          })}

          {/* 楼层走廊 */}
          <Corridor x={5} y1={5} y2={6} />
          <Corridor x={3} y1={11} y2={12} />
          <Corridor x={8} y1={17} y2={18} />
        </div>
      </div>
    </div>
  );
};

// 楼层间走廊
const Corridor: React.FC<{ x: number; y1: number; y2: number }> = ({ x, y1, y2 }) => {
  const left = x * CELL + WALL_THICK + 10;
  const top = y1 * CELL + WALL_THICK + 10;
  const h = (y2 - y1) * CELL;
  return (
    <div className="absolute pointer-events-none" style={{
      left, top, width: CELL * 2, height: h,
      background: `repeating-linear-gradient(180deg, #3d2b1f 0px, #3d2b1f 3px, #c4a882 3px, #c4a882 ${Math.round(CELL / 2)}px)`,
      borderLeft: `${WALL_THICK}px solid #3d2b1f`,
      borderRight: `${WALL_THICK}px solid #3d2b1f`,
    }} />
  );
};

export default PixelHomeMap;
