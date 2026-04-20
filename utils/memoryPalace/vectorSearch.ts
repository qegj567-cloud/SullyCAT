/**
 * Memory Palace — 向量搜索（Web Worker 加速版）
 *
 * 查询文本 → 向量化 → 与该角色的 memory_vectors 做余弦相似度 → 阈值过滤
 *
 * 优化：
 * 1. 使用 charId 索引直查，不再全表扫描
 * 2. Float32Array 减少内存占用
 * 3. Web Worker 执行 cosine similarity，不阻塞主线程
 * 4. 回退：Worker 不可用时在主线程计算
 */

import type { MemoryNode, RemoteVectorConfig } from './types';
import { MemoryNodeDB, MemoryVectorDB } from './db';
import { cosineSimilarity } from './embedding';
import { searchVectors as remoteSearch } from './supabaseVector';

export interface VectorSearchResult {
    node: MemoryNode;
    similarity: number;
}

// Worker 单例（懒初始化）
let worker: Worker | null = null;
let workerFailed = false;

// 远程向量搜索会话级熔断：一旦 Supabase RPC 抛网络错误（CORS / fetch TypeError / 500
// 无 CORS 头）就关闭整个会话的远程路径，避免后续每条查询都踩一遍 CORS 然后回退本地，
// 15 次冗余加载全量向量库把 V8 typed-array arena 撕碎。
let remoteSearchBroken = false;

/** 把 worker 标记为坏掉并终止，确保不再被 getWorker() 拿到。 */
function markWorkerBroken(reason: string): void {
    if (workerFailed) return;
    console.warn(`[vectorSearch] disabling worker for this session: ${reason}`);
    workerFailed = true;
    if (worker) {
        try { worker.terminate(); } catch { /* ignore */ }
        worker = null;
    }
    // 同时清空等待中的 worker 请求，免得 Promise 挂死
    for (const resolve of workerPending.values()) resolve([]);
    workerPending.clear();
}

/** 供 relatedMemories 等上层快速判断本会话是否该跳过远程路径。 */
export function isRemoteSearchBroken(): boolean {
    return remoteSearchBroken;
}

function markRemoteBroken(reason: string): void {
    if (remoteSearchBroken) return;
    console.warn(`[vectorSearch] disabling remote search for this session: ${reason}`);
    remoteSearchBroken = true;
}

// Worker 多路复用：以 requestId 分发响应，避免并发时后一个 onmessage
// 覆盖前一个 handler、导致前面的 Promise 永挂。
const workerPending = new Map<number, (results: { memoryId: string; similarity: number }[]) => void>();
let nextWorkerRequestId = 1;

function attachWorkerHandlers(w: Worker): void {
    w.onmessage = (e: MessageEvent) => {
        const { requestId, results } = e.data || {};
        if (typeof requestId !== 'number') return;
        const resolve = workerPending.get(requestId);
        if (resolve) {
            workerPending.delete(requestId);
            resolve(results || []);
        }
    };
    w.onerror = () => markWorkerBroken('worker.onerror fired');
}

function getWorker(): Worker | null {
    if (workerFailed) return null;
    if (worker) return worker;
    try {
        worker = new Worker(
            new URL('./vectorSearchWorker.ts', import.meta.url),
            { type: 'module' }
        );
        attachWorkerHandlers(worker);
        return worker;
    } catch {
        workerFailed = true;
        return null;
    }
}

/**
 * 向量搜索：在指定角色的所有已向量化记忆中搜索
 *
 * @param queryVector 查询向量（已向量化）
 * @param charId 角色 ID
 * @param threshold 相似度阈值，默认 0.3
 * @param topK 返回最多 topK 条，默认 20
 * @param remoteConfig 远程向量存储配置（可选，有配置时优先走远程）
 */
export async function vectorSearch(
    queryVector: number[] | Float32Array,
    charId: string,
    threshold: number = 0.3,
    topK: number = 20,
    remoteConfig?: RemoteVectorConfig,
): Promise<VectorSearchResult[]> {
    // ─── 远程路径：Supabase pgvector ─────────────────
    // 注意：远程 RPC 已内置 archived=false 过滤
    if (remoteConfig?.enabled && remoteConfig.initialized && !remoteSearchBroken) {
        try {
            const remoteResults = await remoteSearch(remoteConfig, queryVector, charId, threshold, topK);
            if (remoteResults.length > 0) {
                // 远程结果已包含内容，构建轻量 MemoryNode（带 EventBox 字段）
                return remoteResults.map(r => ({
                    node: {
                        id: r.memoryId,
                        charId,
                        content: r.content,
                        room: r.room as any,
                        tags: r.tags,
                        importance: r.importance,
                        mood: r.mood,
                        embedded: true,
                        createdAt: r.createdAt || Date.now(),
                        lastAccessedAt: r.lastAccessedAt || r.createdAt || Date.now(),
                        accessCount: r.accessCount || 0,
                        eventBoxId: r.eventBoxId,
                        archived: r.archived,
                        isBoxSummary: r.isSummary,
                    },
                    similarity: r.similarity,
                }));
            }
            // 远程正常但这次没命中：直接返回空，不要再跑一遍本地（避免双倍耗时）。
            return [];
        } catch (e: any) {
            // 远程坏了（CORS / 500 无 CORS 头 / DNS 等网络错）：熔断整个会话的远程路径
            const msg = e?.message || String(e);
            markRemoteBroken(msg);
            // 本次查询回退到本地
        }
    }

    // ─── 本地路径：IndexedDB + Worker ────────────────
    const vectors = await MemoryVectorDB.getAllByCharId(charId);
    if (vectors.length === 0) return [];

    // 尝试使用 Worker 计算
    let scored: { memoryId: string; similarity: number }[];
    const w = getWorker();

    if (w) {
        scored = await runInWorker(w, queryVector, vectors, threshold, topK);
    } else {
        scored = mainThreadSearch(queryVector, vectors, threshold, topK);
    }

    // 加载对应的 MemoryNode（过滤 archived 节点）
    const results: VectorSearchResult[] = [];
    for (const item of scored) {
        const node = await MemoryNodeDB.getById(item.memoryId);
        if (node && !node.archived) {
            results.push({ node, similarity: item.similarity });
        }
    }

    return results;
}

/** Worker 通信 — 支持并发多路复用（用 requestId 区分响应） */
function runInWorker(
    w: Worker,
    queryVector: number[] | Float32Array,
    vectors: { memoryId: string; vector: number[] | Float32Array }[],
    threshold: number,
    topK: number,
): Promise<{ memoryId: string; similarity: number }[]> {
    return new Promise((resolve) => {
        // 全部归一到 Float32Array，准备走 transfer list 零拷贝。
        // 注意：transfer 后主线程这些 buffer 会被 neuter，所以 timeout 兜底
        // 不能再用 mainThreadSearch（会读到全 0 buffer 静默返空）。
        // 策略：超时时 resolve([]) 让当次查询退化成 BM25-only，同时把 worker
        // 标记为坏掉 —— 下一次 vectorSearch 在 getWorker() 处拿到 null，
        // 走主线程正确路径（无 transfer，无 neuter）。这样单次 worker 故障
        // 不会变成"永远静默少结果"的长期状态。
        const qv = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);
        const fvs = vectors.map(v => ({
            memoryId: v.memoryId,
            vector: v.vector instanceof Float32Array ? v.vector : new Float32Array(v.vector),
        }));

        const requestId = nextWorkerRequestId++;
        const timeout = setTimeout(() => {
            if (!workerPending.has(requestId)) return; // 已完成
            workerPending.delete(requestId);
            markWorkerBroken('timeout 10s — buffers neutered, cannot run mainThreadSearch on this call; subsequent calls will use main thread');
            resolve([]);
        }, 10000);

        workerPending.set(requestId, (results) => {
            clearTimeout(timeout);
            resolve(results);
        });

        // Transfer list：把所有 ArrayBuffer 移交给 worker，0 拷贝。
        // queryVector + 每个候选向量都是 charId 一次性的 Float32Array
        // （MemoryVectorDB.getAllByCharId 每次 ensureFloat32 都是新 buffer），
        // 调用方不会复用，转移安全。
        const transfers: Transferable[] = [qv.buffer, ...fvs.map(v => (v.vector as Float32Array).buffer)];
        try {
            w.postMessage({ requestId, queryVector: qv, vectors: fvs, threshold, topK }, transfers);
        } catch (e: any) {
            clearTimeout(timeout);
            workerPending.delete(requestId);
            markWorkerBroken(`postMessage failed: ${e?.message || e}`);
            resolve([]);
        }
    });
}

/** 主线程回退计算 */
function mainThreadSearch(
    queryVector: number[] | Float32Array,
    vectors: { memoryId: string; vector: number[] | Float32Array }[],
    threshold: number,
    topK: number,
): { memoryId: string; similarity: number }[] {
    const scored: { memoryId: string; similarity: number }[] = [];

    for (const vec of vectors) {
        const sim = cosineSimilarity(queryVector, vec.vector);
        if (sim >= threshold) {
            scored.push({ memoryId: vec.memoryId, similarity: sim });
        }
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
}
