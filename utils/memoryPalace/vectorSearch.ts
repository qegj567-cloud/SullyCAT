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
    if (remoteConfig?.enabled && remoteConfig.initialized) {
        try {
            const remoteResults = await remoteSearch(remoteConfig, queryVector, charId, threshold, topK);
            if (remoteResults.length > 0) {
                // 远程结果已包含内容，构建轻量 MemoryNode
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
                        boxId: '',
                        boxTopic: '',
                        createdAt: r.createdAt || Date.now(),
                        lastAccessedAt: r.createdAt || Date.now(),
                        accessCount: 0,
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

    // 加载对应的 MemoryNode
    const results: VectorSearchResult[] = [];
    for (const item of scored) {
        const node = await MemoryNodeDB.getById(item.memoryId);
        if (node) {
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
        const timeout = setTimeout(() => {
            // Worker 超时（5秒），回退到主线程
            resolve(mainThreadSearch(queryVector, vectors, threshold, topK));
        }, 5000);

        w.onmessage = (e: MessageEvent) => {
            clearTimeout(timeout);
            resolve(e.data.results);
        };

        // 传输 plain arrays（结构化克隆支持 Float32Array）
        w.postMessage({
            queryVector: queryVector instanceof Float32Array ? Array.from(queryVector) : queryVector,
            vectors: vectors.map(v => ({
                memoryId: v.memoryId,
                vector: v.vector instanceof Float32Array ? Array.from(v.vector) : v.vector,
            })),
            threshold,
            topK,
        });
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
