/**
 * Memory Palace — BM25 搜索
 *
 * 关键词精确匹配，补偿向量搜索对专有名词的弱点。
 * 中文 2-gram 分词 + 英文空格分词 + TF-IDF 评分。
 * 纯前端计算，无需外部服务。
 */

import type { MemoryNode } from './types';

// BM25 参数
const K1 = 1.2;
const B = 0.75;

// ─── 分词 ──────────────────────────────────────────────

/**
 * 中文 2-gram + 英文按空格分词
 *
 * 示例：
 * "小明去了北京" → ["小明", "明去", "去了", "了北", "北京"]
 * "hello world" → ["hello", "world"]
 * "小明说hello" → ["小明", "明说", "hello"]
 */
export function tokenize(text: string): string[] {
    const tokens: string[] = [];
    // 先按非中文字符分割，提取英文 token
    const parts = text.split(/([a-zA-Z0-9]+)/);

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        if (/^[a-zA-Z0-9]+$/.test(trimmed)) {
            // 英文/数字：整词
            tokens.push(trimmed.toLowerCase());
        } else {
            // 中文：2-gram
            const cleaned = trimmed.replace(/[\s\p{P}]/gu, ''); // 去掉标点和空白
            for (let i = 0; i < cleaned.length - 1; i++) {
                tokens.push(cleaned.slice(i, i + 2));
            }
            // 如果只有 1 个字，也加入
            if (cleaned.length === 1) {
                tokens.push(cleaned);
            }
        }
    }

    return tokens;
}

// ─── BM25 搜索引擎 ────────────────────────────────────

interface BM25Result {
    node: MemoryNode;
    score: number;
}

/**
 * BM25 搜索
 *
 * @param query 搜索查询文本
 * @param nodes 候选记忆节点
 * @param topK 返回最多 topK 条
 */
export function bm25Search(
    query: string,
    nodes: MemoryNode[],
    topK: number = 20,
): BM25Result[] {
    if (nodes.length === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // 预处理：为每个文档建立 token 频率表
    const docTokens: string[][] = nodes.map(n => tokenize(n.content));

    // 计算平均文档长度
    const avgDl = docTokens.reduce((sum, t) => sum + t.length, 0) / docTokens.length;

    // 构建 IDF（Inverse Document Frequency）
    const docCount = nodes.length;
    const idf: Record<string, number> = {};

    for (const qt of queryTokens) {
        if (idf[qt] !== undefined) continue;
        // 包含该 token 的文档数
        const df = docTokens.filter(dt => dt.includes(qt)).length;
        // BM25 IDF 公式
        idf[qt] = Math.log((docCount - df + 0.5) / (df + 0.5) + 1);
    }

    // 计算每个文档的 BM25 分数
    const results: BM25Result[] = [];

    for (let i = 0; i < nodes.length; i++) {
        const dl = docTokens[i].length;
        if (dl === 0) continue;

        let score = 0;

        // 构建该文档的 token 频率表
        const tf: Record<string, number> = {};
        for (const t of docTokens[i]) {
            tf[t] = (tf[t] || 0) + 1;
        }

        for (const qt of queryTokens) {
            const termFreq = tf[qt] || 0;
            if (termFreq === 0) continue;

            const tfNorm = (termFreq * (K1 + 1)) / (termFreq + K1 * (1 - B + B * dl / avgDl));
            score += (idf[qt] || 0) * tfNorm;
        }

        if (score > 0) {
            results.push({ node: nodes[i], score });
        }
    }

    // 按分数降序
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
}
