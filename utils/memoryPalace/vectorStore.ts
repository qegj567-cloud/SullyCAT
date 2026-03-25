/**
 * Memory Palace — 向量化 + 存储 + 去重
 *
 * 将提取出的 MemoryNode 批量向量化，
 * 与已有向量做去重（余弦 > 0.9 跳过），
 * 然后存入 memory_nodes 和 memory_vectors。
 */

import type { EmbeddingConfig, MemoryNode, MemoryVector } from './types';
import { MemoryNodeDB, MemoryVectorDB } from './db';
import { getEmbeddings, cosineSimilarity } from './embedding';

const DEDUP_THRESHOLD = 0.9;

/**
 * 向量化并存储记忆节点
 *
 * 流程：
 * 1. 批量向量化 nodes 的 content
 * 2. 与已有向量做去重（cosine > 0.9 的跳过）
 * 3. 保存 MemoryNode (embedded=true) + MemoryVector
 */
export async function vectorizeAndStore(
    nodes: MemoryNode[],
    embeddingConfig: EmbeddingConfig,
): Promise<{ stored: number; skipped: number }> {
    if (nodes.length === 0) return { stored: 0, skipped: 0 };

    // 1. 批量向量化
    const texts = nodes.map(n => n.content);
    const vectors = await getEmbeddings(texts, embeddingConfig);

    // 2. 加载已有向量用于去重
    const charId = nodes[0].charId;
    const existingVectors = await MemoryVectorDB.getAllByCharId(charId);

    let stored = 0;
    let skipped = 0;

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const vector = vectors[i];

        // 去重检查
        const isDuplicate = existingVectors.some(
            ev => cosineSimilarity(vector, ev.vector) > DEDUP_THRESHOLD
        );

        if (isDuplicate) {
            console.log(`♻️ [VectorStore] Skipping duplicate memory: "${node.content.slice(0, 30)}..."`);
            skipped++;
            continue;
        }

        // 3. 保存
        node.embedded = true;
        await MemoryNodeDB.save(node);

        const memoryVector: MemoryVector = {
            memoryId: node.id,
            vector,
            dimensions: embeddingConfig.dimensions,
        };
        await MemoryVectorDB.save(memoryVector);

        // 将新向量也加入已有列表，后续去重时可以检测同批次内的重复
        existingVectors.push(memoryVector);

        stored++;
    }

    console.log(`✅ [VectorStore] Stored ${stored}, skipped ${skipped} duplicates`);
    return { stored, skipped };
}
