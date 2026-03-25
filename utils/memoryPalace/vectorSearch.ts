/**
 * Memory Palace — 向量搜索
 *
 * 查询文本 → 向量化 → 与全部 memory_vectors 做余弦相似度 → 阈值过滤
 */

import type { MemoryNode } from './types';
import { MemoryNodeDB, MemoryVectorDB } from './db';
import { cosineSimilarity } from './embedding';

export interface VectorSearchResult {
    node: MemoryNode;
    similarity: number;
}

/**
 * 向量搜索：在指定角色的所有已向量化记忆中搜索
 *
 * @param queryVector 查询向量（已向量化）
 * @param charId 角色 ID
 * @param threshold 相似度阈值，默认 0.3
 * @param topK 返回最多 topK 条，默认 20
 */
export async function vectorSearch(
    queryVector: number[],
    charId: string,
    threshold: number = 0.3,
    topK: number = 20,
): Promise<VectorSearchResult[]> {
    // 加载该角色所有向量
    const vectors = await MemoryVectorDB.getAllByCharId(charId);
    if (vectors.length === 0) return [];

    // 计算相似度
    const scored: { memoryId: string; similarity: number }[] = [];

    for (const vec of vectors) {
        const sim = cosineSimilarity(queryVector, vec.vector);
        if (sim >= threshold) {
            scored.push({ memoryId: vec.memoryId, similarity: sim });
        }
    }

    // 按相似度降序
    scored.sort((a, b) => b.similarity - a.similarity);

    // 取 topK
    const topResults = scored.slice(0, topK);

    // 加载对应的 MemoryNode
    const results: VectorSearchResult[] = [];
    for (const item of topResults) {
        const node = await MemoryNodeDB.getById(item.memoryId);
        if (node) {
            results.push({ node, similarity: item.similarity });
        }
    }

    return results;
}
