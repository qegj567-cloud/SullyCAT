/**
 * Memory Palace — 关联网络 (Memory Links)
 *
 * 记忆之间的五种连接：temporal, emotional, causal, person, metaphor。
 * 自动建立 temporal 和 emotional 关联，其他类型在后续版本用 LLM 判断。
 */

import type { MemoryNode, MemoryLink, LinkType } from './types';
import { MemoryLinkDB } from './db';

const TEMPORAL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 小时
const CO_ACTIVATION_INCREMENT = 0.05;
const MAX_STRENGTH = 1.0;

function generateId(): string {
    return `ml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 为新记忆节点建立关联
 *
 * 当前自动建立两种：
 * 1. temporal — 24h 内创建的记忆互相关联
 * 2. emotional — 相同 mood 标签的记忆关联
 */
export async function buildLinks(
    newNodes: MemoryNode[],
    existingNodes: MemoryNode[],
): Promise<MemoryLink[]> {
    const links: MemoryLink[] = [];
    const linkSet = new Set<string>(); // 防重复：`${sourceId}-${targetId}-${type}`

    for (const newNode of newNodes) {
        for (const existing of existingNodes) {
            if (newNode.id === existing.id) continue;

            // 1. Temporal: 24h 内创建
            if (Math.abs(newNode.createdAt - existing.createdAt) < TEMPORAL_WINDOW_MS) {
                const key = makeKey(newNode.id, existing.id, 'temporal');
                if (!linkSet.has(key)) {
                    links.push(createLink(newNode.id, existing.id, 'temporal', 0.3));
                    linkSet.add(key);
                }
            }

            // 2. Emotional: 相同 mood
            if (newNode.mood && existing.mood && newNode.mood === existing.mood && newNode.mood !== 'neutral') {
                const key = makeKey(newNode.id, existing.id, 'emotional');
                if (!linkSet.has(key)) {
                    links.push(createLink(newNode.id, existing.id, 'emotional', 0.4));
                    linkSet.add(key);
                }
            }
        }

        // 同批次内的节点也建立关联
        for (const other of newNodes) {
            if (newNode.id === other.id) continue;

            // 同一个 box 内的记忆有 temporal 关联
            if (newNode.boxId === other.boxId) {
                const key = makeKey(newNode.id, other.id, 'temporal');
                if (!linkSet.has(key)) {
                    links.push(createLink(newNode.id, other.id, 'temporal', 0.5));
                    linkSet.add(key);
                }
            }

            // Emotional
            if (newNode.mood && other.mood && newNode.mood === other.mood && newNode.mood !== 'neutral') {
                const key = makeKey(newNode.id, other.id, 'emotional');
                if (!linkSet.has(key)) {
                    links.push(createLink(newNode.id, other.id, 'emotional', 0.4));
                    linkSet.add(key);
                }
            }
        }
    }

    // 批量保存
    if (links.length > 0) {
        await MemoryLinkDB.saveMany(links);
        console.log(`🔗 [Links] Created ${links.length} links`);
    }

    return links;
}

/**
 * 共同激活：当多条记忆同时被检索命中时，加强它们之间的关联
 */
export async function strengthenCoActivated(nodeIds: string[]): Promise<void> {
    if (nodeIds.length < 2) return;

    for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
            const links = await MemoryLinkDB.getBySourceId(nodeIds[i]);
            const existingLink = links.find(l => l.targetId === nodeIds[j]);

            if (existingLink) {
                // 加强现有关联
                existingLink.strength = Math.min(
                    MAX_STRENGTH,
                    existingLink.strength + CO_ACTIVATION_INCREMENT
                );
                await MemoryLinkDB.save(existingLink);
            }
            // 也检查反向
            else {
                const reverseLinks = await MemoryLinkDB.getBySourceId(nodeIds[j]);
                const reverseLink = reverseLinks.find(l => l.targetId === nodeIds[i]);
                if (reverseLink) {
                    reverseLink.strength = Math.min(
                        MAX_STRENGTH,
                        reverseLink.strength + CO_ACTIVATION_INCREMENT
                    );
                    await MemoryLinkDB.save(reverseLink);
                }
                // 两个被共同激活的节点如果没有已有关联，创建一条新的 temporal 关联
                else {
                    const link = createLink(nodeIds[i], nodeIds[j], 'temporal', CO_ACTIVATION_INCREMENT);
                    await MemoryLinkDB.save(link);
                }
            }
        }
    }
}

// ─── 工具函数 ──────────────────────────────────────────

function createLink(sourceId: string, targetId: string, type: LinkType, strength: number): MemoryLink {
    return {
        id: generateId(),
        sourceId,
        targetId,
        type,
        strength,
    };
}

/** 生成去重 key（确保 A-B 和 B-A 视为同一对） */
function makeKey(id1: string, id2: string, type: string): string {
    const [a, b] = id1 < id2 ? [id1, id2] : [id2, id1];
    return `${a}-${b}-${type}`;
}
