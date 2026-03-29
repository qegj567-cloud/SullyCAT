/**
 * Pixel Home — 像素小人捏人器
 *
 * 选发型/发色/眼色/肤色/服装，实时预览生成的 16×16 chibi 像素角色。
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { PixelCharConfig } from './pixelCharGenerator';
import {
  DEFAULT_CONFIG, generatePixelChar,
  HAIR_COLORS, EYE_COLORS, SKIN_TONES, OUTFIT_COLORS,
} from './pixelCharGenerator';

interface Props {
  initial?: PixelCharConfig | null;
  onSave: (config: PixelCharConfig, imageUri: string) => void;
  onCancel: () => void;
}

const HAIR_STYLE_NAMES = ['短发', '齐肩', '长发', '马尾', '卷发', '刘海'];

const PixelCharEditor: React.FC<Props> = ({ initial, onSave, onCancel }) => {
  const [config, setConfig] = useState<PixelCharConfig>(initial || DEFAULT_CONFIG);

  const update = useCallback((partial: Partial<PixelCharConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  }, []);

  const previewUri = useMemo(() => generatePixelChar(config), [config]);

  const handleSave = useCallback(() => {
    onSave(config, previewUri);
  }, [config, previewUri, onSave]);

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4 no-scrollbar">
      {/* 预览 */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-24 h-24 bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-center p-2">
          <img src={previewUri} alt="preview" className="w-full h-full" style={{ imageRendering: 'pixelated' }} draggable={false} />
        </div>
        <span className="text-[10px] text-slate-500">16x16 像素角色预览</span>
      </div>

      {/* 发型 */}
      <Section title="发型">
        <div className="flex gap-1 flex-wrap">
          {HAIR_STYLE_NAMES.map((name, i) => (
            <button key={i} onClick={() => update({ hairStyle: i })}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                config.hairStyle === i ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'
              }`}>
              {name}
            </button>
          ))}
        </div>
      </Section>

      {/* 发色 */}
      <Section title="发色">
        <ColorPicker colors={HAIR_COLORS} selected={config.hairColor} onSelect={c => update({ hairColor: c })} />
      </Section>

      {/* 眼色 */}
      <Section title="眼睛">
        <ColorPicker colors={EYE_COLORS} selected={config.eyeColor} onSelect={c => update({ eyeColor: c })} />
      </Section>

      {/* 肤色 */}
      <Section title="肤色">
        <ColorPicker colors={SKIN_TONES} selected={config.skinTone} onSelect={c => update({ skinTone: c })} />
      </Section>

      {/* 服装主色 */}
      <Section title="上衣">
        <ColorPicker colors={OUTFIT_COLORS} selected={config.outfitColor} onSelect={c => update({ outfitColor: c })} />
      </Section>

      {/* 服装副色 */}
      <Section title="下装">
        <ColorPicker colors={OUTFIT_COLORS} selected={config.outfitColor2} onSelect={c => update({ outfitColor2: c })} />
      </Section>

      {/* 操作 */}
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
        className={`w-7 h-7 rounded-lg border-2 transition-all active:scale-90 ${
          selected === c ? 'border-white scale-110' : 'border-transparent'
        }`}
        style={{ backgroundColor: c }}
      />
    ))}
  </div>
);

export default PixelCharEditor;
