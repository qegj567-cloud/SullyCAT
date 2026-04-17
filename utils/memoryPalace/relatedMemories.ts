/**
 * Memory Palace — 取相关记忆的共享 helper
 *
 * 在记忆提取流程中（聊天 buffer 路径 + 旧聊天迁移路径），
 * 我们需要让 LLM 看到一些"已经存在的、可能相关的旧记忆"，
 * 这样它才能：
 *   ① 避免误解隐式指代
 *   ② 输出 relatedTo 标记，把新记忆和旧事件绑成同一个 EventBox
 *
 * 输入：若干段对话/日志文本
 * 流程：3 段并行 embedding → 并行向量搜索 → 合并去重 → top-N
 * 输出：RelatedMemoryRef[]（带 id/room/content）
 */

import type { EmbeddingConfig } from './types';
import type { RelatedMemoryRef } from './extraction';
import { getEmbeddings } from './embedding';
import { vectorSearch } from './vectorSearch';

export interface FetchRelatedOptions {
    /** 单段查询的相似度阈值，默认 0.35 */
    threshold?: number;
    /** 单段查询取 top 几条，默认 5 */
    perQueryTopK?: number;
    /** 合并后最多返回多少条，默认 10 */
    maxTotal?: number;
    /** 内容截断长度，默认 100 字 */
    contentTruncate?: number;
}

/**
 * 用一组文本片段搜出相关旧记忆。
 *
 * 使用场景：
 * - 缓冲区提取：传聊天记录头/中/尾各一段
 * - 旧记忆迁移：传当前 chunk 的日志摘要
 *
 * 注意：
 * - 内部失败不抛错，返回空数组（调用方流程不应被中断）
 * - 已存在的活记忆才会返回（archived 节点会被 vectorSearch 自动过滤）
 *
 * @param snippets 用于做向量查询的文本片段（每段约 300 字）
 * @param charId 角色 ID
 * @param embeddingConfig Embedding 配置
 * @param opts 调参
 */
export async function fetchRelatedMemoriesForExtraction(
    snippets: string[],
    charId: string,
    embeddingConfig: EmbeddingConfig,
    opts: FetchRelatedOptions = {},
): Promise<RelatedMemoryRef[]> {
    const validSnippets = snippets.map(s => s.trim()).filter(s => s.length > 0);
    if (validSnippets.length === 0) return [];

    const threshold = opts.threshold ?? 0.35;
    const perQueryTopK = opts.perQueryTopK ?? 5;
    const maxTotal = opts.maxTotal ?? 10;
    const contentTruncate = opts.contentTruncate ?? 100;

    try {
        // 并行 embedding
        const vectors = await getEmbeddings(validSnippets, embeddingConfig);

        // 并行向量搜索
        const searchResults = await Promise.all(
            vectors.map(vec => vectorSearch(vec, charId, threshold, perQueryTopK))
        );

        // 合并去重：同一记忆保留最高相似度
        const seen = new Map<string, { node: any; similarity: number }>();
        for (const results of searchResults) {
            for (const r of results) {
                const existing = seen.get(r.node.id);
                if (!existing || r.similarity > existing.similarity) {
                    seen.set(r.node.id, r);
                }
            }
        }

        // 按相似度降序
        const related = [...seen.values()]
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxTotal);

        return related.map(r => ({
            id: r.node.id,
            room: r.node.room,
            content: (r.node.content || '').slice(0, contentTruncate),
        }));
    } catch (e: any) {
        console.warn(`🏰 [RelatedMemories] 检索失败（不影响主流程）: ${e?.message || e}`);
        return [];
    }
}

/**
 * 从一段消息列表中切出头/中/尾 3 段文本片段。
 * 用于聊天 buffer 路径，覆盖整段对话的话题变化。
 */
export function sampleSnippetsFromMessages(
    messages: { content: string }[],
    sampleSize: number = 5,
    snippetCharLimit: number = 300,
): string[] {
    const len = messages.length;
    if (len === 0) return [];

    const ranges = [
        messages.slice(0, sampleSize),
        messages.slice(
            Math.max(0, Math.floor(len / 2) - Math.floor(sampleSize / 2)),
            Math.floor(len / 2) + Math.ceil(sampleSize / 2),
        ),
        messages.slice(Math.max(0, len - sampleSize)),
    ];

    const snippets: string[] = [];
    for (const range of ranges) {
        const text = range.map(m => m.content).join('\n').slice(0, snippetCharLimit);
        if (text.trim()) snippets.push(text);
    }
    return snippets;
}
