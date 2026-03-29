/**
 * Pixel Home — 单房间编辑器（俯视视角）
 *
 * 按格子移动家具（像素游戏风格）
 * 支持自定义墙纸/地砖上传
 * 内嵌记忆空间可视化面板
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { PixelRoomLayout, PlacedFurniture, PixelAsset } from './types';
import type { MemoryRoom } from '../../utils/memoryPalace/types';
import type { MemoryNode } from '../../utils/memoryPalace/types';
import { ROOM_SLOTS, ROOM_META } from './roomTemplates';
import { PixelLayoutDB } from './pixelHomeDb';
import { defaultFurniturePixelSrc } from './roomPixelRenderer';
import { MemoryNodeDB } from '../../utils/memoryPalace/db';
import { processImage } from '../../utils/file';
import { pixelizeImage, removeBackground } from '../../utils/pixelizer';

interface Props {
  charId: string;
  charName: string;
  charSprite?: string;
  userName: string;
  roomId: MemoryRoom;
  layout: PixelRoomLayout;
  assets: PixelAsset[];
  onUpdate: () => void;
  onOpenLibrary: (slotId: string | null) => void;
}

const TILE = 28;
const WALL_TOP_RATIO = 0.28;
// 格子数
const GRID_COLS = 10;
const GRID_ROWS = 8;
// 格子百分比步长
const GRID_STEP_X = 100 / GRID_COLS; // 10%
const GRID_STEP_Y = 100 / GRID_ROWS; // 12.5%

/** 吸附到最近的格子，边界留出家具空间 */
function snapToGrid(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(GRID_STEP_X, Math.min(100 - GRID_STEP_X, Math.round(x / GRID_STEP_X) * GRID_STEP_X)),
    y: Math.max(GRID_STEP_Y, Math.min(100 - GRID_STEP_Y, Math.round(y / GRID_STEP_Y) * GRID_STEP_Y)),
  };
}

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

const WALL_COLOR = '#3d2b1f';
const WALL_LIGHT = '#5c4332';
const WALL_THICK = 6;

// 情绪色
const MOOD_COLORS: Record<string, string> = {
  happy: '#fbbf24', sad: '#60a5fa', angry: '#ef4444', anxious: '#f97316',
  tender: '#f472b6', peaceful: '#34d399', confused: '#a78bfa', neutral: '#94a3b8',
};

const PixelRoomEditor: React.FC<Props> = ({ charId, charName, charSprite, userName, roomId, layout, assets, onUpdate, onOpenLibrary }) => {
  const [furniture, setFurniture] = useState<PlacedFurniture[]>(layout.furniture);
  const [wallColor, setWallColor] = useState(layout.wallColor);
  const [floorColor, setFloorColor] = useState(layout.floorColor);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [zoom, setZoom] = useState(1);
  const [showMemory, setShowMemory] = useState(false);
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);

  // 自定义墙纸/地砖
  const [customWall, setCustomWall] = useState<string | null>(layout.wallColor.startsWith('data:') ? layout.wallColor : null);
  const [customFloor, setCustomFloor] = useState<string | null>(layout.floorColor.startsWith('data:') ? layout.floorColor : null);

  // 角色小人
  const [charPos, setCharPos] = useState({ x: 50, y: 60 });
  const [charFlip, setCharFlip] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; fx: number; fy: number }>({ x: 0, y: 0, fx: 0, fy: 0 });
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const wallInputRef = useRef<HTMLInputElement>(null);
  const floorInputRef = useRef<HTMLInputElement>(null);

  const meta = ROOM_META[roomId];
  const slotDefs = ROOM_SLOTS[roomId];
  const floorStyle = FLOOR_STYLES[roomId] || FLOOR_STYLES.living_room;

  // 角色漫步（也吸附到格子）
  useEffect(() => {
    const timer = setInterval(() => {
      setCharPos(prev => {
        const nx = prev.x + (Math.random() - 0.5) * 20;
        const ny = prev.y + (Math.random() - 0.5) * 15;
        const snapped = snapToGrid(nx, ny);
        setCharFlip(snapped.x < prev.x);
        return snapped;
      });
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setFurniture(layout.furniture);
    setWallColor(layout.wallColor);
    setFloorColor(layout.floorColor);
    setCustomWall(layout.wallColor.startsWith('data:') ? layout.wallColor : null);
    setCustomFloor(layout.floorColor.startsWith('data:') ? layout.floorColor : null);
  }, [layout]);

  // wheel
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(z => Math.max(0.5, Math.min(3, z + (e.deltaY > 0 ? -0.15 : 0.15))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const saveLayout = useCallback((updatedFurniture: PlacedFurniture[], wc?: string, fc?: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await PixelLayoutDB.save({
        ...layout, furniture: updatedFurniture,
        wallColor: wc || wallColor, floorColor: fc || floorColor,
        lastUpdatedAt: Date.now(), lastDecoratedBy: 'user',
      });
      onUpdate();
    }, 500);
  }, [layout, wallColor, floorColor, onUpdate]);

  // 拖拽 → 格子吸附
  const handlePointerDown = useCallback((e: React.PointerEvent, slotId: string) => {
    if (mode !== 'edit') return;
    e.preventDefault(); e.stopPropagation();
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
    const rawX = dragStartRef.current.fx + dx;
    const rawY = dragStartRef.current.fy + dy;
    const snapped = snapToGrid(rawX, rawY);
    setFurniture(prev => prev.map(f =>
      f.slotId === draggingRef.current ? { ...f, ...snapped } : f
    ));
  }, [zoom]);

  const handlePointerUp = useCallback(() => {
    if (draggingRef.current) {
      // 最终吸附
      setFurniture(prev => {
        const next = prev.map(f => {
          if (f.slotId === draggingRef.current) {
            const s = snapToGrid(f.x, f.y);
            return { ...f, ...s };
          }
          return f;
        });
        draggingRef.current = null;
        saveLayout(next);
        return next;
      });
    }
  }, [saveLayout]);

  const updateFurniture = useCallback((slotId: string, updates: Partial<PlacedFurniture>) => {
    setFurniture(prev => {
      const next = prev.map(f => f.slotId === slotId ? { ...f, ...updates, placedBy: 'user' as const } : f);
      saveLayout(next);
      return next;
    });
  }, [saveLayout]);

  const deleteFurniture = useCallback((slotId: string) => {
    setFurniture(prev => { const next = prev.filter(f => f.slotId !== slotId); saveLayout(next); return next; });
    setSelectedSlot(null);
  }, [saveLayout]);

  const getFurnitureImage = useCallback((f: PlacedFurniture): string | null => {
    if (f.assetId) {
      const asset = assets.find(a => a.id === f.assetId);
      if (asset) return asset.pixelImage;
    }
    if (f.isDefault !== false) return defaultFurniturePixelSrc(roomId, f.slotId);
    return null;
  }, [assets, roomId]);

  // 墙纸/地砖上传 + 像素化
  const handleTextureUpload = useCallback(async (file: File, target: 'wall' | 'floor') => {
    try {
      const dataUri = await processImage(file, { maxWidth: 256, skipCompression: true });
      // 像素化处理
      const img = await loadImage(dataUri);
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = pixelizeImage(imageData, 32);
      // 渲染平铺纹理 tile
      const tileCanvas = document.createElement('canvas');
      tileCanvas.width = result.width * 2; tileCanvas.height = result.height * 2;
      const tCtx = tileCanvas.getContext('2d')!;
      tCtx.imageSmoothingEnabled = false;
      const smallCanvas = document.createElement('canvas');
      smallCanvas.width = result.width; smallCanvas.height = result.height;
      smallCanvas.getContext('2d')!.putImageData(result.imageData, 0, 0);
      tCtx.drawImage(smallCanvas, 0, 0, tileCanvas.width, tileCanvas.height);
      const tileUri = tileCanvas.toDataURL('image/png');

      if (target === 'wall') {
        setCustomWall(tileUri); setWallColor(tileUri);
        saveLayout(furniture, tileUri, undefined);
      } else {
        setCustomFloor(tileUri); setFloorColor(tileUri);
        saveLayout(furniture, undefined, tileUri);
      }
    } catch (err) {
      console.error('Texture upload failed:', err);
    }
  }, [furniture, saveLayout]);

  // 加载记忆
  const loadMemories = useCallback(async () => {
    setMemoryLoading(true);
    try {
      const nodes = await MemoryNodeDB.getByRoom(charId, roomId);
      nodes.sort((a, b) => b.importance - a.importance);
      setMemories(nodes.slice(0, 30));
    } catch (err) {
      console.error('Load memories failed:', err);
    }
    setMemoryLoading(false);
  }, [charId, roomId]);

  useEffect(() => { if (showMemory) loadMemories(); }, [showMemory, loadMemories]);

  const selectedFurniture = selectedSlot ? furniture.find(f => f.slotId === selectedSlot) : null;
  const selectedSlotDef = selectedSlot ? slotDefs.find(s => s.id === selectedSlot) : null;
  const roomPxW = GRID_COLS * TILE;
  const roomPxH = GRID_ROWS * TILE;
  const roomDisplayName = roomId === 'user_room' ? `${userName}的房` : meta.name;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#1a1410' }}>
      <div ref={outerRef} className="flex-1 overflow-hidden flex items-center justify-center touch-none"
        onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
          <div ref={stageRef} className="relative select-none overflow-visible" style={{ width: roomPxW, height: roomPxH }}>
            {/* 墙壁外框 */}
            <div className="absolute rounded-sm" style={{ inset: -WALL_THICK, backgroundColor: WALL_COLOR }}>
              <div className="absolute inset-x-0 top-0 rounded-t-sm" style={{ height: 2, backgroundColor: WALL_LIGHT }} />
              <div className="absolute inset-y-0 left-0 rounded-l-sm" style={{ width: 2, backgroundColor: WALL_LIGHT }} />
            </div>

            {/* 墙面带 */}
            <div className="absolute inset-x-0 top-0 overflow-hidden" style={{ height: `${WALL_TOP_RATIO * 100}%` }}>
              {customWall ? (
                <div className="absolute inset-0" style={{
                  backgroundImage: `url(${customWall})`, backgroundSize: `${TILE * 2}px ${TILE * 2}px`,
                  backgroundRepeat: 'repeat', imageRendering: 'pixelated' as any,
                }} />
              ) : (
                <>
                  <div className="absolute inset-0" style={{ backgroundColor: floorStyle.wallFace }} />
                  <div className="absolute inset-0" style={{
                    backgroundImage: `linear-gradient(${floorStyle.wallFaceDark} 1px, transparent 1px), linear-gradient(90deg, ${floorStyle.wallFaceDark}40 1px, transparent 1px)`,
                    backgroundSize: `${TILE * 2}px ${Math.round(TILE * 0.6)}px`,
                  }} />
                </>
              )}
              <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: `linear-gradient(to bottom, ${floorStyle.wallFaceDark}, ${floorStyle.base})` }} />
            </div>

            {/* 地板 */}
            <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: `${WALL_TOP_RATIO * 100}%` }}>
              {customFloor ? (
                <div className="absolute inset-0" style={{
                  backgroundImage: `url(${customFloor})`, backgroundSize: `${TILE}px ${TILE}px`,
                  backgroundRepeat: 'repeat', imageRendering: 'pixelated' as any,
                }} />
              ) : (
                <>
                  <div className="absolute inset-0" style={{ backgroundColor: floorStyle.base }} />
                  <FloorTexture type={floorStyle.pattern} alt={floorStyle.alt} />
                </>
              )}
            </div>

            {/* 格子网格（编辑模式可见） */}
            {mode === 'edit' && (
              <div className="absolute inset-0 pointer-events-none z-10" style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)`,
                backgroundSize: `${GRID_STEP_X}% ${GRID_STEP_Y}%`,
              }} />
            )}

            {/* 家具 */}
            {furniture.map(f => {
              const imgSrc = getFurnitureImage(f);
              if (!imgSrc) return null;
              const isSelected = selectedSlot === f.slotId;
              const furSize = TILE * 1.8 * f.scale;
              const labelName = f.isDefault !== false ? slotDefs.find(s => s.id === f.slotId)?.name : null;
              // 绝对像素坐标，居中放置
              const halfW = furSize / 2;
              const halfH = furSize / 2; // 图片高度可能不同，但用宽度近似
              const posX = (f.x / 100) * roomPxW - halfW;
              const posY = (f.y / 100) * roomPxH - halfH;

              return (
                <div key={f.slotId} style={{
                  position: 'absolute',
                  left: Math.max(-2, posX),
                  top: Math.max(-2, posY),
                  zIndex: isSelected ? 100 : Math.round(f.y),
                  cursor: mode === 'edit' ? 'grab' : 'pointer',
                  transition: draggingRef.current === f.slotId ? 'none' : 'left 0.15s, top 0.15s',
                }}
                  onPointerDown={e => {
                    if (mode === 'edit') {
                      handlePointerDown(e, f.slotId);
                    } else {
                      setSelectedSlot(isSelected ? null : f.slotId);
                    }
                  }}>
                  {isSelected && <div className="absolute -inset-1 rounded border-2 animate-pulse" style={{ borderColor: meta.color, boxShadow: `0 0 8px ${meta.color}80` }} />}
                  <img src={imgSrc} className="pointer-events-none" style={{
                    width: furSize, height: 'auto',
                    imageRendering: 'pixelated',
                    transform: `rotate(${f.rotation}deg)`,
                  }} draggable={false} />
                  {mode === 'edit' && labelName && (
                    <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[6px] font-bold px-1 rounded bg-black/70 text-white whitespace-nowrap">{labelName}</span>
                  )}
                </div>
              );
            })}

            {/* 角色小人 */}
            {charSprite && (
              <div className="absolute transition-all duration-[2200ms] ease-in-out z-40 pointer-events-none" style={{
                left: `${charPos.x}%`, top: `${charPos.y}%`,
                transform: `translate(-50%, -100%) scaleX(${charFlip ? -1 : 1})`,
              }}>
                <img src={charSprite} className="w-10 h-auto drop-shadow-md"
                  style={{ imageRendering: 'pixelated' }} draggable={false} />
                <div className="w-5 h-1 mx-auto rounded-full bg-black/20" />
              </div>
            )}

            {/* 房间名 */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-white/80 whitespace-nowrap">
                {roomDisplayName}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 底部工具栏 */}
      <div className="shrink-0 bg-slate-800/95 backdrop-blur-sm border-t border-slate-700/50 px-3 py-2 max-h-[50%] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1">
            <ModeBtn label="浏览" active={mode === 'view'} onClick={() => { setMode('view'); setSelectedSlot(null); }} />
            <ModeBtn label="编辑" active={mode === 'edit'} onClick={() => setMode('edit')} />
            <ModeBtn label="记忆" active={showMemory} onClick={() => setShowMemory(!showMemory)} />
          </div>
          <div className="flex gap-1">
            <ToolBtn label="放家具" color="bg-green-700" onClick={() => onOpenLibrary('__add__')} />
            <ToolBtn label="墙纸" color="bg-violet-700" onClick={() => wallInputRef.current?.click()} />
            <ToolBtn label="地砖" color="bg-amber-800" onClick={() => floorInputRef.current?.click()} />
          </div>
        </div>

        {/* 隐藏文件输入 */}
        <input ref={wallInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => e.target.files?.[0] && handleTextureUpload(e.target.files[0], 'wall')} />
        <input ref={floorInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => e.target.files?.[0] && handleTextureUpload(e.target.files[0], 'floor')} />

        {/* 选中家具面板 */}
        {selectedFurniture && (
          <div className="p-2.5 bg-slate-700/60 rounded-xl space-y-2 mb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-200 font-bold">
                {selectedSlotDef?.name || (selectedFurniture.assetId ? assets.find(a => a.id === selectedFurniture.assetId)?.name : '家具')}
              </span>
              {selectedSlotDef && <span className="text-[10px] text-slate-400 italic">{selectedSlotDef.category}</span>}
            </div>
            <SliderRow label="大小" min={0.3} max={3} step={0.1} value={selectedFurniture.scale}
              onChange={v => updateFurniture(selectedSlot!, { scale: v })} display={selectedFurniture.scale.toFixed(1)} />
            <SliderRow label="旋转" min={-180} max={180} step={15} value={selectedFurniture.rotation}
              onChange={v => updateFurniture(selectedSlot!, { rotation: v })} display={`${selectedFurniture.rotation}°`} />
            <div className="flex gap-2">
              <button onClick={() => onOpenLibrary(selectedSlot)}
                className="flex-1 py-1.5 bg-amber-600 text-white text-[10px] font-bold rounded-lg active:scale-95">替换素材</button>
              {selectedFurniture.isDefault === false && (
                <button onClick={() => deleteFurniture(selectedSlot!)}
                  className="px-3 py-1.5 bg-red-600 text-white text-[10px] font-bold rounded-lg active:scale-95">删除</button>
              )}
              {selectedFurniture.assetId && selectedFurniture.isDefault !== false && (
                <button onClick={() => updateFurniture(selectedSlot!, { assetId: null })}
                  className="px-3 py-1.5 bg-slate-600 text-slate-200 text-[10px] font-bold rounded-lg active:scale-95">还原</button>
              )}
            </div>
          </div>
        )}

        {/* 记忆空间面板 */}
        {showMemory && (
          <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                {roomDisplayName}的记忆 ({memories.length})
              </span>
              <button onClick={loadMemories} className="text-[9px] text-slate-400 hover:text-slate-200">刷新</button>
            </div>
            {memoryLoading ? (
              <div className="text-center py-4 text-slate-500 text-xs">加载中...</div>
            ) : memories.length === 0 ? (
              <div className="text-center py-4 text-slate-500 text-xs">暂无记忆</div>
            ) : (
              <div className="space-y-1 max-h-[200px] overflow-y-auto no-scrollbar">
                {memories.map(mem => {
                  const moodColor = MOOD_COLORS[mem.mood] || MOOD_COLORS.neutral;
                  const age = Math.round((Date.now() - mem.createdAt) / 86400000);
                  return (
                    <div key={mem.id} className="flex items-start gap-2 p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 transition-colors">
                      {/* 像素化重要度指示器 */}
                      <div className="shrink-0 flex flex-col items-center gap-0.5 mt-0.5">
                        <div className="flex gap-px">
                          {Array.from({ length: Math.min(5, Math.ceil(mem.importance / 2)) }).map((_, i) => (
                            <div key={i} className="w-1.5 h-1.5" style={{ backgroundColor: moodColor, imageRendering: 'pixelated' as any }} />
                          ))}
                        </div>
                        <span className="text-[7px] text-slate-500">{mem.importance}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-slate-300 leading-tight line-clamp-2">{mem.content}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[8px] px-1 rounded" style={{ backgroundColor: moodColor + '30', color: moodColor }}>{mem.mood}</span>
                          {mem.tags.slice(0, 2).map(t => (
                            <span key={t} className="text-[8px] text-slate-500">#{t}</span>
                          ))}
                          <span className="text-[8px] text-slate-600 ml-auto">{age}天前</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// 地板纹理
const FloorTexture: React.FC<{ type: string; alt: string }> = ({ type, alt }) => {
  if (type === 'wood') return <div className="absolute inset-0" style={{
    backgroundImage: `repeating-linear-gradient(90deg, ${alt} 0px, ${alt} 1px, transparent 1px, transparent ${TILE}px), repeating-linear-gradient(0deg, transparent 0px, transparent ${TILE - 1}px, ${alt}80 ${TILE - 1}px, ${alt}80 ${TILE}px)`,
  }} />;
  if (type === 'tile') return <div className="absolute inset-0" style={{
    backgroundImage: `linear-gradient(${alt} 1px, transparent 1px), linear-gradient(90deg, ${alt} 1px, transparent 1px)`,
    backgroundSize: `${TILE}px ${TILE}px`,
  }} />;
  return <div className="absolute inset-0" style={{
    backgroundImage: `linear-gradient(${alt} 1px, transparent 1px), linear-gradient(90deg, ${alt} 1px, transparent 1px)`,
    backgroundSize: `${Math.round(TILE * 1.5)}px ${TILE}px`,
  }} />;
};

const ModeBtn: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button onClick={onClick} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${active ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'}`}>{label}</button>
);

const ToolBtn: React.FC<{ label: string; color: string; onClick: () => void }> = ({ label, color, onClick }) => (
  <button onClick={onClick} className={`px-2 py-1.5 rounded-lg text-[10px] font-bold text-white active:scale-95 transition-transform ${color}`}>{label}</button>
);

const SliderRow: React.FC<{ label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; display: string }> = ({ label, min, max, step, value, onChange, display }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] text-slate-400 w-8">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="flex-1 h-1 accent-amber-500" />
    <span className="text-[10px] text-slate-400 w-8 text-right">{display}</span>
  </div>
);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
}

export default PixelRoomEditor;
