/**
 * Pixel Home — 资产仓库
 *
 * 管理所有像素化家具资产：预览、删除、批量导出。
 */

import React, { useState, useCallback } from 'react';
import type { PixelAsset } from './types';
import { PixelAssetDB } from './pixelHomeDb';

interface Props {
  assets: PixelAsset[];
  onChanged: () => void;
  onSelectAsset: (assetId: string) => void;
}

const AssetLibrary: React.FC<Props> = ({ assets, onChanged, onSelectAsset }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // 切换选中
  const toggleSelect = useCallback((id: string) => {
    if (!selectMode) {
      onSelectAsset(id);
      return;
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [selectMode, onSelectAsset]);

  // 删除选中
  const handleDeleteSelected = useCallback(async () => {
    for (const id of selectedIds) {
      await PixelAssetDB.delete(id);
    }
    setSelectedIds(new Set());
    setSelectMode(false);
    onChanged();
  }, [selectedIds, onChanged]);

  // 批量导出 ZIP
  const handleExportZip = useCallback(async () => {
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const toExport = selectMode
        ? assets.filter(a => selectedIds.has(a.id))
        : assets;

      for (const asset of toExport) {
        // data URI → blob
        const resp = await fetch(asset.pixelImage);
        const blob = await resp.blob();
        zip.file(`${asset.name}_${asset.pixelSize}px.png`, blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pixel_home_assets_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [assets, selectedIds, selectMode]);

  if (assets.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-6">
        <span className="text-4xl">📦</span>
        <p className="text-sm text-slate-400 text-center">仓库是空的</p>
        <p className="text-xs text-slate-500 text-center">去像素工坊上传图片生成家具吧</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 顶部操作栏 */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-700/50">
        <button
          onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            selectMode ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'
          }`}
        >
          {selectMode ? `已选 ${selectedIds.size}` : '多选'}
        </button>
        <div className="flex gap-2">
          {selectMode && selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white active:scale-95 transition-transform"
            >
              🗑 删除
            </button>
          )}
          <button
            onClick={handleExportZip}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white active:scale-95 transition-transform"
          >
            📥 导出ZIP
          </button>
        </div>
      </div>

      {/* 资产网格 */}
      <div className="flex-1 overflow-y-auto p-3 no-scrollbar">
        <div className="grid grid-cols-3 gap-2">
          {assets.map(asset => {
            const isSelected = selectedIds.has(asset.id);
            return (
              <button
                key={asset.id}
                onClick={() => toggleSelect(asset.id)}
                className={`relative bg-slate-800 rounded-xl overflow-hidden aspect-square border-2 transition-all active:scale-95 ${
                  isSelected ? 'border-amber-500' : 'border-transparent'
                }`}
              >
                <img
                  src={asset.pixelImage}
                  alt={asset.name}
                  className="w-full h-full object-contain p-2"
                  style={{ imageRendering: 'pixelated' }}
                  draggable={false}
                />
                {/* 调色板 */}
                <div className="absolute bottom-0 inset-x-0 flex h-1.5">
                  {asset.palette.map((c, i) => (
                    <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                {/* 名称 */}
                <span className="absolute bottom-2 inset-x-1 text-[8px] text-white text-center truncate drop-shadow-md">
                  {asset.name}
                </span>
                {/* 尺寸标签 */}
                <span className="absolute top-1 right-1 text-[8px] bg-black/50 text-slate-300 px-1 rounded">
                  {asset.pixelSize}px
                </span>
                {/* 多选勾 */}
                {selectMode && (
                  <div className={`absolute top-1 left-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    isSelected ? 'bg-amber-500 border-amber-500' : 'border-slate-500'
                  }`}>
                    {isSelected && <span className="text-white text-[10px]">✓</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AssetLibrary;
