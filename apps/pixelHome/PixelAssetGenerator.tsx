/**
 * Pixel Home — 像素资产生成器
 *
 * 上传图片 → 背景去除 → 像素化 → 调色板提取 → 存入仓库
 */

import React, { useState, useRef, useCallback } from 'react';
import type { PixelAsset } from './types';
import { PixelAssetDB } from './pixelHomeDb';
import { pixelizeImage, removeBackground } from '../../utils/pixelizer';
import { extractPalette, applyPalette } from '../../utils/paletteExtractor';
import { processImage } from '../../utils/file';

interface Props {
  onGenerated: () => void;
}

interface PendingImage {
  id: string;
  name: string;
  originalDataUri: string;
  pixelDataUri?: string;
  palette?: string[];
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
}

const PIXEL_SIZES = [24, 32, 48, 64];

const PixelAssetGenerator: React.FC<Props> = ({ onGenerated }) => {
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [pixelSize, setPixelSize] = useState(32);
  const [paletteCount, setPaletteCount] = useState(8);
  const [removeBg, setRemoveBg] = useState(true);
  const [generating, setGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理文件上传
  const handleFiles = useCallback(async (files: FileList) => {
    const newPending: PendingImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.match(/^image\/(png|jpeg|webp)/)) continue;
      try {
        const dataUri = await processImage(file, { maxWidth: 512, skipCompression: true });
        newPending.push({
          id: `upload_${Date.now()}_${i}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          originalDataUri: dataUri,
          status: 'pending',
        });
      } catch (err) {
        console.error('Failed to process image:', err);
      }
    }
    setPending(prev => [...prev, ...newPending]);
  }, []);

  // 拖拽上传
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // 删除待处理项
  const removePending = useCallback((id: string) => {
    setPending(prev => prev.filter(p => p.id !== id));
  }, []);

  // 批量生成
  const handleGenerate = useCallback(async () => {
    if (pending.length === 0) return;
    setGenerating(true);

    const results: PixelAsset[] = [];

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      if (item.status === 'done') continue;

      setPending(prev => prev.map(p => p.id === item.id ? { ...p, status: 'processing' } : p));

      try {
        // 1. 加载图片到 Canvas
        const img = await loadImage(item.originalDataUri);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // 2. 背景去除
        if (removeBg) {
          imageData = removeBackground(imageData);
          ctx.putImageData(imageData, 0, 0);
        }

        // 3. 提取调色板
        const palette = extractPalette(imageData, paletteCount);

        // 4. 像素化 + 应用调色板
        const pixelResult = pixelizeImage(imageData, pixelSize, palette);

        // 5. 渲染到展示 Canvas（放大像素）
        const displayScale = 4;
        const displayCanvas = document.createElement('canvas');
        displayCanvas.width = pixelResult.width * displayScale;
        displayCanvas.height = pixelResult.height * displayScale;
        const dCtx = displayCanvas.getContext('2d')!;
        dCtx.imageSmoothingEnabled = false;

        // 先画到小 canvas
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = pixelResult.width;
        smallCanvas.height = pixelResult.height;
        const sCtx = smallCanvas.getContext('2d')!;
        sCtx.putImageData(pixelResult.imageData, 0, 0);

        // 放大到展示 canvas
        dCtx.drawImage(smallCanvas, 0, 0, displayCanvas.width, displayCanvas.height);
        const pixelDataUri = displayCanvas.toDataURL('image/png');

        // 6. 存入结果
        const asset: PixelAsset = {
          id: `pa_${Date.now()}_${i}`,
          name: item.name,
          originalImage: item.originalDataUri,
          pixelImage: pixelDataUri,
          pixelSize,
          palette,
          width: pixelResult.width,
          height: pixelResult.height,
          createdAt: Date.now(),
          tags: [],
        };
        results.push(asset);

        setPending(prev => prev.map(p => p.id === item.id
          ? { ...p, status: 'done', pixelDataUri, palette }
          : p
        ));
      } catch (err: any) {
        console.error('Pixelize failed:', err);
        setPending(prev => prev.map(p => p.id === item.id
          ? { ...p, status: 'error', error: err.message }
          : p
        ));
      }
    }

    // 批量保存
    if (results.length > 0) {
      await PixelAssetDB.saveBatch(results);
      onGenerated();
    }
    setGenerating(false);
  }, [pending, pixelSize, paletteCount, removeBg, onGenerated]);

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4 no-scrollbar">
      {/* 上传区 */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-slate-600 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-amber-500/50 transition-colors min-h-[120px]"
      >
        <span className="text-3xl">🖼️</span>
        <span className="text-xs text-slate-400 font-medium">点击或拖拽上传图片</span>
        <span className="text-[10px] text-slate-500">支持 PNG / WebP / JPEG，可批量上传</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          multiple
          className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* 参数控制 */}
      <div className="bg-slate-800/60 rounded-xl p-3 space-y-3">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">生成参数</h4>

        {/* 像素尺寸 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-300 w-16">像素尺寸</span>
          <div className="flex gap-1 flex-1">
            {PIXEL_SIZES.map(s => (
              <button
                key={s}
                onClick={() => setPixelSize(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  pixelSize === s ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* 调色板颜色数 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-300 w-16">调色板</span>
          <input
            type="range"
            min={4}
            max={16}
            value={paletteCount}
            onChange={e => setPaletteCount(parseInt(e.target.value))}
            className="flex-1 h-1 accent-amber-500"
          />
          <span className="text-xs text-slate-400 w-6 text-right">{paletteCount}</span>
        </div>

        {/* 背景去除 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-300">自动去除背景</span>
          <button
            onClick={() => setRemoveBg(!removeBg)}
            className={`w-10 h-5 rounded-full transition-colors ${removeBg ? 'bg-amber-500' : 'bg-slate-600'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${removeBg ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {/* 待处理列表 */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            待处理 ({pending.length})
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {pending.map(item => (
              <div key={item.id} className="relative bg-slate-800 rounded-xl overflow-hidden aspect-square">
                <img
                  src={item.pixelDataUri || item.originalDataUri}
                  alt={item.name}
                  className="w-full h-full object-contain p-2"
                  style={item.pixelDataUri ? { imageRendering: 'pixelated' } : undefined}
                />
                {/* 状态指示 */}
                <div className="absolute top-1 right-1">
                  {item.status === 'pending' && <span className="text-xs">⏳</span>}
                  {item.status === 'processing' && <span className="text-xs animate-spin">⚙️</span>}
                  {item.status === 'done' && <span className="text-xs">✅</span>}
                  {item.status === 'error' && <span className="text-xs">❌</span>}
                </div>
                {/* 删除 */}
                <button
                  onClick={() => removePending(item.id)}
                  className="absolute top-1 left-1 w-5 h-5 bg-black/50 rounded-full text-white text-[10px] flex items-center justify-center"
                >
                  ✕
                </button>
                {/* 调色板预览 */}
                {item.palette && (
                  <div className="absolute bottom-0 inset-x-0 flex h-2">
                    {item.palette.map((c, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                )}
                <span className="absolute bottom-2 left-1 right-1 text-[8px] text-white text-center truncate drop-shadow-md">
                  {item.name}
                </span>
              </div>
            ))}
          </div>

          {/* 生成按钮 */}
          <button
            onClick={handleGenerate}
            disabled={generating || pending.every(p => p.status === 'done')}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${
              generating
                ? 'bg-slate-700 text-slate-400 cursor-wait'
                : 'bg-amber-500 text-white hover:bg-amber-400'
            }`}
          >
            {generating ? '⚙️ 正在像素化...' : `🎨 批量生成 (${pending.filter(p => p.status === 'pending').length})`}
          </button>
        </div>
      )}
    </div>
  );
};

// 辅助：加载图片
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export default PixelAssetGenerator;
