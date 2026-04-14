/**
 * Memory Palace — Reranker（交叉编码器精排）
 *
 * bi-encoder（向量搜索）的痛点：query 和每条记忆独立编码，
 * 相似度只看向量空间的距离，理解不了"我想家"和"外公心梗住院"之间的
 * 语义关系。cross-encoder 把 (query, 候选) 拼起来过注意力，
 * 直接输出相关性分，精度显著高于 bi-encoder。
 *
 * API 兼容：
 *   - 硅基流动 /v1/rerank（默认）
 *   - 阿里云百炼 /rerank
 *   - Jina /v1/rerank
 *   这些 API 的 request/response 形状基本一致（Cohere 约定）。
 */

import type { RerankerConfig, ScoredMemory } from './types';
import { safeResponseJson } from '../safeApi';
import { calculateEffectiveImportance } from './consolidation';

// ─── 评分融合常量 ────────────────────────────────────
// rerank 后最终分 = RERANK_WEIGHT × rerankScore + RECENCY_WEIGHT × recency + IMP_WEIGHT × effectiveImp
// 85% 让 cross-encoder 说了算，recency/effImp 只做轻量调制，避免一堆 imp=10
// 的底层设定性记忆靠重要性 buff 挤占当下相关的记忆。
const RERANK_WEIGHT = 0.85;
const RECENCY_WEIGHT = 0.05;
const IMP_WEIGHT = 0.10;
// 复用 hybridSearch 里的衰减参数（保持行为一致）
const RECENCY_DECAY_PER_HOUR = 0.9995;
const RECENCY_FLOOR = 0.25;
const LIFE_EVENT_IMP = 8;
const LIFE_EVENT_RECENCY_FLOOR = 0.70;

export interface RerankResult {
    /** 对应入参 documents 数组中的下标 */
    index: number;
    /** 归一化后的相关性分，通常在 0-1 之间（部分模型可能超出） */
    relevance_score: number;
}

/**
 * 调用 reranker 精排。
 *
 * @param query 查询文本
 * @param documents 候选记忆文本数组（保持与 scoredMemory 顺序一致）
 * @param config RerankerConfig
 * @param topN 返回前 N 条（不传则全部返回）
 * @returns 按 relevance_score 降序排列的 RerankResult[]；失败抛错由上层降级
 */
export async function rerank(
    query: string,
    documents: string[],
    config: RerankerConfig,
    topN?: number,
): Promise<RerankResult[]> {
    if (!config.enabled) throw new Error('Reranker 未启用');
    if (!config.baseUrl || !config.apiKey) throw new Error('Reranker baseUrl/apiKey 未配置');
    if (documents.length === 0) return [];

    const url = `${config.baseUrl.replace(/\/+$/, '')}/rerank`;
    const body: any = {
        model: config.model || 'BAAI/bge-reranker-v2-m3',
        query,
        documents,
        return_documents: false,
    };
    if (typeof topN === 'number' && topN > 0) body.top_n = Math.min(topN, documents.length);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        // 抛出带状态码的错误，pipeline 层会降级到 hybrid 打分
        const text = await response.text().catch(() => '');
        throw new Error(`Reranker HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await safeResponseJson(response);
    const results: any[] = data?.results || data?.data?.results || [];

    return results
        .map((r: any) => ({
            index: typeof r.index === 'number' ? r.index : -1,
            relevance_score: typeof r.relevance_score === 'number'
                ? r.relevance_score
                : (typeof r.score === 'number' ? r.score : 0),
        }))
        .filter(r => r.index >= 0 && r.index < documents.length)
        .sort((a, b) => b.relevance_score - a.relevance_score);
}

/**
 * 对 hybridSearch 返回的候选池做 rerank 精排 + 重要性/新近度融合。
 *
 * @param candidates hybridSearch 返回的候选（通常 50 条）
 * @param query      当前用户查询
 * @param config     Reranker 配置
 * @param topK       最终返回数量（默认 15）
 * @returns          按新分数降序的 ScoredMemory[]，similarity 字段被替换为 rerank 分
 *
 * 失败时抛错，由调用方降级到原 candidates。
 */
export async function applyRerankAndFuse(
    candidates: ScoredMemory[],
    query: string,
    config: RerankerConfig,
    topK: number = 15,
): Promise<ScoredMemory[]> {
    if (candidates.length === 0) return [];

    const docs = candidates.map(c => c.node.content);
    // 精排只保留 topK * 2 的候选（减少后续计算量），但不少于 20
    const keepN = Math.max(topK * 2, 20);
    const rerankResults = await rerank(query, docs, config, keepN);

    const now = Date.now();
    const out: ScoredMemory[] = [];

    for (const rr of rerankResults) {
        const original = candidates[rr.index];
        if (!original) continue;
        const node = original.node;

        const hoursAgo = (now - node.lastAccessedAt) / (1000 * 60 * 60);
        let recency = Math.max(Math.pow(RECENCY_DECAY_PER_HOUR, hoursAgo), RECENCY_FLOOR);
        if (node.importance >= LIFE_EVENT_IMP) {
            recency = Math.max(recency, LIFE_EVENT_RECENCY_FLOOR);
        }
        const effImp = calculateEffectiveImportance(node, now) / 10;

        const finalScore =
            RERANK_WEIGHT * rr.relevance_score
            + RECENCY_WEIGHT * recency
            + IMP_WEIGHT * effImp;

        out.push({
            node,
            finalScore,
            similarity: rr.relevance_score, // 用 rerank 分替换原 vectorSim，debug log 里能看到
            bm25Score: original.bm25Score,  // 保留原 BM25 分做参考
            roomScore: finalScore,
        });
    }

    // rerank API 返回的顺序已经是 relevance 降序，但融合后可能有变动，重新排一遍
    out.sort((a, b) => b.finalScore - a.finalScore);
    return out.slice(0, topK);
}

/**
 * 从 localStorage 读取 reranker 配置。
 * 与 embedding 类似：优先读全局 os_memory_palace_config.reranker，
 * reuseEmbedding=true 时自动把 embedding 的 baseUrl+apiKey 灌进来。
 */
export function getRerankerConfig(): RerankerConfig | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem('os_memory_palace_config');
        if (!raw) return null;
        const cfg = JSON.parse(raw);
        const rr = cfg?.reranker;
        if (!rr || !rr.enabled) return null;

        // 决定 baseUrl 和 apiKey：reuseEmbedding 时从 embedding 借
        const emb = cfg?.embedding || {};
        const useReuse = rr.reuseEmbedding !== false && (!rr.baseUrl || !rr.apiKey);
        const baseUrl = useReuse ? (rr.baseUrl || emb.baseUrl || '') : rr.baseUrl;
        const apiKey = useReuse ? (rr.apiKey || emb.apiKey || '') : rr.apiKey;

        if (!baseUrl || !apiKey) return null;

        return {
            enabled: true,
            baseUrl,
            apiKey,
            model: rr.model || 'BAAI/bge-reranker-v2-m3',
        };
    } catch {
        return null;
    }
}
