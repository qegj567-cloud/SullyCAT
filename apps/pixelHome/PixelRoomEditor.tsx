/**
 * Pixel Home — 单房间编辑器
 *
 * 拖拽家具到槽位，缩放浏览，类似现有 RoomApp 的拖拽逻辑。
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { PixelRoomLayout, PlacedFurniture, PixelAsset } from './types';
import type { MemoryRoom } from '../../utils/memoryPalace/types';
import { ROOM_SLOTS, ROOM_META, DEFAULT_ROOM_COLORS } from './roomTemplates';
import { PixelLayoutDB } from './pixelHomeDb';
import { defaultFurniturePixelSrc } from './roomPixelRenderer';

interface Props {
  charId: string;
  charName: string;
  roomId: MemoryRoom;
  layout: PixelRoomLayout;
  assets: PixelAsset[];
  onUpdate: () => void;
  onOpenLibrary: () => void;
}

const PixelRoomEditor: React.FC<Props> = ({ charId, charName, roomId, layout, assets, onUpdate, onOpenLibrary }) => {
  const [furniture, setFurniture] = useState<PlacedFurniture[]>(layout.furniture);
  const [wallColor, setWallColor] = useState(layout.wallColor);
  const [floorColor, setFloorColor] = useState(layout.floorColor);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [zoom, setZoom] = useState(1);

  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; fx: number; fy: number }>({ x: 0, y: 0, fx: 0, fy: 0 });
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const meta = ROOM_META[roomId];
  const slotDefs = ROOM_SLOTS[roomId];

  // 保存到 DB（防抖）
  const saveLayout = useCallback((updatedFurniture: PlacedFurniture[], wc?: string, fc?: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const updated: PixelRoomLayout = {
        ...layout,
        furniture: updatedFurniture,
        wallColor: wc || wallColor,
        floorColor: fc || floorColor,
        lastUpdatedAt: Date.now(),
        lastDecoratedBy: 'user',
      };
      await PixelLayoutDB.save(updated);
      onUpdate();
    }, 500);
  }, [layout, wallColor, floorColor, onUpdate]);

  // 拖拽开始
  const handlePointerDown = useCallback((e: React.PointerEvent, slotId: string) => {
    if (mode !== 'edit') return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = slotId;
    const f = furniture.find(f => f.slotId === slotId);
    if (!f) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y };
    setSelectedSlot(slotId);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [mode, furniture]);

  // 拖拽移动
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStartRef.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragStartRef.current.y) / rect.height) * 100;
    const newX = Math.max(5, Math.min(95, dragStartRef.current.fx + dx));
    const newY = Math.max(10, Math.min(90, dragStartRef.current.fy + dy));

    setFurniture(prev => prev.map(f =>
      f.slotId === draggingRef.current ? { ...f, x: newX, y: newY } : f
    ));
  }, []);

  // 拖拽结束
  const handlePointerUp = useCallback(() => {
    if (draggingRef.current) {
      draggingRef.current = null;
      saveLayout(furniture);
    }
  }, [furniture, saveLayout]);

  // 缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.5, Math.min(3, z + delta)));
  }, []);

  // 更新家具属性
  const updateFurniture = useCallback((slotId: string, updates: Partial<PlacedFurniture>) => {
    setFurniture(prev => {
      const next = prev.map(f => f.slotId === slotId ? { ...f, ...updates, placedBy: 'user' as const } : f);
      saveLayout(next);
      return next;
    });
  }, [saveLayout]);

  // 获取家具图片
  const getFurnitureImage = useCallback((f: PlacedFurniture): string => {
    if (f.assetId) {
      const asset = assets.find(a => a.id === f.assetId);
      if (asset) return asset.pixelImage;
    }
    return defaultFurniturePixelSrc(roomId, f.slotId);
  }, [assets, roomId]);

  const selectedFurniture = selectedSlot ? furniture.find(f => f.slotId === selectedSlot) : null;
  const selectedSlotDef = selectedSlot ? slotDefs.find(s => s.id === selectedSlot) : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 房间视图 */}
      <div
        ref={stageRef}
        className="flex-1 relative overflow-hidden touch-none cursor-default"
        onWheel={handleWheel}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
      >
        {/* 墙壁 */}
        <div className="absolute inset-x-0 top-0 h-[60%]" style={{ backgroundColor: wallColor }}>
          {/* 像素网格 */}
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: `linear-gradient(rgba(0,0,0,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.5) 1px, transparent 1px)`,
            backgroundSize: '16px 16px',
          }} />
        </div>

        {/* 地板 */}
        <div className="absolute inset-x-0 bottom-0 h-[40%]" style={{ backgroundColor: floorColor }}>
          <div className="absolute inset-0 opacity-8" style={{
            backgroundImage: `repeating-linear-gradient(90deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 32px)`,
          }} />
        </div>

        {/* 墙地板分界线 */}
        <div className="absolute inset-x-0 top-[60%] h-[3px] bg-black/20" />

        {/* 家具 */}
        {furniture.map(f => {
          const slotDef = slotDefs.find(s => s.id === f.slotId);
          if (!slotDef) return null;
          const isSelected = selectedSlot === f.slotId;
          const imgSrc = getFurnitureImage(f);

          return (
            <div
              key={f.slotId}
              className={`absolute flex flex-col items-center cursor-pointer transition-shadow
                ${isSelected ? 'z-50' : ''}`}
              style={{
                left: `${f.x}%`,
                top: `${f.y}%`,
                transform: `translate(-50%, -50%) scale(${f.scale}) rotate(${f.rotation}deg)`,
                filter: isSelected ? `drop-shadow(0 0 6px ${meta.color})` : undefined,
                transition: draggingRef.current === f.slotId ? 'none' : 'filter 0.2s',
              }}
              onPointerDown={e => handlePointerDown(e, f.slotId)}
              onClick={() => mode === 'view' && setSelectedSlot(isSelected ? null : f.slotId)}
            >
              <img
                src={imgSrc}
                alt={slotDef.name}
                className="w-12 h-12 object-contain pointer-events-none"
                style={{ imageRendering: 'pixelated' }}
                draggable={false}
              />
              {/* 槽位名标签 */}
              {mode === 'edit' && (
                <span className="text-[8px] mt-0.5 px-1 rounded bg-black/50 text-white whitespace-nowrap">
                  {slotDef.name}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部工具栏 */}
      <div className="shrink-0 bg-slate-800/95 backdrop-blur-sm border-t border-slate-700/50 px-4 py-3">
        {/* 模式切换 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-2">
            <button
              onClick={() => { setMode('view'); setSelectedSlot(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                mode === 'view' ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'
              }`}
            >
              👁 浏览
            </button>
            <button
              onClick={() => setMode('edit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                mode === 'edit' ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'
              }`}
            >
              ✏️ 编辑
            </button>
          </div>
          <button
            onClick={onOpenLibrary}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white active:scale-95 transition-transform"
          >
            📦 仓库
          </button>
        </div>

        {/* 选中家具的控制面板 */}
        {selectedFurniture && selectedSlotDef && (
          <div className="mt-2 p-3 bg-slate-700/60 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 font-bold">{selectedSlotDef.name}</span>
              <span className="text-[10px] text-slate-400">{selectedSlotDef.category}</span>
            </div>

            {/* 缩放 */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-8">大小</span>
              <input
                type="range"
                min={0.3}
                max={3}
                step={0.1}
                value={selectedFurniture.scale}
                onChange={e => updateFurniture(selectedSlot!, { scale: parseFloat(e.target.value) })}
                className="flex-1 h-1 accent-amber-500"
              />
              <span className="text-[10px] text-slate-400 w-8 text-right">{selectedFurniture.scale.toFixed(1)}</span>
            </div>

            {/* 旋转 */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-8">旋转</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={5}
                value={selectedFurniture.rotation}
                onChange={e => updateFurniture(selectedSlot!, { rotation: parseInt(e.target.value) })}
                className="flex-1 h-1 accent-amber-500"
              />
              <span className="text-[10px] text-slate-400 w-8 text-right">{selectedFurniture.rotation}°</span>
            </div>

            {/* 替换资产 */}
            <button
              onClick={onOpenLibrary}
              className="w-full py-2 bg-slate-600 text-slate-200 text-xs font-bold rounded-lg active:scale-95 transition-transform"
            >
              🔄 替换家具素材
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PixelRoomEditor;
