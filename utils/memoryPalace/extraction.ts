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

/**
 * 从封好的话题盒中提取记忆节点
 *
 * @param box 已封好的 TopicBox
 * @param messages 话题盒对应的消息列表
 * @param charName 角色名（用于第三人称叙事中的 "TA"）
 * @param apiConfig LLM API 配置
 * @returns MemoryNode[]（embedded = false，等后续向量化）
 */
export async function extractMemories(
    box: TopicBox,
    messages: Message[],
    charName: string,
    llmConfig: LightLLMConfig,
    charContext?: string,
): Promise<MemoryNode[]> {

    const conversationText = messages
        .map(m => `[${m.role === 'user' ? '用户' : charName}]: ${m.content.slice(0, 500)}`)
        .join('\n');

    const contextBlock = charContext
        ? `\n## 你的人设（供参考，帮助你理解对话中的关系和角色定位）\n${charContext}\n`
        : '';

    const systemPrompt = `你是 ${charName}。根据给定的对话内容，以你的第一人称视角（"我"）提取值得记住的记忆。${contextBlock}

## 规则

1. **第一人称叙事**：用 ${charName} 的"我"视角来记录。用户用"TA"指代。保持完整事件脉络，不要掐头去尾。
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
6. **不要遗漏重要记忆，但也不要把每句话都变成记忆**。一个话题盒通常提取 1–5 条记忆。

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

        if (parsed.length === 0) return [];

        const validRooms: MemoryRoom[] = [
            'living_room', 'bedroom', 'study', 'user_room',
            'self_room', 'attic', 'windowsill',
        ];

        // 用盒子内消息的时间范围，而不是 Date.now()
        const msgTimestamps = messages.map(m => m.timestamp).filter(t => t > 0);
        const boxTime = msgTimestamps.length > 0
            ? Math.round((msgTimestamps[0] + msgTimestamps[msgTimestamps.length - 1]) / 2) // 取中间时间
            : Date.now();

        return parsed
            .filter(item => item.content && item.room)
            .map(item => ({
                id: generateId(),
                charId: box.charId,
                content: item.content,
                room: (validRooms.includes(item.room as MemoryRoom) ? item.room : 'living_room') as MemoryRoom,
                tags: Array.isArray(item.tags) ? item.tags : [],
                importance: Math.max(1, Math.min(10, Math.round(item.importance || 5))),
                mood: item.mood || 'neutral',
                embedded: false,
                boxId: box.id,
                boxTopic: box.topic || '',
                createdAt: boxTime,
                lastAccessedAt: boxTime,
                accessCount: 0,
            }));

    } catch (err: any) {
        console.error('⚡ [Extraction] Failed to extract memories:', err.message);
        return [];
    }
}
