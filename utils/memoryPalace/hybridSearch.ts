/**
 * Memory Palace — 混合搜索 + 房间评分
 *
 * 向量 + BM25 融合 → 按房间特性调整评分 → BM25 关键词保底。
 *
 * 设计原则：
 * 1. 语义相似度是主干（similarity 权重最高）
 * 2. 新近度只做轻量调味（有下限，不会把老记忆压扁）
 * 3. 重要性≥8 的"人生事件"不受时间衰减影响
 * 4. BM25 强命中享有保底名额 + 分数补贴，确保专有名词（人名、地名、日期）
 *    能穿透纯向量召回的偏差进入最终 top-K
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
    living_room: { similarity: 0.60, recency: 0.20, importance: 0.20 },
    bedroom:     { similarity: 0.60, recency: 0.10, importance: 0.30 },
    study:       { similarity: 0.55, recency: 0.15, importance: 0.30 },
    user_room:   { similarity: 0.55, recency: 0.15, importance: 0.30 },
    self_room:   { similarity: 0.55, recency: 0.15, importance: 0.30 },
    attic:       { similarity: 0.70, recency: 0.00, importance: 0.30 },
    windowsill:  { similarity: 0.55, recency: 0.15, importance: 0.30 },
};

// 向量 vs BM25 权重：给 BM25 更高比重，保证专有名词（人名、地名、日期）能召回。
const VECTOR_WEIGHT = 0.70;
const BM25_WEIGHT = 0.30;

// 新近度衰减：每小时 0.9995（7天 ~91%，30天 ~70%，90天 ~34%，180天 ~12%）。
// 同时设最低地板，防止老记忆被 recency 项压到零。
const RECENCY_DECAY = 0.9995;
const RECENCY_FLOOR = 0.25;

// 候选池规模：向量与 BM25 各取 100（原 30），避免老但相关的记忆进不了融合阶段。
const VECTOR_POOL_SIZE = 100;
const BM25_POOL_SIZE = 100;

// BM25 保底名额：最终结果里强制保留 BM25 top-N，避免专有名词命中被向量排挤。
const KEYWORD_GUARANTEED_SLOTS = 5;
// 视为"关键词强命中"的归一化 BM25 分数阈值（归一化后最高分为 1.0）
const BM25_STRONG_MATCH_THRESHOLD = 0.15;

// 人生事件阈值：importance ≥ 此值的记忆视为"不可遗忘"，不参与 recency/importance 衰减。
const LIFE_EVENT_IMPORTANCE = 8;
// 人生事件记忆的 recency 保底（无论多久没被召回都至少达到这个值）
const LIFE_EVENT_RECENCY_FLOOR = 0.70;

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

    // 2. 向量搜索（远程优先，本地兜底）— 扩大候选池，给老记忆入围机会
    const vectorResults = await vectorSearch(queryVector, charId, 0.3, VECTOR_POOL_SIZE, remoteVectorConfig);

    // 3. BM25 搜索（在所有已向量化的记忆中搜索）— 候选池同样扩大
    const allNodes = await MemoryNodeDB.getByCharId(charId);
    const embeddedNodes = allNodes.filter(n => n.embedded);
    const bm25Results = bm25Search(query, embeddedNodes, BM25_POOL_SIZE);

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
        // 优先使用本地完整 node（含 boxId, boxTopic, 真实 accessCount 等）
        // 云端返回的轻量 node 仅作兜底
        const fullNode = localNodeMap.get(vr.node.id) || vr.node;
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

        // 混合相似度（语义 + 关键词）
        const hybridSim = VECTOR_WEIGHT * vectorSim + BM25_WEIGHT * bm25Score;

        // 新近度：指数衰减 + 最低地板，避免老记忆在加权和里彻底消失
        const hoursAgo = (now - node.lastAccessedAt) / (1000 * 60 * 60);
        let recency = Math.max(Math.pow(RECENCY_DECAY, hoursAgo), RECENCY_FLOOR);

        // 人生事件豁免：importance ≥ 8 的记忆新近度享受保底
        // （"外公心梗住院"这种事，不会因为 5 个月没提就被忘掉）
        if (node.importance >= LIFE_EVENT_IMPORTANCE) {
            recency = Math.max(recency, LIFE_EVENT_RECENCY_FLOOR);
        }

        // 有效重要性（归一化到 0-1）— 内部已对高重要性记忆豁免衰减
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

    if (results.length === 0) return [];

    // 6. BM25 保底通道：关键词强命中的记忆必入选
    //    场景：用户明说"我外公生病" → BM25 直接命中"外公"的老记忆，
    //    但该记忆因时间久远在 hybrid 排名里被压到 50 开外，
    //    这里通过"分数补贴"把它提到中位线附近，保证它能进入 top-K 且不垫底。
    const bm25Ranking = [...results]
        .filter(r => r.bm25Score >= BM25_STRONG_MATCH_THRESHOLD)
        .sort((a, b) => b.bm25Score - a.bm25Score)
        .slice(0, KEYWORD_GUARANTEED_SLOTS);

    const subsidizedIds = new Set<string>();
    if (bm25Ranking.length > 0) {
        // 用 hybrid 排序里第 ⌈topK/2⌉ 名的分数作为"中位票价"
        const hybridSorted = [...results].sort((a, b) => b.finalScore - a.finalScore);
        const medianIdx = Math.min(Math.ceil(topK / 2) - 1, hybridSorted.length - 1);
        const medianScore = hybridSorted[medianIdx]?.finalScore ?? 0;
        const subsidyFloor = medianScore * 0.90;

        for (const r of bm25Ranking) {
            if (r.finalScore < subsidyFloor) {
                // 保底补贴：拉到中位线 90% + 小量 BM25 分做 tie-break
                r.finalScore = subsidyFloor + r.bm25Score * 0.05;
                r.roomScore = r.finalScore;
                subsidizedIds.add(r.node.id);
            }
        }
    }

    // 7. 按 finalScore 降序，截取 top-K
    results.sort((a, b) => b.finalScore - a.finalScore);
    const finalResults = results.slice(0, topK);

    // 8. 可选调试日志：打印每条命中记忆的评分拆解（localStorage 开关）
    //    浏览器 Console 执行 `localStorage.setItem('os_memory_palace_debug_recall','1')` 开启
    //    再执行 `localStorage.removeItem('os_memory_palace_debug_recall')` 关闭
    debugLogRecall(query, finalResults, subsidizedIds, now);

    return finalResults;
}

// ─── 调试日志 ─────────────────────────────────────────

function isDebugEnabled(): boolean {
    try {
        return typeof localStorage !== 'undefined'
            && localStorage.getItem('os_memory_palace_debug_recall') === '1';
    } catch {
        return false;
    }
}

function debugLogRecall(
    query: string,
    results: ScoredMemory[],
    subsidizedIds: Set<string>,
    now: number,
): void {
    if (!isDebugEnabled()) return;

    const rows = results.map((r, i) => {
        const ageDays = ((now - r.node.createdAt) / (1000 * 60 * 60 * 24));
        const accessAgeDays = ((now - r.node.lastAccessedAt) / (1000 * 60 * 60 * 24));
        return {
            '#': i + 1,
            room: r.node.room,
            imp: r.node.importance,
            sim: r.similarity.toFixed(3),
            bm25: r.bm25Score.toFixed(3),
            '创建(天前)': ageDays.toFixed(1),
            '上次召回(天前)': accessAgeDays.toFixed(1),
            final: r.finalScore.toFixed(3),
            保底: subsidizedIds.has(r.node.id) ? '✓' : '',
            人生事件: r.node.importance >= LIFE_EVENT_IMPORTANCE ? '✓' : '',
            content: r.node.content.slice(0, 40) + (r.node.content.length > 40 ? '…' : ''),
        };
    });

    console.groupCollapsed(`🔍 [MemoryRecall] query 长度 ${query.length} 字 → ${results.length} 条记忆`);
    // 打印完整 query，便于验证"当前轮 + 上一轮"是否都进来了
    console.log('📝 完整 query：');
    console.log(query);
    console.log('📊 打分明细：');
    console.table(rows);
    console.log(
        `参数: VEC=${VECTOR_WEIGHT}, BM25=${BM25_WEIGHT}, `
        + `recencyDecay=${RECENCY_DECAY}/h (floor=${RECENCY_FLOOR}), `
        + `人生事件阈值=${LIFE_EVENT_IMPORTANCE} (recency保底=${LIFE_EVENT_RECENCY_FLOOR}), `
        + `BM25保底名额=${KEYWORD_GUARANTEED_SLOTS} (强命中阈值=${BM25_STRONG_MATCH_THRESHOLD})`
    );
    console.groupEnd();
}
