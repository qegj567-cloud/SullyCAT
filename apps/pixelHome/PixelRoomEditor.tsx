/**
 * Pixel Home — 单房间编辑器（俯视视角）
 *
 * 星露谷风格的俯视房间编辑。瓦片地板，墙壁边框。
 * 家具可拖拽移动，支持缩放/旋转，可替换为用户像素资产。
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { PixelRoomLayout, PlacedFurniture, PixelAsset } from './types';
import type { MemoryRoom } from '../../utils/memoryPalace/types';
import { ROOM_SLOTS, ROOM_META } from './roomTemplates';
import { PixelLayoutDB } from './pixelHomeDb';
import { defaultFurniturePixelSrc } from './roomPixelRenderer';

interface Props {
  charId: string;
  charName: string;
  roomId: MemoryRoom;
  layout: PixelRoomLayout;
  assets: PixelAsset[];
  onUpdate: () => void;
  onOpenLibrary: (slotId: string | null) => void;
}

const TILE = 28; // 瓦片大小 (px)

const FLOOR_STYLES: Record<string, {
  wallFace: string; wallFaceDark: string;
  base: string; alt: string; pattern: 'wood' | 'tile' | 'stone';
}> = {
  living_room: { wallFace: '#e8d5b8', wallFaceDark: '#d4c1a4', base: '#c4a882', alt: '#b89b75', pattern: 'wood' },
  bedroom:     { wallFace: '#e8ddd0', wallFaceDark: '#d8cdc0', base: '#d4b896', alt: '#c9ab87', pattern: 'wood' },
  study:       { wallFace: '#c9b99a', wallFaceDark: '#b5a586', base: '#8b6f47', alt: '#7d6340', pattern: 'wood' },
  attic:       { wallFace: '#6b5d50', wallFaceDark: '#5a4d42', base: '#706050', alt: '#655545', pattern: 'stone' },
  self_room:   { wallFace: '#f0d0e0', wallFaceDark: '#e0c0d0', base: '#d4a8c0', alt: '#c99db5', pattern: 'tile' },
  user_room:   { wallFace: '#c8e0d0', wallFaceDark: '#b8d0c0', base: '#a8c4b0', alt: '#9db9a5', pattern: 'tile' },
  windowsill:  { wallFace: '#a8bfb0', wallFaceDark: '#98af9f', base: '#92a89c', alt: '#879d91', pattern: 'stone' },
};

const WALL_TOP_RATIO = 0.28; // 墙面带占房间高度

const WALL_COLOR = '#3d2b1f';
const WALL_LIGHT = '#5c4332';
const WALL_THICK = 6;

const PixelRoomEditor: React.FC<Props> = ({ charId, charName, roomId, layout, assets, onUpdate, onOpenLibrary }) => {
  const [furniture, setFurniture] = useState<PlacedFurniture[]>(layout.furniture);
  const [wallColor, setWallColor] = useState(layout.wallColor);
  const [floorColor, setFloorColor] = useState(layout.floorColor);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [zoom, setZoom] = useState(1);

  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; fx: number; fy: number }>({ x: 0, y: 0, fx: 0, fy: 0 });
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const meta = ROOM_META[roomId];
  const slotDefs = ROOM_SLOTS[roomId];
  const floorStyle = FLOOR_STYLES[roomId] || FLOOR_STYLES.living_room;

  // 同步 layout prop 变更
  useEffect(() => {
    setFurniture(layout.furniture);
    setWallColor(layout.wallColor);
    setFloorColor(layout.floorColor);
  }, [layout]);

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

  // 拖拽
  const handlePointerDown = useCallback((e: React.PointerEvent, slotId: string) => {
    if (mode !== 'edit') return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = slotId;
    const f = furniture.find(f => f.slotId === slotId);
    if (!f) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y };
    setSelectedSlot(slotId);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [mode, furniture]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStartRef.current.x) / (rect.width / zoom)) * 100;
    const dy = ((e.clientY - dragStartRef.current.y) / (rect.height / zoom)) * 100;
    const newX = Math.max(5, Math.min(95, dragStartRef.current.fx + dx));
    const newY = Math.max(5, Math.min(95, dragStartRef.current.fy + dy));

    setFurniture(prev => prev.map(f =>
      f.slotId === draggingRef.current ? { ...f, x: newX, y: newY } : f
    ));
  }, [zoom]);

  const handlePointerUp = useCallback(() => {
    if (draggingRef.current) {
      draggingRef.current = null;
      saveLayout(furniture);
    }
  }, [furniture, saveLayout]);

  // 用 native addEventListener 注册 wheel（non-passive），避免 passive 报错
  const outerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoom(z => Math.max(0.5, Math.min(3, z + delta)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // 更新家具属性
  const updateFurniture = useCallback((slotId: string, updates: Partial<PlacedFurniture>) => {
    setFurniture(prev => {
      const next = prev.map(f => f.slotId === slotId ? { ...f, ...updates, placedBy: 'user' as const } : f);
      saveLayout(next);
      return next;
    });
  }, [saveLayout]);

  // 替换家具资产
  const replaceAsset = useCallback((slotId: string, assetId: string) => {
    updateFurniture(slotId, { assetId, placedBy: 'user' });
  }, [updateFurniture]);

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

  // 房间尺寸（格数）
  const ROOM_W = 10;
  const ROOM_H = 8;
  const roomPxW = ROOM_W * TILE;
  const roomPxH = ROOM_H * TILE;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#1a1410' }}>
      {/* 房间俯视区 */}
      <div
        ref={outerRef}
        className="flex-1 overflow-hidden flex items-center justify-center touch-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
          <div
            ref={stageRef}
            className="relative select-none"
            style={{ width: roomPxW, height: roomPxH }}
          >
            {/* 墙壁外框 */}
            <div
              className="absolute rounded-sm"
              style={{
                inset: -WALL_THICK,
                backgroundColor: WALL_COLOR,
              }}
            >
              {/* 墙壁高光 */}
              <div className="absolute inset-x-0 top-0 rounded-t-sm" style={{ height: 2, backgroundColor: WALL_LIGHT }} />
              <div className="absolute inset-y-0 left-0 rounded-l-sm" style={{ width: 2, backgroundColor: WALL_LIGHT }} />
            </div>

            {/* 墙面带（上方 ~28%） */}
            <div className="absolute inset-x-0 top-0 overflow-hidden" style={{
              height: `${WALL_TOP_RATIO * 100}%`,
              backgroundColor: floorStyle.wallFace,
            }}>
              {/* 墙面砖纹 */}
              <div className="absolute inset-0" style={{
                backgroundImage: `
                  linear-gradient(${floorStyle.wallFaceDark} 1px, transparent 1px),
                  linear-gradient(90deg, ${floorStyle.wallFaceDark}40 1px, transparent 1px)
                `,
                backgroundSize: `${TILE * 2}px ${Math.round(TILE * 0.6)}px`,
              }} />
              {/* 墙面底部阴影 */}
              <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{
                background: `linear-gradient(to bottom, ${floorStyle.wallFaceDark}, ${floorStyle.base})`,
              }} />
            </div>

            {/* 地板区（下方 ~72%） */}
            <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{
              top: `${WALL_TOP_RATIO * 100}%`,
              backgroundColor: floorStyle.base,
            }}>
              {floorStyle.pattern === 'wood' && (
                <div className="absolute inset-0" style={{
                  backgroundImage: `
                    repeating-linear-gradient(90deg, ${floorStyle.alt} 0px, ${floorStyle.alt} 1px, transparent 1px, transparent ${TILE}px),
                    repeating-linear-gradient(0deg, transparent 0px, transparent ${TILE - 1}px, ${floorStyle.alt}80 ${TILE - 1}px, ${floorStyle.alt}80 ${TILE}px)
                  `,
                }} />
              )}
              {floorStyle.pattern === 'tile' && (
                <div className="absolute inset-0" style={{
                  backgroundImage: `linear-gradient(${floorStyle.alt} 1px, transparent 1px), linear-gradient(90deg, ${floorStyle.alt} 1px, transparent 1px)`,
                  backgroundSize: `${TILE}px ${TILE}px`,
                }} />
              )}
              {floorStyle.pattern === 'stone' && (
                <div className="absolute inset-0" style={{
                  backgroundImage: `linear-gradient(${floorStyle.alt} 1px, transparent 1px), linear-gradient(90deg, ${floorStyle.alt} 1px, transparent 1px)`,
                  backgroundSize: `${Math.round(TILE * 1.5)}px ${TILE}px`,
                }} />
              )}
            </div>

            {/* 家具精灵（俯视） */}
            {furniture.map(f => {
              const slotDef = slotDefs.find(s => s.id === f.slotId);
              if (!slotDef) return null;
              const isSelected = selectedSlot === f.slotId;
              const imgSrc = getFurnitureImage(f);
              const furSize = TILE * 1.8 * f.scale;

              return (
                <div
                  key={f.slotId}
                  className="absolute"
                  style={{
                    left: `${f.x}%`,
                    top: `${f.y}%`,
                    transform: `translate(-50%, -50%)`,
                    zIndex: isSelected ? 100 : Math.round(f.y),
                    cursor: mode === 'edit' ? 'grab' : 'pointer',
                  }}
                  onPointerDown={e => handlePointerDown(e, f.slotId)}
                  onClick={() => mode === 'view' && setSelectedSlot(isSelected ? null : f.slotId)}
                >
                  {/* 选中高亮 */}
                  {isSelected && (
                    <div className="absolute -inset-1 rounded border-2 animate-pulse" style={{
                      borderColor: meta.color,
                      boxShadow: `0 0 8px ${meta.color}80`,
                    }} />
                  )}
                  <img
                    src={imgSrc}
                    alt={slotDef.name}
                    className="pointer-events-none"
                    style={{
                      width: furSize,
                      height: furSize,
                      imageRendering: 'pixelated',
                      transform: `rotate(${f.rotation}deg)`,
                      filter: f.colorOverride ? `hue-rotate(${colorToHue(f.colorOverride)}deg)` : undefined,
                    }}
                    draggable={false}
                  />
                  {/* 编辑模式标签 */}
                  {mode === 'edit' && (
                    <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[6px] font-bold px-1 rounded bg-black/70 text-white whitespace-nowrap">
                      {slotDef.name}
                    </span>
                  )}
                </div>
              );
            })}

            {/* 房间名 */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-white/80 whitespace-nowrap">
                {meta.emoji} {meta.name} — {meta.description}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 底部工具栏 */}
      <div className="shrink-0 bg-slate-800/95 backdrop-blur-sm border-t border-slate-700/50 px-3 py-2 max-h-[45%] overflow-y-auto no-scrollbar">
        {/* 模式切换 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1.5">
            <ModeBtn label="👁 浏览" active={mode === 'view'} onClick={() => { setMode('view'); setSelectedSlot(null); }} />
            <ModeBtn label="✏️ 编辑" active={mode === 'edit'} onClick={() => setMode('edit')} />
          </div>
          <button
            onClick={() => onOpenLibrary(null)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white active:scale-95 transition-transform"
          >
            📦 仓库
          </button>
        </div>

        {/* 选中家具面板 */}
        {selectedFurniture && selectedSlotDef && (
          <div className="p-2.5 bg-slate-700/60 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-200 font-bold">{selectedSlotDef.name}</span>
              <span className="text-[10px] text-slate-400 italic">{selectedSlotDef.category}</span>
            </div>

            {/* 缩放 */}
            <SliderRow
              label="大小"
              min={0.3} max={3} step={0.1}
              value={selectedFurniture.scale}
              onChange={v => updateFurniture(selectedSlot!, { scale: v })}
              display={selectedFurniture.scale.toFixed(1)}
            />

            {/* 旋转 */}
            <SliderRow
              label="旋转"
              min={-180} max={180} step={15}
              value={selectedFurniture.rotation}
              onChange={v => updateFurniture(selectedSlot!, { rotation: v })}
              display={`${selectedFurniture.rotation}°`}
            />

            {/* 替换/重置 */}
            <div className="flex gap-2">
              <button
                onClick={() => onOpenLibrary(selectedSlot)}
                className="flex-1 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg active:scale-95 transition-transform"
              >
                🔄 替换素材
              </button>
              {selectedFurniture.assetId && (
                <button
                  onClick={() => updateFurniture(selectedSlot!, { assetId: null })}
                  className="px-3 py-2 bg-slate-600 text-slate-200 text-xs font-bold rounded-lg active:scale-95 transition-transform"
                >
                  ↩️ 默认
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 小组件
const ModeBtn: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
      active ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'
    }`}
  >
    {label}
  </button>
);

const SliderRow: React.FC<{
  label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; display: string;
}> = ({ label, min, max, step, value, onChange, display }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] text-slate-400 w-8">{label}</span>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      className="flex-1 h-1 accent-amber-500"
    />
    <span className="text-[10px] text-slate-400 w-8 text-right">{display}</span>
  </div>
);

/** 简单 hex → hue 偏移（粗略映射） */
function colorToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / (max - min)) * 60;
  else if (max === g) h = (2 + (b - r) / (max - min)) * 60;
  else h = (4 + (r - g) / (max - min)) * 60;
  return h < 0 ? h + 360 : h;
}

export default PixelRoomEditor;
