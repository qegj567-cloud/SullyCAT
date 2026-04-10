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
import type { EmbeddingConfig, PersonalityStyle, RemoteVectorConfig } from './types';

/** 从 localStorage 读取远程向量配置（避免在每个调用点都传参） */
function getRemoteVectorConfig(): RemoteVectorConfig | undefined {
    try {
        const raw = localStorage.getItem('os_remote_vector_config');
        if (!raw) return undefined;
        const config = JSON.parse(raw) as RemoteVectorConfig;
        return (config.enabled && config.initialized) ? config : undefined;
    } catch { return undefined; }
}
import { extractMemoriesFromBuffer } from './extraction';
import type { RelatedMemoryRef, PinnedMemoryRef } from './extraction';
import { vectorSearch } from './vectorSearch';
import { vectorizeAndStore, checkModelConsistency, rebuildAllVectors } from './vectorStore';
import type { VectorizedNodeSummary } from './vectorStore';
import { buildLinks, strengthenCoActivated } from './links';
import { hybridSearch } from './hybridSearch';
import { spreadActivation } from './activation';
import { applyPriming, checkRumination } from './priming';
import { expandAndFormat } from './formatter';
import { runConsolidation } from './consolidation';
// 认知消化由用户在记忆宫殿 App 手动触发，不在聊天管线中自动运行
import { MemoryNodeDB, MemoryLinkDB, AnticipationDB } from './db';
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
 *
 * @param queryOverride App 自定义上下文（场景、题目等），会与最近一轮对话拼接后一起检索
 */
export async function retrieveMemories(
    recentMessages: Message[],
    charId: string,
    embeddingConfig: EmbeddingConfig,
    currentMood?: string,
    personalityStyle: PersonalityStyle = 'emotional',
    ruminationTendency: number = 0.3,
    queryOverride?: string,
    userName?: string,
    remoteVectorConfig?: RemoteVectorConfig,
): Promise<string> {
    try {
        // 1. 构建查询
        //    两部分拼接：queryOverride（App 场景上下文）+ 最近一轮对话
        //    这样 embedding 同时覆盖"当前在做什么"和"最近聊了什么"
        const chatContext = getLastTurnMessages(recentMessages)
            .map(m => m.content)
            .join('\n');
        const query = [queryOverride, chatContext]
            .filter(Boolean)
            .join('\n')
            .slice(0, 2000);

        if (!query.trim()) return '';

        // 2. 混合搜索
        let results = await hybridSearch(query, charId, embeddingConfig, 15, remoteVectorConfig);

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
        return await expandAndFormat(results, charId, anticipations, userName);

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
 * @param recentMessages 可选，不传则自动从 DB 加载
 * @param queryHint 可选，App 自定义检索词（如场景描述、游戏叙事）。
 *                  传了就直接用这个检索，不走 getLastTurnMessages。
 */
/**
 * 获取全局记忆宫殿 embedding 配置。
 * 优先使用全局配置（localStorage），如果没有则回退到角色级别配置。
 */
function getEmbeddingConfig(charEmbeddingConfig?: any): EmbeddingConfig | null {
    try {
        const raw = localStorage.getItem('os_memory_palace_config');
        if (raw) {
            const global = JSON.parse(raw);
            if (global.embedding?.baseUrl && global.embedding?.apiKey) {
                return global.embedding as EmbeddingConfig;
            }
        }
    } catch {}
    // 回退到角色级别（兼容旧数据）
    if (charEmbeddingConfig?.baseUrl && charEmbeddingConfig?.apiKey) {
        return charEmbeddingConfig as EmbeddingConfig;
    }
    return null;
}

export async function injectMemoryPalace(
    char: { memoryPalaceEnabled?: boolean; embeddingConfig?: any; activeBuffs?: any[]; personalityStyle?: string; ruminationTendency?: number; id: string; memoryPalaceInjection?: string },
    recentMessages?: Message[],
    queryHint?: string,
    userName?: string,
): Promise<void> {
    if (!char.memoryPalaceEnabled) return;
    const embeddingConfig = getEmbeddingConfig(char.embeddingConfig);
    if (!embeddingConfig) return;
    try {
        const msgs = recentMessages ?? await DB.getMessagesByCharId(char.id);
        const currentMood = char.activeBuffs?.[0]?.name;
        const context = await retrieveMemories(
            msgs, char.id, embeddingConfig,
            currentMood,
            (char.personalityStyle as PersonalityStyle) || 'emotional',
            char.ruminationTendency ?? 0.3,
            queryHint,
            userName,
            getRemoteVectorConfig(),
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
const BUFFER_THRESHOLD = 100;
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
/** 单批次处理结果 */
export interface ChunkResult {
    chunkIndex: number;
    msgCount: number;
    memoryCount: number;
    failed: boolean;
}

/** 向量化完成的结果回调数据 */
export interface VectorizeReport {
    /** 本次新存储的记忆数 */
    stored: number;
    /** 去重跳过数 */
    skipped: number;
    /** 重建的已有向量数（仅备份导入/换模型时） */
    rebuilt: number;
    /** 本次存储的记忆节点摘要列表 */
    storedNodes: VectorizedNodeSummary[];
    /** 重建的记忆节点摘要列表 */
    rebuiltNodes: VectorizedNodeSummary[];
    /** 每批次的处理结果（可选，用于展示分批详情） */
    chunkResults?: ChunkResult[];
    /** 水位线变化 */
    hwmBefore?: number;
    hwmAfter?: number;
}

/** Pipeline 回调：用于向 UI 层传递实时状态 */
export interface PipelineCallbacks {
    /** 进度文案更新（每个阶段调用） */
    onProgress?: (message: string) => void;
    /** 当重建/长时间向量化开始时调用，传入提示文案；结束时传空字符串 */
    onBlockingStatus?: (message: string) => void;
    /** 当向量化完成后调用，传入本次处理的详细报告 */
    onVectorizeComplete?: (report: VectorizeReport) => void;
}

export async function processNewMessages(
    _allRecentMessages: Message[], // 保留参数兼容，但内部直接从 DB 加载
    charId: string,
    charName: string,
    embeddingConfig: EmbeddingConfig,
    llmConfig: LightLLMConfig,
    userName: string = '',
    /** 强制模式：跳过缓冲区阈值检查，用于一键向量化 */
    force: boolean = false,
    /** 进度回调（兼容旧调用） */
    onProgress?: (stage: string) => void,
    /** UI 回调 */
    callbacks?: PipelineCallbacks,
): Promise<void> {
    // 并发锁：同一角色同时只能跑一次
    if (processingLocks.has(charId)) {
        console.log(`🏰 [Pipeline] 跳过：${charName} 已有处理任务在运行`);
        return;
    }
    processingLocks.add(charId);

    // 统一进度广播：同时通知旧 onProgress 回调和新 callbacks.onProgress
    const broadcast = (msg: string) => {
        onProgress?.(msg);
        callbacks?.onProgress?.(msg);
    };

    try {
        // 1. 加载全部消息（含已处理的），计算热区和缓冲区
        const allMessages = await DB.getMessagesByCharId(charId, true);
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

        const minThreshold = force ? 10 : BUFFER_THRESHOLD;
        if (buffer.length < minThreshold) {
            console.log(`🏰 [Pipeline] 跳过：缓冲区 ${buffer.length} 条 < 阈值 ${minThreshold}（hwm=${lastProcessedId}, hotZone起始id=${hotZoneStartId}）`);
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
        broadcast(`正在整理 ${toProcess.length} 条对话…\n总消息 ${totalCount} 条 | 热区 ${HOT_ZONE_SIZE} 条 | 水位线 #${lastProcessedId}`);

        // 5. 构建精简上下文：角色档案 + 用户档案 + 相关已有记忆
        let charContext = '';
        let relatedMemoryRefs: RelatedMemoryRef[] = [];
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

            // 5c. 向量检索相关已有记忆，用于两个目的：
            //     ① 为 LLM 提取提供上下文（防止误解隐式指代）
            //     ② 收集结构化引用供 LLM 标注跨时间事件关联（relatedTo）
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
                        // 收集结构化引用（带 ID），传给 extraction 做跨时间关联
                        relatedMemoryRefs = related.map(r => ({
                            id: r.node.id,
                            room: r.node.room,
                            content: r.node.content.slice(0, 100),
                        }));
                        console.log(`🏰 [Pipeline] 检索到 ${related.length} 条相关记忆作为提取上下文（${snippets.length} 段查询）`);
                    }
                }
            } catch (e: any) {
                console.warn(`🏰 [Pipeline] 相关记忆检索失败（不影响提取）: ${e.message}`);
            }
        } catch (e: any) {
            console.warn(`🏰 [Pipeline] 加载角色上下文失败（不影响提取）: ${e.message}`);
        }

        // 6. 收集当前便利贴（供 LLM 判断是否需要提前摘除）
        const now = Date.now();
        const allCharNodes = await MemoryNodeDB.getByCharId(charId);
        const pinnedRefs: PinnedMemoryRef[] = allCharNodes
            .filter(n => n.pinnedUntil && n.pinnedUntil > now)
            .map(n => ({ id: n.id, content: n.content.slice(0, 80) }));

        // 7. LLM 提取记忆 — 大缓冲区分批处理（每批 ~250 条消息）
        //    避免一次喂太多消息导致 LLM 偷懒只提取几条
        const CHUNK_SIZE = 250;
        const chunks: Message[][] = [];
        for (let i = 0; i < toProcess.length; i += CHUNK_SIZE) {
            chunks.push(toProcess.slice(i, i + CHUNK_SIZE));
        }

        console.log(`🏰 [Pipeline] 开始提取记忆：${toProcess.length} 条消息，分 ${chunks.length} 批（每批 ~${CHUNK_SIZE} 条）`);

        const allMemories: import('./types').MemoryNode[] = [];
        const allCrossTimeLinks: { newMemoryId: string; existingMemoryId: string }[] = [];

        /** 每批的处理结果：成功提取的记忆数，失败为 -1 */
        const chunkResults: { chunkIndex: number; msgCount: number; memoryCount: number; lastMsgId: number; failed: boolean }[] = [];
        /** 成功处理到的最远消息 ID（用于安全更新 HWM） */
        let safeHighWaterMark = lastProcessedId;

        for (let ci = 0; ci < chunks.length; ci++) {
            const chunk = chunks[ci];
            broadcast(`正在提取记忆 (${ci + 1}/${chunks.length})…\n本批 ${chunk.length} 条消息 | 已提取 ${allMemories.length} 条记忆`);
            console.log(`🏰 [Pipeline] 调用 LLM 提取 batch ${ci + 1}/${chunks.length}（${chunk.length} 条消息 → ${llmConfig.model}）`);

            const chunkLastMsgId = chunk[chunk.length - 1].id;
            try {
                const extractionResult = await extractMemoriesFromBuffer(
                    chunk, charId, charName, llmConfig, charContext, userName, relatedMemoryRefs, pinnedRefs,
                );

                const batchMemories = extractionResult.memories;

                // ── 单批验证：消息数 vs 提取记忆数的比例检查 ──
                // 每 50 条消息至少应该提取 1 条记忆，否则视为 LLM 偷懒/异常
                const minExpected = Math.max(1, Math.floor(chunk.length / 50));
                if (batchMemories.length < minExpected) {
                    console.warn(`⚠️ [Pipeline] batch ${ci + 1}: ${chunk.length} 条消息仅提取 ${batchMemories.length} 条记忆（期望 >= ${minExpected}），该批不推进水位线`);
                    broadcast(`批次 ${ci + 1}/${chunks.length} 提取异常\n${chunk.length} 条消息仅提取 ${batchMemories.length} 条（期望 >= ${minExpected}）`);
                    chunkResults.push({ chunkIndex: ci, msgCount: chunk.length, memoryCount: batchMemories.length, lastMsgId: chunkLastMsgId, failed: true });
                    // 仍然保留提取到的记忆（可能是有效的），但不推进 HWM
                    allMemories.push(...batchMemories);
                    allCrossTimeLinks.push(...extractionResult.crossTimeLinks);
                    continue;
                }

                allMemories.push(...batchMemories);
                allCrossTimeLinks.push(...extractionResult.crossTimeLinks);
                // 这批验证通过 → 安全推进 HWM 到这批末尾
                safeHighWaterMark = chunkLastMsgId;
                chunkResults.push({ chunkIndex: ci, msgCount: chunk.length, memoryCount: batchMemories.length, lastMsgId: chunkLastMsgId, failed: false });

                console.log(`✅ [Pipeline] batch ${ci + 1}: ${batchMemories.length} 条记忆 (${chunk.length} 条消息)`);

                // 处理便利贴摘除
                if (extractionResult.unpinIds.length > 0) {
                    for (const unpinId of extractionResult.unpinIds) {
                        const node = allCharNodes.find(n => n.id === unpinId);
                        if (node) {
                            node.pinnedUntil = null;
                            await MemoryNodeDB.save(node);
                        }
                    }
                    console.log(`📌 [Pipeline] batch ${ci + 1}: 摘除 ${extractionResult.unpinIds.length} 条便利贴`);
                }
            } catch (e: any) {
                console.warn(`❌ [Pipeline] batch ${ci + 1} 提取失败: ${e.message}`);
                broadcast(`批次 ${ci + 1}/${chunks.length} 失败\n${e.message}`);
                chunkResults.push({ chunkIndex: ci, msgCount: chunk.length, memoryCount: -1, lastMsgId: chunkLastMsgId, failed: true });
                // 失败的批次不推进 HWM → 下次会重新处理
            }
        }

        const memories = allMemories;
        const failedChunks = chunkResults.filter(r => r.failed);
        const successChunks = chunkResults.filter(r => !r.failed);

        if (memories.length === 0) {
            console.warn(`🏰 [Pipeline] 所有批次共提取 0 条记忆（${toProcess.length} 条消息），不更新高水位，下次重试`);
            broadcast(`提取失败：${toProcess.length} 条消息未能提取任何记忆\n全部 ${chunks.length} 批次失败，水位线不变`);
            return;
        }

        // 汇报批次结果
        const successMsg = successChunks.length > 0 ? `${successChunks.length} 批成功` : '';
        const failMsg = failedChunks.length > 0 ? `${failedChunks.length} 批异常` : '';
        console.log(`🏰 [Pipeline] 提取完成：${chunks.length} 批共 ${memories.length} 条记忆（${[successMsg, failMsg].filter(Boolean).join('，')}）`);

        // 7. 检测 embedding 模型是否变更，如果变了则重建所有已有向量
        let rebuildResult: { rebuilt: number; rebuiltNodes: VectorizedNodeSummary[] } = { rebuilt: 0, rebuiltNodes: [] };
        try {
            const consistency = await checkModelConsistency(charId, embeddingConfig.model);
            if (consistency === 'mismatch') {
                console.warn(`🔄 [Pipeline] 检测到 embedding 模型变更/向量缺失，开始重建已有向量...`);
                callbacks?.onBlockingStatus?.(`${charName}正在沉思最近的事情…`);
                rebuildResult = await rebuildAllVectors(charId, embeddingConfig, getRemoteVectorConfig());
                console.log(`🔄 [Pipeline] 重建完成：${rebuildResult.rebuilt} 条向量已更新`);
                callbacks?.onBlockingStatus?.('');
            }
        } catch (e: any) {
            console.warn(`🔄 [Pipeline] 模型一致性检查失败（不影响新记忆存储）: ${e.message}`);
            callbacks?.onBlockingStatus?.('');
        }

        // 8. 向量化（Embedding API，按批次）
        //    向量化失败则不更新高水位，下次重试时 LLM 会重新提取但 dedup 会跳过已存的
        console.log(`🏰 [Pipeline] 开始向量化 ${memories.length} 条记忆...`);
        broadcast(`正在向量化 ${memories.length} 条记忆…`);
        const vectorResult = await vectorizeAndStore(memories, embeddingConfig, getRemoteVectorConfig());
        console.log(`🏰 [Pipeline] 向量化完成：${vectorResult.stored} 条存储, ${vectorResult.skipped} 条去重跳过`);

        // 向量化完成回调 — 通知 UI 层展示结果（无论成功与否都报告，让用户看到发生了什么）
        callbacks?.onVectorizeComplete?.({
            stored: vectorResult.stored,
            skipped: vectorResult.skipped,
            rebuilt: rebuildResult.rebuilt,
            storedNodes: vectorResult.storedNodes,
            rebuiltNodes: rebuildResult.rebuiltNodes,
            chunkResults,
            hwmBefore: lastProcessedId,
            hwmAfter: safeHighWaterMark,
        });

        // 9. 安全更新高水位标记 — 只推进到最后一个验证通过的批次末尾
        //    失败/异常的批次之后的消息不会被跳过，下次管线运行时会重新处理
        if (safeHighWaterMark > lastProcessedId) {
            setLastProcessedId(charId, safeHighWaterMark);
            console.log(`✅ [Pipeline] 水位线安全推进: hwm ${lastProcessedId} → ${safeHighWaterMark}`);
        } else {
            console.warn(`⚠️ [Pipeline] 所有批次均异常，水位线不变: hwm ${lastProcessedId}`);
        }

        // 构建完成信息
        const hwmInfo = safeHighWaterMark > lastProcessedId
            ? `水位线 #${lastProcessedId} → #${safeHighWaterMark}`
            : `水位线不变 #${lastProcessedId}（批次异常）`;
        const failInfo = failedChunks.length > 0
            ? `\n${failedChunks.length} 批异常，相关消息下次重试`
            : '';
        broadcast(`记忆整理完成！新增 ${vectorResult.stored} 条记忆\n${hwmInfo}${failInfo}`);

        // 10. 建关联（仅规则，不调 LLM，省钱）— 失败不影响已保存的记忆
        try {
            const existingNodes = await MemoryNodeDB.getByCharId(charId);
            const justStored = existingNodes.filter(n => memories.some(nn => nn.id === n.id));
            const others = existingNodes.filter(n => !memories.some(nn => nn.id === n.id));
            await buildLinks(justStored, others);
            console.log(`🏰 [Pipeline] 关联建立完成（${justStored.length} 新节点 vs ${Math.min(others.length, 50)} 已有节点）`);
        } catch (e: any) {
            console.warn(`🏰 [Pipeline] 关联建立失败（不影响已保存记忆）: ${e.message}`);
        }

        // 10b. 跨时间事件关联：将 LLM 标注的 relatedTo 转为 causal link
        //      这些关联跨越了 buildLinks 的 24h 时间窗口，连接了旧事件和新后续
        if (allCrossTimeLinks.length > 0) {
            try {
                const crossLinks = allCrossTimeLinks.map(({ newMemoryId, existingMemoryId }) => ({
                    id: `ml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    sourceId: newMemoryId,
                    targetId: existingMemoryId,
                    type: 'causal' as const,
                    strength: 0.7,
                }));
                await MemoryLinkDB.saveMany(crossLinks);
                console.log(`🔗 [Pipeline] 跨时间事件关联：${crossLinks.length} 条 causal link（连接新记忆 ↔ 旧事件）`);
            } catch (e: any) {
                console.warn(`🔗 [Pipeline] 跨时间关联保存失败（不影响已保存记忆）: ${e.message}`);
            }
        }

        // 11. 巩固（纯计算）— 失败不影响已保存的记忆
        try {
            await runConsolidation(charId);
        } catch (e: any) {
            console.warn(`🏰 [Pipeline] 巩固失败（不影响已保存记忆）: ${e.message}`);
        }

    } catch (err: any) {
        console.error(`❌ [Pipeline] processNewMessages 失败 (charId=${charId}):`, err.message, err.stack?.split('\n')[1] || '');
    } finally {
        callbacks?.onBlockingStatus?.(''); // 确保阻塞遮罩在任何情况下都能解除
        processingLocks.delete(charId);
    }
}
