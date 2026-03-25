/**
 * Memory Palace — 格式化输出
 *
 * 话题盒展开（拉取同盒兄弟记忆）+ Markdown 格式化注入 Prompt。
 */

import type { Anticipation, MemoryNode, ScoredMemory } from './types';
import { ROOM_LABELS, ROOM_CONFIGS } from './types';
import { MemoryNodeDB } from './db';

function formatTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return '刚才';
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}个月前`;
    return `${Math.floor(months / 12)}年前`;
}

const MAX_BOX_SIBLINGS = 3; // 每个 boxId 最多补充 3 条兄弟记忆
const MAX_OUTPUT_MEMORIES = 12; // 最终输出最多 12 条

/**
 * 话题盒展开 + 格式化为 Markdown
 *
 * 1. 命中带 boxId 的记忆 → 拉取同盒兄弟（最多 3 条补充）
 * 2. 去重
 * 3. 格式化输出
 */
export async function expandAndFormat(
    results: ScoredMemory[],
    charId: string,
    anticipations: Anticipation[] = [],
): Promise<string> {
    if (results.length === 0 && anticipations.length === 0) return '';

    // 1. 话题盒展开
    const allNodes = new Map<string, MemoryNode>();
    const orderedIds: string[] = [];

    for (const r of results) {
        if (!allNodes.has(r.node.id)) {
            allNodes.set(r.node.id, r.node);
            orderedIds.push(r.node.id);
        }
    }

    // 找到 boxId → 拉取兄弟
    const expandedBoxIds = new Set<string>();
    for (const r of results) {
        if (r.node.boxId && !expandedBoxIds.has(r.node.boxId)) {
            expandedBoxIds.add(r.node.boxId);
            const siblings = await MemoryNodeDB.getByBoxId(r.node.boxId);
            let added = 0;
            for (const sib of siblings) {
                if (!allNodes.has(sib.id) && added < MAX_BOX_SIBLINGS) {
                    allNodes.set(sib.id, sib);
                    orderedIds.push(sib.id);
                    added++;
                }
            }
        }
    }

    // 2. 截断到最大数量
    const finalIds = orderedIds.slice(0, MAX_OUTPUT_MEMORIES);

    // 3. 格式化
    let output = `### 记忆宫殿 (Memory Palace)\n\n`;

    // 按房间分组
    const byRoom = new Map<string, MemoryNode[]>();
    for (const id of finalIds) {
        const node = allNodes.get(id)!;
        const roomKey = node.room;
        if (!byRoom.has(roomKey)) byRoom.set(roomKey, []);
        byRoom.get(roomKey)!.push(node);
    }

    // 房间输出顺序：卧室 > 客厅 > 书房 > 用户房间 > 自我房间 > 阁楼 > 窗台
    const roomOrder = ['bedroom', 'living_room', 'study', 'user_room', 'self_room', 'attic', 'windowsill'];

    for (const room of roomOrder) {
        const nodes = byRoom.get(room);
        if (!nodes || nodes.length === 0) continue;

        const roomLabel = ROOM_LABELS[room as keyof typeof ROOM_LABELS] || room;
        const roomDesc = ROOM_CONFIGS[room as keyof typeof ROOM_CONFIGS]?.description || '';

        for (const node of nodes) {
            const date = new Date(node.createdAt).toLocaleDateString('zh-CN');
            const ago = formatTimeAgo(node.createdAt);
            output += `**[${roomLabel} · ${roomDesc}]** (${date}, ${ago}, 重要性: ${node.importance})\n`;
            output += `${node.content}\n\n`;
        }
    }

    // 4. 窗台期盼附加输出
    const activeAnticipations = anticipations.filter(a => a.status === 'active' || a.status === 'anchor');
    if (activeAnticipations.length > 0) {
        output += `> **窗台期盼**:\n`;
        for (const ant of activeAnticipations) {
            const label = ant.status === 'anchor' ? '🔒 锚点' : '✨ 期盼';
            output += `> - ${label}: ${ant.content}\n`;
        }
        output += `\n`;
    }

    return output.trim();
}
