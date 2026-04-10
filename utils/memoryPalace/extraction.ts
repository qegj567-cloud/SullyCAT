/**
 * Memory Palace — 记忆提取 (Memory Extraction)
 *
 * 将封好的话题盒送给 LLM，提取出 MemoryNode 数组。
 * 不同重要性对应不同的记忆详细程度。
 */

import type { Message } from '../../types';
import type { MemoryNode, MemoryRoom, TopicBox } from './types';
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

function parseMemoryNodes(parsed: any[], box: TopicBox, messages: Message[], topicOverride?: string): MemoryNode[] {
    if (parsed.length === 0) return [];

    // 用盒子内消息的时间范围，而不是 Date.now()
    const msgTimestamps = messages.map(m => m.timestamp).filter(t => t > 0);
    const boxTime = msgTimestamps.length > 0
        ? Math.round((msgTimestamps[0] + msgTimestamps[msgTimestamps.length - 1]) / 2)
        : Date.now();

    return parsed
        .filter(item => item.content && item.room)
        .map(item => ({
            id: generateId(),
            charId: box.charId,
            content: item.content,
            room: (VALID_ROOMS.includes(item.room as MemoryRoom) ? item.room : 'living_room') as MemoryRoom,
            tags: Array.isArray(item.tags) ? item.tags : [],
            importance: Math.max(1, Math.min(10, Math.round(item.importance || 5))),
            mood: item.mood || 'neutral',
            embedded: false,
            boxId: box.id,
            boxTopic: topicOverride || box.topic || '',
            createdAt: boxTime,
            lastAccessedAt: boxTime,
            accessCount: 0,
        }));
}

/** 从消息缓冲区直接解析记忆节点（不依赖 TopicBox） */
function parseMemoryNodesFromBuffer(
    parsed: any[], charId: string, messages: Message[], batchLabel: string,
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
                boxId: `buffer_${batchLabel}`,
                boxTopic: batchLabel,
                createdAt: midTime,
                lastAccessedAt: midTime,
                accessCount: 0,
                pinnedUntil,
            };
        });
}

// ─── 原始接口：仅提取记忆 ───────────────────────────

/**
 * 从封好的话题盒中提取记忆节点
 *
 * @param box 已封好的 TopicBox
 * @param messages 话题盒对应的消息列表
 * @param charName 角色名（用于第三人称叙事中的 "TA"）
 * @param llmConfig LLM API 配置
 * @returns MemoryNode[]（embedded = false，等后续向量化）
 */
export async function extractMemories(
    box: TopicBox,
    messages: Message[],
    charName: string,
    llmConfig: LightLLMConfig,
    charContext?: string,
    userName?: string,
): Promise<MemoryNode[]> {

    const userLabel = userName || '用户';
    const conversationText = buildConversationText(messages, charName, userLabel);

    const contextBlock = charContext
        ? `\n## 你的人设（供参考，帮助你理解对话中的关系和角色定位）\n${charContext}\n`
        : '';

    const systemPrompt = `你是 ${charName}。根据给定的对话内容，以你的第一人称视角（"我"）提取值得记住的记忆。${contextBlock}

${buildRulesBlock(charName, userLabel)}

## 输出格式

严格 JSON 数组，不要 markdown 包裹：
[
  {
    "content": "我视角的记忆...",
    "room": "living_room",
    "importance": 5,
    "mood": "neutral",
    "tags": ["标签1", "标签2"]
  }
]

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
                        { role: 'user', content: `话题：${box.topic || '未知'}\n\n对话内容：\n${conversationText}` },
                    ],
                    temperature: 0.4,
                    max_tokens: 16000,
                }),
            }
        );

        const reply = data.choices?.[0]?.message?.content || '';
        const parsed = safeParseJsonArray(reply);
        return parseMemoryNodes(parsed, box, messages);

    } catch (err: any) {
        console.error('⚡ [Extraction] Failed to extract memories:', err.message);
        return [];
    }
}

// ─── 合并接口：同时提取记忆 + 话题元数据（省一次 LLM） ──

export interface ExtractionWithMetadata {
    memories: MemoryNode[];
    topic: string;
    events: string[];
    keywords: string[];
}

/**
 * 一次 LLM 调用同时提取记忆节点和话题元数据。
 * 用于历史聊天批量处理，将原来的 extractBoxMetadata + extractMemories 两次调用合并为一次。
 */
export async function extractMemoriesWithMetadata(
    box: TopicBox,
    messages: Message[],
    charName: string,
    llmConfig: LightLLMConfig,
    charContext?: string,
    userName?: string,
): Promise<ExtractionWithMetadata> {

    const userLabel = userName || '用户';
    const conversationText = buildConversationText(messages, charName, userLabel);

    const contextBlock = charContext
        ? `\n## 你的人设（供参考，帮助你理解对话中的关系和角色定位）\n${charContext}\n`
        : '';

    const systemPrompt = `你是 ${charName}。根据给定的对话内容，完成两件事：
1. 提取话题摘要信息（topic/events/keywords）
2. 以你的第一人称视角（"我"）提取值得记住的记忆
${contextBlock}
${buildRulesBlock(charName, userLabel)}

## 输出格式

严格 JSON 对象，不要 markdown 包裹：
{
  "topic": "一句话话题摘要（15字以内，用${userLabel}和${charName}的名字而非泛称）",
  "events": ["关键事件1（15字以内）", "关键事件2"],
  "keywords": ["关键词1", "关键词2"],
  "memories": [
    {
      "content": "我视角的记忆...",
      "room": "living_room",
      "importance": 5,
      "mood": "neutral",
      "tags": ["标签1", "标签2"]
    }
  ]
}

memories 为空时写 []。topic/events/keywords 必须填写。`;

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

        // 解析外层 JSON 对象
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return { memories: [], topic: '未知话题', events: [], keywords: [] };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const topic = parsed.topic || '未知话题';
        const memories = parseMemoryNodes(
            Array.isArray(parsed.memories) ? parsed.memories : [],
            box,
            messages,
            topic,
        );

        return {
            memories,
            topic,
            events: Array.isArray(parsed.events) ? parsed.events : [],
            keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        };

    } catch (err: any) {
        console.error('⚡ [Extraction] Failed to extract memories with metadata:', err.message);
        return { memories: [], topic: '未知话题', events: [], keywords: [] };
    }
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

/** 缓冲区提取结果，包含跨时间关联信息 */
export interface BufferExtractionResult {
    memories: MemoryNode[];
    /** 新记忆 → 关联的已有记忆 ID 映射 */
    crossTimeLinks: { newMemoryId: string; existingMemoryId: string }[];
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
    if (messages.length === 0) return { memories: [], crossTimeLinks: [], unpinIds: [] };

    const userLabel = userName || '用户';
    const conversationText = buildConversationText(messages, charName, userLabel);

    const contextBlock = charContext
        ? `\n## 你的人设（供参考，帮助你理解对话中的关系和角色定位）\n${charContext}\n`
        : '';

    // 构建已有记忆引用块（带 O-编号，供 LLM 输出 relatedTo）
    const hasRelated = relatedMemories && relatedMemories.length > 0;
    const relatedBlock = hasRelated
        ? `\n## 已有记忆（如果新记忆与某条旧记忆描述的是同一件事或直接相关的事件，请在 relatedTo 中标注编号）\n${
            relatedMemories!.map((r, i) => `O${i}. [${r.room}] ${r.content}`).join('\n')
          }\n`
        : '';

    const relatedToRule = hasRelated
        ? `\n8. **事件关联**（relatedTo）：如果这条新记忆和上方"已有记忆"中的某条描述的是同一件事的后续发展、结局、或直接因果关联，在 relatedTo 中写上对应编号（如 ["O0", "O3"]）。没有关联就不写这个字段。只标注真正相关的，不要勉强。`
        : '';

    const relatedToFormat = hasRelated
        ? `,
    "relatedTo": ["O0"]`
        : '';

    // 便利贴摘除判断
    const hasPinned = pinnedMemories && pinnedMemories.length > 0;
    const pinnedBlock = hasPinned
        ? `\n## 当前便利贴（如果对话内容表明某条便利贴已失效，在输出末尾用 unpin 标注）\n${
            pinnedMemories!.map((p, i) => `P${i}. ${p.content}`).join('\n')
          }\n`
        : '';

    const unpinRule = hasPinned
        ? `\n9. **便利贴摘除**（unpin，可选）：如果对话中明确提到某条便利贴描述的状态已结束（如"感冒好了""提前回来了""考试考完了"），在输出的 JSON 数组末尾加一条 {"unpin": "P0"} 来摘除它。只在对话明确提及时才摘除，不要猜测。`
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

        // 解析跨时间关联：将 LLM 输出的 relatedTo ["O0", "O3"] 映射为真实 memory ID
        const crossTimeLinks: BufferExtractionResult['crossTimeLinks'] = [];
        if (hasRelated && memories.length > 0) {
            for (let i = 0; i < parsed.length && i < memories.length; i++) {
                const item = parsed[i];
                if (Array.isArray(item.relatedTo)) {
                    for (const ref of item.relatedTo) {
                        const idx = parseInt(String(ref).replace(/^O/i, ''), 10);
                        if (idx >= 0 && idx < relatedMemories!.length) {
                            crossTimeLinks.push({
                                newMemoryId: memories[i].id,
                                existingMemoryId: relatedMemories![idx].id,
                            });
                        }
                    }
                }
            }
            if (crossTimeLinks.length > 0) {
                console.log(`🔗 [Extraction] 发现 ${crossTimeLinks.length} 条跨时间事件关联`);
            }
        }

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

        return { memories, crossTimeLinks, unpinIds };

    } catch (err: any) {
        console.error(`❌ [Extraction] 缓冲区提取失败 (${messages.length} 条消息):`, err.message);
        return { memories: [], crossTimeLinks: [], unpinIds: [] };
    }
}
