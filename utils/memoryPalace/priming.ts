/**
 * Memory Palace — 启动效应 (Priming) + 反刍 (Rumination)
 *
 * 启动效应：当前情绪偏置检索结果（开心时更容易想起开心的事）
 * 反刍：阁楼里的记忆有概率"不请自来"地浮现
 */

import type { MemoryNode, ScoredMemory } from './types';
import { MemoryNodeDB } from './db';

const PRIMING_BOOST = 1.3; // 情绪匹配时 score 乘以 1.3

/**
 * 启动效应：当前情绪匹配的记忆提升分数
 */
export function applyPriming(results: ScoredMemory[], currentMood: string): ScoredMemory[] {
    if (!currentMood || currentMood === 'neutral') return results;

    return results.map(r => {
        if (r.node.mood === currentMood) {
            return { ...r, finalScore: r.finalScore * PRIMING_BOOST };
        }
        return r;
    });
}

/**
 * 反刍检查：阁楼记忆有概率随机浮现
 *
 * 反刍概率 = tendency × 0.2（最高 20%）
 *
 * @param charId 角色 ID
 * @param tendency 反刍倾向 0-1，默认 0.3
 * @returns 一条随机阁楼记忆，或 null
 */
export async function checkRumination(
    charId: string,
    tendency: number = 0.3,
): Promise<MemoryNode | null> {
    const probability = Math.min(tendency, 1) * 0.2;

    if (Math.random() > probability) return null;

    // 从阁楼随机取一条
    const atticNodes = await MemoryNodeDB.getByRoom(charId, 'attic');
    if (atticNodes.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * atticNodes.length);
    return atticNodes[randomIndex];
}
