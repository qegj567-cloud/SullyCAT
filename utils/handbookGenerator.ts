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
                max_tokens: 3000,
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
//
// 设计原则（user 反馈对齐 2026-04）:
// - 角色的一天不可能就一句话——要丰满、有早中晚、有具体物件,像真的有人在过日子
// - 接入该角色当日的 DailySchedule.slots 作为"剧本骨架",让 LLM 基于真实日程展开(造谣)
// - 唯一不能破的红线 = 不要虚构"user 和角色共同发生的事":
//     - ❌ 没见面说"今天和 user 见了" / 没一起吃饭说"和 user 吃了饭" / user 没说过的话不能引述
//     - 这种事会让 user 翻开手账时觉得"我的人生被夺舍了" —— 必须严格防御
// - 角色"想 user / 念叨一句 user 说过的真话"是允许的,只要不上升为"共同物理事件"
//
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

    // 从角色设定里抽一点点关键字（不灌全 systemPrompt 节约 token）
    const charSnippet = (char.description || char.systemPrompt || '').slice(0, 400);

    // 把当日 DailySchedule.slots 作为"剧本骨架"喂给 LLM
    // 注意:不引用 flowNarrative —— 它是覆盖式的、user-coupled,反而会污染
    let scheduleBlock = '';
    try {
        const sched = await DB.getDailySchedule(char.id, date);
        if (sched && sched.slots && sched.slots.length > 0) {
            const lines = sched.slots.map(s => {
                const parts = [`- ${s.startTime}`, s.activity];
                if (s.description) parts.push(`(${s.description})`);
                if (s.location) parts.push(`@${s.location}`);
                return parts.join(' ');
            });
            scheduleBlock = `\n【今日日程（请以此为骨架展开,不要复述,要"造谣"成手账体）】\n${lines.join('\n')}\n`;
        }
    } catch { /* DB 没拿到也无妨 */ }

    const prompt = `今天是 ${date}（星期${dayOfWeek}）。请为角色「${char.name}」写一份**今日手账**——作为 ${userName} 手账里的陪伴页,用 ${char.name} 自己的视角记下 ta 一整天的碎片。

【角色设定（节选）】
${charSnippet}
${scheduleBlock}
【⚠️ 绝对铁律 —— 违反一条整篇判废】
1. **不要虚构 ${userName} 和 ${char.name} 之间真实发生过的事**。这是底线:
   - ❌ 不能写"今天和 ${userName} 见面/吃饭/逛街/打电话/视频/出门" —— 除非聊天记录里真的有
   - ❌ 不能写"${userName} 跟我说……" 引一句话 —— 除非那句话今天聊天里真的说过
   - ❌ 不能编造任何 ${userName} 出场的具体动作/对话
   - 为什么:${userName} 翻开手账看到"和 ta 一起去了 XX",但她根本没去过 ——
     这叫"夺舍",会让 ${userName} 失去对自己人生的把控感。
2. ${userName} 可以以"念头"形式出现:
   - ✅ "想起 ${userName} 昨天那句话……"(必须是真说过的)
   - ✅ "看到那只猫,觉得 ${userName} 应该会喜欢"
   - ✅ 收到 ${userName} 消息时角色的心情
   - 但不能升级为"共同物理事件",更不能让 ${userName} 成为段落主语
3. 严禁 AI 捧场/讨好型句式:"希望 ${userName} 看到""如果 ${userName} 在就好了""想给 ta 惊喜"

【创作要求 —— 写丰满、像真有人在过日子】
1. **不要一句话敷衍**。这是"今日手账",不是签名档。要分至少 3 个场景/时段,
   每段都有具体的物件、动作、感受、小情绪
2. 用 ${char.name} 自己的口吻（第一人称最自然,第三人称也行）。不要旁白腔、
   不要"今天 ta…… 接下来 ta……"这种简介体
3. 紧贴上方"今日日程"骨架,但**不要**复述时间表 —— 要把它"造谣"成有手感、
   有质感、有情绪的手账体片段(就像真人翻开手账,记下"早上磨咖啡时手抖了""下午刷
   设计参考刷到困""晚上洗完澡发呆"这种)
4. 允许角色性格里真实的消极、无聊、拖延、独处、emo,不必每天都积极
5. 可以有内心碎碎念、对路过事物的吐槽、突如其来的小情绪
6. 段落之间可以用空行分隔(像真翻手账每段隔开),但不要标题、不要 emoji 开头
7. **必须完整收尾**——不要写到一半停下、不要悬念式断句、不要"……"省略号结尾。
   每个场景写完整,整篇有自然落幕。

直接输出正文。`;

    try {
        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9,
                max_tokens: 4000,   // 给足空间——某些模型有 reasoning token 会占额度,1500 太紧
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
