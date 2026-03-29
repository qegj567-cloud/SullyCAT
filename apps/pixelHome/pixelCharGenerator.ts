/**
 * Pixel Home — 像素小人生成器
 *
 * 16×16 chibi 风格的像素角色，Canvas 逐像素绘制。
 * 可配置：发型、发色、眼色、肤色、服装色。
 * 生成后用于在房间里走动。
 */

// ─── 配置类型 ────────────────────────────────────────

export interface PixelCharConfig {
  hairStyle: number;    // 0-5
  hairColor: string;    // hex
  eyeColor: string;     // hex
  skinTone: string;     // hex
  outfitColor: string;  // hex
  outfitColor2: string; // hex (次要色)
}

export const DEFAULT_CONFIG: PixelCharConfig = {
  hairStyle: 0,
  hairColor: '#2d3748',
  eyeColor: '#63b3ed',
  skinTone: '#fcd5b4',
  outfitColor: '#2d3748',
  outfitColor2: '#4a5568',
};

// ─── 预设配色 ────────────────────────────────────────

export const HAIR_COLORS = [
  '#2d3748', '#1a1a2e', '#4a3728', '#8b6914',
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

// ─── 发型数据（16×16 像素矩阵，1=有头发）─────────

// 每个发型是一组 [x, y] 坐标
const HAIR_STYLES: [number, number][][] = [
  // 0: 短发（男生向）
  [
    [5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
    [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
    [4,3],[5,3],[11,3],
    [3,4],[4,4],[11,4],[12,4],
    [3,5],[12,5],
    [3,6],[12,6],
  ],
  // 1: 中长发（齐肩）
  [
    [5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
    [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
    [4,3],[5,3],[11,3],
    [3,4],[4,4],[11,4],[12,4],
    [3,5],[12,5],
    [3,6],[12,6],
    [3,7],[12,7],
    [3,8],[12,8],
    [3,9],[4,9],[11,9],[12,9],
  ],
  // 2: 长发
  [
    [5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
    [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
    [4,3],[5,3],[11,3],
    [3,4],[4,4],[11,4],[12,4],
    [3,5],[12,5],
    [3,6],[12,6],
    [3,7],[12,7],
    [3,8],[12,8],
    [3,9],[12,9],
    [3,10],[12,10],
    [3,11],[4,11],[11,11],[12,11],
    [4,12],[11,12],
  ],
  // 3: 马尾（右侧）
  [
    [5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
    [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
    [4,3],[5,3],[11,3],
    [3,4],[4,4],[11,4],[12,4],
    [3,5],[12,5],
    [3,6],[12,6],
    // 马尾
    [12,4],[13,4],
    [13,5],[14,5],
    [13,6],[14,6],
    [13,7],[14,7],
    [13,8],
  ],
  // 4: 蓬松卷发
  [
    [4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],
    [3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],
    [3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[12,2],
    [3,3],[4,3],[5,3],[11,3],[12,3],
    [2,4],[3,4],[4,4],[11,4],[12,4],[13,4],
    [2,5],[3,5],[12,5],[13,5],
    [2,6],[3,6],[12,6],[13,6],
    [2,7],[3,7],[12,7],[13,7],
    [3,8],[12,8],
  ],
  // 5: 刘海遮眼
  [
    [5,1],[6,1],[7,1],[8,1],[9,1],[10,1],
    [4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
    [4,3],[5,3],[6,3],[7,3],[11,3],
    [3,4],[4,4],[5,4],[6,4],[11,4],[12,4],
    [3,5],[4,5],[5,5],[12,5],
    [3,6],[12,6],
    [3,7],[12,7],
  ],
];

// ─── 渲染函数 ────────────────────────────────────────

const SIZE = 16;
const SCALE = 4; // 展示放大

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

/** 颜色加深 */
function darken(hex: string, amount = 30): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

/** 颜色加亮 */
function lighten(hex: string, amount = 40): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

/**
 * 生成像素小人并返回 data URI。
 */
export function generatePixelChar(config: PixelCharConfig): string {
  const { hairStyle, hairColor, eyeColor, skinTone, outfitColor, outfitColor2 } = config;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, SIZE, SIZE);

  const skinDark = darken(skinTone, 25);
  const hairDark = darken(hairColor, 35);
  const outfitDark = darken(outfitColor, 30);
  const outfitLight = lighten(outfitColor2, 20);

  // ─── 身体轮廓（黑线）─────────
  const outline = '#1a1a1a';

  // ─── 头部（脸） ───────────
  // 脸部区域 5,3 ~ 10,8（6×6 椭圆）
  for (let y = 3; y <= 8; y++) {
    for (let x = 5; x <= 10; x++) {
      // 椭圆边界
      if (y === 3 && (x === 5 || x === 10)) continue;
      if (y === 8 && (x === 5 || x === 10)) continue;
      px(ctx, x, y, skinTone);
    }
  }
  // 脸部阴影（下半）
  for (let x = 6; x <= 9; x++) px(ctx, x, 8, skinDark);

  // ─── 眼睛 ─────────────
  // 左眼 6,5-6  右眼 9,5-6
  px(ctx, 6, 5, '#ffffff');
  px(ctx, 6, 6, eyeColor);
  px(ctx, 9, 5, '#ffffff');
  px(ctx, 9, 6, eyeColor);

  // 眼睛高光
  px(ctx, 6, 5, lighten(eyeColor, 80));
  px(ctx, 9, 5, lighten(eyeColor, 80));

  // ─── 嘴巴 ─────────────
  px(ctx, 7, 7, darken(skinTone, 40));
  px(ctx, 8, 7, darken(skinTone, 40));

  // ─── 头部轮廓 ─────────
  // 顶部
  for (let x = 6; x <= 9; x++) px(ctx, x, 2, outline);
  // 两侧
  for (let y = 3; y <= 7; y++) { px(ctx, 4, y, outline); px(ctx, 11, y, outline); }
  // 下巴
  px(ctx, 5, 8, outline); px(ctx, 10, 8, outline);
  for (let x = 5; x <= 10; x++) px(ctx, x, 9, outline);
  // 顶部连角
  px(ctx, 5, 2, outline); px(ctx, 10, 2, outline);

  // ─── 身体（上衣）─────────
  // 身体 6,10 ~ 9,13
  for (let y = 10; y <= 12; y++) {
    for (let x = 5; x <= 10; x++) {
      px(ctx, x, y, y === 10 ? outfitColor : outfitColor2);
    }
  }
  // 领口
  px(ctx, 7, 10, skinTone);
  px(ctx, 8, 10, skinTone);
  // 衣服阴影
  for (let x = 5; x <= 10; x++) px(ctx, x, 12, outfitDark);

  // 身体轮廓
  for (let y = 10; y <= 12; y++) { px(ctx, 4, y, outline); px(ctx, 11, y, outline); }

  // ─── 胳膊 ─────────────
  px(ctx, 4, 10, outfitColor);
  px(ctx, 4, 11, outfitColor2);
  px(ctx, 3, 11, skinTone);
  px(ctx, 11, 10, outfitColor);
  px(ctx, 11, 11, outfitColor2);
  px(ctx, 12, 11, skinTone);

  // ─── 腿 ───────────────
  px(ctx, 6, 13, outfitDark); px(ctx, 7, 13, outfitDark);
  px(ctx, 8, 13, outfitDark); px(ctx, 9, 13, outfitDark);
  // 鞋子
  px(ctx, 6, 14, outline); px(ctx, 7, 14, outline);
  px(ctx, 8, 14, outline); px(ctx, 9, 14, outline);

  // ─── 头发（最后画，覆盖脸部）────
  const hairData = HAIR_STYLES[hairStyle % HAIR_STYLES.length];
  for (const [hx, hy] of hairData) {
    px(ctx, hx, hy, hairColor);
  }
  // 头发高光（顶部第一行）
  const topRow = hairData.filter(([, hy]) => hy === Math.min(...hairData.map(([, y]) => y)));
  for (const [hx, hy] of topRow) {
    px(ctx, hx, hy, lighten(hairColor, 30));
  }
  // 头发轮廓
  for (const [hx, hy] of hairData) {
    // 如果上方没有头发像素，画轮廓
    if (!hairData.some(([x, y]) => x === hx && y === hy - 1)) {
      px(ctx, hx, hy - 1, hairDark);
    }
  }

  // ─── 放大到展示尺寸 ────
  const display = document.createElement('canvas');
  display.width = SIZE * SCALE;
  display.height = SIZE * SCALE;
  const dCtx = display.getContext('2d')!;
  dCtx.imageSmoothingEnabled = false;
  dCtx.drawImage(canvas, 0, 0, display.width, display.height);

  return display.toDataURL('image/png');
}

// ─── 缓存 ────────────────────────────────────────────

const _cache = new Map<string, string>();

export function getCachedPixelChar(config: PixelCharConfig): string {
  const key = JSON.stringify(config);
  if (_cache.has(key)) return _cache.get(key)!;
  const uri = generatePixelChar(config);
  _cache.set(key, uri);
  return uri;
}
