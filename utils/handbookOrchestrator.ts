/**
 * 手账 v2 编排器 — 版式优先 / 槽位填空
 *
 * 流程:
 *  1. roll layout: pickTemplate(date 条件) → 一组 SlotDef
 *  2. user 先手 (目前: 自动让"主角口吻 LLM"代笔 user 槽 — 也可改成 UI 直接填)
 *  3. char 按顺序轮: 单次 LLM 调用 → {slotId, text, payload?, refersTo?} 或 {pass:true}
 *  4. 收尾: 把 filled slots 转成 HandbookPage[] + HandbookLayout (跟旧渲染管道兼容)
 *
 * 跟旧 handbookGenerator 的关键区别:
 *  - 不让 LLM 排版 (位置已经定死)
 *  - 不再 "occupied bbox 避让" (没必要)
 *  - 字数硬约束 (charBudget) — 写溢出让模型自截
 *  - 角色看到 *已填的所有 slot 内容*, 必须挑剩下槽里的一个写 (或 pass)
 *  - **today-only 硬约束**: 反复强调 "只写今天的事, 不要把以前的回忆当今天讲"
 */

import {
    CharacterProfile, UserProfile,
    HandbookPage, HandbookFragment, HandbookLayout, LayoutPlacement,
    LayoutTemplate, SlotDef, SlotRole, SlotPayload,
} from '../types';
import { DB } from './db';
import { safeResponseJson, extractJson } from './safeApi';
import { ContextBuilder } from './context';
import { LAYOUT_TEMPLATES, pickTemplate } from './handbookLayouts';

interface ApiConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

// ─── 工具: 当日时间窗 ────────────────────────────────────
function dayRange(date: string): { start: number; end: number } {
    const [y, m, d] = date.split('-').map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    return { start, end: start + 86400000 };
}

function dayOfWeekZh(date: string): string {
    return ['日', '一', '二', '三', '四', '五', '六'][
        new Date(date.replace(/-/g, '/')).getDay()
    ];
}

// ─── 工具: user 当日跟某角色对话片段 ─────────────────────
async function todayChatLines(
    char: CharacterProfile,
    date: string,
    userName: string,
): Promise<{ lines: string[]; userMsgCount: number }> {
    const { start, end } = dayRange(date);
    let all: any[] = [];
    try { all = await DB.getMessagesByCharId(char.id, true); } catch { return { lines: [], userMsgCount: 0 }; }
    const today = all
        .filter(m => m.timestamp >= start && m.timestamp < end)
        .sort((a, b) => a.timestamp - b.timestamp);
    const lines: string[] = [];
    let userMsgCount = 0;
    for (const m of today) {
        if (m.role === 'system') continue;
        if (typeof m.content !== 'string' || !m.content.trim()) continue;
        const speaker = m.role === 'user' ? userName : char.name;
        const text = m.content.length > 200 ? m.content.slice(0, 200) + '…' : m.content;
        lines.push(`${speaker}: ${text}`);
        if (m.role === 'user') userMsgCount++;
    }
    return { lines, userMsgCount };
}

// ─── 槽 → prompt 描述 ─────────────────────────────────────
function describeSlotForPrompt(s: SlotDef): string {
    const auth = s.eligibleAuthors.join('|');
    return `[${s.id}] role=${s.slotRole} 字数=${s.charBudget[0]}~${s.charBudget[1]} 谁能写=${auth}\n  目的: ${s.hint}`;
}

// ─── 槽 → 输出 schema 描述 (告诉 LLM 要返回的 JSON shape) ──
function slotOutputSchema(role: SlotRole): string {
    switch (role) {
        case 'todo':
            return `{ "slotId": "X", "payload": { "kind": "todo", "items": [{"text":"...", "done": true|false}, ...] } }`;
        case 'gratitude':
            return `{ "slotId": "X", "payload": { "kind": "gratitude", "items": ["...", "...", "..."] } }`;
        case 'timeline-plan':
            return `{ "slotId": "X", "payload": { "kind": "timeline", "items": [{"time":"07:30", "text":"起床", "emoji":"☀️"}, ...] } }`;
        case 'mood-card':
            return `{ "slotId": "X", "text": "今天的心情一句话", "payload": { "kind": "mood", "rating": 1~5, "tag": "可选小标签" } }`;
        case 'photo-caption':
            return `{ "slotId": "X", "payload": { "kind": "photo", "caption": "短描述 (≤25字)" } }`;
        case 'sticky-reaction':
            return `{ "slotId": "X", "text": "便签内容", "refersTo": "被引用的slotId(必填)" }`;
        case 'hero-diary':
        case 'corner-note':
        default:
            return `{ "slotId": "X", "text": "纯文本内容" }`;
    }
}

// ─── 共享: today-only 红线 ────────────────────────────────
const TODAY_ONLY_RULE = `
【⚠️⚠️⚠️ TODAY-ONLY 硬约束 — 违反整组判废】
- 只写 *今天 (该日期)* 真正发生过的事 / 真正想到的念头
- **严禁**把以前的回忆、过往的对话、过去的经历当作"今天的事"扯出来
- **严禁**虚构今天和 user 一起做了什么 (没见面就没有)
- 如果你这个角色今天根本没素材, 直接 pass —— 不要硬挤
- 反应型槽 (sticky-reaction) 必须明确引用 "已填的某个槽 (slotId)" 的具体内容, 不许凭空发挥
`;

// ─── LLM call (单槽填空) ─────────────────────────────────
async function callLLM(
    apiConfig: ApiConfig, prompt: string, temperature: number,
): Promise<string | null> {
    try {
        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: 'user', content: prompt }],
                temperature,
                max_tokens: 4000,
            }),
        });
        if (!response.ok) return null;
        const data = await safeResponseJson(response);
        const raw: string = data.choices?.[0]?.message?.content || '';
        return raw.trim();
    } catch { return null; }
}

function parseLLMJson(raw: string): any | null {
    let s = raw.trim()
        .replace(/^```(?:json|JSON)?\s*\n?/gm, '')
        .replace(/\n?```\s*$/gm, '').trim();
    try { return JSON.parse(s); }
    catch { try { return extractJson(s); } catch { return null; } }
}

// ─── filled slot 内部表示 ────────────────────────────────
interface FilledSlot {
    slotId: string;
    slotRole: SlotRole;
    /** 文本内容 (有些 role 没有, 走 payload) */
    text: string;
    payload?: SlotPayload;
    /** 'user' 或 charId */
    authorKind: 'user' | 'char';
    authorName: string;
    charId?: string;
    refersTo?: string;
}

// ─── 渲染 "已填上下文" 给下一轮 LLM 看 ────────────────────
function renderFilledContext(filled: FilledSlot[]): string {
    if (filled.length === 0) return '【已填的槽】(暂无)';
    const lines: string[] = ['【已填的槽 — 你可以引用这些内容】'];
    for (const f of filled) {
        const preview = f.text || (f.payload ? JSON.stringify(f.payload).slice(0, 80) : '');
        lines.push(`  [${f.slotId}] (${f.slotRole}, by ${f.authorName}): ${preview}`);
    }
    return lines.join('\n');
}

function renderRemainingSlots(remaining: SlotDef[], authorKind: 'user' | 'char'): string {
    const eligible = remaining.filter(s => s.eligibleAuthors.includes(authorKind));
    if (eligible.length === 0) return '【你能填的槽】(无 — 该 pass)';
    return ['【剩余可填的槽】'].concat(eligible.map(describeSlotForPrompt)).join('\n');
}

// ─── 1. user 槽 — 自动代笔 (基于今日聊天) ────────────────
//
// 选 user-eligible 的槽, 每个槽喂 user 当日跟所有角色的聊天上下文,
// 让 LLM 以 user 第一人称填充。可以一次性填多个 user 槽 (一次 LLM 调用)。
async function fillUserSlots(
    template: LayoutTemplate,
    date: string,
    selectedCharIds: string[],
    characters: CharacterProfile[],
    userProfile: UserProfile,
    apiConfig: ApiConfig,
): Promise<FilledSlot[]> {
    const userName = userProfile.name || '我';
    const slots = template.pages.flat().filter(s => s.eligibleAuthors.includes('user'));
    if (slots.length === 0) return [];

    // 收集 user 今日素材
    const transcriptParts: string[] = [];
    let totalUserMsgs = 0;
    for (const charId of selectedCharIds) {
        const c = characters.find(ch => ch.id === charId);
        if (!c) continue;
        const { lines, userMsgCount } = await todayChatLines(c, date, userName);
        totalUserMsgs += userMsgCount;
        if (lines.length === 0) continue;
        const trimmed = lines.length > 50 ? lines.slice(-50) : lines;
        transcriptParts.push(`== 与「${c.name}」==\n${trimmed.join('\n')}`);
    }

    if (totalUserMsgs === 0) {
        // 一句没说 — 还是给一些极简槽 (mood-card / hero-diary 极简版) 填一下,
        // 让纸不空。但量级很小。
        const minimal = slots.filter(s =>
            s.slotRole === 'mood-card' || s.slotRole === 'corner-note'
        ).slice(0, 1);
        return minimal.map(s => makeEmptyDayFiller(s, userName));
    }

    const dow = dayOfWeekZh(date);
    const slotBlock = slots.map(describeSlotForPrompt).join('\n');

    // 输出 schema: 数组, 每个元素一个填好的槽
    const schemaExamples = slots.map(s => slotOutputSchema(s.slotRole)).join(',\n  ');

    const prompt = `今天是 ${date} (星期${dow})。你是「${userName}」的私人手账代笔。
基于 ${userName} 今天和不同角色的对话碎片, 用 ${userName} 的第一人称, **同时填好以下手账槽位**。每个槽都有自己的语义、字数预算、用途, 严格遵守。

${slotBlock}

${TODAY_ONLY_RULE}

【输出 JSON 数组】每个元素对应一个槽, 形如:
[
  ${schemaExamples}
]

字段说明:
- slotId 必须是上面列出来的 id (大写字母)
- text: 纯文本内容 (适用 hero-diary / corner-note / mood-card 等)
- payload: 结构化数据 (适用 todo / gratitude / timeline-plan / mood-card / photo-caption)
- 只能填上面 "谁能写" 含 "user" 的槽
- 字数硬卡: text 长度必须落在该槽的 charBudget 区间内
- 没素材的槽 *不要硬填*, 直接不在数组里出现就行 (留白比硬挤好)
- 不要 emoji 开头, 不要标题, 不要 ** 加粗 (除了笔感修饰)

【今日对话素材】
${transcriptParts.join('\n\n')}

直接输出 JSON 数组。`;

    const raw = await callLLM(apiConfig, prompt, 0.75);
    if (!raw) return [];
    const parsed = parseLLMJson(raw);
    if (!Array.isArray(parsed)) return [];

    const filled: FilledSlot[] = [];
    for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const slotId = String(item.slotId || '').toUpperCase();
        const slot = slots.find(s => s.id === slotId);
        if (!slot) continue;
        const text = typeof item.text === 'string' ? item.text.trim() : '';
        const payload = sanitizePayload(item.payload, slot.slotRole);
        if (!text && !payload) continue;
        filled.push({
            slotId: slot.id,
            slotRole: slot.slotRole,
            text: clampText(text, slot.charBudget),
            payload,
            authorKind: 'user',
            authorName: userName,
        });
    }
    return filled;
}

function makeEmptyDayFiller(slot: SlotDef, userName: string): FilledSlot {
    if (slot.slotRole === 'mood-card') {
        return {
            slotId: slot.id, slotRole: 'mood-card',
            text: '今天有点静。', payload: { kind: 'mood', rating: 3 },
            authorKind: 'user', authorName: userName,
        };
    }
    return {
        slotId: slot.id, slotRole: slot.slotRole,
        text: '安静的一天。',
        authorKind: 'user', authorName: userName,
    };
}

function clampText(text: string, [_min, max]: [number, number]): string {
    if (text.length <= max) return text;
    // 优先在标点处截断
    const slice = text.slice(0, max);
    const lastPunct = Math.max(
        slice.lastIndexOf('。'), slice.lastIndexOf('!'), slice.lastIndexOf('?'),
        slice.lastIndexOf('.'), slice.lastIndexOf(','), slice.lastIndexOf(','),
    );
    return lastPunct > max - 30 ? slice.slice(0, lastPunct + 1) : slice + '…';
}

function sanitizePayload(p: any, role: SlotRole): SlotPayload | undefined {
    if (!p || typeof p !== 'object') return undefined;
    const kind = p.kind;
    if (role === 'todo' && kind === 'todo' && Array.isArray(p.items)) {
        const items = p.items
            .map((it: any) => {
                if (typeof it === 'string') return { text: it.trim(), done: false };
                if (it && typeof it === 'object' && typeof it.text === 'string') {
                    return { text: it.text.trim(), done: !!it.done };
                }
                return null;
            })
            .filter((x: any) => x && x.text);
        return items.length > 0 ? { kind: 'todo', items } : undefined;
    }
    if (role === 'gratitude' && kind === 'gratitude' && Array.isArray(p.items)) {
        const items = p.items.map((s: any) => String(s || '').trim()).filter(Boolean);
        return items.length > 0 ? { kind: 'gratitude', items } : undefined;
    }
    if (role === 'timeline-plan' && kind === 'timeline' && Array.isArray(p.items)) {
        const items = p.items
            .map((it: any) => {
                if (!it || typeof it !== 'object') return null;
                const time = String(it.time || '').trim();
                const text = String(it.text || '').trim();
                if (!time || !text) return null;
                const emoji = typeof it.emoji === 'string' ? it.emoji.trim() : undefined;
                return { time, text, emoji };
            })
            .filter(Boolean);
        return items.length > 0 ? { kind: 'timeline', items } : undefined;
    }
    if (role === 'mood-card' && kind === 'mood') {
        const rating = Math.max(1, Math.min(5, Math.round(Number(p.rating) || 3)));
        const tag = typeof p.tag === 'string' ? p.tag.trim() : undefined;
        return { kind: 'mood', rating, tag };
    }
    if (role === 'photo-caption' && kind === 'photo') {
        const caption = String(p.caption || '').trim();
        const src = typeof p.src === 'string' ? p.src : undefined;
        return caption ? { kind: 'photo', caption, src } : undefined;
    }
    return undefined;
}

// ─── 2. char 槽 — 单次 LLM 调用 ────────────────────────────
async function fillOneCharTurn(
    char: CharacterProfile,
    template: LayoutTemplate,
    filled: FilledSlot[],
    date: string,
    userProfile: UserProfile,
    apiConfig: ApiConfig,
): Promise<FilledSlot | null> {
    const remaining = template.pages.flat().filter(s =>
        !filled.find(f => f.slotId === s.id) && s.eligibleAuthors.includes('char')
    );
    if (remaining.length === 0) return null;

    const userName = userProfile.name || 'user';
    const dow = dayOfWeekZh(date);
    const coreContext = ContextBuilder.buildCoreContext(char, userProfile, true);

    // 抽 ta 平时怎么说话的样本
    let speechSamples: string[] = [];
    try {
        const all = await DB.getMessagesByCharId(char.id, true);
        const charMsgs = all.filter((m: any) =>
            m.role === 'assistant'
            && typeof m.content === 'string'
            && m.content.length > 4
            && m.content.length < 400
            && !(m.content.trim().startsWith('{') && m.content.trim().endsWith('}'))
        );
        if (charMsgs.length <= 20) {
            speechSamples = charMsgs.map((m: any) => m.content.slice(0, 160));
        } else {
            const step = charMsgs.length / 20;
            for (let i = 0; i < 20; i++) {
                speechSamples.push(charMsgs[Math.floor(i * step)].content.slice(0, 160));
            }
        }
    } catch {}

    // 该 char 今天有没有跟 user 聊过 (有素材才允许写 sticky-reaction 引 user 的槽)
    const { lines: todayLines, userMsgCount } = await todayChatLines(char, date, userName);

    const speechBlock = speechSamples.length > 0
        ? `\n【⚠️ ${char.name} 平时怎么说话 — 严格模仿语气/用词/句式/口头禅】\n${speechSamples.map((s, i) => `[${i + 1}] ${s}`).join('\n')}\n`
        : '';

    const todayChatBlock = todayLines.length > 0
        ? `\n【今天 ${char.name} 跟 ${userName} 的对话片段 — 这是 *今天* 真实发生的, 你的反应只能基于这些】\n${todayLines.slice(-25).join('\n')}\n`
        : `\n【⚠️ ${char.name} 今天没和 ${userName} 说过话】不要假装聊过, 写自己的事或对其他槽内容的反应即可。\n`;

    const filledBlock = renderFilledContext(filled);
    const remainingBlock = renderRemainingSlots(remaining, 'char');

    // 只列 char-eligible 的 schema 例子
    const exampleSchemas = remaining.slice(0, 4)
        .map(s => `  - 选 ${s.id}: ${slotOutputSchema(s.slotRole)}`)
        .join('\n');

    const prompt = `今天是 ${date} (星期${dow})。${userName} 在手账上已经写了一些, 你 (角色「${char.name}」) 路过这一页, **可以挑一个空槽留下你的笔迹, 也可以选择不写**。

【角色完整档案】
${coreContext}
${speechBlock}${todayChatBlock}

${filledBlock}

${remainingBlock}

${TODAY_ONLY_RULE}

【关键决策】
1. 在 "剩余可填的槽" 里挑 **0 或 1 个** 槽
2. 如果挑一个: 严格按它的字数预算和 role 来写
3. **如果是 sticky-reaction 槽**: 必须明确引用 "已填的槽" 里的某一条 (refersTo 字段填那个 slotId)
4. 如果你这个角色今天根本没什么想留下的, **直接 pass**

【输出 JSON, 二选一】

A. 挑一个槽填 (按 role 用对应 schema):
${exampleSchemas}

B. 选择不写:
{ "pass": true, "reason": "可选, 一句话说为什么 (debug 用)" }

直接输出 JSON 对象, 不要数组, 不要 markdown 包裹。`;

    const raw = await callLLM(apiConfig, prompt, 0.85);
    if (!raw) return null;
    const parsed = parseLLMJson(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.pass === true) return null;

    const slotId = String(parsed.slotId || '').toUpperCase();
    const slot = remaining.find(s => s.id === slotId);
    if (!slot) return null;

    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    const payload = sanitizePayload(parsed.payload, slot.slotRole);
    if (!text && !payload) return null;

    // sticky-reaction 强约束: 必须有 refersTo 且引用的 slot 已存在
    let refersTo: string | undefined;
    if (slot.slotRole === 'sticky-reaction') {
        refersTo = String(parsed.refersTo || '').toUpperCase();
        const exists = filled.find(f => f.slotId === refersTo);
        if (!exists) {
            // 强约束失败 → 整槽作废 (好过让 ta 凭空发挥)
            return null;
        }
    }

    // 如果当天该角色没和 user 聊天, 而 ta 想引用 user 写的槽 — 也允许 (反应是单向的)
    // 但如果 ta 想写涉及 user 的内容 (在 hero-diary / corner-note 里), 限制就靠 prompt
    // 里的 today-only 红线 + speech sample 兜底了

    return {
        slotId: slot.id,
        slotRole: slot.slotRole,
        text: clampText(text, slot.charBudget),
        payload,
        authorKind: 'char',
        authorName: char.name,
        charId: char.id,
        refersTo,
    };
}

// ─── 3. 主入口: composePageV2 ────────────────────────────
export interface ComposeV2Input {
    date: string;
    selectedCharIds: string[];
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: ApiConfig;
    /** 强制使用某模板 id, 不传则按条件自动选 */
    forcedTemplateId?: string;
    /** 进度回调 — 给 UI 用 */
    onProgress?: (info: { stage: 'user' | 'char'; name: string; i: number; n: number }) => void;
}

export interface ComposeV2Result {
    pages: HandbookPage[];
    layouts: HandbookLayout[];
    templateId: string;
    /** debug: 哪些槽留白了 */
    skippedSlotIds: string[];
}

export async function composePageV2(input: ComposeV2Input): Promise<ComposeV2Result> {
    const { date, selectedCharIds, characters, userProfile, apiConfig, forcedTemplateId, onProgress } = input;

    // ─── roll layout ──
    let template = forcedTemplateId ? LAYOUT_TEMPLATES[forcedTemplateId] : null;
    if (!template) {
        // 自动选: 用今日 user 消息总量 + 选中角色数
        let userMsgCount = 0;
        for (const cid of selectedCharIds) {
            const c = characters.find(x => x.id === cid);
            if (!c) continue;
            const { userMsgCount: n } = await todayChatLines(c, date, userProfile.name || 'user');
            userMsgCount += n;
        }
        template = pickTemplate({ userMsgCount, charCount: selectedCharIds.length });
    }

    const totalTurns = 1 + selectedCharIds.length;
    let turnIdx = 0;
    const tick = (stage: 'user' | 'char', name: string) => {
        turnIdx++;
        onProgress?.({ stage, name, i: turnIdx, n: totalTurns });
    };

    const filled: FilledSlot[] = [];

    // ─── user 先手 (一次 LLM 调用填多个 user 槽) ──
    tick('user', userProfile.name || '我');
    const userFilled = await fillUserSlots(
        template, date, selectedCharIds, characters, userProfile, apiConfig,
    );
    filled.push(...userFilled);

    // ─── chars 按顺序 ──
    for (const cid of selectedCharIds) {
        const c = characters.find(x => x.id === cid);
        if (!c) continue;
        tick('char', c.name);
        const charSlot = await fillOneCharTurn(c, template, filled, date, userProfile, apiConfig);
        if (charSlot) filled.push(charSlot);
    }

    // ─── 转 HandbookPage[] + HandbookLayout ──
    const allSlots = template.pages.flat();
    const skippedSlotIds = allSlots
        .filter(s => !filled.find(f => f.slotId === s.id))
        .map(s => s.id);

    const result = buildPagesAndLayout(template, filled, date);
    return { ...result, templateId: template.id, skippedSlotIds };
}

// ─── filled → HandbookPage[] + HandbookLayout ────────────
//
// 旧渲染管道吃 HandbookPage[] (有 fragments) + HandbookLayout (placements 指 fragment).
// 我们让每个作者一份 HandbookPage, fragments 是 ta 填的所有槽; placements 按
// SlotDef 的位置生成, 同时把 SlotRole / payload 传进 fragment.
function buildPagesAndLayout(
    template: LayoutTemplate,
    filled: FilledSlot[],
    date: string,
): { pages: HandbookPage[]; layouts: HandbookLayout[] } {
    const allSlots = template.pages.flat();
    // 按作者分组 → 一个 HandbookPage / 作者
    const byAuthor: Map<string, FilledSlot[]> = new Map();
    for (const f of filled) {
        const key = f.authorKind === 'user' ? '__user__' : (f.charId || `__char__${f.authorName}`);
        if (!byAuthor.has(key)) byAuthor.set(key, []);
        byAuthor.get(key)!.push(f);
    }

    const pages: HandbookPage[] = [];
    const placements: LayoutPlacement[] = [];

    for (const [key, fs] of byAuthor.entries()) {
        const isUser = key === '__user__';
        const charId = isUser ? undefined : fs[0].charId;
        const pageId = isUser
            ? `udiary-${date}-${Date.now()}`
            : `lifestream-${charId || fs[0].authorName}-${date}-${Date.now()}`;

        const fragments: HandbookFragment[] = fs.map((f, i) => ({
            id: `frag-${pageId}-${i}-${f.slotId}`,
            text: f.text,
            slotId: f.slotId,
            slotRole: f.slotRole,
            authorKind: f.authorKind,
            refersTo: f.refersTo,
            payload: f.payload,
        }));

        const content = fs.map(f => f.text || (f.payload ? JSON.stringify(f.payload) : '')).filter(Boolean).join('\n\n');

        const page: HandbookPage = {
            id: pageId,
            type: isUser ? 'user_diary' : 'character_life',
            charId,
            content,
            fragments,
            paperStyle: template.paperStyle || 'plain',
            generatedBy: 'llm',
            generatedAt: Date.now(),
        };
        pages.push(page);

        // placements
        for (const f of fs) {
            const slot = allSlots.find(s => s.id === f.slotId);
            if (!slot) continue;
            const fragId = fragments.find(fr => fr.slotId === f.slotId)?.id;
            placements.push({
                pageId, fragmentId: fragId,
                xPct: slot.xPct, yPct: slot.yPct, widthPct: slot.widthPct,
                rotate: slot.rotate ?? 0, zIndex: slot.zIndex ?? 10,
                role: slotRoleToLegacyRole(slot.slotRole),
                isHero: !!slot.isHero,
                slotId: slot.id, slotRole: slot.slotRole,
                maxHeightPct: slot.maxHeightPct, skinVariant: slot.skinVariant,
            });
        }
    }

    const layout: HandbookLayout = {
        pageNumber: 1,
        placements,
        generatedAt: Date.now(),
        templateId: template.id,
    };

    return { pages, layouts: [layout] };
}

// 新 SlotRole → 旧 LayoutRole 兜底 (老渲染器还在用)
function slotRoleToLegacyRole(role: SlotRole): 'main' | 'side' | 'corner' | 'margin' {
    switch (role) {
        case 'hero-diary': return 'main';
        case 'timeline-plan': return 'main';
        case 'todo': return 'main';
        case 'gratitude': return 'side';
        case 'mood-card': return 'side';
        case 'photo-caption': return 'side';
        case 'sticky-reaction': return 'corner';
        case 'corner-note': return 'margin';
    }
}

// ─── 4. 单角色重生 (v2) ───────────────────────────────────
//
// 用法: handleRegenerateLifestream 调它, 拿到只更新该角色 slot 的结果。
// 流程: 找回原 templateId → 把其它角色 + user 的 fills 当作 "已填" → 再调一次 fillOneCharTurn。
export interface RegenCharInput {
    date: string;
    charId: string;
    pages: HandbookPage[];           // 当前所有 page
    layouts: HandbookLayout[];       // 当前所有 layout
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: ApiConfig;
}

export interface RegenCharResult {
    /** 新的 page (替换原 charId 的那条 LLM page) */
    newPage: HandbookPage | null;
    /** 新的整体 layouts (替换 entry.layouts) */
    newLayouts: HandbookLayout[];
}

export async function regenerateCharSlots(input: RegenCharInput): Promise<RegenCharResult> {
    const { date, charId, pages, layouts, characters, userProfile, apiConfig } = input;
    const char = characters.find(c => c.id === charId);
    if (!char) return { newPage: null, newLayouts: layouts };

    // 找 templateId — v2 layout 必须有
    const v2Layout = layouts.find(l => l.templateId);
    if (!v2Layout?.templateId) return { newPage: null, newLayouts: layouts };
    const template = LAYOUT_TEMPLATES[v2Layout.templateId];
    if (!template) return { newPage: null, newLayouts: layouts };

    // 重建 "已填的所有 slot" — 包含 user + 其它 chars (排除被重生的 char)
    const filled: FilledSlot[] = [];
    const allSlots = template.pages.flat();
    for (const page of pages) {
        if (page.charId === charId) continue;       // 跳过被重生的
        if (!page.fragments) continue;
        for (const frag of page.fragments) {
            if (!frag.slotId) continue;
            const slot = allSlots.find(s => s.id === frag.slotId);
            if (!slot) continue;
            const author = page.charId
                ? (characters.find(c => c.id === page.charId)?.name || '某角色')
                : (userProfile.name || '我');
            filled.push({
                slotId: frag.slotId,
                slotRole: frag.slotRole || slot.slotRole,
                text: frag.text,
                payload: frag.payload,
                authorKind: page.charId ? 'char' : 'user',
                authorName: author,
                charId: page.charId,
                refersTo: frag.refersTo,
            });
        }
    }

    // 调 char turn
    const newSlot = await fillOneCharTurn(char, template, filled, date, userProfile, apiConfig);
    if (!newSlot) return { newPage: null, newLayouts: layouts };

    // 拼一份新 char page
    const newPageId = `lifestream-${charId}-${date}-${Date.now()}`;
    const newFragId = `frag-${newPageId}-0-${newSlot.slotId}`;
    const newPage: HandbookPage = {
        id: newPageId,
        type: 'character_life',
        charId,
        content: newSlot.text || (newSlot.payload ? JSON.stringify(newSlot.payload) : ''),
        fragments: [{
            id: newFragId,
            text: newSlot.text,
            slotId: newSlot.slotId,
            slotRole: newSlot.slotRole,
            authorKind: 'char',
            refersTo: newSlot.refersTo,
            payload: newSlot.payload,
        }],
        paperStyle: template.paperStyle || 'plain',
        generatedBy: 'llm',
        generatedAt: Date.now(),
    };

    // 重建 v2 layout: 移除该 char 旧的 placements, 加新的
    const slot = allSlots.find(s => s.id === newSlot.slotId);
    if (!slot) return { newPage: null, newLayouts: layouts };

    const otherPlacements = v2Layout.placements.filter(pl => {
        const ownerPage = pages.find(p => p.id === pl.pageId);
        return ownerPage?.charId !== charId;
    });
    const newPlacement: LayoutPlacement = {
        pageId: newPageId, fragmentId: newFragId,
        xPct: slot.xPct, yPct: slot.yPct, widthPct: slot.widthPct,
        rotate: slot.rotate ?? 0, zIndex: slot.zIndex ?? 10,
        role: slotRoleToLegacyRole(slot.slotRole),
        isHero: !!slot.isHero,
        slotId: slot.id, slotRole: slot.slotRole,
        maxHeightPct: slot.maxHeightPct, skinVariant: slot.skinVariant,
    };
    const newV2Layout: HandbookLayout = {
        ...v2Layout,
        placements: [...otherPlacements, newPlacement],
        generatedAt: Date.now(),
    };
    const newLayouts = layouts.map(l => l === v2Layout ? newV2Layout : l);
    return { newPage, newLayouts };
}

// ─── 5. 删 / 编辑后重算 layout ────────────────────────────
//
// 旧的 composePageLayout 会重洗版式 — v2 不要。这个 helper:
//  1. 保留所有 v2 layouts 的 placement, 但剔除指向已删除 page 的
//  2. user_note (用户手写) 走旧 composePageLayout 单独排, 拼到 v2 之后
//
// 调用方: HandbookApp 里 updatePage / handleDeletePage / handleAddNote 等
//
// 注: 这里不依赖旧 composePageLayout (避免循环 import), HandbookApp 自己处理 user_note。
//     这个函数只负责 v2 部分的重算。
export function recomposeV2Layouts(
    layouts: HandbookLayout[],
    pages: HandbookPage[],
): HandbookLayout[] {
    return layouts
        .filter(l => l.templateId)
        .map(l => ({
            ...l,
            placements: l.placements.filter(pl => pages.some(p => p.id === pl.pageId)),
        }))
        .filter(l => l.placements.length > 0);
}
