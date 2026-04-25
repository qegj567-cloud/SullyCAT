/**
 * 手账生成器
 *
 * 两个独立管线 (NOT 复用 daily_schedule 的 flowNarrative —— 那个会被覆盖且和 user 强耦合)：
 *
 * 1. generateUserDiaryPage —— 主体
 *    给 LLM 喂 user 当日所有跨角色聊天，让 ta 用第一人称、碎片日记体替 user 写一份草稿。
 *    user 会二次编辑，所以不强求模仿语气，只追求"事实可读、留白真实"。
 *
 * 2. generateLifestreamPage —— 陪伴页（仅 lifestyle 角色）
 *    单独调一次 LLM 生成"角色今天的小生活"短文，存进当日 handbook entry。
 *    硬性约束：不准 AI 捧场、不准等/想 user 当主语，user 至多一带而过。
 *    mindful 角色不进此管线（ta 们没有"小生活"可写）。
 */

import { CharacterProfile, UserProfile, Message, HandbookPage } from '../types';
import { DB } from './db';
import { safeResponseJson, extractJson } from './safeApi';

interface ApiConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

// ─── 工具：取一天范围 [start, end) 的 ms ───
function dayRange(date: string): { start: number; end: number } {
    const [y, m, d] = date.split('-').map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    const end = start + 24 * 60 * 60 * 1000;
    return { start, end };
}

// 把单条消息渲染成一行文本，截掉过长内容；过滤系统/工具/隐藏内容
function renderMsgLine(m: Message, userName: string, charName: string): string | null {
    if (m.role === 'system') return null;
    if (!m.content || typeof m.content !== 'string') return null;
    const raw = m.content.trim();
    if (!raw) return null;
    // 过滤纯结构化的 JSON / 系统消息（启发式）
    if (raw.startsWith('{') && raw.endsWith('}') && raw.length > 50 && /"\w+"\s*:/.test(raw)) {
        return null;
    }
    const speaker = m.role === 'user' ? userName : charName;
    const text = raw.length > 220 ? raw.slice(0, 220) + '…' : raw;
    return `${speaker}: ${text}`;
}

// 取 user 当日和某角色的对话片段（按时间升序）
async function getTodayChatLines(
    char: CharacterProfile,
    date: string,
    userName: string,
): Promise<{ lines: string[]; userMsgCount: number }> {
    const { start, end } = dayRange(date);
    // includeProcessed=true 绕过记忆宫殿水位线，拿到 raw 数据
    const all = await DB.getMessagesByCharId(char.id, true);
    const today = all
        .filter(m => m.timestamp >= start && m.timestamp < end)
        .sort((a, b) => a.timestamp - b.timestamp);
    const lines: string[] = [];
    let userMsgCount = 0;
    for (const m of today) {
        const line = renderMsgLine(m, userName, char.name);
        if (line) {
            lines.push(line);
            if (m.role === 'user') userMsgCount++;
        }
    }
    return { lines, userMsgCount };
}

// ─── 1. user 视角日记（跨角色聚合）─────────────────────────
export interface UserDiaryGenInput {
    date: string;                  // YYYY-MM-DD
    selectedCharIds: string[];     // 入册的角色（默认：今天聊过的）
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: ApiConfig;
}

export interface UserDiaryGenResult {
    page: HandbookPage | null;
    totalUserMsgs: number;
    perChar: { charId: string; charName: string; userMsgs: number; totalLines: number }[];
}

export async function generateUserDiaryPage(
    input: UserDiaryGenInput,
): Promise<UserDiaryGenResult> {
    const { date, selectedCharIds, characters, userProfile, apiConfig } = input;
    const userName = userProfile.name || '我';

    const perChar: UserDiaryGenResult['perChar'] = [];
    const transcriptParts: string[] = [];
    let totalUserMsgs = 0;

    for (const charId of selectedCharIds) {
        const char = characters.find(c => c.id === charId);
        if (!char) continue;
        const { lines, userMsgCount } = await getTodayChatLines(char, date, userName);
        perChar.push({ charId, charName: char.name, userMsgs: userMsgCount, totalLines: lines.length });
        totalUserMsgs += userMsgCount;
        if (lines.length === 0) continue;
        // 控制单角色片段长度（最多 60 行，避免某天极长对话压垮 prompt）
        const trimmed = lines.length > 60 ? lines.slice(-60) : lines;
        transcriptParts.push(`== 与「${char.name}」==\n${trimmed.join('\n')}`);
    }

    if (totalUserMsgs === 0 || transcriptParts.length === 0) {
        return { page: null, totalUserMsgs, perChar };
    }

    const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][new Date(date.replace(/-/g, '/')).getDay()];

    const prompt = `今天是 ${date}（星期${dayOfWeek}）。

你是「${userName}」的私人手账代笔。请基于 ${userName} 今天和不同角色的对话碎片，替 ${userName} 写一份**当日日记**。${userName} 会自己二次编辑，所以你只需要交一份可读的草稿。

【硬性约束】
1. 第一人称（"我……"），中性自然语气，碎片化日记体，不要书信体
2. **只写 ${userName} 真的说过/做过/经历过的事**，对话里没出现的内容一律不要补全
3. 留白即真实——如果素材本就稀薄，就写得短，可以诚实说"今天没什么好说的"
4. **不要逐条复述对话**，要把多个角色那里听到/说过的事重新组织成"我的一天"
5. 不要把任何角色当作"日记的收件人"，这是 ${userName} 自己回看的私人记录
6. 不要 AI 式的总结/反思/升华（如"今天我学到了…""这让我意识到…"），除非 ${userName} 自己说过类似的话
7. 不要用 emoji，不要"亲爱的日记"之类开场，不要标题
8. 长度 100~400 字，视素材厚度而定，少就少写

【今日对话素材】
${transcriptParts.join('\n\n')}

直接输出日记正文。不要 JSON、不要包裹、不要任何说明文字。`;

    try {
        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8,
                max_tokens: 1200,
            }),
        });
        if (!response.ok) {
            console.error('[Handbook/UserDiary] API error:', response.status);
            return { page: null, totalUserMsgs, perChar };
        }
        const data = await safeResponseJson(response);
        let content: string = data.choices?.[0]?.message?.content || '';
        content = content.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
        if (content.length < 8) {
            return { page: null, totalUserMsgs, perChar };
        }
        const page: HandbookPage = {
            id: `udiary-${date}-${Date.now()}`,
            type: 'user_diary',
            content,
            paperStyle: 'lined',
            generatedBy: 'llm',
            generatedAt: Date.now(),
        };
        return { page, totalUserMsgs, perChar };
    } catch (e) {
        console.error('[Handbook/UserDiary] failed:', e);
        return { page: null, totalUserMsgs, perChar };
    }
}

// ─── 2. 生活系角色生活流（陪伴页）──────────────────────────
export async function generateLifestreamPage(
    char: CharacterProfile,
    date: string,
    userProfile: UserProfile,
    apiConfig: ApiConfig,
): Promise<HandbookPage | null> {
    // 仅 lifestyle 角色生成生活流；mindful 没有"小生活"可写
    const style = char.scheduleStyle || 'lifestyle';
    if (style !== 'lifestyle') return null;

    const userName = userProfile.name || 'user';
    const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][new Date(date.replace(/-/g, '/')).getDay()];

    // 从角色设定里抽一点点关键字给 LLM 做参考（不灌全 systemPrompt 节约 token）
    const charSnippet = (char.description || char.systemPrompt || '').slice(0, 400);

    const prompt = `今天是 ${date}（星期${dayOfWeek}）。请为角色「${char.name}」写一段"今天的小生活"短文，作为 ${userName} 手账里的一页**陪伴内容**——展示 ${userName} 不在的时候，${char.name} 在自己世界里的一天碎片。

【角色设定（节选）】
${charSnippet}

【硬性约束（违反一条都视为失败）】
1. 这是 ${char.name} **自己的一天**，不是 "${char.name} 等 ${userName} / 想 ${userName} / 找 ${userName}" 的一天
2. 描写 ta 的手在做什么、看到什么、想到什么——具体到角色身份相关的物件/动作
3. ${userName} 至多一带而过（想起一句话、顺手买了什么、看到什么觉得 ta 会喜欢），**不能成为段落的主语，不能贯穿全文**
4. 严禁 AI 捧场和讨好型话语，例如：
   - ❌ "希望 ${userName} 看到这段会开心"
   - ❌ "如果 ${userName} 在的话就好了"
   - ❌ "想给 ${userName} 一个惊喜"
   - ❌ 任何替 ${userName} 立人设、夸 ${userName}、表白 ${userName} 的句子
5. 允许角色性格里真实的消极/无聊/拖延/独处感——不必每天都积极
6. ${char.name} 自己的口吻（第一人称或第三人称都可，看角色更自然哪个），**不要旁白腔**
7. 长度 60~180 字，自然碎片，不要小作文也不要标题
8. 不要 emoji 开头，不要任何包裹符号

直接输出短文正文。`;

    try {
        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9,
                max_tokens: 600,
            }),
        });
        if (!response.ok) {
            console.error('[Handbook/Lifestream] API error:', response.status, char.name);
            return null;
        }
        const data = await safeResponseJson(response);
        let content: string = data.choices?.[0]?.message?.content || '';
        content = content.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
        if (content.length < 8) return null;
        return {
            id: `lifestream-${char.id}-${date}-${Date.now()}`,
            type: 'character_life',
            charId: char.id,
            content,
            paperStyle: 'plain',
            generatedBy: 'llm',
            generatedAt: Date.now(),
        };
    } catch (e) {
        console.error('[Handbook/Lifestream] failed:', char.name, e);
        return null;
    }
}

// ─── 工具：今天日期字符串（本地时区）─────────────────────
export function getLocalDateStr(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ─── 探测：今天哪些角色和 user 有过对话 ───────────────────
export async function findCharactersWithChatToday(
    characters: CharacterProfile[],
    date: string,
): Promise<string[]> {
    const { start, end } = dayRange(date);
    const result: string[] = [];
    for (const c of characters) {
        try {
            const all = await DB.getMessagesByCharId(c.id, true);
            const hasUserMsg = all.some(m => m.timestamp >= start && m.timestamp < end && m.role === 'user');
            if (hasUserMsg) result.push(c.id);
        } catch {}
    }
    return result;
}

// 探测：今天哪些 lifestyle 角色应该生成陪伴页（默认：所有 lifestyle 角色）
export function pickLifestreamChars(characters: CharacterProfile[]): CharacterProfile[] {
    return characters.filter(c => (c.scheduleStyle || 'lifestyle') === 'lifestyle');
}
