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

function getWorker(): Worker | null {
    if (workerFailed) return null;
    if (worker) return worker;
    try {
        worker = new Worker(
            new URL('./vectorSearchWorker.ts', import.meta.url),
            { type: 'module' }
        );
        worker.onerror = () => { workerFailed = true; worker = null; };
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
    if (remoteConfig?.enabled && remoteConfig.initialized) {
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
            // 远程无结果，尝试本地兜底
        } catch {
            // 远程失败，回退到本地
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

/** Worker 通信 */
function runInWorker(
    w: Worker,
    queryVector: number[] | Float32Array,
    vectors: { memoryId: string; vector: number[] | Float32Array }[],
    threshold: number,
    topK: number,
): Promise<{ memoryId: string; similarity: number }[]> {
    return new Promise((resolve) => {
        // 全部归一到 Float32Array，准备走 transfer list 零拷贝。
        // 注意：transfer 后主线程这些 buffer 会被 neuter，所以下面的 timeout
        // 兜底不能再用 mainThreadSearch（会读到全 0 buffer 静默返空），
        // 直接 resolve([]) 让 hybridSearch 退化成纯 BM25。
        const qv = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);
        const fvs = vectors.map(v => ({
            memoryId: v.memoryId,
            vector: v.vector instanceof Float32Array ? v.vector : new Float32Array(v.vector),
        }));

        const timeout = setTimeout(() => {
            console.warn('[vectorSearch] worker timeout (5s) — buffers transferred, returning empty (BM25 will carry)');
            resolve([]);
        }, 5000);

        w.onmessage = (e: MessageEvent) => {
            clearTimeout(timeout);
            resolve(e.data.results);
        };

        // Transfer list：把所有 ArrayBuffer 移交给 worker，0 拷贝。
        // queryVector + 每个候选向量都是 charId 一次性的 Float32Array
        // （MemoryVectorDB.getAllByCharId 每次 ensureFloat32 都是新 buffer），
        // 调用方不会复用，转移安全。
        const transfers: Transferable[] = [qv.buffer, ...fvs.map(v => (v.vector as Float32Array).buffer)];
        w.postMessage({ queryVector: qv, vectors: fvs, threshold, topK }, transfers);
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
