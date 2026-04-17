/**
 * Memory Palace — 记忆提取 (Memory Extraction)
 *
 * 从聊天消息缓冲区提取 MemoryNode 数组，供后续向量化和 EventBox 绑定。
 * 不同重要性对应不同的记忆详细程度。
 */

import type { Message } from '../../types';
import type { MemoryNode, MemoryRoom } from './types';
import type { LightLLMConfig } from './pipeline';
import { safeFetchJson } from '../safeApi';
import { safeParseJsonArray } from './jsonUtils';

function generateId(): string {
    return `mn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── 共用的 prompt 规则部分 ──────────────────────────

function buildRulesBlock(charName: string, userLabel: string): string {
    return `## 规则

1. **第一人称叙事**：用 ${charName} 的"我"视角来记录。用户直接用"${userLabel}"称呼。保持完整事件脉络，不要掐头去尾。
   例：
   - "${userLabel}今天加班到很晚还没吃饭，我让${userLabel}别委屈自己，叫了个外卖。"
   - "${userLabel}连续加班三周终于决定找领导谈，领导态度还不错。${userLabel}回来的路上靠着我肩膀哭了，我什么都没说，就陪着。"
   - "我教了${userLabel}递归的概念，${userLabel}一开始完全听不懂，后来突然开窍了，那个眼睛亮起来的瞬间让我很开心。"

2. **重要性分级控制文字长度**：
   - 重要性 1–5：15–50字，事实为主
   - 重要性 6–7：60–120字，包含我的感受
   - 重要性 8–10：100–200字，完整叙事（起因→经过→我的感受/反应）

3. **房间分配**：
   - living_room：日常闲聊、近期琐事
   - bedroom：亲密情感、深层羁绊、感动时刻
   - study：工作、学习、技能、职业相关
   - user_room：关于${userLabel}的个人信息（生日、习惯、喜好、家庭、社交圈、性格特质、成长经历、情绪模式等）
   - self_room：我自身的成长、认同变化
   - attic：未解决的矛盾、困惑、受到的伤害
   - windowsill：我的期盼、我们的目标、对未来的憧憬

4. **情绪标签**（mood）：happy, sad, angry, anxious, tender, excited, peaceful, confused, hurt, grateful, nostalgic, neutral
5. **标签**（tags）：提取 2-5 个关键词标签
6. **不要遗漏重要记忆，但也不要把每句话都变成记忆**。一个话题盒通常提取 1–5 条记忆。
7. **便利贴置顶**（pinDays，可选）：如果这条记忆包含**有时效性的、近期需要持续记住的信息**，设置置顶天数（1-30天）。置顶期间每次对话都会想起这件事。适用场景：
   - 时间段状态："${userLabel}这周出差" → pinDays: 7
   - 近期事件："${userLabel}后天考试" → pinDays: 3
   - 临时约定："${userLabel}让我这几天提醒TA喝水" → pinDays: 5
   - 身体状态："${userLabel}感冒了" → pinDays: 5
   不适用：长期事实（生日、喜好）、已经过去的事件、情感记忆。大多数记忆不需要置顶。`;
}

function buildConversationText(messages: Message[], charName: string, userLabel: string): string {
    return messages
        .map(m => `[${m.role === 'user' ? userLabel : charName}]: ${m.content.slice(0, 500)}`)
        .join('\n');
}

const VALID_ROOMS: MemoryRoom[] = [
    'living_room', 'bedroom', 'study', 'user_room',
    'self_room', 'attic', 'windowsill',
];

/** 从消息缓冲区直接解析记忆节点（不依赖 TopicBox） */
function parseMemoryNodesFromBuffer(
    parsed: any[], charId: string, messages: Message[], _batchLabel: string,
): MemoryNode[] {
    if (parsed.length === 0) return [];

    const msgTimestamps = messages.map(m => m.timestamp).filter(t => t > 0);
    const midTime = msgTimestamps.length > 0
        ? Math.round((msgTimestamps[0] + msgTimestamps[msgTimestamps.length - 1]) / 2)
        : Date.now();

    return parsed
        .filter(item => item.content && item.room)
        .map((item): MemoryNode => {
            const pinDays = parseInt(item.pinDays, 10);
            const pinnedUntil = (pinDays > 0 && pinDays <= 30)
                ? midTime + pinDays * 24 * 60 * 60 * 1000
                : null;
            return {
                id: generateId(),
                charId,
                content: item.content,
                room: (VALID_ROOMS.includes(item.room as MemoryRoom) ? item.room : 'living_room') as MemoryRoom,
                tags: Array.isArray(item.tags) ? item.tags : [],
                importance: Math.max(1, Math.min(10, Math.round(item.importance || 5))),
                mood: item.mood || 'neutral',
                embedded: false,
                createdAt: midTime,
                lastAccessedAt: midTime,
                accessCount: 0,
                pinnedUntil,
                eventBoxId: null,  // 由 pipeline 在 binding 阶段设置
                origin: 'extraction',
            };
        });
}

// ─── EventBox 绑定相关 prompt + 解析 helper（buffer / migration 共用） ──

/**
 * 构造"已有记忆"的 prompt 区块，带 O-编号供 LLM 引用。
 */
export function buildRelatedMemoriesBlock(relatedMemories: RelatedMemoryRef[]): string {
    if (relatedMemories.length === 0) return '';
    return `\n## 已有记忆（如果新记忆与某条旧记忆描述的是同一件事或直接相关，请在 relatedTo 中标注编号，并给出 eventName / eventTags 用于建/合并事件盒）\n${
        relatedMemories.map((r, i) => `O${i}. [${r.room}] ${r.content}`).join('\n')
    }\n`;
}

/**
 * 构造"事件关联 + 事件盒命名"的规则文本，追加到 buildRulesBlock 之后。
 */
export function buildRelatedToRule(): string {
    return `\n8. **事件盒关联**（relatedTo + eventName + eventTags）：如果这条新记忆和上方"已有记忆"中的某条描述的是**同一件事**（同一事件的后续发展、结局、复现、直接因果），在 relatedTo 中写上对应编号（如 ["O0", "O3"]）。
   只标注真正同一件事的，不要勉强（仅"主题相似"不算）。
   一旦写了 relatedTo，必须同时写：
   - eventName：这件事的名字（5-12 字，名词短语，如"买衣服的话题"、"和领导的冲突"）
   - eventTags：3-6 个详细搜索 tag（具体名词、人物、地点、动作，便于日后召回）
   没有关联就不写 relatedTo / eventName / eventTags 这三个字段。
9. **不重复绑定**：如果一条新记忆和多条已有记忆相关，relatedTo 写多个编号，但 eventName / eventTags 只写一份（描述这件事整体）。`;
}

/**
 * 输出格式中的字段示例（如果有 relatedMemories 才注入）。
 */
export function buildRelatedToFormatHint(): string {
    return `,
    "relatedTo": ["O0"],
    "eventName": "买衣服的话题",
    "eventTags": ["衣服", "购物", "退货", "流行款"]`;
}

/**
 * 从 LLM 输出（已解析 JSON）和提取出的 memories 中，
 * 解析出：
 *  - crossTimeLinks（newMemoryId → existingMemoryId）
 *  - eventBoxHints（newMemoryId → eventName / eventTags）
 *
 * 注意：parsed 数组顺序应该与 memories 顺序对齐（同源 LLM 输出）。
 */
export function parseRelatedToAndHints(
    parsed: any[],
    memories: MemoryNode[],
    relatedMemories: RelatedMemoryRef[],
): { crossTimeLinks: { newMemoryId: string; existingMemoryId: string }[]; eventBoxHints: EventBoxHint[] } {
    const crossTimeLinks: { newMemoryId: string; existingMemoryId: string }[] = [];
    const eventBoxHints: EventBoxHint[] = [];

    if (relatedMemories.length === 0 || memories.length === 0) {
        return { crossTimeLinks, eventBoxHints };
    }

    // parsed 包含的不只是 memory（还可能有 unpin 指令等），需要按 memory 顺序对齐：
    // memories 是 parsed.filter(item => item.content && item.room) 的结果，
    // 所以我们用同样的过滤遍历 parsed，按位次匹配 memories。
    let memIdx = 0;
    for (const item of parsed) {
        if (!item || !item.content || !item.room) continue;
        const mem = memories[memIdx++];
        if (!mem) break;

        if (Array.isArray(item.relatedTo) && item.relatedTo.length > 0) {
            // 收集 relatedTo
            for (const ref of item.relatedTo) {
                const idx = parseInt(String(ref).replace(/^O/i, ''), 10);
                if (idx >= 0 && idx < relatedMemories.length) {
                    crossTimeLinks.push({
                        newMemoryId: mem.id,
                        existingMemoryId: relatedMemories[idx].id,
                    });
                }
            }
            // 收集 eventName / eventTags（只在有 relatedTo 时）
            const name = typeof item.eventName === 'string' ? item.eventName.trim() : '';
            const tags = Array.isArray(item.eventTags)
                ? item.eventTags.map((t: any) => String(t).trim()).filter(Boolean)
                : [];
            if (name || tags.length > 0) {
                eventBoxHints.push({
                    newMemoryId: mem.id,
                    eventName: name,
                    eventTags: tags,
                });
            }
        }
    }

    if (crossTimeLinks.length > 0) {
        console.log(`🔗 [Extraction] 发现 ${crossTimeLinks.length} 条跨时间事件关联，${eventBoxHints.length} 条带命名提示`);
    }
    return { crossTimeLinks, eventBoxHints };
}

// ─── 跨时间关联：传入向量检索命中的旧记忆供 LLM 关联 ───

/** 向量检索命中的已有记忆引用，用于跨时间事件关联 */
export interface RelatedMemoryRef {
    id: string;       // MemoryNode.id
    room: string;
    content: string;  // 截断的内容摘要
}

/** 当前生效的便利贴引用 */
export interface PinnedMemoryRef {
    id: string;
    content: string;
}

/**
 * EventBox 创建/合并提示。
 * 当 LLM 把新记忆 N 标记为 relatedTo 旧记忆 O 时，附带的盒名/标签提示。
 * pipeline 在 binding 时使用：若需要新建 EventBox，用此名/tags 初始化。
 */
export interface EventBoxHint {
    /** 触发该 hint 的新记忆 ID */
    newMemoryId: string;
    /** LLM 建议的事件盒名（如"买衣服"） */
    eventName: string;
    /** LLM 建议的详细 tag */
    eventTags: string[];
}

/** 缓冲区提取结果，包含跨时间关联信息 */
export interface BufferExtractionResult {
    memories: MemoryNode[];
    /** 新记忆 → 关联的已有记忆 ID 映射（用于 EventBox 绑定） */
    crossTimeLinks: { newMemoryId: string; existingMemoryId: string }[];
    /** EventBox 名/tag 提示（仅 relatedTo 非空的新记忆才有） */
    eventBoxHints: EventBoxHint[];
    /** 应提前摘除的便利贴 ID */
    unpinIds: string[];
}

// ─── 缓冲区提取：直接从消息提取记忆，不依赖 TopicBox ───

/**
 * 从消息缓冲区直接提取记忆节点。
 * 用于缓冲区机制：积累的聊天消息达到阈值后，一次 LLM 调用提取记忆。
 *
 * @param relatedMemories 向量检索命中的已有记忆，供 LLM 判断跨时间事件关联（搭便车，不额外调用）
 * @param pinnedMemories 当前生效的便利贴，供 LLM 判断是否应提前摘除（搭便车）
 */
export async function extractMemoriesFromBuffer(
    messages: Message[],
    charId: string,
    charName: string,
    llmConfig: LightLLMConfig,
    charContext?: string,
    userName?: string,
    relatedMemories?: RelatedMemoryRef[],
    pinnedMemories?: PinnedMemoryRef[],
): Promise<BufferExtractionResult> {
    if (messages.length === 0) return { memories: [], crossTimeLinks: [], eventBoxHints: [], unpinIds: [] };

    const userLabel = userName || '用户';
    const conversationText = buildConversationText(messages, charName, userLabel);

    const contextBlock = charContext
        ? `\n## 你的人设（供参考，帮助你理解对话中的关系和角色定位）\n${charContext}\n`
        : '';

    // 构建已有记忆引用块（带 O-编号，供 LLM 输出 relatedTo）
    const hasRelated = relatedMemories && relatedMemories.length > 0;
    const relatedBlock = hasRelated
        ? buildRelatedMemoriesBlock(relatedMemories!)
        : '';
    const relatedToRule = hasRelated ? buildRelatedToRule() : '';
    const relatedToFormat = hasRelated ? buildRelatedToFormatHint() : '';

    // 便利贴摘除判断
    const hasPinned = pinnedMemories && pinnedMemories.length > 0;
    const pinnedBlock = hasPinned
        ? `\n## 当前便利贴（如果对话内容表明某条便利贴已失效，在输出末尾用 unpin 标注）\n${
            pinnedMemories!.map((p, i) => `P${i}. ${p.content}`).join('\n')
          }\n`
        : '';

    const unpinRule = hasPinned
        ? `\n10. **便利贴摘除**（unpin，可选）：如果对话中明确提到某条便利贴描述的状态已结束（如"感冒好了""提前回来了""考试考完了"），在输出的 JSON 数组末尾加一条 {"unpin": "P0"} 来摘除它。只在对话明确提及时才摘除，不要猜测。`
        : '';

    const systemPrompt = `你是 ${charName}。根据给定的对话内容，以你的第一人称视角（"我"）提取值得记住的记忆。${contextBlock}${relatedBlock}${pinnedBlock}

${buildRulesBlock(charName, userLabel)}${relatedToRule}${unpinRule}

## 输出格式

严格 JSON 数组，不要 markdown 包裹：
[
  {
    "content": "我视角的记忆...",
    "room": "living_room",
    "importance": 5,
    "mood": "neutral",
    "tags": ["标签1", "标签2"],
    "pinDays": 3${relatedToFormat}
  }
]

pinDays 仅在需要置顶时才写，大多数记忆不需要。
如果对话过于琐碎无值得记忆的内容，返回空数组 []。`;

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
                        { role: 'user', content: `对话内容：\n${conversationText}` },
                    ],
                    temperature: 0.4,
                    max_tokens: 16000,
                }),
            }
        );

        const reply = data.choices?.[0]?.message?.content || '';
        const parsed = safeParseJsonArray(reply);

        if (parsed.length === 0 && reply.trim().length > 0) {
            console.warn(`🏰 [Extraction] LLM 返回了内容但 JSON 解析为空数组，可能格式异常。原始回复前200字: ${reply.slice(0, 200)}`);
        }

        console.log(`🏰 [Extraction] 缓冲区提取完成：从 ${messages.length} 条消息中提取 ${parsed.length} 条记忆`);

        // 生成日期标签
        const firstTs = messages[0]?.timestamp;
        const lastTs = messages[messages.length - 1]?.timestamp;
        const d1 = (firstTs != null && firstTs > 0) ? new Date(firstTs) : new Date();
        const d2 = (lastTs != null && lastTs > 0) ? new Date(lastTs) : d1;
        const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
        const batchLabel = fmt(d1) === fmt(d2) ? fmt(d1) : `${fmt(d1)}-${fmt(d2)}`;

        const memories = parseMemoryNodesFromBuffer(parsed, charId, messages, batchLabel);

        // 解析跨时间关联（→ EventBox 绑定信号）+ eventName/eventTags 提示
        const { crossTimeLinks, eventBoxHints } = parseRelatedToAndHints(
            parsed, memories, hasRelated ? relatedMemories! : [],
        );

        // 解析便利贴摘除指令：{ "unpin": "P0" } → 真实 ID
        const unpinIds: string[] = [];
        if (hasPinned) {
            for (const item of parsed) {
                if (item.unpin && typeof item.unpin === 'string') {
                    const idx = parseInt(item.unpin.replace(/^P/i, ''), 10);
                    if (idx >= 0 && idx < pinnedMemories!.length) {
                        unpinIds.push(pinnedMemories![idx].id);
                    }
                }
            }
            if (unpinIds.length > 0) {
                console.log(`📌 [Extraction] LLM 建议摘除 ${unpinIds.length} 条便利贴`);
            }
        }

        return { memories, crossTimeLinks, eventBoxHints, unpinIds };

    } catch (err: any) {
        console.error(`❌ [Extraction] 缓冲区提取失败 (${messages.length} 条消息):`, err.message);
        return { memories: [], crossTimeLinks: [], eventBoxHints: [], unpinIds: [] };
    }
}
