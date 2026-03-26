/**
 * Memory Palace — 集成管线 (Pipeline)
 *
 * 对外暴露两个主要函数：
 * 1. retrieveMemories() — 检索管线，AI 回复前调用
 * 2. processNewMessages() — 缓冲区机制，AI 回复后后台调用
 *
 * 缓冲区机制（替代旧的 TopicLoom + 封盒方案）：
 * - 热区：最近 200 条消息留在聊天上下文
 * - 缓冲区：热区之前、高水位之后的消息
 * - 缓冲区 >= 50 条时触发：LLM 提取记忆 → Embedding → 更新高水位
 * - 保留缓冲区尾部 15% 作为下次提取的上下文衔接
 *
 * LLM 调用策略：
 * - 记忆提取 → 用 LightLLMConfig（复用 emotionConfig.api 轻量副模型）
 * - 检索管线 → 纯计算，不调 LLM
 */

import type { Message } from '../../types';
import type { EmbeddingConfig, PersonalityStyle } from './types';
import { extractMemoriesFromBuffer } from './extraction';
import { vectorSearch } from './vectorSearch';
import { vectorizeAndStore } from './vectorStore';
import { buildLinks, strengthenCoActivated } from './links';
import { hybridSearch } from './hybridSearch';
import { spreadActivation } from './activation';
import { applyPriming, checkRumination } from './priming';
import { expandAndFormat } from './formatter';
import { runConsolidation } from './consolidation';
// 认知消化由用户在记忆宫殿 App 手动触发，不在聊天管线中自动运行
import { MemoryNodeDB, AnticipationDB } from './db';
import { DB } from '../db';

// ─── 轻量 LLM 配置类型 ───────────────────────────────

/**
 * 轻量 LLM 配置，用于记忆提取等后台任务。
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
 * 从消息列表末尾提取最近一轮完整对话上下文。
 *
 * 调用时机是 AI 回复前，所以消息末尾通常是：
 *   ... [assistant] [user] [user] [user]
 *
 * 策略：从末尾往回扫，收集 3 个阶段：
 *   Phase 1: 末尾连续 user 消息（用户刚发的）
 *   Phase 2: 紧邻的上一轮 assistant 回复（提供话题延续的语境）
 *   Phase 3: 该 assistant 之前的连续 user 消息（上一轮的提问/话题）
 *
 * 总计 cap 在 15 条，覆盖当前轮 + 上一轮完整对话。
 */
function getLastTurnMessages(messages: Message[]): Message[] {
    if (messages.length === 0) return [];

    const MAX = 15;
    const result: Message[] = [];
    let i = messages.length - 1;

    // Phase 1: 末尾连续 user 消息（用户新发的）
    while (i >= 0 && messages[i].role === 'user' && result.length < MAX) {
        result.unshift(messages[i]);
        i--;
    }

    // Phase 2: 紧邻的 assistant 回复（上一轮角色回答，提供上下文）
    while (i >= 0 && messages[i].role === 'assistant' && result.length < MAX) {
        result.unshift(messages[i]);
        i--;
    }

    // Phase 3: 再往回收集连续 user 消息（上一轮用户输入）
    while (i >= 0 && messages[i].role === 'user' && result.length < MAX) {
        result.unshift(messages[i]);
        i--;
    }

    // 兜底
    return result.length > 0 ? result : messages.slice(-3);
}

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
        // 1. 构建查询：取最近一轮完整对话（用户连续输入 + 角色回复）
        //    chat 模式下用户可能连发多条，hardcode 3 条会漏掉上下文
        //    策略：从末尾往回找，收集最后一个 assistant 回复之前的所有连续 user 消息 + 该回复
        const queryMessages = getLastTurnMessages(recentMessages);
        const query = queryMessages
            .map(m => m.content)
            .join('\n')
            .slice(0, 2000);

        if (!query.trim()) return '';

        // 2. 混合搜索
        let results = await hybridSearch(query, charId, embeddingConfig);

        if (results.length === 0) {
            console.log(`🏰 [Retrieve] 混合搜索无结果，跳过记忆注入`);
            return '';
        }

        console.log(`🏰 [Retrieve] 混合搜索命中 ${results.length} 条，最高分 ${results[0]?.finalScore.toFixed(3)}`);

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
        console.error(`❌ [Retrieve] 检索记忆失败:`, err.message);
        return '';
    }
}

/**
 * 便捷函数：检索记忆并挂到 char.memoryPalaceInjection 上。
 *
 * 各 App 在构建 System Prompt 前调用一次即可，
 * 之后 buildCoreContext 会自动读取并注入。
 *
 * messages 可选：不传则自动从 DB 加载该角色的聊天记录。
 */
export async function injectMemoryPalace(
    char: { memoryPalaceEnabled?: boolean; embeddingConfig?: any; activeBuffs?: any[]; personalityStyle?: string; ruminationTendency?: number; id: string; memoryPalaceInjection?: string },
    recentMessages?: Message[],
): Promise<void> {
    if (!char.memoryPalaceEnabled || !char.embeddingConfig?.baseUrl || !char.embeddingConfig?.apiKey) return;
    try {
        const msgs = recentMessages ?? await DB.getMessagesByCharId(char.id);
        const currentMood = char.activeBuffs?.[0]?.name;
        const context = await retrieveMemories(
            msgs, char.id, char.embeddingConfig,
            currentMood,
            (char.personalityStyle as PersonalityStyle) || 'emotional',
            char.ruminationTendency ?? 0.3,
        );
        if (context) {
            char.memoryPalaceInjection = context;
        }
    } catch (e: any) {
        console.warn(`🏰 [MemoryPalace] injectMemoryPalace failed: ${e.message}`);
    }
}

// ─── 输入管线（AI 回复后，后台） ──────────────────────

// ─── 高水位标记：记录每个角色处理到的最后消息 ID ────────

const LAST_MSG_KEY = (charId: string) => `mp_lastMsgId_${charId}`;

function getLastProcessedId(charId: string): number {
    try {
        const val = parseInt(localStorage.getItem(LAST_MSG_KEY(charId)) || '0', 10);
        return isNaN(val) || val < 0 ? 0 : val;
    } catch { return 0; }
}

function setLastProcessedId(charId: string, msgId: number): void {
    try { localStorage.setItem(LAST_MSG_KEY(charId), String(msgId)); } catch {}
}

/** 获取当前高水位标记（供外部上下文过滤使用） */
export function getMemoryPalaceHighWaterMark(charId: string): number {
    return getLastProcessedId(charId);
}

// ─── 缓冲区配置 ─────────────────────────────────────

/** 热区大小：最近 N 条消息始终留在聊天上下文，不处理 */
const HOT_ZONE_SIZE = 200;
/** 缓冲区阈值：累积超过 N 条消息后触发处理 */
const BUFFER_THRESHOLD = 50;
/** 处理比例：取缓冲区前 85%，保留尾部 15% 作为下次总结的上下文 */
const PROCESS_RATIO = 0.85;

/** 并发锁：防止多次 AI 回复同时触发 processNewMessages 产生竞态 */
const processingLocks = new Set<string>();

/**
 * 缓冲区机制处理聊天消息：
 *
 * 1. 热区 = 最近 200 条消息（留在聊天上下文，不处理）
 * 2. 缓冲区 = 高水位标记之后、热区之前的消息
 * 3. 缓冲区 >= 阈值时：取前 85% → LLM 提取记忆 → Embedding → 更新高水位
 * 4. 保留尾部 15%，避免下次总结时事件没有起因
 *
 * 相比旧方案（每轮 TopicLoom + 封盒），LLM 调用频率大幅降低：
 * 只在缓冲区满时触发，且只需 1 次 LLM 提取 + Embedding。
 */
export async function processNewMessages(
    _allRecentMessages: Message[], // 保留参数兼容，但内部直接从 DB 加载
    charId: string,
    charName: string,
    embeddingConfig: EmbeddingConfig,
    llmConfig: LightLLMConfig,
    userName: string = '',
): Promise<void> {
    // 并发锁：同一角色同时只能跑一次
    if (processingLocks.has(charId)) {
        console.log(`🏰 [Pipeline] 跳过：${charName} 已有处理任务在运行`);
        return;
    }
    processingLocks.add(charId);

    try {
        // 1. 加载全部消息，计算热区和缓冲区
        const allMessages = await DB.getMessagesByCharId(charId);
        const textMessages = allMessages
            .filter(m => m.type === 'text' && m.content?.trim())
            .sort((a, b) => a.id - b.id);

        const totalCount = textMessages.length;

        if (totalCount <= HOT_ZONE_SIZE) {
            console.log(`🏰 [Pipeline] 跳过：消息总数 ${totalCount} <= 热区 ${HOT_ZONE_SIZE}，无需处理`);
            return;
        }

        // 2. 热区 = 最后 HOT_ZONE_SIZE 条
        const hotZoneStartIdx = totalCount - HOT_ZONE_SIZE;
        const hotZoneStartId = textMessages[hotZoneStartIdx].id;

        // 3. 缓冲区 = 高水位标记之后、热区之前
        const lastProcessedId = getLastProcessedId(charId);
        const buffer = textMessages.filter(m => m.id > lastProcessedId && m.id < hotZoneStartId);

        if (buffer.length < BUFFER_THRESHOLD) {
            console.log(`🏰 [Pipeline] 跳过：缓冲区 ${buffer.length} 条 < 阈值 ${BUFFER_THRESHOLD}（hwm=${lastProcessedId}, hotZone起始id=${hotZoneStartId}）`);
            return;
        }

        // 4. 取前 85% 处理，保留尾部 15%
        const processCount = Math.ceil(buffer.length * PROCESS_RATIO);
        const toProcess = buffer.slice(0, processCount);
        const keptTail = buffer.length - processCount;

        if (toProcess.length === 0) return;

        console.log(`🏰 [Pipeline] 开始处理缓冲区：${toProcess.length} 条消息（保留尾部 ${keptTail} 条）`);
        console.log(`🏰 [Pipeline]   消息ID范围: ${toProcess[0].id} ~ ${toProcess[toProcess.length - 1].id}`);
        console.log(`🏰 [Pipeline]   总消息: ${totalCount}, 热区: ${HOT_ZONE_SIZE}, 缓冲区: ${buffer.length}, hwm: ${lastProcessedId}`);

        // 5. 构建精简上下文：角色档案 + 用户档案 + 相关已有记忆
        let charContext = '';
        try {
            const chars = await DB.getAllCharacters();
            const charProfile = chars.find(c => c.id === charId);
            const userProfile = await DB.getUserProfile();

            // 5a. 精简角色档案（姓名、设定、世界观）
            if (charProfile) {
                charContext += `[角色档案]\n`;
                charContext += `名字: ${charProfile.name}\n`;
                charContext += `核心设定:\n${charProfile.systemPrompt || '无'}\n`;
                if (charProfile.worldview?.trim()) {
                    charContext += `世界观: ${charProfile.worldview}\n`;
                }
                charContext += `\n`;
            }

            // 5b. 精简用户档案（姓名、设定）
            if (userProfile) {
                charContext += `[用户档案]\n`;
                charContext += `名字: ${userProfile.name}\n`;
                charContext += `设定: ${userProfile.bio || '无'}\n\n`;
            }

            // 5c. 向量检索相关已有记忆，为本次总结提供上下文
            //     防止 LLM 在缺少背景时误解对话中的隐式指代
            //     从头、中、尾各取一段做 3 次查询，覆盖整段对话的话题变化
            try {
                const len = toProcess.length;
                const SAMPLE_SIZE = 5;
                const snippets: string[] = [];

                // 头部、中部、尾部各取 5 条消息
                const ranges = [
                    toProcess.slice(0, SAMPLE_SIZE),
                    toProcess.slice(Math.max(0, Math.floor(len / 2) - Math.floor(SAMPLE_SIZE / 2)), Math.floor(len / 2) + Math.ceil(SAMPLE_SIZE / 2)),
                    toProcess.slice(Math.max(0, len - SAMPLE_SIZE)),
                ];

                for (const range of ranges) {
                    const text = range.map(m => m.content).join('\n').slice(0, 300);
                    if (text.trim()) snippets.push(text);
                }

                if (snippets.length > 0) {
                    // 并行 embedding 3 段
                    const { getEmbeddings } = await import('./embedding');
                    const vectors = await getEmbeddings(snippets, embeddingConfig);

                    // 并行向量搜索，每段取 top 5
                    const searchResults = await Promise.all(
                        vectors.map(vec => vectorSearch(vec, charId, 0.35, 5))
                    );

                    // 合并去重：同一记忆保留最高相似度
                    const seen = new Map<string, { node: any; similarity: number }>();
                    for (const results of searchResults) {
                        for (const r of results) {
                            const existing = seen.get(r.node.id);
                            if (!existing || r.similarity > existing.similarity) {
                                seen.set(r.node.id, r);
                            }
                        }
                    }

                    // 按相似度降序，最多取 10 条
                    const related = [...seen.values()]
                        .sort((a, b) => b.similarity - a.similarity)
                        .slice(0, 10);

                    if (related.length > 0) {
                        charContext += `[相关已有记忆（供参考，帮助理解对话中的人物和事件指代）]\n`;
                        related.forEach((r, i) => {
                            charContext += `${i + 1}. [${r.node.room}] ${r.node.content}\n`;
                        });
                        charContext += `\n`;
                        console.log(`🏰 [Pipeline] 检索到 ${related.length} 条相关记忆作为提取上下文（${snippets.length} 段查询）`);
                    }
                }
            } catch (e: any) {
                console.warn(`🏰 [Pipeline] 相关记忆检索失败（不影响提取）: ${e.message}`);
            }
        } catch (e: any) {
            console.warn(`🏰 [Pipeline] 加载角色上下文失败（不影响提取）: ${e.message}`);
        }

        // 6. 一次 LLM 调用提取记忆（无 TopicLoom，无封盒）
        console.log(`🏰 [Pipeline] 调用 LLM 提取记忆...（${toProcess.length} 条消息 → ${llmConfig.model}）`);
        const memories = await extractMemoriesFromBuffer(
            toProcess, charId, charName, llmConfig, charContext, userName,
        );

        // ⚠️ 只有提取到记忆时才更新高水位，避免 LLM 失败/返空导致消息丢失
        if (memories.length === 0) {
            console.warn(`🏰 [Pipeline] LLM 提取返回 0 条记忆（${toProcess.length} 条消息），不更新高水位，下次重试`);
            return;
        }

        console.log(`🏰 [Pipeline] LLM 提取完成：${memories.length} 条记忆`);

        // 7. 向量化（Embedding API，按批次）
        console.log(`🏰 [Pipeline] 开始向量化 ${memories.length} 条记忆...`);
        const vectorResult = await vectorizeAndStore(memories, embeddingConfig);
        console.log(`🏰 [Pipeline] 向量化完成：${vectorResult.stored} 条存储, ${vectorResult.skipped} 条去重跳过`);

        // 8. 建关联（仅规则，不调 LLM，省钱）
        const existingNodes = await MemoryNodeDB.getByCharId(charId);
        const justStored = existingNodes.filter(n => memories.some(nn => nn.id === n.id));
        const others = existingNodes.filter(n => !memories.some(nn => nn.id === n.id));
        await buildLinks(justStored, others); // 不传 llmConfig = 跳过 LLM 深层关联
        console.log(`🏰 [Pipeline] 关联建立完成（${justStored.length} 新节点 vs ${Math.min(others.length, 50)} 已有节点）`);

        // 9. 更新高水位标记（只在提取成功后才更新）
        const newHighWaterMark = toProcess[toProcess.length - 1].id;
        setLastProcessedId(charId, newHighWaterMark);
        console.log(`✅ [Pipeline] 缓冲区处理完成：${memories.length} 条记忆, hwm ${lastProcessedId} → ${newHighWaterMark}`);

        // 10. 巩固（纯计算）
        await runConsolidation(charId);

    } catch (err: any) {
        console.error(`❌ [Pipeline] processNewMessages 失败 (charId=${charId}):`, err.message, err.stack?.split('\n')[1] || '');
    } finally {
        processingLocks.delete(charId);
    }
}
