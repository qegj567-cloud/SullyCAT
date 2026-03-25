/**
 * Memory Palace — Topic Loom (话题织机)
 *
 * 将连续的消息流切成话题盒子 (TopicBox)。
 * 一次性把所有新消息发给 LLM，让它标记在哪里切话题。
 * 一次 LLM 调用处理所有新消息，而不是逐条判断。
 */

import type { Message } from '../../types';
import type { TopicBox, TopicContinuity } from './types';
import type { LightLLMConfig } from './pipeline';
import { TopicBoxDB } from './db';
import { DB } from '../db';
import { safeFetchJson } from '../safeApi';
import { safeParseJsonArray } from './jsonUtils';

const MAX_BOX_MESSAGES = 35;

// ─── 通用轻量 LLM 调用 ───────────────────────────────

async function callLightLLM(
    config: LightLLMConfig,
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number = 20,
    temperature: number = 0.1,
): Promise<string> {
    const data = await safeFetchJson(
        `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature,
                max_tokens: maxTokens,
            }),
        }
    );
    return (data.choices?.[0]?.message?.content || '').trim();
}

// ─── 批量话题切分（一次 LLM 调用） ──────────────────

/**
 * 一次性判断一批消息中哪里有话题切换。
 * 返回切分点的索引数组（在该索引之前切一刀）。
 * 例：消息 [0,1,2,3,4,5,6]，返回 [4] 表示 0-3 是一个话题，4-6 是另一个。
 */
export async function batchJudgeTopicBreaks(
    contextMessages: { role: string; content: string }[],
    newMessages: { role: string; content: string; index: number }[],
    llmConfig: LightLLMConfig,
): Promise<number[]> {
    if (newMessages.length <= 2) return []; // 太少不用判断

    const contextStr = contextMessages.length > 0
        ? `前文（已归档的最后几条消息，作为话题参考）：\n${contextMessages.map(m => `[${m.role}]: ${m.content.slice(0, 150)}`).join('\n')}\n\n`
        : '';

    const messagesStr = newMessages
        .map(m => `[${m.index}][${m.role}]: ${m.content.slice(0, 200)}`)
        .join('\n');

    const systemPrompt = `你是一个话题切分器。给你一组聊天消息（带编号），判断哪些地方发生了话题切换。

规则：
- 同一话题的连续讨论不要切开
- 只有明确换了一个新话题才切（比如从聊吃饭突然聊到工作）
- 话题微转（从吃饭聊到做饭）不算换话题
- 返回需要切分的消息编号（在该编号之前切一刀）

只返回一个 JSON 数组，包含切分点的编号。如果没有话题切换，返回空数组 []。
例：[4] 表示在编号4之前切一刀，0-3是一个话题，4往后是新话题。
例：[3,7] 表示切两刀，0-2 / 3-6 / 7+ 三个话题。
例：[] 表示全部是同一个话题。

只输出 JSON 数组，不要其他内容。`;

    try {
        const reply = await callLightLLM(
            llmConfig, systemPrompt,
            `${contextStr}新消息：\n${messagesStr}`,
            100, 0.1,
        );

        // 解析结果
        const match = reply.match(/\[[\s\S]*?\]/);
        if (!match) return [];

        const breaks = JSON.parse(match[0]) as number[];
        if (!Array.isArray(breaks)) return [];

        // 过滤有效的切分点
        const validIndices = new Set(newMessages.map(m => m.index));
        return breaks
            .filter(b => typeof b === 'number' && validIndices.has(b))
            .sort((a, b) => a - b);

    } catch (err: any) {
        console.warn('⚡ [TopicLoom] Batch topic judgment failed:', err.message);
        return [];
    }
}

// ─── LLM 封盒元数据提取 ─────────────────────────────

export async function extractBoxMetadata(
    messages: { role: string; content: string }[],
    llmConfig: LightLLMConfig,
): Promise<{ topic: string; events: string[]; keywords: string[] }> {
    const systemPrompt = `你是一个对话分析器。根据给定的对话内容，提取：
1. topic — 一句话话题摘要（15字以内）
2. events — 关键事件列表（最多5条，每条15字以内）
3. keywords — 关键词（最多8个）

严格以 JSON 格式返回，不要有其他内容：
{"topic": "...", "events": ["..."], "keywords": ["..."]}`;

    const conversationText = messages
        .map(m => `[${m.role}]: ${m.content.slice(0, 300)}`)
        .join('\n');

    try {
        const reply = await callLightLLM(llmConfig, systemPrompt, conversationText, 300, 0.3);
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    topic: parsed.topic || '未知话题',
                    events: Array.isArray(parsed.events) ? parsed.events : [],
                    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
                };
            } catch {
                return { topic: reply.slice(0, 15), events: [], keywords: [] };
            }
        }
        return { topic: '未知话题', events: [], keywords: [] };
    } catch (err: any) {
        console.warn('⚡ [TopicLoom] Metadata extraction failed:', err.message);
        return { topic: '未知话题', events: [], keywords: [] };
    }
}

// ─── TopicLoom 管理器 ─────────────────────────────────

function generateId(): string {
    return `tb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class TopicLoomManager {
    private charId: string;
    private llmConfig: LightLLMConfig;
    private currentBox: TopicBox | null = null;
    private recentContent: { role: string; content: string }[] = [];

    constructor(charId: string, llmConfig: LightLLMConfig) {
        this.charId = charId;
        this.llmConfig = llmConfig;
    }

    async init(): Promise<void> {
        const openBox = await TopicBoxDB.getOpenBox(this.charId);
        if (openBox) {
            this.currentBox = openBox;
            if (openBox.messageIds.length > 0) {
                try {
                    const recentMsgs = await DB.getRecentMessagesByCharId(this.charId, 50);
                    const boxMsgIds = new Set(openBox.messageIds);
                    this.recentContent = recentMsgs
                        .filter(m => boxMsgIds.has(m.id))
                        .slice(-3)
                        .map(m => ({ role: m.role, content: m.content }));
                } catch (err: any) {
                    console.warn('⚡ [TopicLoom] Failed to restore recentContent:', err.message);
                }
            }
        }
    }

    /**
     * 批量处理新消息（一次 LLM 调用判断所有切分点）
     * 返回所有被封好的 TopicBox（可能 0 个或多个）
     */
    async processBatch(messages: Message[]): Promise<TopicBox[]> {
        if (messages.length === 0) return [];

        const sealedBoxes: TopicBox[] = [];

        // 如果没有当前盒子，先创建一个
        if (!this.currentBox) {
            this.currentBox = {
                id: generateId(),
                charId: this.charId,
                messageIds: [],
                status: 'open',
                topic: '',
                events: [],
                keywords: [],
                createdAt: Date.now(),
                sealedAt: null,
            };
        }

        // 如果消息太少（≤2），直接追加不做判断
        if (messages.length <= 2 && this.currentBox.messageIds.length <= 1) {
            for (const msg of messages) {
                this.currentBox.messageIds.push(msg.id);
                this.recentContent.push({ role: msg.role, content: msg.content });
            }
            await TopicBoxDB.save(this.currentBox);
            return [];
        }

        // 一次 LLM 调用：判断所有消息的切分点
        const indexedMessages = messages.map((m, i) => ({
            role: m.role,
            content: m.content,
            index: i,
        }));

        const breakPoints = await batchJudgeTopicBreaks(
            this.recentContent, // 前文上下文
            indexedMessages,
            this.llmConfig,
        );

        // 按切分点把消息分成段
        const segments: Message[][] = [];
        let lastBreak = 0;
        for (const bp of breakPoints) {
            if (bp > lastBreak) {
                segments.push(messages.slice(lastBreak, bp));
            }
            lastBreak = bp;
        }
        segments.push(messages.slice(lastBreak)); // 最后一段

        // 处理每一段
        for (let segIdx = 0; segIdx < segments.length; segIdx++) {
            const segment = segments[segIdx];

            // 第一段之后的段 = 话题切换，需要封盒 + 开新盒
            if (segIdx > 0 && this.currentBox.messageIds.length > 0) {
                const sealed = await this.sealCurrentBox();
                sealedBoxes.push(sealed);
            }

            // 把这段消息追加到当前盒子
            for (const msg of segment) {
                this.currentBox!.messageIds.push(msg.id);
                this.recentContent.push({ role: msg.role, content: msg.content });
            }

            // 盒子超过硬限制
            if (this.currentBox!.messageIds.length >= MAX_BOX_MESSAGES) {
                const sealed = await this.sealCurrentBox();
                sealedBoxes.push(sealed);
            }
        }

        // 保存当前 open 的盒子
        await TopicBoxDB.save(this.currentBox!);

        // 只保留最后 3 条作为下次的上下文
        this.recentContent = this.recentContent.slice(-3);

        return sealedBoxes;
    }

    /** 旧的单条处理接口，保留兼容性 */
    async processMessage(message: Message): Promise<TopicBox | null> {
        const results = await this.processBatch([message]);
        return results.length > 0 ? results[0] : null;
    }

    private async sealCurrentBox(): Promise<TopicBox> {
        if (!this.currentBox) throw new Error('No box to seal');

        const metadata = await extractBoxMetadata(this.recentContent, this.llmConfig);

        this.currentBox.status = 'sealed';
        this.currentBox.sealedAt = Date.now();
        this.currentBox.topic = metadata.topic;
        this.currentBox.events = metadata.events;
        this.currentBox.keywords = metadata.keywords;

        await TopicBoxDB.save(this.currentBox);

        const sealed = { ...this.currentBox };

        // 开新盒子
        this.currentBox = {
            id: generateId(),
            charId: this.charId,
            messageIds: [],
            status: 'open',
            topic: '',
            events: [],
            keywords: [],
            createdAt: Date.now(),
            sealedAt: null,
        };

        return sealed;
    }

    async forceSeal(): Promise<TopicBox | null> {
        if (!this.currentBox || this.currentBox.messageIds.length === 0) return null;
        return this.sealCurrentBox();
    }
}
