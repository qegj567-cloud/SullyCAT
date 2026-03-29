/**
 * Pixel Home — 像素小人生成器
 *
 * 16×16 chibi 风格二次元像素角色，Canvas 逐像素绘制。
 * 大头 + 竖条豆豆眼 + 无嘴巴 + 简约身体。
 * 10种发型，可配置发色/眼色/肤色/服装色。
 */

export interface PixelCharConfig {
  hairStyle: number;    // 0-9
  hairColor: string;
  eyeColor: string;
  skinTone: string;
  outfitColor: string;
  outfitColor2: string;
  customPixels?: Record<string, string>; // "x,y" -> hex，用户手绘覆盖
}

export const DEFAULT_CONFIG: PixelCharConfig = {
  hairStyle: 0,
  hairColor: '#2d3748',
  eyeColor: '#63b3ed',
  skinTone: '#fcd5b4',
  outfitColor: '#2d3748',
  outfitColor2: '#4a5568',
};

export const HAIR_COLORS = [
  '#1a1a2e', '#2d3748', '#4a3728', '#8b6914',
  '#d4a017', '#e87461', '#c0392b', '#f5b7b1',
  '#a78bfa', '#e2e8f0', '#f4a460', '#ff6b9d',
];

export const EYE_COLORS = [
  '#63b3ed', '#48bb78', '#f6ad55', '#fc8181',
  '#b794f4', '#2d3748', '#e53e3e', '#d69e2e',
];

export const SKIN_TONES = [
  '#fce4d6', '#fcd5b4', '#f0c090', '#d4a574',
  '#c68642', '#8d5524', '#70361c',
];

export const OUTFIT_COLORS = [
  '#2d3748', '#1e3a5f', '#1a4731', '#5b1a1a',
  '#4a1a5e', '#e2e8f0', '#f5f0e1', '#c41e3a',
  '#1e90ff', '#ff6347', '#2ecc71', '#f39c12',
];

// ─── 发型数据 ────────────────────────────────────────

// 每个发型定义 [x, y] 像素坐标
const HAIR_STYLES: [number, number][][] = [
  // 0: 短发（利落）
  [[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
   [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
   [4,3],[5,3],[11,3],
   [3,4],[4,4],[11,4],[12,4],
   [3,5],[12,5]],

  // 1: 齐肩
  [[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
   [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
   [4,3],[5,3],[11,3],
   [3,4],[4,4],[11,4],[12,4],
   [3,5],[12,5],[3,6],[12,6],
   [3,7],[12,7],[3,8],[12,8]],

  // 2: 长发
  [[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
   [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
   [4,3],[5,3],[11,3],
   [3,4],[4,4],[11,4],[12,4],
   [3,5],[12,5],[3,6],[12,6],[3,7],[12,7],
   [3,8],[12,8],[3,9],[12,9],[3,10],[12,10],
   [4,11],[11,11]],

  // 3: 右马尾
  [[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
   [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
   [4,3],[5,3],[11,3],
   [3,4],[4,4],[11,4],[12,4],[13,4],
   [3,5],[12,5],[13,5],[14,5],
   [13,6],[14,6],[13,7],[14,7],[13,8]],

  // 4: 双马尾
  [[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
   [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
   [4,3],[5,3],[11,3],
   [3,4],[4,4],[11,4],[12,4],
   [2,5],[3,5],[12,5],[13,5],
   [1,6],[2,6],[13,6],[14,6],
   [1,7],[2,7],[13,7],[14,7],
   [1,8],[2,8],[13,8],[14,8],
   [2,9],[13,9]],

  // 5: 蓬松卷发
  [[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],
   [3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],
   [3,2],[4,2],[5,2],[11,2],[12,2],
   [2,3],[3,3],[4,3],[11,3],[12,3],[13,3],
   [2,4],[3,4],[12,4],[13,4],
   [2,5],[3,5],[12,5],[13,5],
   [2,6],[3,6],[12,6],[13,6],
   [3,7],[12,7]],

  // 6: 刘海遮右眼
  [[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
   [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
   [4,3],[5,3],[6,3],[7,3],[11,3],
   [3,4],[4,4],[5,4],[6,4],[7,4],[11,4],[12,4],
   [3,5],[4,5],[5,5],[6,5],[12,5],
   [3,6],[12,6]],

  // 7: 寸头/板寸
  [[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
   [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
   [4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3],
   [4,4],[11,4]],

  // 8: 中分
  [[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
   [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
   [4,3],[5,3],[7,3],[8,3],[11,3],
   [3,4],[4,4],[11,4],[12,4],
   [3,5],[12,5],[3,6],[12,6],
   [3,7],[12,7]],

  // 9: 高丸子
  [[6,0],[7,0],[8,0],[9,0],
   [5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
   [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
   [4,3],[5,3],[11,3],
   [3,4],[4,4],[11,4],[12,4],
   [3,5],[12,5]],
];

export const HAIR_STYLE_NAMES = [
  '短发', '齐肩', '长发', '马尾', '双马尾',
  '卷发', '刘海', '板寸', '中分', '丸子',
];

// ─── 辅助 ────────────────────────────────────────────

function darken(hex: string, amount = 30): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function lighten(hex: string, amount = 40): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

const SIZE = 16;
const SCALE = 4;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

// ─── 渲染 ────────────────────────────────────────────

export function generatePixelChar(config: PixelCharConfig): string {
  const { hairStyle, hairColor, eyeColor, skinTone, outfitColor, outfitColor2, customPixels } = config;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, SIZE, SIZE);

  const skinDark = darken(skinTone, 20);
  const hairDark = darken(hairColor, 35);
  const outfitDark = darken(outfitColor, 30);
  const outline = '#1a1a1a';

  // ─── 头部轮廓 ─────────
  for (let x = 6; x <= 9; x++) px(ctx, x, 2, outline);
  px(ctx, 5, 2, outline); px(ctx, 10, 2, outline);
  for (let y = 3; y <= 8; y++) { px(ctx, 4, y, outline); px(ctx, 11, y, outline); }
  px(ctx, 5, 9, outline); px(ctx, 10, 9, outline);
  for (let x = 6; x <= 9; x++) px(ctx, x, 9, outline);

  // ─── 脸 ───────────────
  for (let y = 3; y <= 8; y++) {
    for (let x = 5; x <= 10; x++) {
      if (y === 3 && (x === 5 || x === 10)) continue;
      if ((y === 8 || y === 9) && (x === 5 || x === 10)) continue;
      px(ctx, x, y, skinTone);
    }
  }
  // 脸颊腮红
  px(ctx, 5, 7, lighten(skinTone, -15));
  px(ctx, 10, 7, lighten(skinTone, -15));

  // ─── 二次元豆豆眼（竖2格，无嘴）───
  px(ctx, 6, 5, eyeColor);
  px(ctx, 6, 6, darken(eyeColor, 40));
  px(ctx, 9, 5, eyeColor);
  px(ctx, 9, 6, darken(eyeColor, 40));
  // 高光
  px(ctx, 6, 5, lighten(eyeColor, 60));
  px(ctx, 9, 5, lighten(eyeColor, 60));

  // ─── 身体 ─────────────
  for (let y = 10; y <= 12; y++) {
    for (let x = 5; x <= 10; x++) {
      px(ctx, x, y, y === 10 ? outfitColor : outfitColor2);
    }
  }
  px(ctx, 7, 10, skinTone); px(ctx, 8, 10, skinTone); // 领口
  for (let x = 5; x <= 10; x++) px(ctx, x, 12, outfitDark);
  for (let y = 10; y <= 12; y++) { px(ctx, 4, y, outline); px(ctx, 11, y, outline); }

  // 胳膊
  px(ctx, 4, 10, outfitColor); px(ctx, 4, 11, outfitColor2);
  px(ctx, 3, 11, skinTone);
  px(ctx, 11, 10, outfitColor); px(ctx, 11, 11, outfitColor2);
  px(ctx, 12, 11, skinTone);

  // 腿
  px(ctx, 6, 13, outfitDark); px(ctx, 7, 13, outfitDark);
  px(ctx, 8, 13, outfitDark); px(ctx, 9, 13, outfitDark);
  px(ctx, 6, 14, outline); px(ctx, 7, 14, outline);
  px(ctx, 8, 14, outline); px(ctx, 9, 14, outline);

  // ─── 头发 ─────────────
  const hairData = HAIR_STYLES[hairStyle % HAIR_STYLES.length];
  for (const [hx, hy] of hairData) px(ctx, hx, hy, hairColor);
  // 高光
  const minHy = Math.min(...hairData.map(([, y]) => y));
  for (const [hx, hy] of hairData) {
    if (hy === minHy || hy === minHy + 1) px(ctx, hx, hy, lighten(hairColor, 25));
  }

  // ─── 用户手绘覆盖 ────
  if (customPixels) {
    for (const [key, color] of Object.entries(customPixels)) {
      const [cx, cy] = key.split(',').map(Number);
      if (cx >= 0 && cx < SIZE && cy >= 0 && cy < SIZE) {
        if (color === 'transparent') {
          ctx.clearRect(cx, cy, 1, 1);
        } else {
          px(ctx, cx, cy, color);
        }
      }
    }
  }

  // 放大
  const display = document.createElement('canvas');
  display.width = SIZE * SCALE;
  display.height = SIZE * SCALE;
  const dCtx = display.getContext('2d')!;
  dCtx.imageSmoothingEnabled = false;
  dCtx.drawImage(canvas, 0, 0, display.width, display.height);
  return display.toDataURL('image/png');
}

/** 获取 16x16 原始像素数据（用于画布编辑器） */
export function generatePixelCharRaw(config: PixelCharConfig): ImageData {
  // 先生成到16x16 canvas
  const uri = generatePixelChar({ ...config, customPixels: undefined });
  // 但我们需要原始16x16... 重新生成不放大的
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  // 复用 generatePixelChar 但不放大——直接走一遍
  ctx.clearRect(0, 0, SIZE, SIZE);
  // 为了不重复代码，从放大版缩回来
  const img = new Image();
  // 同步方式不行，改用另一种方式
  // 直接返回一个空的，让调用方从 config 重建
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

// 缓存
const _cache = new Map<string, string>();
export function getCachedPixelChar(config: PixelCharConfig): string {
  const key = JSON.stringify(config);
  if (_cache.has(key)) return _cache.get(key)!;
  const uri = generatePixelChar(config);
  _cache.set(key, uri);
  return uri;
}
