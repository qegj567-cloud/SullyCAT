/**
 * Memory Palace — 集成管线 (Pipeline)
 *
 * 对外暴露两个主要函数：
 * 1. retrieveMemories() — 检索管线，AI 回复前调用
 * 2. processNewMessages() — 输入管线，AI 回复后后台调用
 */

import type { APIConfig, Message } from '../../types';
import type { EmbeddingConfig, PersonalityStyle, ScoredMemory } from './types';
import { TopicLoomManager } from './topicLoom';
import { extractMemories } from './extraction';
import { vectorizeAndStore } from './vectorStore';
import { buildLinks } from './links';
import { strengthenCoActivated } from './links';
import { hybridSearch } from './hybridSearch';
import { spreadActivation } from './activation';
import { applyPriming, checkRumination } from './priming';
import { expandAndFormat } from './formatter';
import { runConsolidation } from './consolidation';
import { MemoryNodeDB, AnticipationDB, MemoryBatchDB } from './db';
import { DB } from '../db';

// ─── 检索管线（AI 回复前） ────────────────────────────

/**
 * 检索记忆并格式化为可注入 System Prompt 的 Markdown
 *
 * 完整流程：
 * 1. 取最近消息拼接查询
 * 2. 混合搜索（向量 + BM25 + 房间评分）
 * 3. 扩散激活
 * 4. 启动效应 + 反刍
 * 5. 话题盒展开 + 格式化
 */
export async function retrieveMemories(
    recentMessages: Message[],
    charId: string,
    embeddingConfig: EmbeddingConfig,
    apiConfig: APIConfig,
    currentMood?: string,
    personalityStyle: PersonalityStyle = 'emotional',
    ruminationTendency: number = 0.3,
): Promise<string> {
    try {
        // 1. 构建查询（最近 3 条消息内容拼接）
        const queryMessages = recentMessages.slice(-3);
        const query = queryMessages
            .map(m => m.content)
            .join('\n')
            .slice(0, 500); // 限制查询长度

        if (!query.trim()) return '';

        // 2. 混合搜索
        let results = await hybridSearch(query, charId, embeddingConfig);

        if (results.length === 0) return '';

        // 3. 扩散激活
        results = await spreadActivation(results, charId, personalityStyle);

        // 4. 启动效应
        if (currentMood) {
            results = applyPriming(results, currentMood);
        }

        // 重新排序
        results.sort((a, b) => b.finalScore - a.finalScore);

        // 5. 反刍
        const ruminatedNode = await checkRumination(charId, ruminationTendency);
        if (ruminatedNode) {
            // 将反刍记忆加入结果（中等分数）
            const avgScore = results.length > 0
                ? results.reduce((s, r) => s + r.finalScore, 0) / results.length
                : 0.5;
            results.push({
                node: ruminatedNode,
                finalScore: avgScore * 0.8,
                similarity: 0,
                bm25Score: 0,
                roomScore: avgScore * 0.8,
            });
        }

        // 6. 更新被检索记忆的访问记录
        const retrievedIds = results.map(r => r.node.id);
        for (const id of retrievedIds) {
            await MemoryNodeDB.touchAccess(id);
        }

        // 7. 共同激活加强关联
        if (retrievedIds.length >= 2) {
            await strengthenCoActivated(retrievedIds.slice(0, 5));
        }

        // 8. 获取期盼
        const anticipations = await AnticipationDB.getByCharId(charId);

        // 9. 格式化
        return await expandAndFormat(results, charId, anticipations);

    } catch (err: any) {
        console.error('⚡ [Pipeline] retrieveMemories failed:', err.message);
        return '';
    }
}

// ─── 输入管线（AI 回复后，后台） ──────────────────────

/** TopicLoomManager 实例缓存（per charId） */
const loomCache = new Map<string, TopicLoomManager>();

/**
 * 处理新消息：TopicLoom → 记忆提取 → 向量化 → 建立关联
 *
 * 应在 AI 回复后后台调用（不阻塞用户交互）。
 */
export async function processNewMessages(
    messages: Message[],
    charId: string,
    charName: string,
    embeddingConfig: EmbeddingConfig,
    apiConfig: APIConfig,
): Promise<void> {
    try {
        // 获取或创建 TopicLoomManager
        let loom = loomCache.get(charId);
        if (!loom) {
            loom = new TopicLoomManager(charId, apiConfig);
            await loom.init();
            loomCache.set(charId, loom);
        }

        // 逐条处理消息
        for (const msg of messages) {
            const sealedBox = await loom.processMessage(msg);

            if (sealedBox) {
                // 封盒了 → 进入记忆提取流程
                console.log(`📦 [Pipeline] Box sealed: "${sealedBox.topic}" (${sealedBox.messageIds.length} msgs)`);

                // 创建批次日志
                const batchId = `mb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                await MemoryBatchDB.save({
                    id: batchId,
                    charId,
                    boxId: sealedBox.id,
                    status: 'processing',
                    nodesCreated: 0,
                    error: null,
                    createdAt: Date.now(),
                    completedAt: null,
                });

                try {
                    // 获取盒子对应的消息内容
                    const allMessages = await DB.getMessagesByCharId(charId);
                    const boxMessages = sealedBox.messageIds
                        .map(id => allMessages.find(m => m.id === id))
                        .filter((m): m is Message => m !== undefined);

                    if (boxMessages.length === 0) {
                        console.warn('⚡ [Pipeline] No messages found for sealed box');
                        continue;
                    }

                    // 提取记忆
                    const nodes = await extractMemories(sealedBox, boxMessages, charName, apiConfig);

                    if (nodes.length > 0) {
                        // 向量化 + 存储
                        await vectorizeAndStore(nodes, embeddingConfig);

                        // 建立关联
                        const existingNodes = await MemoryNodeDB.getByCharId(charId);
                        const justStored = existingNodes.filter(n =>
                            nodes.some(nn => nn.id === n.id)
                        );
                        const others = existingNodes.filter(n =>
                            !nodes.some(nn => nn.id === n.id)
                        );
                        await buildLinks(justStored, others);

                        console.log(`✅ [Pipeline] Extracted ${nodes.length} memories from box "${sealedBox.topic}"`);
                    }

                    // 更新批次日志
                    await MemoryBatchDB.save({
                        id: batchId,
                        charId,
                        boxId: sealedBox.id,
                        status: 'done',
                        nodesCreated: nodes.length,
                        error: null,
                        createdAt: Date.now(),
                        completedAt: Date.now(),
                    });

                } catch (err: any) {
                    console.error('⚡ [Pipeline] Memory extraction failed:', err.message);
                    await MemoryBatchDB.save({
                        id: batchId,
                        charId,
                        boxId: sealedBox.id,
                        status: 'error',
                        nodesCreated: 0,
                        error: err.message,
                        createdAt: Date.now(),
                        completedAt: Date.now(),
                    });
                }

                // 运行巩固
                await runConsolidation(charId);
            }
        }

    } catch (err: any) {
        console.error('⚡ [Pipeline] processNewMessages failed:', err.message);
    }
}
