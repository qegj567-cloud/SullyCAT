/**
 * Memory Dive — 导航/目标选择
 *
 * 角色在记忆宫殿中自主移动的逻辑：
 *   - 在当前房间内优先走向未访问的家具
 *   - 房间内访问完毕后走到下一个房间
 *   - 支持 LLM 返回的 suggestNextRoom 覆盖默认顺序
 */

import type { MemoryRoom } from '../../utils/memoryPalace/types';
import type { PixelRoomLayout, PlacedFurniture } from './types';
import type { DiveSession } from './memoryDiveTypes';

/** 引导顺序——从客厅日常逐步进入内心深处，阁楼最后 */
export const GUIDED_ROOM_ORDER: MemoryRoom[] = [
  'living_room', 'bedroom', 'study', 'self_room', 'user_room', 'windowsill', 'attic',
];

/** 角色下一步要去哪里 */
export type DiveTarget =
  | { kind: 'slot'; slotId: string; x: number; y: number }
  | { kind: 'room'; roomId: MemoryRoom }
  | { kind: 'done' };

/**
 * 计算角色当前应去的站位。
 * 角色站在家具"前方稍下"（y +12%）模拟脚踩在家具前。
 */
export function standPosForFurniture(f: PlacedFurniture): { x: number; y: number } {
  return {
    x: Math.max(10, Math.min(90, f.x)),
    y: Math.max(40, Math.min(92, f.y + 12)),
  };
}

/** 房间的默认入口点（从门口进来的位置） */
export function roomEntryPos(_roomId: MemoryRoom): { x: number; y: number } {
  return { x: 50, y: 82 };
}

/** 用户小人跟随角色的偏移（斜后方） */
export function followerOffset(): { dx: number; dy: number } {
  return { dx: -10, dy: 4 };
}

/**
 * 根据会话状态和房间布局挑选下一个目标。
 *  - preferredRoom：LLM 建议的下一个房间（可选），优先于顺序
 */
export function pickNextTarget(
  session: DiveSession,
  layout: PixelRoomLayout | undefined,
  preferredRoom?: MemoryRoom,
): DiveTarget {
  const visited = session.roomStates.get(session.currentRoom)?.visitedSlots ?? new Set<string>();

  // 1) 当前房间内还有未访问的家具 → 走过去
  if (layout) {
    const unvisited = layout.furniture.filter(f => !visited.has(f.slotId) && f.assetId);
    if (unvisited.length > 0) {
      // 按 y 降序取离角色脚底较近的（简单启发：最靠下的先走）
      const sorted = [...unvisited].sort((a, b) => b.y - a.y);
      const next = sorted[0];
      const pos = standPosForFurniture(next);
      return { kind: 'slot', slotId: next.slotId, x: pos.x, y: pos.y };
    }
  }

  // 2) LLM 建议的房间优先
  if (preferredRoom && !session.visitedRooms.includes(preferredRoom)) {
    return { kind: 'room', roomId: preferredRoom };
  }

  // 3) 按顺序找下一个没去过的房间
  const idx = GUIDED_ROOM_ORDER.indexOf(session.currentRoom);
  for (let i = idx + 1; i < GUIDED_ROOM_ORDER.length; i++) {
    const r = GUIDED_ROOM_ORDER[i];
    if (!session.visitedRooms.includes(r)) return { kind: 'room', roomId: r };
  }
  for (const r of GUIDED_ROOM_ORDER) {
    if (!session.visitedRooms.includes(r)) return { kind: 'room', roomId: r };
  }

  // 4) 全部走完
  return { kind: 'done' };
}
