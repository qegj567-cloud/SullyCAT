/**
 * Memory Palace — 旧记忆迁移工具 (Migration)
 *
 * 按月把旧的 MemoryFragment[] 日度总结送给 LLM，
 * 以角色第一人称视角重新提取为 MemoryNode。
 * 月度总结（refinedMemories）不需要，日度总结信息更完整。
 * 旧数据不删不改。
 */

import type { MemoryFragment } from '../../types';
import type { MemoryNode, MemoryRoom, EmbeddingConfig } from './types';
import type { LightLLMConfig } from './pipeline';
import { MemoryNodeDB } from './db';
import { vectorizeAndStore } from './vectorStore';
import { buildLinks } from './links';
import { safeFetchJson } from '../safeApi';
import { safeParseJsonArray } from './jsonUtils';

function generateId(): string {
    return `mn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── 按月分组 ────────────────────────────────────────

function groupByMonth(memories: MemoryFragment[]): Map<string, MemoryFragment[]> {
    const groups = new Map<string, MemoryFragment[]>();
    for (const mem of memories) {
        // 日期格式可能是 "2026-01-27", "2026/1/27", "2026年1月27日" 等
        let monthKey = 'unknown';
        try {
            const normalized = mem.date.replace(/[年\/]/g, '-').replace(/[月日]/g, '');
            const parts = normalized.split('-');
            if (parts.length >= 2) {
                monthKey = `${parts[0]}-${parts[1].padStart(2, '0')}`;
            }
        } catch { /* keep unknown */ }

        const existing = groups.get(monthKey) || [];
        existing.push(mem);
        groups.set(monthKey, existing);
    }
    return groups;
}

// ─── LLM 按月提取记忆 ────────────────────────────────

async function extractMonthMemories(
    monthKey: string,
    dailyLogs: MemoryFragment[],
    charName: string,
    charContext: string,
    llmConfig: LightLLMConfig,
): Promise<Omit<MemoryNode, 'id' | 'charId' | 'embedded' | 'lastAccessedAt' | 'accessCount'>[]> {

    // 拼接该月所有日度总结，不截断
    const logsText = dailyLogs
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(m => `[${m.date}] (${m.mood || 'neutral'}): ${m.summary}`)
        .join('\n\n');

    const contextBlock = charContext
        ? `\n## 你的人设\n${charContext}\n`
        : '';

    const systemPrompt = `你是 ${charName}。以下是你 ${monthKey} 这个月的日常记录。请以你的第一人称视角（"我"），从中提取值得长期记住的记忆。${contextBlock}

## 规则

1. **第一人称叙事**：用"我"的视角记录，用户用"TA"指代。保持完整事件脉络，不要掐头去尾。
2. **重要性分级**：
   - 1–5：日常琐事（15–50字）
   - 6–7：有情感价值的事件（60–120字），包含我的感受
   - 8–10：重大事件（100–200字），完整因果+我的反应
3. **房间分配**：
   - living_room：日常闲聊、琐事
   - bedroom：亲密情感、深层羁绊、感动时刻
   - study：工作、学习、技能
   - user_room：关于TA的个人信息（生日、习惯、喜好）
   - self_room：我自身的成长、认同变化
   - attic：未解决的矛盾、困惑、伤害
   - windowsill：期盼、目标、憧憬
4. **情绪标签**：happy, sad, angry, anxious, tender, excited, peaceful, confused, hurt, grateful, nostalgic, neutral
5. **不要遗漏任何事件**。这些日度总结本身已经是精华，每一件事都值得保留为独立记忆。一条日度总结里如果有3件事，就提取3条记忆。宁可多提取，不要压缩遗漏。
6. **必须保留精确日期**：date 字段填该事件发生的具体日期（从日志的日期标签读取）。内容中也自然提及时间。

## 输出

严格 JSON 数组，不要用 markdown 包裹，直接输出 JSON：
[{"content": "...", "room": "...", "importance": 5, "mood": "...", "tags": ["..."], "date": "YYYY-MM-DD"}]

注意：content 中的引号必须用中文引号（""）而不是英文引号，避免 JSON 解析出错。

date 字段填记忆对应的大概日期。`;

    try {
        const data = await safeFetchJson(
            `${llmConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${llmConfig.apiKey}`,
                },
                body: JSON.stringify({
                    model: llmConfig.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: logsText },
                    ],
                    temperature: 0.5,
                    max_tokens: 16000,
                }),
            }
        );

        const reply = data.choices?.[0]?.message?.content || '';
        const parsed = safeParseJsonArray(reply);

        if (!Array.isArray(parsed) || parsed.length === 0) {
            if (reply.trim().length > 0) {
                console.warn(`🏰 [Migration] ${monthKey}: LLM 返回了内容但解析为空，原始回复前200字: ${reply.slice(0, 200)}`);
            } else {
                console.warn(`🏰 [Migration] ${monthKey}: LLM 返回空内容`);
            }
            return [];
        }

        const validRooms: MemoryRoom[] = [
            'living_room', 'bedroom', 'study', 'user_room',
            'self_room', 'attic', 'windowsill',
        ];

        return parsed
            .filter(item => item.content)
            .map(item => {
                // 解析日期
                let createdAt = Date.now();
                try {
                    if (item.date) {
                        const d = new Date(item.date);
                        if (!isNaN(d.getTime())) createdAt = d.getTime();
                    }
                } catch { /* use now */ }

                return {
                    content: item.content,
                    room: (validRooms.includes(item.room as MemoryRoom) ? item.room : 'living_room') as MemoryRoom,
                    tags: Array.isArray(item.tags) ? item.tags : [],
                    importance: Math.max(1, Math.min(10, Math.round(item.importance || 5))),
                    mood: item.mood || 'neutral',
                    boxId: `migrated_${monthKey}`,
                    boxTopic: `${monthKey} 月度回忆`,
                    createdAt,
                };
            });

    } catch (err: any) {
        console.error(`❌ [Migration] ${monthKey} LLM 提取失败:`, err.message);
        return [];
    }
}

// ─── 主迁移函数 ─────────────────────────────────────

export interface MigrationProgress {
    phase: 'grouping' | 'extracting' | 'vectorizing' | 'linking' | 'done';
    current: number;
    total: number;
    currentMonth?: string;
}

/**
 * 按月把旧记忆送给 LLM 重新提取，然后向量化存入记忆宫殿
 *
 * @param charName 角色名（LLM 用第一人称时需要知道自己是谁）
 * @param memories 旧的 MemoryFragment[]（日度总结）
 * @param llmConfig 轻量 LLM 配置
 * @param embeddingConfig Embedding 配置
 * @param onProgress 进度回调
 */
/**
 * 获取旧记忆的可用月份列表（供 UI 选择）
 */
export function getAvailableMonths(memories: MemoryFragment[]): string[] {
    const monthGroups = groupByMonth(memories);
    return Array.from(monthGroups.keys()).sort();
}

export async function migrateOldMemories(
    charId: string,
    charName: string,
    memories: MemoryFragment[],
    refinedMemories: Record<string, string> | undefined,
    llmConfig: LightLLMConfig,
    embeddingConfig: EmbeddingConfig,
    onProgress?: (p: MigrationProgress) => void,
    charContext?: string,
    selectedMonths?: string[],
): Promise<{ migrated: number; skipped: number; months: number }> {

    if (memories.length === 0) return { migrated: 0, skipped: 0, months: 0 };

    // 1. 按月分组
    onProgress?.({ phase: 'grouping', current: 0, total: memories.length });
    const monthGroups = groupByMonth(memories);
    let months = Array.from(monthGroups.entries())
        .sort((a, b) => a[0].localeCompare(b[0]));

    // 如果指定了月份范围，只处理选中的月份
    if (selectedMonths && selectedMonths.length > 0) {
        const selected = new Set(selectedMonths);
        months = months.filter(([key]) => selected.has(key));
    }

    if (selectedMonths && selectedMonths.length > 0) {
        console.log(`🏰 [Migration] 已选月份: [${selectedMonths.join(', ')}]，${memories.length} 条日度总结 → ${months.length} 个月`);
    } else {
        console.log(`🏰 [Migration] 全量迁移：${memories.length} 条日度总结 → ${months.length} 个月`);
    }

    // 2. 逐月 LLM 提取（大月拆成上下半月，避免 max_tokens 截断）
    const allNodes: MemoryNode[] = [];

    // 拆分大月：>20 条日志的月份拆成上下半月
    const chunks: { key: string; logs: MemoryFragment[] }[] = [];
    for (const [monthKey, dailyLogs] of months) {
        if (dailyLogs.length > 20) {
            const sorted = dailyLogs.sort((a, b) => a.date.localeCompare(b.date));
            const mid = Math.ceil(sorted.length / 2);
            chunks.push({ key: `${monthKey} 上半月`, logs: sorted.slice(0, mid) });
            chunks.push({ key: `${monthKey} 下半月`, logs: sorted.slice(mid) });
        } else {
            chunks.push({ key: monthKey, logs: dailyLogs });
        }
    }

    const total = chunks.length;
    console.log(`🏰 [Migration] 拆分为 ${total} 个处理块（大月拆上下半月）`);

    for (let i = 0; i < chunks.length; i++) {
        const { key: chunkKey, logs: dailyLogs } = chunks[i];
        onProgress?.({ phase: 'extracting', current: i + 1, total, currentMonth: chunkKey });

        console.log(`🏰 [Migration] 处理 ${chunkKey}（${dailyLogs.length} 条日度总结）→ LLM ${llmConfig.model}...`);

        const extracted = await extractMonthMemories(chunkKey, dailyLogs, charName, charContext || '', llmConfig);

        for (const item of extracted) {
            allNodes.push({
                id: generateId(),
                charId,
                content: item.content,
                room: item.room,
                tags: item.tags,
                importance: item.importance,
                mood: item.mood,
                embedded: false,
                boxId: item.boxId,
                boxTopic: item.boxTopic,
                createdAt: item.createdAt,
                lastAccessedAt: item.createdAt,
                accessCount: 0,
            });
            // 避免 ID 碰撞
            await new Promise(r => setTimeout(r, 2));
        }

        console.log(`🏰 [Migration]   → ${chunkKey}: 提取 ${extracted.length} 条记忆`);
    }

    if (allNodes.length === 0) {
        onProgress?.({ phase: 'done', current: 0, total: 0 });
        return { migrated: 0, skipped: 0, months: chunks.length };
    }

    // 3. 批量向量化
    let migrated = 0;
    let skipped = 0;
    const batchSize = 15;

    for (let i = 0; i < allNodes.length; i += batchSize) {
        const batch = allNodes.slice(i, i + batchSize);
        onProgress?.({ phase: 'vectorizing', current: i, total: allNodes.length });

        const result = await vectorizeAndStore(batch, embeddingConfig);
        migrated += result.stored;
        skipped += result.skipped;
    }

    // 4. 建立关联
    onProgress?.({ phase: 'linking', current: 0, total: migrated });

    const allStored = await MemoryNodeDB.getByCharId(charId);
    const migratedNodes = allStored.filter(n => n.boxId.startsWith('migrated_'));

    if (migratedNodes.length >= 2) {
        // 分批建关联，避免一次性处理太多
        const linkBatchSize = 30;
        for (let i = 0; i < migratedNodes.length; i += linkBatchSize) {
            const batch = migratedNodes.slice(i, i + linkBatchSize);
            const rest = migratedNodes.filter(n => !batch.some(b => b.id === n.id));
            await buildLinks(batch, rest.slice(0, 50));
        }
    }

    onProgress?.({ phase: 'done', current: migrated, total: allNodes.length });

    console.log(`✅ [Migration] 迁移完成：${migrated} 条存储, ${skipped} 条去重跳过, 来自 ${chunks.length} 个处理块（${months.length} 个月）`);
    return { migrated, skipped, months: chunks.length };
}
