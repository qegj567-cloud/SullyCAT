/**
 * Pixel Home — 像素家园类型定义
 */

import type { MemoryRoom } from '../../utils/memoryPalace/types';

// ─── 像素资产 ─────────────────────────────────────────

export interface PixelAsset {
  id: string;
  name: string;
  originalImage: string;      // 原始图片 data URI
  pixelImage: string;         // 像素化后 data URI
  pixelSize: number;          // 24/32/48/64
  palette: string[];          // 提取的调色板颜色 (hex)
  width: number;              // 像素宽
  height: number;             // 像素高
  createdAt: number;
  tags: string[];
}

// ─── 房间槽位定义（保留作为默认家具模板） ─────────────

export interface RoomSlotDef {
  id: string;
  name: string;
  category: string;
  required: boolean;
  defaultX: number;
  defaultY: number;
  defaultScale: number;
}

// ─── 已放置的家具（支持自由放置）─────────────────────

export interface PlacedFurniture {
  slotId: string;             // 默认家具用槽位 ID，用户自由放置用 unique ID
  assetId: string | null;     // 像素资产 ID（null = 使用默认像素图）
  x: number;
  y: number;
  scale: number;
  rotation: number;
  colorOverride?: string;
  placedBy: 'user' | 'character';
  isDefault?: boolean;        // 是否为默认槽位家具（false/undefined = 用户自由放置）
  /**
   * 前后遮挡手动覆盖：
   *   'front' = 总是压在其他家具上方
   *   'back'  = 总是垫在其他家具下方（但仍在地毯之上）
   *   undefined / 'auto' = 按家具底边自动排
   */
  zOrder?: 'auto' | 'front' | 'back';
}

// ─── 单个房间布局 ─────────────────────────────────────

export interface PixelRoomLayout {
  roomId: MemoryRoom;
  charId: string;
  furniture: PlacedFurniture[];
  wallColor: string;
  floorColor: string;
  ambiance: string;
  lastUpdatedAt: number;
  lastDecoratedBy: 'user' | 'character';
}

// ─── 整个家园状态 ─────────────────────────────────────

export interface PixelHomeState {
  charId: string;
  rooms: PixelRoomLayout[];
  lastLLMDecoration: number;
}

// ─── LLM 装修动作 ─────────────────────────────────────

export type DecorationActionType = 'move' | 'recolor' | 'rescale' | 'set_wall' | 'set_floor' | 'set_ambiance';

export interface DecorationAction {
  type: DecorationActionType;
  roomId: MemoryRoom;
  slotId?: string;
  x?: number;
  y?: number;
  scale?: number;
  color?: string;
  ambiance?: string;
}

export interface DecorationDiff {
  charId: string;
  actions: DecorationAction[];
  summary: string;
  timestamp: number;
}

// ─── 视图状态 ─────────────────────────────────────────

export type PixelHomeViewMode = 'map' | 'room' | 'generator' | 'library' | 'charEditor' | 'dive';

// ─── 房屋预设（导入/导出）─────────────────────────────

export interface PixelHomePreset {
  version: 1;
  name: string;
  author: string;
  createdAt: number;
  rooms: PixelRoomPreset[];
  assets: PixelAssetPreset[];   // 包含的像素资产（用到的才导出）
}

/** 房间预设（去掉 charId，便于跨角色导入） */
export interface PixelRoomPreset {
  roomId: MemoryRoom;
  furniture: PlacedFurniture[];
  wallColor: string;
  floorColor: string;
  ambiance: string;
}

/** 精简版资产（仅包含渲染需要的信息） */
export interface PixelAssetPreset {
  id: string;
  name: string;
  pixelImage: string;
  pixelSize: number;
  palette: string[];
  width: number;
  height: number;
}
