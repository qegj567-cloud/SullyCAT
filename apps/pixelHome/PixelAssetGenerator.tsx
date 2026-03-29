/**
 * Pixel Home — 像素资产生成器
 *
 * 上传图片 → 实时预览像素化效果 → 调参数实时刷新 → 确定后存入仓库
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { PixelAsset } from './types';
import { PixelAssetDB } from './pixelHomeDb';
import { pixelizeImage, removeBackground } from '../../utils/pixelizer';
import { extractPalette } from '../../utils/paletteExtractor';
import { processImage } from '../../utils/file';

interface Props {
  onGenerated: () => void;
}

interface PendingImage {
  id: string;
  name: string;
  originalDataUri: string;
  // 预处理缓存（背景去除后）
  processedData?: ImageData;
  processedWidth?: number;
  processedHeight?: number;
  // 实时预览结果
  previewUri?: string;
  previewPalette?: string[];
  previewW?: number;
  previewH?: number;
}

const PIXEL_SIZES = [24, 32, 48, 64];
const CATEGORY_OPTIONS = ['furniture', 'decor', 'plant', 'food', 'character', 'other'];
const CATEGORY_LABELS: Record<string, string> = {
  furniture: '家具', decor: '装饰', plant: '植物', food: '食物', character: '角色', other: '其他',
};

const PixelAssetGenerator: React.FC<Props> = ({ onGenerated }) => {
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [pixelSize, setPixelSize] = useState(32);
  const [paletteCount, setPaletteCount] = useState(8);
  const [removeBg, setRemoveBg] = useState(true);
  const [defaultCategory, setDefaultCategory] = useState('furniture');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>();

  // 上传文件 → 预处理（加载+可选去背景）→ 生成预览
  const handleFiles = useCallback(async (files: FileList) => {
    const newItems: PendingImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.match(/^image\/(png|jpeg|webp)/)) continue;
      try {
        const dataUri = await processImage(file, { maxWidth: 512, skipCompression: true });
        const img = await loadImage(dataUri);
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (removeBg) imageData = removeBackground(imageData);

        newItems.push({
          id: `upload_${Date.now()}_${i}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          originalDataUri: dataUri,
          processedData: imageData,
          processedWidth: canvas.width,
          processedHeight: canvas.height,
        });
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
    setPending(prev => [...prev, ...newItems]);
  }, [removeBg]);

  // 参数变化时，重新生成所有预览（防抖 200ms）
  useEffect(() => {
    if (pending.length === 0) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      regeneratePreviews();
    }, 200);
  }, [pixelSize, paletteCount, pending.length]);

  // 新上传的图片也立即生成预览
  useEffect(() => {
    const needsPreview = pending.filter(p => !p.previewUri && p.processedData);
    if (needsPreview.length > 0) regeneratePreviews();
  }, [pending]);

  // 重新生成所有预览
  const regeneratePreviews = useCallback(() => {
    setPending(prev => prev.map(item => {
      if (!item.processedData) return item;
      try {
        const palette = extractPalette(item.processedData, paletteCount);
        const result = pixelizeImage(item.processedData, pixelSize, palette);
        const uri = renderScaled(result.imageData, result.width, result.height, 4);
        return { ...item, previewUri: uri, previewPalette: palette, previewW: result.width, previewH: result.height };
      } catch {
        return item;
      }
    }));
  }, [pixelSize, paletteCount]);

  // 背景去除开关变化时，重新预处理所有图片
  const toggleRemoveBg = useCallback(async () => {
    const newVal = !removeBg;
    setRemoveBg(newVal);
    // 重新处理所有原始图片
    setPending(prev => prev.map(item => ({ ...item, processedData: undefined, previewUri: undefined })));
    const updated: PendingImage[] = [];
    for (const item of pending) {
      try {
        const img = await loadImage(item.originalDataUri);
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (newVal) imageData = removeBackground(imageData);
        updated.push({ ...item, processedData: imageData, processedWidth: canvas.width, processedHeight: canvas.height, previewUri: undefined });
      } catch {
        updated.push(item);
      }
    }
    setPending(updated);
  }, [removeBg, pending]);

  // 删除
  const removePending = useCallback((id: string) => {
    setPending(prev => prev.filter(p => p.id !== id));
  }, []);

  // 确定生成 → 存入仓库
  const handleConfirm = useCallback(async () => {
    const ready = pending.filter(p => p.previewUri);
    if (ready.length === 0) return;
    setSaving(true);

    const assets: PixelAsset[] = ready.map((item, i) => ({
      id: `pa_${Date.now()}_${i}`,
      name: item.name,
      originalImage: item.originalDataUri,
      pixelImage: item.previewUri!,
      pixelSize,
      palette: item.previewPalette || [],
      width: item.previewW || pixelSize,
      height: item.previewH || pixelSize,
      createdAt: Date.now(),
      tags: [defaultCategory],
    }));

    await PixelAssetDB.saveBatch(assets);
    onGenerated();
    setPending([]);
    setSaving(false);
  }, [pending, pixelSize, defaultCategory, onGenerated]);

  const readyCount = pending.filter(p => p.previewUri).length;

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4 no-scrollbar">
      {/* 上传区 */}
      <div onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files); }}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-slate-600 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-amber-500/50 transition-colors min-h-[100px]">
        <span className="text-sm text-slate-400 font-medium">点击或拖拽上传图片</span>
        <span className="text-[10px] text-slate-500">PNG / WebP / JPEG，可批量上传</span>
        <input ref={fileInputRef} type="file" accept="image/png,image/webp,image/jpeg" multiple className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)} />
      </div>

      {/* 参数（改参数实时刷新预览） */}
      <div className="bg-slate-800/60 rounded-xl p-3 space-y-3">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">生成参数</h4>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-300 w-16">像素尺寸</span>
          <div className="flex gap-1 flex-1">
            {PIXEL_SIZES.map(s => (
              <button key={s} onClick={() => setPixelSize(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${pixelSize === s ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-300 w-16">调色板</span>
          <input type="range" min={4} max={16} value={paletteCount}
            onChange={e => setPaletteCount(parseInt(e.target.value))}
            className="flex-1 h-1 accent-amber-500" />
          <span className="text-xs text-slate-400 w-6 text-right">{paletteCount}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-300">自动去除背景</span>
          <button onClick={toggleRemoveBg}
            className={`w-10 h-5 rounded-full transition-colors ${removeBg ? 'bg-amber-500' : 'bg-slate-600'}`}>
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${removeBg ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-300 w-16">分类</span>
          <div className="flex gap-1 flex-1 flex-wrap">
            {CATEGORY_OPTIONS.map(cat => (
              <button key={cat} onClick={() => setDefaultCategory(cat)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${defaultCategory === cat ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 预览列表 */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            预览 ({pending.length})
            <span className="text-slate-500 font-normal ml-1">调整参数实时刷新</span>
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {pending.map(item => (
              <div key={item.id} className="bg-slate-800 rounded-xl overflow-hidden">
                {/* 原图 vs 像素化对比 */}
                <div className="flex">
                  <div className="w-1/2 aspect-square bg-slate-900 flex items-center justify-center p-1">
                    <img src={item.originalDataUri} alt="原图" className="max-w-full max-h-full object-contain" draggable={false} />
                  </div>
                  <div className="w-1/2 aspect-square bg-slate-900/50 flex items-center justify-center p-1" style={{
                    backgroundImage: 'linear-gradient(45deg, #1e293b 25%, transparent 25%, transparent 75%, #1e293b 75%), linear-gradient(45deg, #1e293b 25%, transparent 25%, transparent 75%, #1e293b 75%)',
                    backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px',
                  }}>
                    {item.previewUri ? (
                      <img src={item.previewUri} alt="预览" className="max-w-full max-h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                    ) : (
                      <span className="text-[9px] text-slate-500">处理中...</span>
                    )}
                  </div>
                </div>
                {/* 信息栏 */}
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <span className="text-[9px] text-slate-300 truncate flex-1">{item.name}</span>
                  <button onClick={() => removePending(item.id)}
                    className="text-[9px] text-slate-500 hover:text-red-400 ml-1 shrink-0">移除</button>
                </div>
                {/* 调色板 */}
                {item.previewPalette && (
                  <div className="flex h-1.5">
                    {item.previewPalette.map((c, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 确定按钮 */}
          <button onClick={handleConfirm}
            disabled={saving || readyCount === 0}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${
              saving ? 'bg-slate-700 text-slate-400 cursor-wait'
                : readyCount > 0 ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-500'
            }`}>
            {saving ? '保存中...' : `确定生成 (${readyCount})`}
          </button>
        </div>
      )}
    </div>
  );
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function renderScaled(imageData: ImageData, w: number, h: number, scale: number): string {
  const small = document.createElement('canvas');
  small.width = w; small.height = h;
  small.getContext('2d')!.putImageData(imageData, 0, 0);
  const big = document.createElement('canvas');
  big.width = w * scale; big.height = h * scale;
  const ctx = big.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, big.width, big.height);
  return big.toDataURL('image/png');
}

export default PixelAssetGenerator;
