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

// ─── 房间槽位定义 ─────────────────────────────────────

export interface RoomSlotDef {
  id: string;
  name: string;               // 中文名
  category: string;           // 记忆映射分类描述
  required: boolean;
  defaultX: number;           // 默认位置 x (0-100%)
  defaultY: number;           // 默认位置 y (0-100%)
  defaultScale: number;       // 默认缩放
}

// ─── 已放置的家具 ─────────────────────────────────────

export interface PlacedFurniture {
  slotId: string;             // 对应 RoomSlotDef.id
  assetId: string | null;     // 用户自定义资产 ID（null = 使用默认像素图）
  x: number;                  // 当前位置 x (0-100%)
  y: number;                  // 当前位置 y (0-100%)
  scale: number;
  rotation: number;           // 旋转角度
  colorOverride?: string;     // LLM 换色后的覆盖色 (hex)
  placedBy: 'user' | 'character';
}

// ─── 单个房间布局 ─────────────────────────────────────

export interface PixelRoomLayout {
  roomId: MemoryRoom;
  charId: string;
  furniture: PlacedFurniture[];
  wallColor: string;          // 墙壁颜色 (hex 或 CSS gradient)
  floorColor: string;         // 地板颜色
  ambiance: string;           // LLM 设定的氛围描述
  lastUpdatedAt: number;
  lastDecoratedBy: 'user' | 'character';
}

// ─── 整个家园状态 ─────────────────────────────────────

export interface PixelHomeState {
  charId: string;
  rooms: PixelRoomLayout[];
  lastLLMDecoration: number;  // 上次角色装修时间戳
}

// ─── LLM 装修动作 ─────────────────────────────────────

export type DecorationActionType = 'move' | 'recolor' | 'rescale' | 'set_wall' | 'set_floor' | 'set_ambiance';

export interface DecorationAction {
  type: DecorationActionType;
  roomId: MemoryRoom;
  slotId?: string;            // move/recolor/rescale 时需要
  x?: number;
  y?: number;
  scale?: number;
  color?: string;             // recolor / set_wall / set_floor
  ambiance?: string;          // set_ambiance
}

export interface DecorationDiff {
  charId: string;
  actions: DecorationAction[];
  summary: string;            // 角色的装修感言
  timestamp: number;
}

// ─── 视图状态 ─────────────────────────────────────────

export type PixelHomeViewMode = 'map' | 'room' | 'generator' | 'library';
