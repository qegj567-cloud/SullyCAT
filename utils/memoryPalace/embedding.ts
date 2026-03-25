/**
 * Memory Palace — Embedding 服务
 *
 * 调用 OpenAI 兼容的 Embedding API，将文本转为向量。
 * 支持硅基流动 / 阿里云 / 字节等端点。
 */

import type { EmbeddingConfig } from './types';

// ─── 核心 API 调用 ────────────────────────────────────

/**
 * 单条文本向量化
 */
export async function getEmbedding(text: string, config: EmbeddingConfig): Promise<number[]> {
    const results = await getEmbeddings([text], config);
    return results[0];
}

/**
 * 批量文本向量化（一次最多 20 条，超出自动分批）
 */
export async function getEmbeddings(texts: string[], config: EmbeddingConfig): Promise<number[][]> {
    if (texts.length === 0) return [];

    const BATCH_SIZE = 20;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const batchResults = await callEmbeddingAPI(batch, config);
        results.push(...batchResults);
    }

    return results;
}

/**
 * 实际调用 Embedding API
 */
async function callEmbeddingAPI(
    input: string[], config: EmbeddingConfig, retryCount: number = 0
): Promise<number[][]> {
    const url = `${config.baseUrl.replace(/\/+$/, '')}/embeddings`;

    const body = {
        model: config.model,
        input,
        dimensions: config.dimensions,
        encoding_format: 'float',
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`Embedding API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (!data.data || !Array.isArray(data.data)) {
            throw new Error(`Embedding API returned unexpected format: ${JSON.stringify(data).slice(0, 200)}`);
        }

        // OpenAI 格式: data[].embedding[]
        // 按 index 排序确保顺序正确
        const sorted = [...data.data].sort((a: any, b: any) => a.index - b.index);
        return sorted.map((item: any) => item.embedding as number[]);

    } catch (err: any) {
        // 重试一次
        if (retryCount < 1) {
            console.warn(`⚡ [Embedding] Retry after error: ${err.message}`);
            await new Promise(r => setTimeout(r, 1000));
            return callEmbeddingAPI(input, config, retryCount + 1);
        }
        throw err;
    }
}

// ─── 数学工具 ──────────────────────────────────────────

/**
 * 余弦相似度
 * 返回值范围 [-1, 1]，越接近 1 越相似
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
}
