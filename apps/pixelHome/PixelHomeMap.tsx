/**
 * Pixel Home — 7房间俯瞰地图
 *
 * 星露谷风格的像素家园俯瞰视图，点击进入单房间。
 */

import React, { useRef, useState, useCallback } from 'react';
import type { PixelHomeState, PixelAsset } from './types';
import type { MemoryRoom } from '../../utils/memoryPalace/types';
import { ROOM_META, ALL_ROOMS, ROOM_SLOTS } from './roomTemplates';
import { generateRoomPixelThumbnail } from './roomPixelRenderer';

interface Props {
  homeState: PixelHomeState;
  assets: PixelAsset[];
  onEnterRoom: (roomId: MemoryRoom) => void;
}

// 俯瞰布局：3行排列
const MAP_LAYOUT: { roomId: MemoryRoom; row: number; col: number }[] = [
  { roomId: 'attic',       row: 0, col: 1 },
  { roomId: 'study',       row: 1, col: 0 },
  { roomId: 'bedroom',     row: 1, col: 1 },
  { roomId: 'self_room',   row: 1, col: 2 },
  { roomId: 'living_room', row: 2, col: 0 },
  { roomId: 'user_room',   row: 2, col: 1 },
  { roomId: 'windowsill',  row: 2, col: 2 },
];

const PixelHomeMap: React.FC<Props> = ({ homeState, assets, onEnterRoom }) => {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTouchDist = useRef<number>(0);
  const lastTouchCenter = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(s => Math.max(0.5, Math.min(3, s + delta)));
  }, []);

  // 触摸缩放
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
      lastTouchCenter.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1) {
      isDragging.current = true;
      dragStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        ox: offset.x,
        oy: offset.y,
      };
    }
  }, [offset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDist.current > 0) {
        const ratio = dist / lastTouchDist.current;
        setScale(s => Math.max(0.5, Math.min(3, s * ratio)));
      }
      lastTouchDist.current = dist;
    } else if (e.touches.length === 1 && isDragging.current) {
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    lastTouchDist.current = 0;
    isDragging.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden touch-none"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
          transformOrigin: 'center center',
          transition: isDragging.current ? 'none' : 'transform 0.1s ease-out',
        }}
      >
        {/* 3x3 网格布局 */}
        <div className="grid grid-cols-3 gap-2 p-4" style={{ width: 'min(90vw, 400px)' }}>
          {MAP_LAYOUT.map(({ roomId, row, col }) => {
            const meta = ROOM_META[roomId];
            const roomLayout = homeState.rooms.find(r => r.roomId === roomId);
            const furnitureCount = roomLayout?.furniture.filter(f => f.assetId).length || 0;

            return (
              <button
                key={roomId}
                onClick={() => onEnterRoom(roomId)}
                className="aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all relative overflow-hidden group"
                style={{
                  gridRow: row + 1,
                  gridColumn: col + 1,
                  borderColor: meta.color + '60',
                  background: `linear-gradient(135deg, ${roomLayout?.wallColor || '#1e293b'}, ${roomLayout?.floorColor || '#0f172a'})`,
                }}
              >
                {/* 像素网格覆盖层 */}
                <div className="absolute inset-0 opacity-10" style={{
                  backgroundImage: `linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)`,
                  backgroundSize: '8px 8px',
                }} />

                {/* 家具缩略点 */}
                {roomLayout?.furniture.map((f, i) => (
                  <div
                    key={f.slotId}
                    className="absolute w-2 h-2 rounded-sm"
                    style={{
                      left: `${f.x}%`,
                      top: `${f.y}%`,
                      backgroundColor: f.assetId ? meta.color : meta.color + '40',
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                ))}

                {/* 房间标签 */}
                <span className="text-lg z-10 drop-shadow-lg">{meta.emoji}</span>
                <span className="text-[9px] font-bold z-10 drop-shadow-md" style={{ color: meta.color }}>
                  {meta.name}
                </span>

                {/* hover 提示 */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </button>
            );
          })}

          {/* 空位填充（0,0 和 0,2 位置） */}
          <div className="aspect-square" style={{ gridRow: 1, gridColumn: 1 }} />
          <div className="aspect-square" style={{ gridRow: 1, gridColumn: 3 }} />
        </div>
      </div>
    </div>
  );
};

export default PixelHomeMap;
