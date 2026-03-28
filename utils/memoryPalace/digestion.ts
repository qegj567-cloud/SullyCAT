/**
 * Memory Palace — 认知消化 (Cognitive Digestion)
 *
 * 模拟大脑的后台认知过程。每次封盒后触发一次"消化循环"，
 * 角色带着自己的人设和记忆，对所有待消化的内容做一次统一审视：
 *
 * - 阁楼困惑：化解了→卧室 / 恶化→创伤加深 / 淡忘→衰减
 * - 窗台期盼：实现了→卧室温暖记忆 / 落空了→阁楼心结
 * - 书房知识：反复访问→内化为自我认同（self_room）
 *
 * 这不是分区域轮流审查，而是一次 LLM 调用，角色作为一个整体去"回想"。
 */

import type { MemoryNode, Anticipation, PersonalityStyle } from './types';
import type { LightLLMConfig } from './pipeline';
import { MemoryNodeDB, AnticipationDB } from './db';
import { fulfillAnticipation, disappointAnticipation } from './anticipation';
import { safeFetchJson } from '../safeApi';
import { safeParseJsonArray } from './jsonUtils';

// ─── 消化结果类型 ─────────────────────────────────────

interface DigestAction {
    /** 记忆/期盼 ID */
    id: string;
    /** 动作类型 */
    action:
        | 'resolve'        // 阁楼困惑化解 → 移到卧室
        | 'deepen'         // 阁楼困惑恶化 → importance 提升
        | 'fade'           // 淡忘 → importance 降低
        | 'fulfill'        // 期盼实现
        | 'disappoint'     // 期盼落空
        | 'internalize'    // 书房知识内化 → 生成 self_room 记忆
        | 'keep';          // 维持现状
    /** 角色的内心独白（用于生成新记忆时的 content） */
    reflection?: string;
}

export interface DigestResult {
    resolved: string[];      // 阁楼→卧室
    deepened: string[];      // 阁楼 importance 提升
    faded: string[];         // importance 降低
    fulfilled: string[];     // 期盼实现
    disappointed: string[];  // 期盼落空
    internalized: string[];  // 书房→self_room 新记忆
}

// ─── 轮数计数 & 自动触发 ─────────────────────────────

/** 每聊 N 轮自动触发一次消化（1轮 = 用户发 + AI 回复） */
const AUTO_DIGEST_ROUNDS = 50;
const ROUND_KEY = (charId: string) => `mp_digestRounds_${charId}`;
const LAST_DIGEST_KEY = (charId: string) => `mp_lastDigest_${charId}`;

/** 获取当前已累积的轮数 */
export function getDigestRoundCount(charId: string): number {
    try {
        return parseInt(localStorage.getItem(ROUND_KEY(charId)) || '0', 10);
    } catch { return 0; }
}

/** 累加一轮，返回是否达到自动消化阈值 */
export function incrementDigestRound(charId: string): boolean {
    const current = getDigestRoundCount(charId) + 1;
    try { localStorage.setItem(ROUND_KEY(charId), String(current)); } catch {}
    return current >= AUTO_DIGEST_ROUNDS;
}

/** 重置轮数计数器（消化完成后调用） */
function resetDigestRounds(charId: string): void {
    try { localStorage.setItem(ROUND_KEY(charId), '0'); } catch {}
}

function markDigested(charId: string): void {
    try { localStorage.setItem(LAST_DIGEST_KEY(charId), String(Date.now())); } catch {}
}

// ─── 收集待消化材料 ──────────────────────────────────

async function gatherDigestMaterial(charId: string): Promise<{
    atticNodes: MemoryNode[];
    anticipations: Anticipation[];
    studyNodes: MemoryNode[];
    recentContext: MemoryNode[];
}> {
    // 阁楼：所有未消化的困惑
    const atticNodes = await MemoryNodeDB.getByRoom(charId, 'attic');

    // 窗台期盼：active 和 anchor 的
    const allAnts = await AnticipationDB.getByCharId(charId);
    const anticipations = allAnts.filter(a => a.status === 'active' || a.status === 'anchor');

    // 书房：高访问次数的知识（accessCount >= 3 说明被反复提及）
    const allStudy = await MemoryNodeDB.getByRoom(charId, 'study');
    const studyNodes = allStudy.filter(n => n.accessCount >= 3);

    // 最近的卧室/客厅记忆作为"最近发生了什么"的上下文
    const bedroom = await MemoryNodeDB.getByRoom(charId, 'bedroom');
    const living = await MemoryNodeDB.getByRoom(charId, 'living_room');
    const recentContext = [...bedroom, ...living]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10);

    return { atticNodes, anticipations, studyNodes, recentContext };
}

// ─── LLM 统一消化调用 ────────────────────────────────

async function callDigestLLM(
    charName: string,
    charPersona: string,
    material: {
        atticNodes: MemoryNode[];
        anticipations: Anticipation[];
        studyNodes: MemoryNode[];
        recentContext: MemoryNode[];
    },
    llmConfig: LightLLMConfig,
): Promise<DigestAction[]> {

    // 如果没有任何待消化的内容，跳过
    if (material.atticNodes.length === 0 &&
        material.anticipations.length === 0 &&
        material.studyNodes.length === 0) {
        return [];
    }

    const systemPrompt = `你是 ${charName}。以下是你的核心人设：
${charPersona.slice(0, 800)}

你现在正在独处，安静地回想最近的事情。你需要对内心里那些"还没消化完"的东西做一次整理。

## 你需要审视的内容

${material.atticNodes.length > 0 ? `### 内心困惑 (阁楼)
这些是你一直没想通的事、受过的伤、没解决的矛盾：
${material.atticNodes.map((n, i) => `[A${i}] (${n.mood}, 重要性${n.importance}): ${n.content}`).join('\n')}
` : ''}
${material.anticipations.length > 0 ? `### 心里的期盼 (窗台)
这些是你一直在等待或盼望的事：
${material.anticipations.map((a, i) => `[W${i}] (${a.status}): ${a.content}`).join('\n')}
` : ''}
${material.studyNodes.length > 0 ? `### 反复想起的知识/成长 (书房)
这些是你经常回忆到的学习和成长经历：
${material.studyNodes.map((n, i) => `[S${i}] (访问${n.accessCount}次): ${n.content}`).join('\n')}
` : ''}
### 最近发生的事
${material.recentContext.map(n => `- (${n.room}, ${n.mood}): ${n.content}`).join('\n')}

## 你的任务

以 ${charName} 的第一人称内心视角，审视上面的内容。对每一条给出判断：

对于阁楼困惑 [A*]：
- "resolve" — 最近的经历让你想开了，释然了
- "deepen" — 这件事越想越严重，变成了心理创伤
- "fade" — 你已经不太在意了，开始淡忘
- "keep" — 还没想通，继续放着

对于窗台期盼 [W*]：
- "fulfill" — 这个期盼已经实现了！
- "disappoint" — 这个期盼已经不可能了
- "keep" — 还在等待中

对于书房知识 [S*]：
- "internalize" — 这个已经变成了你的一部分，塑造了你的性格
- "keep" — 还只是知识，没有内化

如果是 resolve/deepen/internalize，请附上 reflection（你的内心独白，第三人称描述，50字以内）。

严格 JSON 数组格式：
[{"id": "A0", "action": "resolve", "reflection": "..."}]

没有变化的可以不写。只写有变化的。`;

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
                        { role: 'user', content: '请开始审视。' },
                    ],
                    temperature: 0.6,
                    max_tokens: 1500,
                }),
            }
        );

        const reply = data.choices?.[0]?.message?.content || '';
        const parsed = safeParseJsonArray(reply);

        const validActions = ['resolve', 'deepen', 'fade', 'fulfill', 'disappoint', 'internalize', 'keep'];

        // 将 A0/W0/S0 映射回真实 ID
        return parsed
            .filter(item => validActions.includes(item.action) && item.action !== 'keep')
            .map(item => {
                let realId = '';
                const prefix = item.id?.[0];
                const idx = parseInt(item.id?.slice(1) || '-1', 10);

                if (prefix === 'A' && idx >= 0 && idx < material.atticNodes.length) {
                    realId = material.atticNodes[idx].id;
                } else if (prefix === 'W' && idx >= 0 && idx < material.anticipations.length) {
                    realId = material.anticipations[idx].id;
                } else if (prefix === 'S' && idx >= 0 && idx < material.studyNodes.length) {
                    realId = material.studyNodes[idx].id;
                }

                return {
                    id: realId,
                    action: item.action as DigestAction['action'],
                    reflection: item.reflection,
                };
            })
            .filter(item => item.id); // 过滤无效映射

    } catch (err: any) {
        console.warn('⚡ [Digest] LLM call failed:', err.message);
        return [];
    }
}

// ─── 执行消化动作 ─────────────────────────────────────

function generateId(): string {
    return `mn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function executeActions(
    actions: DigestAction[],
    charId: string,
    material: {
        atticNodes: MemoryNode[];
        anticipations: Anticipation[];
        studyNodes: MemoryNode[];
    },
): Promise<DigestResult> {
    const result: DigestResult = {
        resolved: [], deepened: [], faded: [],
        fulfilled: [], disappointed: [], internalized: [],
    };

    for (const action of actions) {
        try {
            switch (action.action) {
                case 'resolve': {
                    // 阁楼→卧室：困惑化解了
                    const node = material.atticNodes.find(n => n.id === action.id);
                    if (node) {
                        node.room = 'bedroom';
                        node.mood = 'peaceful';
                        if (action.reflection) {
                            node.content = action.reflection;
                        }
                        await MemoryNodeDB.save(node);
                        result.resolved.push(node.id);
                        console.log(`🕊️ [Digest] Resolved → bedroom: "${node.content.slice(0, 30)}..."`);
                    }
                    break;
                }

                case 'deepen': {
                    // 阁楼：困惑恶化，importance 提升
                    const node = material.atticNodes.find(n => n.id === action.id);
                    if (node) {
                        node.importance = Math.min(10, node.importance + 1);
                        if (action.reflection) {
                            node.content = action.reflection;
                        }
                        await MemoryNodeDB.save(node);
                        result.deepened.push(node.id);
                        console.log(`💢 [Digest] Deepened (imp→${node.importance}): "${node.content.slice(0, 30)}..."`);
                    }
                    break;
                }

                case 'fade': {
                    // 淡忘：importance 降低
                    const node = material.atticNodes.find(n => n.id === action.id);
                    if (node) {
                        node.importance = Math.max(1, node.importance - 2);
                        await MemoryNodeDB.save(node);
                        result.faded.push(node.id);
                        console.log(`🌫️ [Digest] Fading (imp→${node.importance}): "${node.content.slice(0, 30)}..."`);
                    }
                    break;
                }

                case 'fulfill': {
                    // 期盼实现（调用已有的 fulfillAnticipation）
                    await fulfillAnticipation(action.id);
                    result.fulfilled.push(action.id);
                    break;
                }

                case 'disappoint': {
                    // 期盼落空
                    await disappointAnticipation(action.id);
                    result.disappointed.push(action.id);
                    break;
                }

                case 'internalize': {
                    // 书房→self_room：知识内化为自我认同
                    const node = material.studyNodes.find(n => n.id === action.id);
                    if (node && action.reflection) {
                        const selfMemory: MemoryNode = {
                            id: generateId(),
                            charId,
                            content: action.reflection,
                            room: 'self_room',
                            tags: ['内化', '成长', ...node.tags],
                            importance: Math.max(node.importance, 7),
                            mood: 'peaceful',
                            embedded: false,
                            boxId: node.boxId,
                            boxTopic: '认知内化',
                            createdAt: Date.now(),
                            lastAccessedAt: Date.now(),
                            accessCount: 0,
                        };
                        await MemoryNodeDB.save(selfMemory);
                        result.internalized.push(selfMemory.id);
                        console.log(`🪞 [Digest] Internalized → self_room: "${action.reflection.slice(0, 30)}..."`);
                    }
                    break;
                }
            }
        } catch (err: any) {
            console.warn(`⚡ [Digest] Action ${action.action} failed for ${action.id}:`, err.message);
        }
    }

    return result;
}

// ─── 主入口 ──────────────────────────────────────────

/**
 * 运行一次认知消化循环
 *
 * 触发时机：每次封盒后由 pipeline 调用（有冷却时间控制频率）
 * 也可以在记忆宫殿 App 里手动触发（用于测试）
 *
 * @param charId 角色 ID
 * @param charName 角色名
 * @param charPersona 角色核心人设（systemPrompt + worldview 片段）
 * @param llmConfig 轻量 LLM 配置
 * @param force 保留参数兼容，已无冷却限制
 */
export async function runCognitiveDigestion(
    charId: string,
    charName: string,
    charPersona: string,
    llmConfig: LightLLMConfig,
    _force: boolean = false,
): Promise<DigestResult | null> {
    // 收集材料
    const material = await gatherDigestMaterial(charId);

    // 如果没有任何待消化的东西，直接返回
    if (material.atticNodes.length === 0 &&
        material.anticipations.length === 0 &&
        material.studyNodes.length === 0) {
        markDigested(charId);
        return { resolved: [], deepened: [], faded: [], fulfilled: [], disappointed: [], internalized: [] };
    }

    console.log(`🧠 [Digest] Starting cognitive digestion for ${charName}: ${material.atticNodes.length} attic, ${material.anticipations.length} anticipations, ${material.studyNodes.length} study`);

    // LLM 统一消化
    const actions = await callDigestLLM(charName, charPersona, material, llmConfig);

    // 执行动作
    const result = await executeActions(actions, charId, material);

    // 重置轮数计数器 & 标记时间
    resetDigestRounds(charId);
    markDigested(charId);

    const total = result.resolved.length + result.deepened.length + result.faded.length +
        result.fulfilled.length + result.disappointed.length + result.internalized.length;
    if (total > 0) {
        console.log(`✅ [Digest] Complete: ${result.resolved.length} resolved, ${result.deepened.length} deepened, ${result.faded.length} faded, ${result.fulfilled.length} fulfilled, ${result.disappointed.length} disappointed, ${result.internalized.length} internalized`);
    }

    return result;
}

// ─── 人格风格自动推断 ────────────────────────────────

const VALID_STYLES: PersonalityStyle[] = ['emotional', 'narrative', 'imagery', 'analytical'];

/**
 * 根据角色人设 + 已有记忆，让 LLM 判断角色的人格风格。
 * 首次启用记忆宫殿时自动调用一次，结果写入 self_room 并返回。
 *
 * @returns 推断出的 PersonalityStyle，失败时返回 'emotional' 作为默认值
 */
export async function detectPersonalityStyle(
    charId: string,
    charName: string,
    charPersona: string,
    llmConfig: LightLLMConfig,
): Promise<{ style: PersonalityStyle; ruminationTendency: number; reasoning: string }> {
    // 收集已有记忆作为参考（最多20条，按重要性排序）
    const allNodes = await MemoryNodeDB.getByCharId(charId);
    const sampleNodes = allNodes
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 20);

    const memoryContext = sampleNodes.length > 0
        ? `\n## 已有的记忆样本\n${sampleNodes.map((n, i) => `${i + 1}. [${n.room}/${n.mood}] ${n.content}`).join('\n')}`
        : '';

    const systemPrompt = `你是一个性格分析专家。根据角色的人设和记忆，判断这个角色的认知风格和反刍倾向。

## 角色：${charName}
${charPersona.slice(0, 1200)}
${memoryContext}

## 一、四种认知风格（style）

- **emotional**（情感型）：思维以情绪为主导，容易被感受牵引，联想时优先走情感链路。适合感性、共情力强、情绪丰富的角色。
- **narrative**（叙事型）：思维以时间线和因果为主导，喜欢讲故事、回顾经历。适合沉稳、重视经历和关系发展的角色。
- **imagery**（意象型）：思维以隐喻和画面为主导，喜欢用比喻理解世界。适合文艺、诗意、想象力丰富的角色。
- **analytical**（分析型）：思维以逻辑和因果为主导，喜欢分析、推理。适合理性、冷静、重视逻辑的角色。

## 二、反刍倾向（ruminationTendency）

0.0 ~ 1.0 之间的数值，表示这个角色有多容易反复纠结过去的事、翻旧账、被未解决的心结困扰。
- 0.0～0.2：洒脱、活在当下，很少纠结过去
- 0.3～0.5：正常水平，偶尔会想起旧事
- 0.6～0.8：敏感、容易纠结，经常翻旧账
- 0.9～1.0：极度执念型，无法释怀

请根据 ${charName} 的性格特征判断，给出简短理由（30字以内）。

严格 JSON 格式回复：
{"style": "emotional", "ruminationTendency": 0.3, "reasoning": "理由"}`;

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
                        { role: 'user', content: '请判断。' },
                    ],
                    temperature: 0.3,
                    max_tokens: 300,
                }),
            }
        );

        const reply = data.choices?.[0]?.message?.content || '';

        // 尝试提取 JSON
        const jsonMatch = reply.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const style = VALID_STYLES.includes(parsed.style) ? parsed.style : 'emotional';
            const rawRum = parseFloat(parsed.ruminationTendency);
            const ruminationTendency = isNaN(rawRum) ? 0.3 : Math.max(0, Math.min(1, Math.round(rawRum * 10) / 10));
            const reasoning = parsed.reasoning || '';

            const styleLabel = style === 'emotional' ? '情感型' : style === 'narrative' ? '叙事型' : style === 'imagery' ? '意象型' : '分析型';
            console.log(`🎭 [PersonalityDetect] ${charName} → ${styleLabel}，反刍倾向 ${ruminationTendency}（${reasoning}）`);

            // 写入 self_room 作为角色自我认知的一部分
            const selfMemory: MemoryNode = {
                id: `mn_${Date.now()}_pstyle`,
                charId,
                content: `经过自我审视，${charName}认识到自己是${styleLabel}的思维方式，反刍倾向为 ${ruminationTendency}。${reasoning}`,
                room: 'self_room',
                tags: ['人格风格', '自我认知'],
                importance: 7,
                mood: 'peaceful',
                embedded: false,
                boxId: 'system_personality_detect',
                boxTopic: '人格风格自我认知',
                createdAt: Date.now(),
                lastAccessedAt: Date.now(),
                accessCount: 0,
            };
            await MemoryNodeDB.save(selfMemory);

            return { style, ruminationTendency, reasoning };
        }
    } catch (err: any) {
        console.warn(`🎭 [PersonalityDetect] LLM 调用失败: ${err.message}`);
    }

    return { style: 'emotional', ruminationTendency: 0.3, reasoning: '默认值' };
}
