/**
 * Memory Palace — 关联网络 (Memory Links)
 *
 * 记忆之间的五种连接：temporal, emotional, causal, person, metaphor。
 * - temporal / emotional: 自动规则建立
 * - causal / person / metaphor: LLM 判断（每次封盒时对新记忆 vs Top-5 相似旧记忆做一次批量判断）
 */

import type { MemoryNode, MemoryLink, LinkType } from './types';
import type { LightLLMConfig } from './pipeline';
import { MemoryLinkDB } from './db';
import { safeFetchJson } from '../safeApi';

const TEMPORAL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 小时
const CO_ACTIVATION_INCREMENT = 0.05;
const MAX_STRENGTH = 1.0;

function generateId(): string {
    return `ml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── LLM 关联判断 ────────────────────────────────────

/**
 * 用 LLM 批量判断新记忆和候选旧记忆之间的深层关联
 * 一次调用判断一条新记忆 vs 最多 5 条旧记忆
 */
async function classifyDeepLinks(
    newNode: MemoryNode,
    candidates: MemoryNode[],
    llmConfig: LightLLMConfig,
): Promise<{ targetId: string; type: LinkType; strength: number }[]> {
    if (candidates.length === 0) return [];

    const candidateList = candidates
        .map((c, i) => `[${i}] (${c.room}, ${c.mood}): ${c.content.slice(0, 80)}`)
        .join('\n');

    const prompt = `你是一个记忆关联分析器。给你一条新记忆和几条旧记忆，判断它们之间是否存在以下三种深层关联：

- causal: 因果关系（一件事导致了另一件事）
- person: 提到了同一个人
- metaphor: 隐喻/类比关系（两件事虽然不同但有相似的情感模式或意义）

只输出存在关联的配对。严格 JSON 数组格式：
[{"index": 0, "type": "causal", "strength": 0.6}]

strength 范围 0.3-0.8，关联越强越高。
如果没有任何深层关联，返回空数组 []。`;

    const userMsg = `新记忆 (${newNode.room}, ${newNode.mood}): ${newNode.content}

候选旧记忆：
${candidateList}`;

    try {
        const data = await safeFetchJson(
            `${llmConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${llmConfig.apiKey}`,
                },
                body: JSON.stringify({
                    model: llmConfig.model,
                    messages: [
                        { role: 'system', content: prompt },
                        { role: 'user', content: userMsg },
                    ],
                    temperature: 0.2,
                    max_tokens: 500,
                }),
            }
        );

        const reply = data.choices?.[0]?.message?.content || '';
        const jsonMatch = reply.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const parsed = JSON.parse(jsonMatch[0]) as Array<{
            index: number; type: string; strength: number;
        }>;

        const validTypes: LinkType[] = ['causal', 'person', 'metaphor'];

        return parsed
            .filter(item =>
                typeof item.index === 'number' &&
                item.index >= 0 &&
                item.index < candidates.length &&
                validTypes.includes(item.type as LinkType)
            )
            .map(item => ({
                targetId: candidates[item.index].id,
                type: item.type as LinkType,
                strength: Math.max(0.3, Math.min(0.8, item.strength || 0.5)),
            }));

    } catch (err: any) {
        console.warn('⚡ [Links] LLM deep link classification failed:', err.message);
        return [];
    }
}

// ─── 主函数 ──────────────────────────────────────────

/**
 * 为新记忆节点建立关联
 *
 * 三层：
 * 1. temporal — 24h 内 / 同 box 自动建链
 * 2. emotional — 相同 mood 自动建链
 * 3. causal / person / metaphor — LLM 判断（如果提供了 llmConfig）
 *
 * @param llmConfig 可选。传入则启用 LLM 深层关联判断。
 */
export async function buildLinks(
    newNodes: MemoryNode[],
    existingNodes: MemoryNode[],
    llmConfig?: LightLLMConfig | null,
): Promise<MemoryLink[]> {
    const links: MemoryLink[] = [];
    const linkSet = new Set<string>();

    for (const newNode of newNodes) {
        // ─── 自动规则关联 ─────────────────────────

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

        // 同批次内的节点
        for (const other of newNodes) {
            if (newNode.id === other.id) continue;

            if (newNode.boxId === other.boxId) {
                const key = makeKey(newNode.id, other.id, 'temporal');
                if (!linkSet.has(key)) {
                    links.push(createLink(newNode.id, other.id, 'temporal', 0.5));
                    linkSet.add(key);
                }
            }

            if (newNode.mood && other.mood && newNode.mood === other.mood && newNode.mood !== 'neutral') {
                const key = makeKey(newNode.id, other.id, 'emotional');
                if (!linkSet.has(key)) {
                    links.push(createLink(newNode.id, other.id, 'emotional', 0.4));
                    linkSet.add(key);
                }
            }
        }

        // ─── LLM 深层关联（causal / person / metaphor）──

        if (llmConfig && existingNodes.length > 0) {
            // 取最近创建的 5 条旧记忆作为候选（避免全量判断太贵）
            const candidates = existingNodes
                .filter(n => n.id !== newNode.id)
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, 5);

            if (candidates.length > 0) {
                const deepLinks = await classifyDeepLinks(newNode, candidates, llmConfig);

                for (const dl of deepLinks) {
                    const key = makeKey(newNode.id, dl.targetId, dl.type);
                    if (!linkSet.has(key)) {
                        links.push(createLink(newNode.id, dl.targetId, dl.type, dl.strength));
                        linkSet.add(key);
                    }
                }
            }
        }
    }

    // 批量保存
    if (links.length > 0) {
        await MemoryLinkDB.saveMany(links);
        console.log(`🔗 [Links] Created ${links.length} links (temporal/emotional: auto, causal/person/metaphor: ${llmConfig ? 'LLM' : 'skipped'})`);
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
                existingLink.strength = Math.min(
                    MAX_STRENGTH,
                    existingLink.strength + CO_ACTIVATION_INCREMENT
                );
                await MemoryLinkDB.save(existingLink);
            }
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
