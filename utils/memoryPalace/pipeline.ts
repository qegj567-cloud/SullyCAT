/**
 * Memory Palace — 集成管线 (Pipeline)
 *
 * 对外暴露两个主要函数：
 * 1. retrieveMemories() — 检索管线，AI 回复前调用
 * 2. processNewMessages() — 输入管线，AI 回复后后台调用
 *
 * LLM 调用策略：
 * - Topic Loom / 记忆提取 → 用 LightLLMConfig（复用 emotionConfig.api 轻量副模型）
 * - 检索管线 → 纯计算，不调 LLM
 */

import type { Message } from '../../types';
import type { EmbeddingConfig, PersonalityStyle } from './types';
import { TopicLoomManager } from './topicLoom';
import { extractMemoriesWithMetadata } from './extraction';
import { vectorizeAndStore } from './vectorStore';
import { buildLinks, strengthenCoActivated } from './links';
import { hybridSearch } from './hybridSearch';
import { spreadActivation } from './activation';
import { applyPriming, checkRumination } from './priming';
import { expandAndFormat } from './formatter';
import { runConsolidation } from './consolidation';
// 认知消化由用户在记忆宫殿 App 手动触发，不在聊天管线中自动运行
import { MemoryNodeDB, AnticipationDB, MemoryBatchDB, TopicBoxDB } from './db';
import { DB } from '../db';

// ─── 轻量 LLM 配置类型 ───────────────────────────────

/**
 * 轻量 LLM 配置，用于 Topic Loom 和记忆提取等后台任务。
 * 复用 emotionConfig.api 的 { baseUrl, apiKey, model }。
 * 这样可以用便宜快速的小模型（如 DeepSeek-V2-Lite、GLM-4-Flash）
 * 而不是主聊天模型。
 */
export interface LightLLMConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

// ─── 检索管线（AI 回复前） ────────────────────────────

/**
 * 检索记忆并格式化为可注入 System Prompt 的 Markdown
 *
 * 注意：检索管线全程纯计算 + Embedding API，不调 LLM。
 */
export async function retrieveMemories(
    recentMessages: Message[],
    charId: string,
    embeddingConfig: EmbeddingConfig,
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
            .slice(0, 500);

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

// ─── 高水位标记：记录每个角色处理到的最后消息 ID ────────

const LAST_MSG_KEY = (charId: string) => `mp_lastMsgId_${charId}`;

function getLastProcessedId(charId: string): number {
    try {
        return parseInt(localStorage.getItem(LAST_MSG_KEY(charId)) || '0', 10);
    } catch { return 0; }
}

function setLastProcessedId(charId: string, msgId: number): void {
    try { localStorage.setItem(LAST_MSG_KEY(charId), String(msgId)); } catch {}
}

/**
 * 处理新消息：TopicLoom → 记忆提取 → 向量化 → 建立关联
 *
 * 使用高水位标记（localStorage）追踪已处理的消息 ID，
 * 只处理上次水位之后的新消息，避免漏处理或重复处理。
 *
 * @param allRecentMessages 最近 50 条消息（由调用方从 DB 加载）
 * @param llmConfig 轻量 LLM 配置（来自 emotionConfig.api）
 * @param embeddingConfig Embedding 配置，用于向量化
 */
export async function processNewMessages(
    allRecentMessages: Message[],
    charId: string,
    charName: string,
    embeddingConfig: EmbeddingConfig,
    llmConfig: LightLLMConfig,
    userName: string = '',
): Promise<void> {
    try {
        // 1. 找出上次处理到哪条消息
        const lastId = getLastProcessedId(charId);

        // 2. 过滤出新消息（id > lastId），按 ID 升序
        const newMessages = allRecentMessages
            .filter(m => m.id > lastId && m.type === 'text') // 只处理文本消息
            .sort((a, b) => a.id - b.id);

        if (newMessages.length === 0) return;

        console.log(`🏰 [Pipeline] Processing ${newMessages.length} new messages (lastId=${lastId}, newest=${newMessages[newMessages.length - 1].id})`);

        // 3. 获取或创建 TopicLoomManager（用轻量模型）
        let loom = loomCache.get(charId);
        if (!loom) {
            loom = new TopicLoomManager(charId, llmConfig, charName, userName);
            await loom.init();
            loomCache.set(charId, loom);
        }

        // 4. 一次性批量处理所有新消息（一次 LLM 调用判断切分点）
        //    skipMetadata=true：元数据提取合并到后面的 extractMemoriesWithMetadata 里一起做
        const sealedBoxes = await loom.processBatch(newMessages, true);

        // 加载角色人设 + 用户信息作为记忆提取的上下文
        let charContext = '';
        if (sealedBoxes.length > 0) {
            try {
                const { ContextBuilder } = await import('../context');
                const chars = await DB.getAllCharacters();
                const charProfile = chars.find(c => c.id === charId);
                const userProfile = await DB.getUserProfile();
                if (charProfile && userProfile) {
                    charContext = ContextBuilder.buildCoreContext(charProfile, userProfile, false);
                } else if (charProfile) {
                    charContext = ContextBuilder.buildRoleSettingsContext(charProfile);
                }
            } catch { /* proceed without context */ }
        }

        // 5. 对每个封好的盒子：提取记忆 → 向量化 → 建关联
        for (const sealedBox of sealedBoxes) {
            console.log(`📦 [Pipeline] Box sealed: "${sealedBox.topic}" (${sealedBox.messageIds.length} msgs)`);

            const batchId = `mb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await MemoryBatchDB.save({
                id: batchId, charId, boxId: sealedBox.id,
                status: 'processing', nodesCreated: 0, error: null,
                createdAt: Date.now(), completedAt: null,
            });

            try {
                const allMessages = await DB.getMessagesByCharId(charId);
                const boxMessages = sealedBox.messageIds
                    .map(id => allMessages.find(m => m.id === id))
                    .filter((m): m is Message => m !== undefined);

                if (boxMessages.length === 0) {
                    console.warn('⚡ [Pipeline] No messages found for sealed box');
                    continue;
                }

                // 一次 LLM 同时提取记忆 + 话题元数据（合并原来的 extractBoxMetadata + extractMemories）
                const result = await extractMemoriesWithMetadata(sealedBox, boxMessages, charName, llmConfig, charContext, userName);

                // 回填话题元数据到盒子
                sealedBox.topic = result.topic;
                sealedBox.events = result.events;
                sealedBox.keywords = result.keywords;
                await TopicBoxDB.save(sealedBox);

                console.log(`📦 [Pipeline] Box metadata: "${result.topic}"`);

                if (result.memories.length > 0) {
                    // 向量化（Embedding API，按批次）
                    await vectorizeAndStore(result.memories, embeddingConfig);

                    // 建关联（1 次 LLM 批量判断深层关联）
                    const existingNodes = await MemoryNodeDB.getByCharId(charId);
                    const justStored = existingNodes.filter(n => result.memories.some(nn => nn.id === n.id));
                    const others = existingNodes.filter(n => !result.memories.some(nn => nn.id === n.id));
                    await buildLinks(justStored, others, llmConfig);

                    console.log(`✅ [Pipeline] Extracted ${result.memories.length} memories from box "${result.topic}"`);
                }

                await MemoryBatchDB.save({
                    id: batchId, charId, boxId: sealedBox.id,
                    status: 'done', nodesCreated: result.memories.length, error: null,
                    createdAt: Date.now(), completedAt: Date.now(),
                });

            } catch (err: any) {
                console.error('⚡ [Pipeline] Memory extraction failed:', err.message);
                await MemoryBatchDB.save({
                    id: batchId, charId, boxId: sealedBox.id,
                    status: 'error', nodesCreated: 0, error: err.message,
                    createdAt: Date.now(), completedAt: Date.now(),
                });
            }
        }

        // 6. 巩固（纯计算，不调 LLM）
        // 认知消化不再自动触发，由用户在记忆宫殿 App 里手动操作
        if (sealedBoxes.length > 0) {
            await runConsolidation(charId);
        }

        // 5. 更新高水位标记
        const maxId = Math.max(...newMessages.map(m => m.id));
        setLastProcessedId(charId, maxId);

    } catch (err: any) {
        console.error('⚡ [Pipeline] processNewMessages failed:', err.message);
    }
}

// ─── 历史聊天全量处理 ────────────────────────────────

export interface HistoryProcessProgress {
    phase: 'loading' | 'splitting' | 'extracting' | 'vectorizing' | 'done';
    current: number;
    total: number;
    detail?: string;
}

/**
 * 将角色的全部历史聊天记录走一遍完整流程：
 * TopicLoom 切话题 → 封盒 → 提取记忆 → 向量化 → 建关联
 *
 * 按 50 条消息一组分窗口处理，避免上下文溢出。
 */
export async function processHistoricalChat(
    charId: string,
    charName: string,
    embeddingConfig: EmbeddingConfig,
    llmConfig: LightLLMConfig,
    onProgress?: (p: HistoryProcessProgress) => void,
    userName: string = '',
): Promise<{ boxes: number; memories: number }> {

    // 1. 加载全部聊天记录
    onProgress?.({ phase: 'loading', current: 0, total: 0 });
    const allMessages = await DB.getMessagesByCharId(charId);
    const textMessages = allMessages
        .filter(m => m.type === 'text' && m.content?.trim())
        .sort((a, b) => a.id - b.id);

    if (textMessages.length === 0) {
        onProgress?.({ phase: 'done', current: 0, total: 0 });
        return { boxes: 0, memories: 0 };
    }

    console.log(`🏰 [HistoryProcess] Processing ${textMessages.length} historical messages`);

    // 加载角色人设 + 用户信息
    let charContext = '';
    try {
        const { ContextBuilder } = await import('../context');
        const chars = await DB.getAllCharacters();
        const charProfile = chars.find(c => c.id === charId);
        const userProfile = await DB.getUserProfile();
        if (charProfile && userProfile) {
            charContext = ContextBuilder.buildCoreContext(charProfile, userProfile, false);
        } else if (charProfile) {
            charContext = ContextBuilder.buildRoleSettingsContext(charProfile);
        }
    } catch { /* proceed without */ }

    // 2. 创建专用 TopicLoomManager
    const loom = new TopicLoomManager(charId, llmConfig, charName, userName);

    // 3. 按 50 条一组分窗口
    const WINDOW_SIZE = 50;
    const windows: Message[][] = [];
    for (let i = 0; i < textMessages.length; i += WINDOW_SIZE) {
        windows.push(textMessages.slice(i, i + WINDOW_SIZE));
    }

    let totalBoxes = 0;
    let totalMemories = 0;

    // 4. 逐窗口处理
    for (let w = 0; w < windows.length; w++) {
        const window = windows[w];
        onProgress?.({
            phase: 'splitting',
            current: w + 1,
            total: windows.length,
            detail: `话题切分中... 第 ${w + 1}/${windows.length} 批 (消息 ${window[0].id}-${window[window.length - 1].id})`,
        });

        // TopicLoom 批量切分（1 次 LLM），跳过元数据提取（后面合并在记忆提取里一起做）
        const sealedBoxes = await loom.processBatch(window, true);

        // 5. 对每个封好的盒子：一次 LLM 同时提取记忆 + 话题元数据 → 向量化
        for (const sealedBox of sealedBoxes) {
            totalBoxes++;
            onProgress?.({
                phase: 'extracting',
                current: totalBoxes,
                total: totalBoxes, // 不知道总数，用当前值
                detail: `提取记忆: box #${totalBoxes} (${sealedBox.messageIds.length} 条消息)`,
            });

            try {
                const boxMessages = sealedBox.messageIds
                    .map(id => allMessages.find(m => m.id === id))
                    .filter((m): m is Message => m !== undefined);

                if (boxMessages.length === 0) continue;

                // 一次 LLM 调用同时提取记忆 + 话题元数据（原来需要 2 次）
                const result = await extractMemoriesWithMetadata(sealedBox, boxMessages, charName, llmConfig, charContext, userName);

                // 回填话题元数据到盒子
                sealedBox.topic = result.topic;
                sealedBox.events = result.events;
                sealedBox.keywords = result.keywords;
                await TopicBoxDB.save(sealedBox);

                if (result.memories.length > 0) {
                    // 向量化
                    onProgress?.({
                        phase: 'vectorizing',
                        current: totalMemories + result.memories.length,
                        total: totalMemories + result.memories.length,
                        detail: `向量化 ${result.memories.length} 条记忆...`,
                    });

                    await vectorizeAndStore(result.memories, embeddingConfig);

                    // 建关联（不用 LLM，只建 temporal + emotional 规则关联，省 API）
                    const existingNodes = await MemoryNodeDB.getByCharId(charId);
                    const justStored = existingNodes.filter(n => result.memories.some(nn => nn.id === n.id));
                    const others = existingNodes.filter(n => !result.memories.some(nn => nn.id === n.id));
                    await buildLinks(justStored, others); // 不传 llmConfig = 跳过 LLM 深层关联

                    totalMemories += result.memories.length;
                    console.log(`✅ [HistoryProcess] Box "${result.topic}": ${result.memories.length} memories`);
                }
            } catch (err: any) {
                console.error(`⚡ [HistoryProcess] Failed for box #${totalBoxes}:`, err.message);
            }
        }
    }

    // 6. 强制封掉最后一个 open box（同样跳过元数据，合并提取）
    const lastSealed = await loom.forceSeal(true);
    if (lastSealed) {
        try {
            const boxMessages = lastSealed.messageIds
                .map(id => allMessages.find(m => m.id === id))
                .filter((m): m is Message => m !== undefined);
            if (boxMessages.length > 0) {
                const result = await extractMemoriesWithMetadata(lastSealed, boxMessages, charName, llmConfig, charContext, userName);
                lastSealed.topic = result.topic;
                lastSealed.events = result.events;
                lastSealed.keywords = result.keywords;
                await TopicBoxDB.save(lastSealed);
                if (result.memories.length > 0) {
                    await vectorizeAndStore(result.memories, embeddingConfig);
                    totalMemories += result.memories.length;
                    totalBoxes++;
                }
            }
        } catch (err: any) {
            console.error('⚡ [HistoryProcess] Failed for last box:', err.message);
        }
    }

    // 7. 设置高水位标记（标记所有历史消息都已处理）
    if (textMessages.length > 0) {
        const maxId = textMessages[textMessages.length - 1].id;
        setLastProcessedId(charId, maxId);
    }

    // 8. 跑一次巩固
    await runConsolidation(charId);

    onProgress?.({ phase: 'done', current: totalMemories, total: totalMemories });
    console.log(`✅ [HistoryProcess] Done: ${totalBoxes} boxes, ${totalMemories} memories from ${textMessages.length} messages`);
    return { boxes: totalBoxes, memories: totalMemories };
}
