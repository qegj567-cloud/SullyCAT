/**
 * Pixel Home — 像素家园主入口
 *
 * 管理4个子视图：俯瞰地图、单房间编辑、资产生成器、资产仓库
 * 处理资产替换流程：编辑器→仓库→选择资产→回到编辑器并应用
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOS } from '../../context/OSContext';
import type { PixelHomeState, PixelHomeViewMode, PixelAsset, PlacedFurniture } from './types';
import type { MemoryRoom } from '../../utils/memoryPalace/types';
import { getOrCreateHomeState, PixelLayoutDB, PixelAssetDB } from './pixelHomeDb';
import { ROOM_META } from './roomTemplates';
import PixelHomeMap from './PixelHomeMap';
import PixelRoomEditor from './PixelRoomEditor';
import PixelAssetGenerator from './PixelAssetGenerator';
import AssetLibrary from './AssetLibrary';

interface Props {
  charId: string;
  charName: string;
  onBack: () => void;
}

const PixelHomeView: React.FC<Props> = ({ charId, charName, onBack }) => {
  const { addToast } = useOS();
  const [viewMode, setViewMode] = useState<PixelHomeViewMode>('map');
  const [homeState, setHomeState] = useState<PixelHomeState | null>(null);
  const [assets, setAssets] = useState<PixelAsset[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<MemoryRoom>('living_room');
  const [loading, setLoading] = useState(true);

  // 资产替换上下文：记住从哪个槽位跳到仓库的
  const pendingSlotRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [state, allAssets] = await Promise.all([
          getOrCreateHomeState(charId),
          PixelAssetDB.getAll(),
        ]);
        if (!cancelled) {
          setHomeState(state);
          setAssets(allAssets);
        }
      } catch (err) {
        console.error('❌ [PixelHome] Failed to load:', err);
        addToast?.('加载像素家园失败', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [charId]);

  const handleEnterRoom = useCallback((roomId: MemoryRoom) => {
    setSelectedRoom(roomId);
    setViewMode('room');
  }, []);

  const handleRoomUpdate = useCallback(async () => {
    const state = await getOrCreateHomeState(charId);
    setHomeState(state);
  }, [charId]);

  const handleAssetsChanged = useCallback(async () => {
    const allAssets = await PixelAssetDB.getAll();
    setAssets(allAssets);
  }, []);

  // 从编辑器打开仓库（可能带有待替换的 slotId）
  const handleOpenLibrary = useCallback((slotId: string | null) => {
    pendingSlotRef.current = slotId;
    setViewMode('library');
  }, []);

  // 从仓库选择资产 → 替换到槽位
  const handleSelectAsset = useCallback(async (assetId: string) => {
    const slotId = pendingSlotRef.current;
    if (slotId && homeState) {
      // 找到当前房间的布局并替换资产
      const roomLayout = homeState.rooms.find(r => r.roomId === selectedRoom);
      if (roomLayout) {
        const updatedFurniture = roomLayout.furniture.map(f =>
          f.slotId === slotId ? { ...f, assetId, placedBy: 'user' as const } : f
        );
        const updated = {
          ...roomLayout,
          furniture: updatedFurniture,
          lastUpdatedAt: Date.now(),
          lastDecoratedBy: 'user' as const,
        };
        await PixelLayoutDB.save(updated);
        await handleRoomUpdate();
        addToast?.('家具已替换', 'success');
      }
    }
    pendingSlotRef.current = null;
    setViewMode('room');
  }, [homeState, selectedRoom, handleRoomUpdate, addToast]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-900">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-pulse">🏠</div>
          <p className="text-slate-400 text-sm font-light">正在打开{charName}的像素家园...</p>
        </div>
      </div>
    );
  }

  if (!homeState) return null;

  return (
    <div className="h-full w-full flex flex-col bg-slate-900 overflow-hidden">
      {/* 顶部导航 */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3 bg-slate-800/80 backdrop-blur-sm border-b border-slate-700/50">
        <button
          onClick={viewMode === 'map' ? onBack : () => {
            pendingSlotRef.current = null;
            setViewMode(viewMode === 'room' ? 'map' : 'room');
          }}
          className="p-2 -ml-2 rounded-full hover:bg-slate-700 active:scale-90 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-300">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="font-bold text-slate-200 text-sm tracking-wide">
          {viewMode === 'map' && `${charName}的家`}
          {viewMode === 'room' && ROOM_META[selectedRoom].name}
          {viewMode === 'generator' && '像素工坊'}
          {viewMode === 'library' && (pendingSlotRef.current ? '选择替换素材' : '家具仓库')}
        </span>
        <div className="w-8" />
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-hidden relative">
        {viewMode === 'map' && (
          <PixelHomeMap
            homeState={homeState}
            assets={assets}
            onEnterRoom={handleEnterRoom}
          />
        )}
        {viewMode === 'room' && (
          <PixelRoomEditor
            charId={charId}
            charName={charName}
            roomId={selectedRoom}
            layout={homeState.rooms.find(r => r.roomId === selectedRoom)!}
            assets={assets}
            onUpdate={handleRoomUpdate}
            onOpenLibrary={handleOpenLibrary}
          />
        )}
        {viewMode === 'generator' && (
          <PixelAssetGenerator
            onGenerated={handleAssetsChanged}
          />
        )}
        {viewMode === 'library' && (
          <AssetLibrary
            assets={assets}
            onChanged={handleAssetsChanged}
            onSelectAsset={handleSelectAsset}
            isSelecting={!!pendingSlotRef.current}
          />
        )}
      </div>

      {/* 底部工具栏（仅地图视图） */}
      {viewMode === 'map' && (
        <div className="shrink-0 flex items-center justify-around px-4 py-3 bg-slate-800/90 backdrop-blur-sm border-t border-slate-700/50">
          <BottomTab icon="🗺️" label="家园" active onClick={() => setViewMode('map')} />
          <BottomTab icon="🎨" label="像素工坊" onClick={() => setViewMode('generator')} />
          <BottomTab icon="📦" label="仓库" onClick={() => { pendingSlotRef.current = null; setViewMode('library'); }} />
        </div>
      )}
    </div>
  );
};

const BottomTab: React.FC<{ icon: string; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-all active:scale-90
      ${active ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'}`}
  >
    <span className="text-lg">{icon}</span>
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

export default PixelHomeView;
