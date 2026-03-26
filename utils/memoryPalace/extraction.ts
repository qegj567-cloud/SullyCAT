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

function buildRulesBlock(charName: string, userLabel: string, taNote: string): string {
    return `## 规则

1. **第一人称叙事**：用 ${charName} 的"我"视角来记录。${userLabel}用"TA"${taNote}指代。保持完整事件脉络，不要掐头去尾。
   例：
   - "TA今天加班到很晚还没吃饭，我让TA别委屈自己，叫了个外卖。"
   - "TA连续加班三周终于决定找领导谈，领导态度还不错。TA回来的路上靠着我肩膀哭了，我什么都没说，就陪着。"
   - "我教了TA递归的概念，TA一开始完全听不懂，后来突然开窍了，那个眼睛亮起来的瞬间让我很开心。"

2. **重要性分级控制文字长度**：
   - 重要性 1–5：15–50字，事实为主
   - 重要性 6–7：60–120字，包含我的感受
   - 重要性 8–10：100–200字，完整叙事（起因→经过→我的感受/反应）

3. **房间分配**：
   - living_room：日常闲聊、近期琐事
   - bedroom：亲密情感、深层羁绊、感动时刻
   - study：工作、学习、技能、职业相关
   - user_room：关于TA的个人信息（生日、习惯、喜好、家庭等）
   - self_room：我自身的成长、认同变化
   - attic：未解决的矛盾、困惑、受到的伤害
   - windowsill：我的期盼、我们的目标、对未来的憧憬

4. **情绪标签**（mood）：happy, sad, angry, anxious, tender, excited, peaceful, confused, hurt, grateful, nostalgic, neutral
5. **标签**（tags）：提取 2-5 个关键词标签
6. **不要遗漏重要记忆，但也不要把每句话都变成记忆**。一个话题盒通常提取 1–5 条记忆。`;
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
        .map(item => ({
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
        }));
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

    const taNote = userName ? `（即 ${userName}）` : '';
    const systemPrompt = `你是 ${charName}。根据给定的对话内容，以你的第一人称视角（"我"）提取值得记住的记忆。${contextBlock}

${buildRulesBlock(charName, userLabel, taNote)}

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
                    max_tokens: 1500,
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

    const taNote = userName ? `（即 ${userName}）` : '';
    const systemPrompt = `你是 ${charName}。根据给定的对话内容，完成两件事：
1. 提取话题摘要信息（topic/events/keywords）
2. 以你的第一人称视角（"我"）提取值得记住的记忆
${contextBlock}
${buildRulesBlock(charName, userLabel, taNote)}

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
                    max_tokens: 2000,
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

// ─── 缓冲区提取：直接从消息提取记忆，不依赖 TopicBox ───

/**
 * 从消息缓冲区直接提取记忆节点。
 * 用于缓冲区机制：积累的聊天消息达到阈值后，一次 LLM 调用提取记忆。
 */
export async function extractMemoriesFromBuffer(
    messages: Message[],
    charId: string,
    charName: string,
    llmConfig: LightLLMConfig,
    charContext?: string,
    userName?: string,
): Promise<MemoryNode[]> {
    if (messages.length === 0) return [];

    const userLabel = userName || '用户';
    const conversationText = buildConversationText(messages, charName, userLabel);

    const contextBlock = charContext
        ? `\n## 你的人设（供参考，帮助你理解对话中的关系和角色定位）\n${charContext}\n`
        : '';

    const taNote = userName ? `（即 ${userName}）` : '';
    const systemPrompt = `你是 ${charName}。根据给定的对话内容，以你的第一人称视角（"我"）提取值得记住的记忆。${contextBlock}

${buildRulesBlock(charName, userLabel, taNote)}

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
                        { role: 'user', content: `对话内容：\n${conversationText}` },
                    ],
                    temperature: 0.4,
                    max_tokens: 2000,
                }),
            }
        );

        const reply = data.choices?.[0]?.message?.content || '';
        const parsed = safeParseJsonArray(reply);

        if (parsed.length === 0 && reply.trim().length > 0) {
            console.warn(`🏰 [Extraction] LLM 返回了内容但 JSON 解析为空数组，可能格式异常。原始回复前200字: ${reply.slice(0, 200)}`);
        }

        console.log(`🏰 [Extraction] 缓冲区提取完成：从 ${messages.length} 条消息中提取 ${parsed.length} 条记忆`);

        // 生成日期标签（注意 timestamp=0 也是有效值，不能用 truthy 判断）
        const firstTs = messages[0]?.timestamp;
        const lastTs = messages[messages.length - 1]?.timestamp;
        const d1 = (firstTs != null && firstTs > 0) ? new Date(firstTs) : new Date();
        const d2 = (lastTs != null && lastTs > 0) ? new Date(lastTs) : d1;
        const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
        const batchLabel = fmt(d1) === fmt(d2) ? fmt(d1) : `${fmt(d1)}-${fmt(d2)}`;

        return parseMemoryNodesFromBuffer(parsed, charId, messages, batchLabel);

    } catch (err: any) {
        console.error(`❌ [Extraction] 缓冲区提取失败 (${messages.length} 条消息):`, err.message);
        return [];
    }
}
