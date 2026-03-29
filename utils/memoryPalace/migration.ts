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
    userName?: string,
): Promise<Omit<MemoryNode, 'id' | 'charId' | 'embedded' | 'lastAccessedAt' | 'accessCount'>[]> {

    // 拼接该月所有日度总结，不截断
    const logsText = dailyLogs
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(m => `[${m.date}] (${m.mood || 'neutral'}): ${m.summary}`)
        .join('\n\n');

    const contextBlock = charContext
        ? `\n## 你的人设\n${charContext}\n`
        : '';

    const userLabel = userName || 'TA';

    const systemPrompt = `你是 ${charName}。以下是你 ${monthKey} 这个月的日常记录。请以你的第一人称视角（"我"），从中提取值得长期记住的记忆。${contextBlock}

## 规则

1. **第一人称叙事**：用"我"的视角记录，用户用"${userLabel}"指代。保持完整事件脉络，不要掐头去尾。
2. **重要性分级**：
   - 1–5：日常琐事（15–50字）
   - 6–7：有情感价值的事件（60–120字），包含我的感受
   - 8–10：重大事件（100–200字），完整因果+我的反应
3. **房间分配**：
   - living_room：日常闲聊、琐事
   - bedroom：亲密情感、深层羁绊、感动时刻
   - study：工作、学习、技能
   - user_room：关于${userLabel}的个人信息（生日、习惯、喜好）
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

/**
 * 将一个月的日志拆成上旬/中旬/下旬 3 个分块
 */
function splitMonthToThirds(monthKey: string, dailyLogs: MemoryFragment[]): { key: string; logs: MemoryFragment[] }[] {
    const sorted = dailyLogs.sort((a, b) => a.date.localeCompare(b.date));
    const upper: MemoryFragment[] = [];   // 1-10 日
    const middle: MemoryFragment[] = [];  // 11-20 日
    const lower: MemoryFragment[] = [];   // 21-31 日

    for (const log of sorted) {
        let day = 15; // 默认归中旬
        try {
            const normalized = log.date.replace(/[年\/]/g, '-').replace(/[月日]/g, '');
            const parts = normalized.split('-');
            if (parts.length >= 3) day = parseInt(parts[2], 10) || 15;
        } catch { /* default middle */ }

        if (day <= 10) upper.push(log);
        else if (day <= 20) middle.push(log);
        else lower.push(log);
    }

    const result: { key: string; logs: MemoryFragment[] }[] = [];
    if (upper.length > 0) result.push({ key: `${monthKey} 上旬`, logs: upper });
    if (middle.length > 0) result.push({ key: `${monthKey} 中旬`, logs: middle });
    if (lower.length > 0) result.push({ key: `${monthKey} 下旬`, logs: lower });

    // 如果因为日期解析问题全部落入同一个分块或为空，直接返回整月
    if (result.length === 0) result.push({ key: monthKey, logs: sorted });

    return result;
}

/**
 * 获取可用的分块列表（每月拆上旬/中旬/下旬），供 UI 逐块选择
 * 返回 { key: "2026-03 上旬", count: 12 }[]
 */
export function getAvailableChunks(memories: MemoryFragment[]): { key: string; count: number }[] {
    const monthGroups = groupByMonth(memories);
    const months = Array.from(monthGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const chunks: { key: string; count: number }[] = [];
    for (const [monthKey, dailyLogs] of months) {
        const parts = splitMonthToThirds(monthKey, dailyLogs);
        for (const part of parts) {
            chunks.push({ key: part.key, count: part.logs.length });
        }
    }
    return chunks;
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
    userName?: string,
): Promise<{ migrated: number; skipped: number; months: number }> {

    if (memories.length === 0) return { migrated: 0, skipped: 0, months: 0 };

    // 1. 按月分组
    onProgress?.({ phase: 'grouping', current: 0, total: memories.length });
    const monthGroups = groupByMonth(memories);
    let months = Array.from(monthGroups.entries())
        .sort((a, b) => a[0].localeCompare(b[0]));

    // 2. 每月拆成上旬/中旬/下旬 3 个分块
    const allNodes: MemoryNode[] = [];

    const chunks: { key: string; logs: MemoryFragment[] }[] = [];
    for (const [monthKey, dailyLogs] of months) {
        const parts = splitMonthToThirds(monthKey, dailyLogs);
        chunks.push(...parts);
    }

    // 如果指定了分块，只处理选中的分块
    let filteredChunks = chunks;
    if (selectedMonths && selectedMonths.length > 0) {
        const selected = new Set(selectedMonths);
        filteredChunks = chunks.filter(c => selected.has(c.key));
        console.log(`🏰 [Migration] 已选分块: [${selectedMonths.join(', ')}]，共 ${filteredChunks.length} 个分块`);
    } else {
        console.log(`🏰 [Migration] 全量迁移：${memories.length} 条日度总结 → ${months.length} 个月 → ${filteredChunks.length} 个分块`);
    }

    const total = filteredChunks.length;
    console.log(`🏰 [Migration] 待处理 ${total} 个分块（每月拆上旬/中旬/下旬）`);

    for (let i = 0; i < filteredChunks.length; i++) {
        const { key: chunkKey, logs: dailyLogs } = filteredChunks[i];
        onProgress?.({ phase: 'extracting', current: i + 1, total, currentMonth: chunkKey });

        console.log(`🏰 [Migration] [${i + 1}/${total}] 开始 LLM 提取 → ${chunkKey}（${dailyLogs.length} 条日度总结），模型: ${llmConfig.model}`);
        const llmStart = Date.now();

        const extracted = await extractMonthMemories(chunkKey, dailyLogs, charName, charContext || '', llmConfig, userName);

        const llmElapsed = ((Date.now() - llmStart) / 1000).toFixed(1);
        console.log(`🏰 [Migration] [${i + 1}/${total}] LLM 提取完成 ← ${chunkKey}: ${extracted.length} 条记忆，耗时 ${llmElapsed}s`);

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
    }

    if (allNodes.length === 0) {
        onProgress?.({ phase: 'done', current: 0, total: 0 });
        return { migrated: 0, skipped: 0, months: filteredChunks.length };
    }

    // 3. 批量向量化
    let migrated = 0;
    let skipped = 0;
    const batchSize = 15;
    const totalBatches = Math.ceil(allNodes.length / batchSize);

    console.log(`🏰 [Migration] 开始 Embedding 向量化：${allNodes.length} 条记忆，分 ${totalBatches} 批（每批 ${batchSize} 条），模型: ${embeddingConfig.model}`);
    const embStart = Date.now();

    for (let i = 0; i < allNodes.length; i += batchSize) {
        const batch = allNodes.slice(i, i + batchSize);
        const batchIdx = Math.floor(i / batchSize) + 1;
        onProgress?.({ phase: 'vectorizing', current: i, total: allNodes.length });

        console.log(`🏰 [Migration] Embedding 批次 [${batchIdx}/${totalBatches}]：${batch.length} 条...`);
        const batchStart = Date.now();

        const result = await vectorizeAndStore(batch, embeddingConfig);
        migrated += result.stored;
        skipped += result.skipped;

        const batchElapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
        console.log(`🏰 [Migration] Embedding 批次 [${batchIdx}/${totalBatches}] 完成：存储 ${result.stored}，跳过 ${result.skipped}，耗时 ${batchElapsed}s`);
    }

    const embElapsed = ((Date.now() - embStart) / 1000).toFixed(1);
    console.log(`🏰 [Migration] Embedding 全部完成：存储 ${migrated}，跳过 ${skipped}，总耗时 ${embElapsed}s`);

    // 4. 建立关联
    console.log(`🏰 [Migration] 开始建立关联（linking）...`);
    const linkStart = Date.now();
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

    const linkElapsed = ((Date.now() - linkStart) / 1000).toFixed(1);
    console.log(`🏰 [Migration] 关联建立完成，耗时 ${linkElapsed}s`);

    onProgress?.({ phase: 'done', current: migrated, total: allNodes.length });

    console.log(`✅ [Migration] 迁移完成：${migrated} 条存储, ${skipped} 条去重跳过, 来自 ${filteredChunks.length} 个分块（${months.length} 个月）`);
    return { migrated, skipped, months: filteredChunks.length };
}
