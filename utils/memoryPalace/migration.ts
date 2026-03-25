/**
 * Memory Palace — 旧记忆迁移工具 (Migration)
 *
 * 将旧的 MemoryFragment[] + refinedMemories 转换为 MemoryNode，
 * 向量化后存入记忆宫殿。旧数据不删不改。
 */

import type { MemoryFragment } from '../../types';
import type { MemoryNode, MemoryRoom, EmbeddingConfig } from './types';
import type { LightLLMConfig } from './pipeline';
import { MemoryNodeDB } from './db';
import { vectorizeAndStore } from './vectorStore';
import { buildLinks } from './links';
import { safeFetchJson } from '../safeApi';

function generateId(): string {
    return `mn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 用 LLM 批量给旧记忆分配房间和重要性
 * 一次处理最多 20 条，减少 API 调用次数
 */
async function batchClassify(
    summaries: { id: string; summary: string; mood: string }[],
    llmConfig: LightLLMConfig,
): Promise<Map<string, { room: MemoryRoom; importance: number }>> {
    const result = new Map<string, { room: MemoryRoom; importance: number }>();

    const prompt = `你是一个记忆分类器。给你一批记忆摘要，为每条分配房间和重要性。

房间选项：
- living_room：日常闲聊、琐事
- bedroom：亲密情感、深层羁绊
- study：工作、学习、技能
- user_room：用户个人信息（生日、习惯、喜好）
- self_room：角色自身认同变化
- attic：未解决矛盾、困惑
- windowsill：期盼、目标

重要性 1-10：
- 1-3：琐碎日常
- 4-5：普通事件
- 6-7：有情感价值
- 8-10：重大事件/深层情感

严格返回 JSON 数组，每项包含 id, room, importance：
[{"id": "...", "room": "living_room", "importance": 5}]`;

    const input = summaries.map(s =>
        `[id=${s.id}] (${s.mood || 'neutral'}): ${s.summary.slice(0, 100)}`
    ).join('\n');

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
                        { role: 'system', content: prompt },
                        { role: 'user', content: input },
                    ],
                    temperature: 0.3,
                    max_tokens: 2000,
                }),
            }
        );

        const reply = data.choices?.[0]?.message?.content || '';
        const jsonMatch = reply.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as Array<{
                id: string; room: string; importance: number;
            }>;
            const validRooms: MemoryRoom[] = [
                'living_room', 'bedroom', 'study', 'user_room',
                'self_room', 'attic', 'windowsill',
            ];
            for (const item of parsed) {
                result.set(item.id, {
                    room: validRooms.includes(item.room as MemoryRoom)
                        ? item.room as MemoryRoom : 'living_room',
                    importance: Math.max(1, Math.min(10, Math.round(item.importance || 5))),
                });
            }
        }
    } catch (err: any) {
        console.warn('⚡ [Migration] LLM classification failed, using defaults:', err.message);
    }

    return result;
}

/**
 * 简单规则分类（不用 LLM 时的 fallback）
 */
function ruleBasedClassify(summary: string, mood: string): { room: MemoryRoom; importance: number } {
    const lower = summary.toLowerCase();
    const emotionalMoods = ['sad', 'angry', 'hurt', 'tender', 'grateful', 'anxious'];
    const isEmotional = emotionalMoods.includes(mood);

    // 简单关键词判断
    if (/生日|周年|纪念|喜欢吃|爱好|习惯|家人|家庭/.test(lower)) {
        return { room: 'user_room', importance: isEmotional ? 7 : 6 };
    }
    if (/工作|加班|学习|考试|面试|项目|开会/.test(lower)) {
        return { room: 'study', importance: isEmotional ? 6 : 5 };
    }
    if (/吵架|矛盾|误解|道歉|对不起|生气|分手/.test(lower)) {
        return { room: isEmotional ? 'attic' : 'living_room', importance: 7 };
    }
    if (/想要|希望|目标|计划|以后|未来|梦想/.test(lower)) {
        return { room: 'windowsill', importance: 6 };
    }
    if (/感动|哭|拥抱|依赖|信任|在乎|喜欢你|爱/.test(lower)) {
        return { room: 'bedroom', importance: isEmotional ? 8 : 7 };
    }

    return {
        room: 'living_room',
        importance: isEmotional ? 6 : 4,
    };
}

// ─── 主迁移函数 ─────────────────────────────────────

export interface MigrationProgress {
    phase: 'classifying' | 'creating' | 'vectorizing' | 'linking' | 'done';
    current: number;
    total: number;
}

/**
 * 将旧 MemoryFragment[] + refinedMemories 迁移到记忆宫殿
 *
 * @param onProgress 进度回调
 * @returns { migrated, skipped }
 */
export async function migrateOldMemories(
    charId: string,
    memories: MemoryFragment[],
    refinedMemories: Record<string, string> | undefined,
    llmConfig: LightLLMConfig | null,
    embeddingConfig: EmbeddingConfig,
    onProgress?: (p: MigrationProgress) => void,
): Promise<{ migrated: number; skipped: number }> {

    const allItems: { id: string; summary: string; mood: string; date: string; isRefined: boolean }[] = [];

    // 收集所有旧记忆
    for (const mem of memories) {
        allItems.push({
            id: mem.id,
            summary: mem.summary,
            mood: mem.mood || 'neutral',
            date: mem.date,
            isRefined: false,
        });
    }

    // 收集月度总结
    if (refinedMemories) {
        for (const [month, summary] of Object.entries(refinedMemories)) {
            allItems.push({
                id: `refined_${month}`,
                summary,
                mood: 'neutral',
                date: month,
                isRefined: true,
            });
        }
    }

    if (allItems.length === 0) return { migrated: 0, skipped: 0 };

    const total = allItems.length;
    onProgress?.({ phase: 'classifying', current: 0, total });

    // ─── 分类阶段 ─────────────────────────────────
    const classifyMap = new Map<string, { room: MemoryRoom; importance: number }>();

    if (llmConfig) {
        // 用 LLM 批量分类（每批 20 条）
        const batchSize = 20;
        for (let i = 0; i < allItems.length; i += batchSize) {
            const batch = allItems.slice(i, i + batchSize).map(item => ({
                id: item.id,
                summary: item.summary,
                mood: item.mood,
            }));
            onProgress?.({ phase: 'classifying', current: i, total });

            const batchResult = await batchClassify(batch, llmConfig);
            for (const [id, cls] of batchResult) {
                classifyMap.set(id, cls);
            }
        }
    }

    // ─── 创建 MemoryNode ─────────────────────────
    onProgress?.({ phase: 'creating', current: 0, total });

    const nodes: MemoryNode[] = [];
    const now = Date.now();

    for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        onProgress?.({ phase: 'creating', current: i + 1, total });

        // LLM 分类结果 or 规则 fallback
        const cls = classifyMap.get(item.id) || ruleBasedClassify(item.summary, item.mood);

        // 月度总结提升重要性
        if (item.isRefined) {
            cls.importance = Math.max(cls.importance, 7);
            if (cls.room === 'living_room') cls.room = 'bedroom';
        }

        // 解析日期
        let createdAt = now;
        try {
            const dateStr = item.date.replace(/[年月]/g, '-').replace('日', '');
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) createdAt = parsed.getTime();
        } catch { /* 用默认 now */ }

        // 生成虚拟 boxId（按月分组）
        const monthKey = item.date.slice(0, 7).replace(/[年\/]/g, '-');
        const boxId = `migrated_${monthKey}`;

        nodes.push({
            id: generateId(),
            charId,
            content: item.summary,
            room: cls.room,
            tags: [],
            importance: cls.importance,
            mood: item.mood,
            embedded: false,
            boxId,
            boxTopic: item.isRefined ? `${monthKey} 月度总结` : `${item.date} 日常`,
            createdAt,
            lastAccessedAt: createdAt,
            accessCount: 0,
        });

        // 避免 ID 碰撞
        await new Promise(r => setTimeout(r, 1));
    }

    // ─── 向量化 ─────────────────────────────────
    onProgress?.({ phase: 'vectorizing', current: 0, total: nodes.length });

    // 分批向量化（每批 15 条，避免 API 超时）
    let migrated = 0;
    let skipped = 0;
    const batchSize = 15;

    for (let i = 0; i < nodes.length; i += batchSize) {
        const batch = nodes.slice(i, i + batchSize);
        onProgress?.({ phase: 'vectorizing', current: i, total: nodes.length });

        const result = await vectorizeAndStore(batch, embeddingConfig);
        migrated += result.stored;
        skipped += result.skipped;
    }

    // ─── 建立关联 ─────────────────────────────────
    onProgress?.({ phase: 'linking', current: 0, total: migrated });

    // 简单 temporal 关联：同月的记忆互相关联
    const allStored = await MemoryNodeDB.getByCharId(charId);
    const migratedNodes = allStored.filter(n => n.boxId.startsWith('migrated_'));

    if (migratedNodes.length >= 2) {
        await buildLinks(migratedNodes.slice(0, 50), migratedNodes.slice(50));
    }

    onProgress?.({ phase: 'done', current: migrated, total });

    console.log(`✅ [Migration] Done: ${migrated} migrated, ${skipped} skipped (deduped)`);
    return { migrated, skipped };
}
