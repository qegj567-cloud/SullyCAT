/**
 * Pixel Home — 像素家园主入口
 *
 * 管理4个子视图：俯瞰地图、单房间编辑、资产生成器、资产仓库
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useOS } from '../../context/OSContext';
import type { PixelHomeState, PixelHomeViewMode, PixelAsset } from './types';
import type { MemoryRoom } from '../../utils/memoryPalace/types';
import { getOrCreateHomeState, PixelLayoutDB, PixelAssetDB } from './pixelHomeDb';
import { ROOM_META, ALL_ROOMS, ROOM_SLOTS, DEFAULT_ROOM_COLORS } from './roomTemplates';
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

  // 加载家园数据
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

  // 进入房间
  const handleEnterRoom = useCallback((roomId: MemoryRoom) => {
    setSelectedRoom(roomId);
    setViewMode('room');
  }, []);

  // 房间布局更新后同步到 state
  const handleRoomUpdate = useCallback(async () => {
    const state = await getOrCreateHomeState(charId);
    setHomeState(state);
  }, [charId]);

  // 新资产生成后刷新列表
  const handleAssetsChanged = useCallback(async () => {
    const allAssets = await PixelAssetDB.getAll();
    setAssets(allAssets);
  }, []);

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
          onClick={viewMode === 'map' ? onBack : () => setViewMode('map')}
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
          {viewMode === 'library' && '家具仓库'}
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
            onOpenLibrary={() => setViewMode('library')}
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
            onSelectAsset={(assetId) => {
              // TODO: 将选中的资产放到当前房间
              setViewMode('room');
            }}
          />
        )}
      </div>

      {/* 底部工具栏 */}
      {viewMode === 'map' && (
        <div className="shrink-0 flex items-center justify-around px-4 py-3 bg-slate-800/90 backdrop-blur-sm border-t border-slate-700/50">
          <BottomTab icon="🗺️" label="家园" active onClick={() => setViewMode('map')} />
          <BottomTab icon="🎨" label="像素工坊" onClick={() => setViewMode('generator')} />
          <BottomTab icon="📦" label="仓库" onClick={() => setViewMode('library')} />
        </div>
      )}
    </div>
  );
};

// 底部 Tab 按钮
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
