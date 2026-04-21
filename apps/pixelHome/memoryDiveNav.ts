/**
 * Memory Dive — 房间导航顺序
 *
 * 新版剧本流程：角色不再走向家具，只在房间里说话。
 * 这里只保留「下一个该去哪个房间」的逻辑。
 */

import type { MemoryRoom } from '../../utils/memoryPalace/types';

/** 引导顺序——从客厅日常逐步进入内心深处，阁楼最后 */
export const GUIDED_ROOM_ORDER: MemoryRoom[] = [
  'living_room', 'bedroom', 'study', 'self_room', 'user_room', 'windowsill', 'attic',
];

/** 角色站位点（每个房间固定一个脚底点，LLM 不决定位置） */
export function roomCharPos(_roomId: MemoryRoom): { x: number; y: number } {
  return { x: 52, y: 72 };
}

/** 用户小人斜后跟随 */
export function userPos(charX: number, charY: number): { x: number; y: number } {
  return {
    x: Math.max(8, Math.min(92, charX - 10)),
    y: Math.max(42, Math.min(95, charY + 4)),
  };
}

/** 角色在一个房间里 beat 之间的轻微漂移，让画面活一点 */
export function jitterPos(base: { x: number; y: number }): { x: number; y: number } {
  const jx = (Math.random() - 0.5) * 18; // ±9%
  const jy = (Math.random() - 0.5) * 10; // ±5%
  return {
    x: Math.max(18, Math.min(82, base.x + jx)),
    y: Math.max(58, Math.min(86, base.y + jy)),
  };
}

/**
 * 选下一个房间。优先 LLM 推荐，否则按固定顺序取第一个未访问过的房间；
 * 全部访问完返回 null。
 */
export function pickNextRoom(
  currentRoom: MemoryRoom,
  visitedRooms: MemoryRoom[],
  preferred?: MemoryRoom,
): MemoryRoom | null {
  if (preferred && preferred !== currentRoom && !visitedRooms.includes(preferred)) {
    return preferred;
  }
  const idx = GUIDED_ROOM_ORDER.indexOf(currentRoom);
  for (let i = idx + 1; i < GUIDED_ROOM_ORDER.length; i++) {
    const r = GUIDED_ROOM_ORDER[i];
    if (!visitedRooms.includes(r)) return r;
  }
  for (const r of GUIDED_ROOM_ORDER) {
    if (!visitedRooms.includes(r)) return r;
  }
  return null;
}
