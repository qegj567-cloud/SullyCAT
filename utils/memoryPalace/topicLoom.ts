/**
 * Memory Palace — Topic Loom (话题织机)
 *
 * 将连续的消息流切成话题盒子 (TopicBox)。
 * 每来一条新消息，用轻量 LLM（复用 emotionConfig.api）判断是否换话题。
 *
 * 模型选择优先级：emotionConfig.api（轻量副模型）→ 主聊天 API（fallback）
 */

import type { Message } from '../../types';
import type { TopicBox, TopicContinuity } from './types';
import type { LightLLMConfig } from './pipeline';
import { TopicBoxDB } from './db';
import { safeFetchJson } from '../safeApi';

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

// ─── LLM 调用：话题连续性判断 ─────────────────────────

/**
 * 用轻量 LLM 判断新消息和最近消息是否属于同一话题
 */
export async function judgeTopicContinuity(
    recentMessages: { role: string; content: string }[],
    newMessage: { role: string; content: string },
    llmConfig: LightLLMConfig,
): Promise<TopicContinuity> {
    const systemPrompt = `你是一个话题连续性判断器。给你最近的几条消息和一条新消息，判断新消息与之前是否属于同一话题。

只回答以下三个词之一：
- continuous — 同一话题，继续讨论
- partial_shift — 微转，话题有轻微偏移但仍然相关
- discontinuous — 完全换话题了

只输出一个词，不要其他任何内容。`;

    const contextMessages = recentMessages
        .slice(-2)
        .map(m => `[${m.role}]: ${m.content.slice(0, 200)}`)
        .join('\n');

    const userPrompt = `最近消息：
${contextMessages}

新消息：
[${newMessage.role}]: ${newMessage.content.slice(0, 200)}

请判断连续性：`;

    try {
        const reply = await callLightLLM(llmConfig, systemPrompt, userPrompt, 20, 0.1);
        const lower = reply.toLowerCase();

        if (lower.includes('discontinuous')) return 'discontinuous';
        if (lower.includes('partial_shift')) return 'partial_shift';
        return 'continuous';
    } catch (err: any) {
        console.warn('⚡ [TopicLoom] Continuity judge failed, defaulting to continuous:', err.message);
        return 'continuous';
    }
}

// ─── LLM 调用：封盒元数据提取 ─────────────────────────

/**
 * 封盒时提取话题摘要、关键事件、关键词
 */
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
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                topic: parsed.topic || '未知话题',
                events: Array.isArray(parsed.events) ? parsed.events : [],
                keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
            };
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

/**
 * TopicLoom 管理器
 *
 * 使用方式：
 * ```ts
 * const loom = new TopicLoomManager(charId, llmConfig);
 * await loom.init();
 * const sealedBox = await loom.processMessage(message);
 * if (sealedBox) { /* 封盒了，进入记忆提取流程 *\/ }
 * ```
 */
export class TopicLoomManager {
    private charId: string;
    private llmConfig: LightLLMConfig;
    private currentBox: TopicBox | null = null;
    private recentContent: { role: string; content: string }[] = [];

    constructor(charId: string, llmConfig: LightLLMConfig) {
        this.charId = charId;
        this.llmConfig = llmConfig;
    }

    /** 初始化：加载当前 open 的盒子 */
    async init(): Promise<void> {
        const openBox = await TopicBoxDB.getOpenBox(this.charId);
        if (openBox) {
            this.currentBox = openBox;
        }
    }

    /**
     * 处理新消息
     * @returns 如果发生封盒，返回 sealed TopicBox；否则返回 null
     */
    async processMessage(message: Message): Promise<TopicBox | null> {
        const msgContent = { role: message.role, content: message.content };
        let sealedBox: TopicBox | null = null;

        if (!this.currentBox) {
            await this.createNewBox(message);
            this.recentContent.push(msgContent);
            return null;
        }

        // 只有 1 条消息的盒子 → 无条件追加（防孤儿）
        if (this.currentBox.messageIds.length === 1) {
            await this.appendToBox(message);
            this.recentContent.push(msgContent);
            return null;
        }

        // 判断话题连续性（用轻量模型）
        const continuity = await judgeTopicContinuity(
            this.recentContent,
            msgContent,
            this.llmConfig,
        );

        if (continuity === 'discontinuous') {
            sealedBox = await this.sealCurrentBox();
            await this.createNewBox(message);
            this.recentContent = [msgContent];
        } else {
            await this.appendToBox(message);
            this.recentContent.push(msgContent);

            if (this.currentBox!.messageIds.length >= MAX_BOX_MESSAGES) {
                sealedBox = await this.sealCurrentBox();
                this.recentContent = [];
            }
        }

        return sealedBox;
    }

    private async createNewBox(message: Message): Promise<void> {
        this.currentBox = {
            id: generateId(),
            charId: this.charId,
            messageIds: [message.id],
            status: 'open',
            topic: '',
            events: [],
            keywords: [],
            createdAt: Date.now(),
            sealedAt: null,
        };
        await TopicBoxDB.save(this.currentBox);
    }

    private async appendToBox(message: Message): Promise<void> {
        if (!this.currentBox) return;
        this.currentBox.messageIds.push(message.id);
        await TopicBoxDB.save(this.currentBox);
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
        this.currentBox = null;
        return sealed;
    }

    async forceSeal(): Promise<TopicBox | null> {
        if (!this.currentBox || this.currentBox.messageIds.length === 0) return null;
        return this.sealCurrentBox();
    }
}
