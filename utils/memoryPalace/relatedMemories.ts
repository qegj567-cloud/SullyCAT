/**
 * Memory Palace — 取相关记忆的共享 helper
 *
 * 在记忆提取流程中（聊天 buffer 路径 + 旧聊天迁移路径），
 * 我们需要让 LLM 看到一些"已经存在的、可能相关的旧记忆"，
 * 这样它才能：
 *   ① 避免误解隐式指代
 *   ② 输出 relatedTo 标记，把新记忆和旧事件绑成同一个 EventBox
 *
 * 核心策略：**细粒度 per-event 查询**，而不是把大段文本切 3 段 embed。
 * - 迁移路径：把 YAML 列表 (`- 事件X`) 拆成每个 bullet 一个 query
 * - 聊天 buffer 路径：每条 ≥4 字的 user 消息独立 query
 * - 切不出细粒度（非 YAML / 全是短消息）时自动 fallback 到旧的 3 段切法
 *
 * 结果合并：同一记忆取最高相似度；按相似度降序取 top N。
 */

import type { EmbeddingConfig } from './types';
import type { RelatedMemoryRef } from './extraction';
import { getEmbeddings } from './embedding';
import { vectorSearch } from './vectorSearch';

export interface FetchRelatedOptions {
    /** 单段查询的相似度阈值，默认 0.40（细粒度 query 下给点宽松度） */
    threshold?: number;
    /** 单段查询取 top 几条，默认 3（太少会错过稍微改写的同事件） */
    perQueryTopK?: number;
    /** 合并后最多返回多少条，默认 15 */
    maxTotal?: number;
    /** 内容截断长度，默认 100 字 */
    contentTruncate?: number;
}

/**
 * 用一组文本片段搜出相关旧记忆。
 *
 * 使用场景：
 * - 缓冲区提取：传每条 ≥4 字的 user 消息
 * - 旧记忆迁移：传拆分后的 bullet 列表
 *
 * @param snippets 用于做向量查询的文本片段（精细粒度，一条事件/一条消息一段）
 */
export async function fetchRelatedMemoriesForExtraction(
    snippets: string[],
    charId: string,
    embeddingConfig: EmbeddingConfig,
    opts: FetchRelatedOptions = {},
): Promise<RelatedMemoryRef[]> {
    const validSnippets = snippets.map(s => s.trim()).filter(s => s.length > 0);
    if (validSnippets.length === 0) return [];

    const threshold = opts.threshold ?? 0.40;
    const perQueryTopK = opts.perQueryTopK ?? 3;
    const maxTotal = opts.maxTotal ?? 15;
    const contentTruncate = opts.contentTruncate ?? 100;

    try {
        // 并行 batch embedding（一次请求拿回所有向量，便宜）
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

// ─── 细粒度拆分：YAML bullets（迁移路径用） ──────────────

/**
 * 把 YAML 列表格式的总结文本拆成每个 bullet 一个片段。
 *
 * 典型输入：
 *   - 今天吃了蛋糕，很开心
 *   - 晚上和妈妈吵架了
 *   - 决定明天去跑步
 * 输出：[
 *   "今天吃了蛋糕，很开心",
 *   "晚上和妈妈吵架了",
 *   "决定明天去跑步",
 * ]
 *
 * 兼容 "- " / "-  " / "- \t" 以及以连字符开头的多行内容（仅切行首的 -）。
 *
 * @returns bullet 片段数组；如果切不出 ≥ 2 条，返回空数组表示"不是列表格式"
 */
/**
 * 支持的 bullet 字符：ASCII hyphen、Chinese 全角破折号 －、em dash —、bullet
 * dot •、middle dot ·、asterisk *。LLM / Markdown 渲染器可能产出任一种，
 * 只认 ASCII `-` 会漏掉很多真实列表。
 */
const BULLET_LEAD_RE = /[-－—•·*]/;
const BULLET_SPLIT_RE = /\n(?=[-－—•·*][\s\u3000])/;      // 换行后紧跟任一 bullet 字符 + 空白
const BULLET_STRIP_RE = /^[-－—•·*][\s\u3000]+/;           // 行首 bullet 字符 + 空白

export function splitYamlBullets(text: string): string[] {
    if (!text) return [];
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];
    // 若整段根本没有任一 bullet 字符 → 必然不是列表
    if (!BULLET_LEAD_RE.test(normalized)) return [];
    // 按"换行 + 行首 bullet"切
    const parts = normalized.split(BULLET_SPLIT_RE);
    const bullets: string[] = [];
    for (const part of parts) {
        const s = part.replace(BULLET_STRIP_RE, '').trim();
        if (s.length >= 4) bullets.push(s);
    }
    // 至少 2 条才算有效列表
    return bullets.length >= 2 ? bullets : [];
}

/**
 * 给迁移路径用的细粒度拆分：
 * 把一批 daily logs 拍平成 bullet 列表。
 * 每条 bullet 前缀上日期，方便 embedding 时保留时间线索。
 *
 * 如果无法拆出 bullets（有些用户可能改过归档模板），返回空数组；
 * 调用方应 fallback 到传统的 3 段切法。
 */
export function splitLogsToBullets(
    logs: { date: string; summary: string }[],
): string[] {
    const bullets: string[] = [];
    let usedBulletFormat = 0;
    for (const log of logs) {
        const items = splitYamlBullets(log.summary);
        if (items.length > 0) {
            usedBulletFormat++;
            for (const it of items) {
                bullets.push(`[${log.date}] ${it}`);
            }
        } else {
            // 整条日志作为一个片段兜底
            if (log.summary.trim().length >= 4) {
                bullets.push(`[${log.date}] ${log.summary.trim().slice(0, 300)}`);
            }
        }
    }
    // 只有"大部分日志都是 bullet 格式"才认为这个策略有效
    const ok = usedBulletFormat >= Math.max(1, Math.floor(logs.length * 0.3));
    return ok ? bullets : [];
}

// ─── 细粒度拆分：per-message（buffer 路径用） ─────────────

/**
 * Buffer 路径：每条 ≥ MIN_LEN 字的 user 消息独立作为 query。
 * 短语气词/纯标点/URL 过滤掉。
 *
 * 如果可用消息数 < 2，返回空数组，让调用方 fallback 到传统 3 段切法。
 */
export function splitMessagesToSpikes(
    messages: { role: string; content: string }[],
    minLen: number = 4,
    maxPerMsg: number = 300,
): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const m of messages) {
        if (m.role !== 'user') continue;
        let text = (m.content || '').trim();
        if (!text) continue;
        // 剥离 URL（embedding 里是随机噪声）
        text = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
        // 有意义字符数判断
        const meaningful = text.replace(/[\s\p{P}]/gu, '');
        if (meaningful.length < minLen) continue;
        const key = text.slice(0, 100);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(text.slice(0, maxPerMsg));
    }
    return out.length >= 2 ? out : [];
}

// ─── 兜底：传统 3 段切法（保留做 fallback） ──────────────

/**
 * 从一段消息列表中切出头/中/尾 3 段文本片段。
 * 兜底：当 per-message / per-bullet 拆分失败时用。
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
