/**
 * Memory Palace — 混合搜索 + 房间评分
 *
 * 85% 向量 + 15% BM25 融合，然后按房间特性调整评分。
 */

import type { EmbeddingConfig, MemoryNode, MemoryRoom, ScoredMemory, RemoteVectorConfig } from './types';
import { MemoryNodeDB } from './db';
import { getEmbedding } from './embedding';
import { vectorSearch } from './vectorSearch';
import { bm25Search } from './bm25';
import { calculateEffectiveImportance } from './consolidation';

// ─── 房间评分权重 ─────────────────────────────────────

interface RoomWeights {
    similarity: number;
    recency: number;
    importance: number;
}

const ROOM_WEIGHTS: Record<MemoryRoom, RoomWeights> = {
    living_room: { similarity: 0.50, recency: 0.30, importance: 0.20 },
    bedroom:     { similarity: 0.60, recency: 0.10, importance: 0.30 },
    study:       { similarity: 0.55, recency: 0.15, importance: 0.30 },
    user_room:   { similarity: 0.55, recency: 0.15, importance: 0.30 },
    self_room:   { similarity: 0.55, recency: 0.15, importance: 0.30 },
    attic:       { similarity: 0.70, recency: 0.00, importance: 0.30 },
    windowsill:  { similarity: 0.55, recency: 0.15, importance: 0.30 },
};

const VECTOR_WEIGHT = 0.85;
const BM25_WEIGHT = 0.15;
const RECENCY_DECAY = 0.999; // per hour

// ─── 混合搜索 ─────────────────────────────────────────

/**
 * 混合搜索：向量 + BM25 + 房间评分
 *
 * @param query 查询文本（通常为最近 3 条消息拼接）
 * @param charId 角色 ID
 * @param embeddingConfig Embedding 配置
 * @param topK 最终返回数量
 */
export async function hybridSearch(
    query: string,
    charId: string,
    embeddingConfig: EmbeddingConfig,
    topK: number = 15,
    remoteVectorConfig?: RemoteVectorConfig,
): Promise<ScoredMemory[]> {
    // 1. 向量化查询
    const queryVector = await getEmbedding(query, embeddingConfig);

    // 2. 向量搜索（远程优先，本地兜底）
    //
    // 历史教训：曾经把这个候选池从 30 扩到 60 试图放大同主题召回广度，
    // 结果反而变差——sim 0.35-0.45 的"泛情感高 imp"记忆被放进来，
    // 在房间评分（sim 权重 55%、imp/recency 合计 45%）里凭借 imp 和
    // recency 反超了 sim 更精准但 imp_eff 偏低的话题目标记忆（如"外公"
    // 落在 study 房间，imp 衰减过）。
    // 结论：候选池不应作为召回广度的旋钮。精准度靠 per-message 多路搜
    // + imp floor 在 pipeline 层解决，候选池 30 已足够。
    const vectorResults = await vectorSearch(queryVector, charId, 0.3, 30, remoteVectorConfig);

    // 3. BM25 搜索（排除 archived 节点 —— 它们已被压入 EventBox summary）
    const allNodes = await MemoryNodeDB.getByCharId(charId);
    const searchableNodes = allNodes.filter(n => n.embedded && !n.archived);
    const bm25Results = bm25Search(query, searchableNodes, 30);

    // 3b. 本地节点索引：用于将云端返回的轻量 node 补全为完整 node
    //     （allNodes 已在内存中，零额外开销）
    const localNodeMap = new Map(allNodes.map(n => [n.id, n]));

    // 4. 融合：构建 nodeId → scores 映射
    const scoreMap = new Map<string, {
        node: MemoryNode;
        vectorSim: number;
        bm25Score: number;
    }>();

    // 归一化 BM25 分数到 0-1
    const maxBm25 = bm25Results.length > 0 ? bm25Results[0].score : 1;

    for (const vr of vectorResults) {
        // 优先使用本地完整 node（含 eventBoxId / archived 等最新状态）
        const fullNode = localNodeMap.get(vr.node.id) || vr.node;
        // 二次保险：本地态显示 archived → 跳过（远程刚被 archive 但 RPC 未及时反映的情况）
        if (fullNode.archived) continue;
        scoreMap.set(vr.node.id, {
            node: fullNode,
            vectorSim: vr.similarity,
            bm25Score: 0,
        });
    }

    for (const br of bm25Results) {
        const normalized = maxBm25 > 0 ? br.score / maxBm25 : 0;
        const existing = scoreMap.get(br.node.id);
        if (existing) {
            existing.bm25Score = normalized;
        } else {
            scoreMap.set(br.node.id, {
                node: br.node,
                vectorSim: 0,
                bm25Score: normalized,
            });
        }
    }

    // 5. 计算混合分数 + 房间评分
    const now = Date.now();
    const results: ScoredMemory[] = [];

    for (const [, entry] of scoreMap) {
        const { node, vectorSim, bm25Score } = entry;

        // 混合相似度
        const hybridSim = VECTOR_WEIGHT * vectorSim + BM25_WEIGHT * bm25Score;

        // 新近度（指数衰减）
        const hoursAgo = (now - node.lastAccessedAt) / (1000 * 60 * 60);
        const recency = Math.pow(RECENCY_DECAY, hoursAgo);

        // 有效重要性（归一化到 0-1）
        const effectiveImp = calculateEffectiveImportance(node, now) / 10;

        // 房间权重
        const weights = ROOM_WEIGHTS[node.room];
        const roomScore =
            weights.similarity * hybridSim +
            weights.recency * recency +
            weights.importance * effectiveImp;

        results.push({
            node,
            finalScore: roomScore,
            similarity: vectorSim,
            bm25Score,
            roomScore,
        });
    }

    // 6. 按 finalScore 降序
    results.sort((a, b) => b.finalScore - a.finalScore);

    return results.slice(0, topK);
}
