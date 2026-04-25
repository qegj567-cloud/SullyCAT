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

import { CharacterProfile, UserProfile, Message, HandbookPage, HandbookFragment } from '../types';
import { DB } from './db';
import { safeResponseJson, extractJson } from './safeApi';

interface ApiConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

// ─── 工具：把 LLM 输出的 JSON 数组解析成 HandbookFragment[] ─
function parseFragmentsFromLLMOutput(raw: string): HandbookFragment[] {
    let s = raw.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    let parsed: any = null;
    try {
        parsed = JSON.parse(s);
    } catch {
        // extractJson 兜底:从乱七八糟里掏 JSON
        try { parsed = extractJson(s); } catch {}
    }
    if (!parsed || !Array.isArray(parsed)) return [];
    return parsed
        .map((item: any, i: number): HandbookFragment | null => {
            if (typeof item === 'string') {
                return { id: `frag-${Date.now()}-${i}`, text: item.trim() };
            }
            if (item && typeof item === 'object') {
                const text = typeof item.text === 'string' ? item.text.trim()
                           : typeof item.content === 'string' ? item.content.trim()
                           : '';
                if (!text) return null;
                const time = typeof item.time === 'string' ? item.time.trim()
                           : typeof item.timeHint === 'string' ? item.timeHint.trim()
                           : undefined;
                return { id: `frag-${Date.now()}-${i}`, text, time };
            }
            return null;
        })
        .filter((f): f is HandbookFragment => !!f && f.text.length > 1);
}

// 把 fragments 拼成可读的 plain text(存 content 字段,user 编辑/兜底用)
function fragmentsToPlainText(fragments: HandbookFragment[]): string {
    return fragments.map(f => f.time ? `[${f.time}] ${f.text}` : f.text).join('\n\n');
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

你是「${userName}」的私人手账代笔。请基于 ${userName} 今天和不同角色的对话碎片,替 ${userName} 写一组**今日碎片**——不是日记!是社媒碎碎念体(像微博/Twitter 单条),散落地记下今天的瞬间。

【输出形式 —— 只接受 JSON 数组,严格遵守】
[
  { "time": "上午", "text": "..." },
  { "time": "12:40", "text": "..." },
  { "time": "下午", "text": "..." },
  ...
]
- 5~10 条之间
- time 字段可选,可以是 "上午"/"中午"/"下午"/"傍晚"/"深夜",或具体钟点 "10:23"。素材里没明显时间就不写
- text 字段必填,30~80 字之间
- 只输出 JSON 数组本身,不要任何解释/markdown/包裹

【每条 text 的写法 —— 社媒碎碎念,不是日记】
- 第一人称("我……")
- **单一瞬间 + 一点情绪/感受**,不要"我做了 A 然后做了 B"这种叙事堆叠
- 短促、跳跃、有此刻感,像随手发了一条微博
- 不同条之间不需要剧情连贯,可以是:观察、吐槽、动作记录、一闪而过的情绪、对路过事物的反应、和某角色聊天后的感受

【硬性铁律】
1. **只写 ${userName} 真的说过/做过/经历过的事**——对话里没出现的内容一律不补全
2. 留白即真实——素材稀薄就少写几条(3~4 条也行),诚实就好
3. 不要把任何角色当"收件人"(❌ "今天和你聊了……")——这是 ${userName} 自己回看的私人碎片
4. 严禁 AI 式的总结/反思/升华(❌ "今天我学到了……""这让我意识到……"),除非 ${userName} 自己说过类似的话
5. 不要 emoji,不要"亲爱的日记"开场,不要标题

【今日对话素材】
${transcriptParts.join('\n\n')}

直接输出 JSON 数组。`;

    try {
        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8,
                max_tokens: 10000,
            }),
        });
        if (!response.ok) {
            console.error('[Handbook/UserDiary] API error:', response.status);
            return { page: null, totalUserMsgs, perChar };
        }
        const data = await safeResponseJson(response);
        let raw: string = data.choices?.[0]?.message?.content || '';
        raw = raw.trim();
        if (raw.length < 4) return { page: null, totalUserMsgs, perChar };

        const fragments = parseFragmentsFromLLMOutput(raw);
        const content = fragments.length > 0
            ? fragmentsToPlainText(fragments)
            : raw.replace(/^["'`]+|["'`]+$/g, '').trim();
        if (!content || content.length < 4) return { page: null, totalUserMsgs, perChar };

        const page: HandbookPage = {
            id: `udiary-${date}-${Date.now()}`,
            type: 'user_diary',
            content,
            fragments: fragments.length > 0 ? fragments : undefined,
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
// 设计原则(user 反馈对齐 2026-04, depth + 角色沉淀注入版):
// - 角色一天不是一句话,要丰满、有节奏
// - 接入 DailySchedule.slots 作为骨架
// - **大量注入角色沉淀**: worldview / personalityStyle / selfInsights /
//   refinedMemories / impression。深度从角色内核来,不是凭空"看猫想到无常"
// - **类型配比强制**: physical / reflection / observation / user_thought
//   "看到野猫打架想起你"作为反例 few-shot 严禁
// - **3 档深度** light/medium/deep,调整四类型配比和字数
// - 红线: 不要虚构 user 和角色共同发生的事
//
export type LifestreamDepth = 'light' | 'medium' | 'deep';

export async function generateLifestreamPage(
    char: CharacterProfile,
    date: string,
    userProfile: UserProfile,
    apiConfig: ApiConfig,
    depth: LifestreamDepth = 'medium',
): Promise<HandbookPage | null> {
    const style = char.scheduleStyle || 'lifestyle';
    if (style !== 'lifestyle') return null;

    const userName = userProfile.name || 'user';
    const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][new Date(date.replace(/-/g, '/')).getDay()];

    // ─── 1. 角色基础(全量塞,不截 500 字了) ──────
    const description  = (char.description || '').slice(0, 1200);
    const systemPrompt = (char.systemPrompt || '').slice(0, 3500);
    const writerPersona = (char.writerPersona || '').slice(0, 800);
    const worldviewSnippet = (char.worldview || '').slice(0, 1500);

    // ─── 1b. 挂载的世界书(最多 2 本,每本 800 字) ──
    const mountedWorldbooks = (char.mountedWorldbooks || [])
        .slice(0, 2)
        .map(wb => {
            const content = (wb.content || '').slice(0, 800);
            return `《${wb.title}》\n${content}`;
        })
        .filter(s => s.length > 8);

    // ─── 1c. ta 实际怎么说话 — 从聊天里抽 30 条样本 ──
    // 这是"像不像 ta"最关键的输入: prompt 描述规则,样本展示语气
    let speechSamples: string[] = [];
    try {
        const all = await DB.getMessagesByCharId(char.id, true);
        const charMsgs = all.filter(m =>
            m.role === 'assistant'
            && typeof m.content === 'string'
            && m.content.length > 4
            && m.content.length < 600  // 太长的剔掉(可能是日记/小说之类非对话)
            // 过滤掉看起来像 JSON / 系统消息
            && !(m.content.trim().startsWith('{') && m.content.trim().endsWith('}'))
        );
        // 跨时间均匀抽 30 条,避免全是最近一段对话
        if (charMsgs.length <= 30) {
            speechSamples = charMsgs.map(m => m.content.slice(0, 200));
        } else {
            const step = charMsgs.length / 30;
            for (let i = 0; i < 30; i++) {
                const idx = Math.floor(i * step);
                speechSamples.push(charMsgs[idx].content.slice(0, 200));
            }
        }
    } catch { /* 无所谓 */ }

    // ─── 2. 性格风格 ──────────────
    const personalityHint = (() => {
        switch (char.personalityStyle) {
            case 'emotional': return '情绪化、敏感、不掩饰起伏';
            case 'narrative': return '叙事感强、善把事讲成故事';
            case 'imagery':   return '意象式、用比喻和画面思考';
            case 'analytical':return '理性、爱拆解原因、冷静';
            default: return null;
        }
    })();

    // ─── 3. 自我领悟(角色长期反刍出来的认知) ──
    const selfInsights = (char.selfInsights || []).slice(0, 6);

    // ─── 4. 月度记忆痕迹 ──────────
    const recentMemories = (() => {
        const r = char.refinedMemories;
        if (!r) return [] as string[];
        const keys = Object.keys(r).sort().reverse().slice(0, 2);
        return keys.map(k => `[${k}] ${r[k]}`).filter(s => s.length > 5);
    })();

    // ─── 5. 对 user 的私人认知(仅 medium/deep 用) ─
    const impressionHint = (() => {
        const imp = char.impression;
        if (!imp) return null;
        const parts: string[] = [];
        if (imp.personality_core?.summary) parts.push(`认知: ${imp.personality_core.summary}`);
        if (imp.emotion_schema?.comfort_zone) parts.push(`舒适区: ${imp.emotion_schema.comfort_zone}`);
        if (imp.behavior_profile?.tone_style) parts.push(`说话: ${imp.behavior_profile.tone_style}`);
        return parts.length ? parts.join(' / ') : null;
    })();

    // ─── 6. 当日 schedule slots ──
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
            scheduleBlock = `\n【今日日程骨架】\n${lines.join('\n')}\n`;
        }
    } catch {}

    // ─── 7. 类型配比(按 depth 档位) ──
    const composition = (() => {
        switch (depth) {
            case 'light':
                return { total: '5~7', physical: '3~4', reflection: '1~2', observation: '0~1', userThought: '0~1(仅当聊天有真实素材)', avgChars: '30~60', note: '偏日常,反思一两条点缀,不必深' };
            case 'deep':
                return { total: '6~8', physical: '1~2', reflection: '3~4', observation: '2', userThought: '0', avgChars: '50~110', note: '深度反刍,反思和外界观察占主导,几乎不出现 user' };
            case 'medium':
            default:
                return { total: '6~9', physical: '2~3', reflection: '2~3', observation: '1~2', userThought: '0~1(仅当聊天有真实素材)', avgChars: '40~80', note: '日常 + 反思平衡,有内核但不沉重' };
        }
    })();

    // ─── 8. 组装 prompt ──────────
    const insightsBlock = selfInsights.length > 0
        ? `\n【自我领悟(${char.name} 长期反刍出来的认知,反思类碎片要从这里延伸)】\n${selfInsights.map(s => `- ${s}`).join('\n')}\n`
        : '';
    const memoriesBlock = recentMemories.length > 0
        ? `\n【最近的记忆痕迹(可作反思引子,不要复述)】\n${recentMemories.join('\n\n')}\n`
        : '';
    const personalityLine = personalityHint
        ? `\n【性格风格】${personalityHint}\n`
        : '';
    const impressionBlock = (depth !== 'light' && impressionHint)
        ? `\n【对 ${userName} 的私人认知(若出现"想到 ta",从这里延伸,严禁捧场)】\n${impressionHint}\n`
        : '';
    const writerPersonaBlock = writerPersona
        ? `\n【创作 Persona】\n${writerPersona}\n`
        : '';
    const worldbooksBlock = mountedWorldbooks.length > 0
        ? `\n【挂载的世界书(角色身处的设定)】\n${mountedWorldbooks.join('\n\n')}\n`
        : '';
    const speechBlock = speechSamples.length > 0
        ? `\n【⚠️ ta 平时怎么说话 — 这是最关键的"像不像 ta"输入,严格模仿这个语气、用词、句式、节奏】\n${speechSamples.map((s, i) => `[${i + 1}] ${s}`).join('\n')}\n`
        : '';

    const prompt = `今天是 ${date}（星期${dayOfWeek}）。请为角色「${char.name}」生成一组**今日碎片**——不是日记!是 ta 一天里散落的瞬间,像 ta 在发微博,各自独立又拼出 ta 的一天。

【角色档案】
${description ? description + '\n' : ''}${systemPrompt ? `\n【角色核心人设】\n${systemPrompt}\n` : ''}${writerPersonaBlock}${worldviewSnippet ? `\n【世界观背景】\n${worldviewSnippet}\n` : ''}${worldbooksBlock}${personalityLine}${insightsBlock}${memoriesBlock}${impressionBlock}${speechBlock}${scheduleBlock}
【输出形式 —— 严格 JSON 数组】
[
  { "time": "上午", "type": "physical", "text": "..." },
  { "time": "中午", "type": "reflection", "text": "..." },
  ...
]
- 共 ${composition.total} 条
- type 字段必填,**严格遵守如下配比**:
  - "physical"(物理细节,具体到角色身份的物件/动作): ${composition.physical} 条
  - "reflection"(内在反思,**基于上方"自我领悟"+"记忆痕迹"延伸**): ${composition.reflection} 条
  - "observation"(对路过事/世界/陌生人/媒体的观察,**不涉及 ${userName}**): ${composition.observation} 条
  - "user_thought"(短暂想到 ${userName}): ${composition.userThought} 条
- text 字段必填,${composition.avgChars} 字。${composition.note}
- time 字段可选
- **只输出 JSON 数组本身**,不要 markdown 包裹/不要解释

【⚠️⚠️⚠️ 像不像 ta 的核心要求 —— 严格遵守】
- **必须模仿上方"ta 平时怎么说话"样本里的语气、用词、句式、节奏、口头禅、标点习惯**
- 如果 ta 平时用 "啊" "嗯" "诶" 这种语气词,你就要用;如果 ta 不用,你就不要塞进去
- 如果 ta 喜欢长句,你就写长句;ta 喜欢短句就短;ta 爱用破折号就用破折号
- 不要用 ta 说话样本里完全没出现过的"AI 文艺腔"(比如"恍惚间"、"忽然意识到"、"如同一道闪电")
- 这是这个功能的命门:user 一眼就能看出"这不是 ta",一旦不像 user 会立刻删除整组

【⚠️ 类型说明 + 反例(严禁 vs 推荐)】

1. "physical" — 必须**具体到角色身份**的物件/动作:
   ❌ "今天磨咖啡时手抖了"(任何人都可以发,跟角色无关)
   ✅ "戴 noise-canceling 耳机调那段卡住的鼓 fill,左右声道又错位 0.3 拍"(角色是音乐人,具体)

2. "reflection" — **必须从【自我领悟】或【记忆痕迹】延伸**,不是凭空文艺:
   ❌ "看到落叶想到无常"(伪深度,跟角色无关)
   ✅ 假设 selfInsight = "我习惯先撑住再喊救命":
       "又一次到了'我先撑住'阶段。能听见自己说这句话的语气和上次完全一样,但还是这么说。"

3. "observation" — 角色对外界,**绝不涉及 ${userName}**:
   ✅ "刚刷到一篇'躺平 vs 效率'的争论,两边都说被异化,可没人点'被谁异化'"
   ✅ "便利店换了新店员,扫码慢得让前面的 OL 都翻白眼。我倒不急。"

4. "user_thought" — 短暂念头,**不能成为段落主语**,**不能虚构共同事件**:
   ❌❌❌ "看到楼下野猫打架,想起 ${userName}"
   ❌❌❌ "今天给花浇了水,然后想起 ${userName}"
   原因:这种"小事 + 想起 ta"的句式信息量为零,${userName} 看了会觉得 ${char.name} 没自己的内核 —— 这是这个 app 最丢人的失败模式,严禁出现。
   ✅(基于 impression):"想起 ${userName} 上次说 ta 在 burnout 边缘 —— 我大概知道这意味着 ta 接下来会强行假装没事。"
   ✅(只在有真实聊天材料):"${userName} 早上发的那张图,是 ta 选了那家店没去成,我截屏了。"

【⚠️ 绝对铁律 —— 违反整组判废】
- **不要虚构 ${userName} 和 ${char.name} 之间发生过的事**:没见面 / 没一起做 / user 没说过的话,一律不能编。会让 ${userName} 觉得人生被夺舍。
- 严禁 AI 捧场:"希望 ${userName} 看到""如果 ${userName} 在就好了""想给 ta 惊喜"
- 用 ${char.name} 自己的口吻(第一人称最自然),不要旁白腔
- 紧贴日程骨架但**不复述**,要"造谣"成手感片段
- 允许真实的消极、无聊、拖延、独处、emo
- 不要 emoji 开头/不要标题/不要包裹符号

直接输出 JSON 数组。`;

    try {
        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9,
                max_tokens: 10000,  // user 用 Gemini/Claude,给足空间防 reasoning token 占额度
            }),
        });
        if (!response.ok) {
            console.error('[Handbook/Lifestream] API error:', response.status, char.name);
            return null;
        }
        const data = await safeResponseJson(response);
        let raw: string = data.choices?.[0]?.message?.content || '';
        raw = raw.trim();
        if (raw.length < 4) return null;

        const fragments = parseFragmentsFromLLMOutput(raw);
        const content = fragments.length > 0
            ? fragmentsToPlainText(fragments)
            : raw.replace(/^["'`]+|["'`]+$/g, '').trim();
        if (!content || content.length < 4) return null;

        return {
            id: `lifestream-${char.id}-${date}-${Date.now()}`,
            type: 'character_life',
            charId: char.id,
            content,
            fragments: fragments.length > 0 ? fragments : undefined,
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
