/**
 * Pixel Home — 像素小人捏人器
 *
 * 选发型/发色/眼色/肤色/服装 → 实时预览 → 画布二次编辑（点像素点）→ 保存
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { PixelCharConfig } from './pixelCharGenerator';
import {
  DEFAULT_CONFIG, generatePixelChar,
  HAIR_COLORS, EYE_COLORS, SKIN_TONES, OUTFIT_COLORS, HAIR_STYLE_NAMES,
} from './pixelCharGenerator';

interface Props {
  initial?: PixelCharConfig | null;
  onSave: (config: PixelCharConfig, imageUri: string) => void;
  onCancel: () => void;
}

const SIZE = 16;
const CANVAS_SCALE = 12; // 编辑画布每像素大小

const PixelCharEditor: React.FC<Props> = ({ initial, onSave, onCancel }) => {
  const [config, setConfig] = useState<PixelCharConfig>(initial || DEFAULT_CONFIG);
  const [drawMode, setDrawMode] = useState(false);
  const [drawColor, setDrawColor] = useState('#ff0000');
  const [isEraser, setIsEraser] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const isDrawing = useRef(false);

  const update = useCallback((partial: Partial<PixelCharConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  }, []);

  const previewUri = useMemo(() => {
    if (config.customSprite) return config.customSprite;
    return generatePixelChar(config);
  }, [config]);

  // 直接上传像素小人
  const handleUploadSprite = useCallback(async (file: File) => {
    if (!file.type.match(/^image\/(png|jpeg|webp|gif)/)) return;
    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setConfig(prev => ({ ...prev, customSprite: dataUri }));
  }, []);

  // 清除自定义精灵，恢复捏人模式
  const clearCustomSprite = useCallback(() => {
    setConfig(prev => {
      const { customSprite: _, ...rest } = prev;
      return rest as PixelCharConfig;
    });
  }, []);

  // 绘制编辑画布
  useEffect(() => {
    if (!drawMode || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // 先画棋盘底（透明指示）
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#2a2a3a' : '#323248';
        ctx.fillRect(x * CANVAS_SCALE, y * CANVAS_SCALE, CANVAS_SCALE, CANVAS_SCALE);
      }
    }

    // 画生成的角色（16x16 → 放大到画布）
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // 画网格线
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CANVAS_SCALE, 0);
        ctx.lineTo(i * CANVAS_SCALE, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * CANVAS_SCALE);
        ctx.lineTo(canvas.width, i * CANVAS_SCALE);
        ctx.stroke();
      }
    };
    img.src = previewUri;
  }, [drawMode, previewUri]);

  // 画布绘制
  const drawPixel = useCallback((e: React.PointerEvent | React.TouchEvent) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    const px = Math.floor((clientX - rect.left) / rect.width * SIZE);
    const py = Math.floor((clientY - rect.top) / rect.height * SIZE);
    if (px < 0 || px >= SIZE || py < 0 || py >= SIZE) return;

    const key = `${px},${py}`;
    setConfig(prev => {
      const customPixels = { ...(prev.customPixels || {}) };
      if (isEraser) {
        customPixels[key] = 'transparent';
      } else {
        customPixels[key] = drawColor;
      }
      return { ...prev, customPixels };
    });
  }, [drawColor, isEraser]);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    drawPixel(e);
  }, [drawPixel]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    drawPixel(e);
  }, [drawPixel]);

  const handleCanvasPointerUp = useCallback(() => {
    isDrawing.current = false;
  }, []);

  const clearCustom = useCallback(() => {
    setConfig(prev => ({ ...prev, customPixels: undefined }));
  }, []);

  const handleSave = useCallback(() => {
    onSave(config, previewUri);
  }, [config, previewUri, onSave]);

  const canvasSize = SIZE * CANVAS_SCALE;

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-3 no-scrollbar">
      {/* 预览 + 画布切换 */}
      <div className="flex flex-col items-center gap-2">
        {config.customSprite ? (
          <>
            <div className="w-24 h-24 bg-slate-800 rounded-xl border border-emerald-600/50 flex items-center justify-center p-2"
              style={{
                backgroundImage: 'linear-gradient(45deg, #1e293b 25%, transparent 25%, transparent 75%, #1e293b 75%), linear-gradient(45deg, #1e293b 25%, transparent 25%, transparent 75%, #1e293b 75%)',
                backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px',
              }}>
              <img src={config.customSprite} alt="uploaded" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
            </div>
            <span className="text-[10px] text-emerald-400 font-medium">已导入自定义像素小人</span>
            <div className="flex gap-2">
              <button onClick={() => uploadRef.current?.click()}
                className="text-[10px] text-slate-400 hover:text-slate-200 underline">
                重新上传
              </button>
              <button onClick={clearCustomSprite}
                className="text-[10px] text-slate-400 hover:text-red-400 underline">
                清除，恢复捏人
              </button>
            </div>
          </>
        ) : drawMode ? (
          <>
            <canvas
              ref={canvasRef}
              width={canvasSize}
              height={canvasSize}
              className="rounded-lg border border-slate-600 touch-none"
              style={{ width: canvasSize, height: canvasSize, imageRendering: 'pixelated' }}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
            />
            {/* 画笔工具 */}
            <div className="flex items-center gap-2">
              <button onClick={() => setIsEraser(false)}
                className={`px-2 py-1 rounded text-[10px] font-bold ${!isEraser ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                画笔
              </button>
              <button onClick={() => setIsEraser(true)}
                className={`px-2 py-1 rounded text-[10px] font-bold ${isEraser ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                橡皮
              </button>
              <input type="color" value={drawColor} onChange={e => { setDrawColor(e.target.value); setIsEraser(false); }}
                className="w-6 h-6 rounded border-0 cursor-pointer" />
              <button onClick={clearCustom}
                className="px-2 py-1 rounded text-[10px] font-bold bg-slate-700 text-slate-300">
                清除手绘
              </button>
            </div>
          </>
        ) : (
          <div className="w-24 h-24 bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-center p-2">
            <img src={previewUri} alt="preview" className="w-full h-full" style={{ imageRendering: 'pixelated' }} draggable={false} />
          </div>
        )}
        {!config.customSprite && (
          <button onClick={() => setDrawMode(!drawMode)}
            className="text-[10px] text-slate-400 hover:text-slate-200 underline">
            {drawMode ? '返回参数调整' : '打开画布编辑'}
          </button>
        )}
        {/* 上传像素小人入口 */}
        {!config.customSprite && !drawMode && (
          <button onClick={() => uploadRef.current?.click()}
            className="text-[10px] text-emerald-400 hover:text-emerald-300 underline">
            直接上传像素小人
          </button>
        )}
        <input ref={uploadRef} type="file" accept="image/png,image/webp,image/jpeg,image/gif" className="hidden"
          onChange={e => { if (e.target.files?.[0]) { handleUploadSprite(e.target.files[0]); e.target.value = ''; } }} />
      </div>

      {/* 参数区（画布模式或自定义精灵模式下折叠） */}
      {!drawMode && !config.customSprite && (
        <>
          <Section title="发型">
            <div className="flex gap-1 flex-wrap">
              {HAIR_STYLE_NAMES.map((name, i) => (
                <button key={i} onClick={() => update({ hairStyle: i })}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    config.hairStyle === i ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'
                  }`}>
                  {name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="发色">
            <ColorPicker colors={HAIR_COLORS} selected={config.hairColor} onSelect={c => update({ hairColor: c })} />
          </Section>

          <Section title="眼睛">
            <ColorPicker colors={EYE_COLORS} selected={config.eyeColor} onSelect={c => update({ eyeColor: c })} />
          </Section>

          <Section title="肤色">
            <ColorPicker colors={SKIN_TONES} selected={config.skinTone} onSelect={c => update({ skinTone: c })} />
          </Section>

          <Section title="上衣">
            <ColorPicker colors={OUTFIT_COLORS} selected={config.outfitColor} onSelect={c => update({ outfitColor: c })} />
          </Section>

          <Section title="下装">
            <ColorPicker colors={OUTFIT_COLORS} selected={config.outfitColor2} onSelect={c => update({ outfitColor2: c })} />
          </Section>
        </>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={onCancel}
          className="flex-1 py-2.5 bg-slate-700 text-slate-300 text-xs font-bold rounded-xl active:scale-95 transition-transform">
          取消
        </button>
        <button onClick={handleSave}
          className="flex-1 py-2.5 bg-amber-500 text-white text-xs font-bold rounded-xl active:scale-95 transition-transform">
          保存角色
        </button>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">{title}</span>
    {children}
  </div>
);

const ColorPicker: React.FC<{ colors: string[]; selected: string; onSelect: (c: string) => void }> = ({ colors, selected, onSelect }) => (
  <div className="flex gap-1.5 flex-wrap">
    {colors.map(c => (
      <button key={c} onClick={() => onSelect(c)}
        className={`w-6 h-6 rounded-lg border-2 transition-all active:scale-90 ${
          selected === c ? 'border-white scale-110' : 'border-transparent'
        }`}
        style={{ backgroundColor: c }}
      />
    ))}
  </div>
);

export default PixelCharEditor;
