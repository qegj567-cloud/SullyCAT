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

import {
    CharacterProfile, UserProfile, Message,
    HandbookPage, HandbookFragment, HandbookLayout, LayoutPlacement, LayoutRole,
} from '../types';
import { DB } from './db';
import { safeResponseJson, extractJson } from './safeApi';
import { ContextBuilder } from './context';

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
    /** 篇幅预算: 期望生成多少条 fragment(±2);0 = 跳过该 page */
    fragmentBudget?: number;
}

export interface UserDiaryGenResult {
    page: HandbookPage | null;
    totalUserMsgs: number;
    perChar: { charId: string; charName: string; userMsgs: number; totalLines: number }[];
}

export async function generateUserDiaryPage(
    input: UserDiaryGenInput,
): Promise<UserDiaryGenResult> {
    const { date, selectedCharIds, characters, userProfile, apiConfig, fragmentBudget } = input;
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

    // 篇幅预算: 默认 5~9 条,有外部预算就遵循
    const targetCount = fragmentBudget && fragmentBudget > 0
        ? `${Math.max(1, fragmentBudget - 1)} ~ ${fragmentBudget + 1}`
        : '5 ~ 9';

    const prompt = `今天是 ${date}（星期${dayOfWeek}）。

你是「${userName}」的私人手账代笔。请基于 ${userName} 今天和不同角色的对话碎片,替 ${userName} 写一组**今日碎片**——不是日记!是社媒碎碎念体(像微博/Twitter 单条),散落地记下今天的瞬间。

【输出形式 —— 只接受 JSON 数组,严格遵守】
[
  { "time": "上午", "text": "..." },
  { "time": "12:40", "text": "..." },
  { "time": "下午", "text": "..." },
  ...
]
- ${targetCount} 条之间(整本手账一天 ≤ 2 页,你的篇幅预算就是这么多)
- time 字段可选,可以是 "上午"/"中午"/"下午"/"傍晚"/"深夜",或具体钟点 "10:23"。素材里没明显时间就不写
- text 字段必填,正常条 30~80 字
- 鼓励 1~2 条**很短的"涂鸦句"**(< 14 字),像突然在手账边角写一句心情/吐槽/日程小提醒,
  例: "下雨了。" / "好困" / "记得喝水。" / "今天买花。" / "想吃蛋糕!!" — 这种短句会被
  渲染成大字手写涂鸦,放在页面边角,不要凑长
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

【可选 — 笔感修饰(让一两条更鲜活)】
text 里允许少量 markdown 语法,渲染时会变成对应的视觉效果:
- **粗体** — 真的想强调的词(每条最多 1 处,不滥用)
- *斜体* — 引用别人/自语化的句子
- ==文字== — 像马克笔划重点(粉色高亮),用于"这一刻的关键词"
- ~~删除~~ — 想说又否定的话,自嘲口气
- [color:red](文字) — 偶尔用红/蓝/紫等彩笔强调:
  支持的颜色 red/pink/blue/sky/green/mint/yellow/purple/orange/gray
约束:**每条最多用 1 个修饰**,大部分句子保持纯文本就好,不要变成"全员高亮"

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
    /** 篇幅预算: 期望 fragment 数(±1);0 跳过 */
    fragmentBudget?: number,
): Promise<HandbookPage | null> {
    if (fragmentBudget !== undefined && fragmentBudget <= 0) return null;
    // (取消 lifestyle gate: 只要 user 把 ta 选进来,就让 ta 在这页留一笔。
    //  scheduleStyle 仍用于决定是否注入 schedule 骨架。)
    const userName = userProfile.name || 'user';
    const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][new Date(date.replace(/-/g, '/')).getDay()];

    // ─── 1. 直接调项目统一的 ContextBuilder.buildCoreContext ──
    //   它已经处理了:身份/systemPrompt/selfInsights/worldview/mountedWorldbooks
    //   /user profile/impression(完整含 likes/triggers/comfort/changes)
    //   /refinedMemories/activeMemoryMonths 详细日志/memoryPalace/buff
    //   是聊天系统在用的 source of truth,改它会自动跟进
    const coreContext = ContextBuilder.buildCoreContext(char, userProfile, true);

    // ─── 1b. ta 实际怎么说话 — buildCoreContext 没的,得自己补 ──
    // 这是"像不像 ta"最关键的输入: prompt 描述规则,样本展示语气
    let speechSamples: string[] = [];
    try {
        const all = await DB.getMessagesByCharId(char.id, true);
        const charMsgs = all.filter(m =>
            m.role === 'assistant'
            && typeof m.content === 'string'
            && m.content.length > 4
            && m.content.length < 600
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

    // ─── 2. 当日 schedule slots ──
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
                return { defaultTotal: 6, physical: '3~4', reflection: '1~2', observation: '0~1', userThought: '0~1(仅当聊天有真实素材)', avgChars: '30~60', note: '偏日常,反思一两条点缀,不必深' };
            case 'deep':
                return { defaultTotal: 7, physical: '1~2', reflection: '3~4', observation: '2', userThought: '0', avgChars: '50~110', note: '深度反刍,反思和外界观察占主导,几乎不出现 user' };
            case 'medium':
            default:
                return { defaultTotal: 7, physical: '2~3', reflection: '2~3', observation: '1~2', userThought: '0~1(仅当聊天有真实素材)', avgChars: '40~80', note: '日常 + 反思平衡,有内核但不沉重' };
        }
    })();
    // 篇幅预算优先;没传就用 depth 默认值 ±1
    const targetTotal = fragmentBudget && fragmentBudget > 0
        ? `${Math.max(1, fragmentBudget - 1)} ~ ${fragmentBudget + 1}`
        : `${Math.max(1, composition.defaultTotal - 1)} ~ ${composition.defaultTotal + 1}`;

    // ─── 4. 组装 prompt ──────────
    const speechBlock = speechSamples.length > 0
        ? `\n【⚠️ ta 平时怎么说话 — 这是"像不像 ta"最关键的输入,严格模仿这个语气、用词、句式、节奏、口头禅、标点习惯】\n${speechSamples.map((s, i) => `[${i + 1}] ${s}`).join('\n')}\n`
        : '';

    // depth=light 时,user impression 在角色 context 里仍存在,但 prompt 末尾会
    // 强调"几乎不出现 user_thought",通过类型配比抑制即可,不需要再剥 context
    const prompt = `今天是 ${date}（星期${dayOfWeek}）。请为角色「${char.name}」生成一组**今日碎片**——不是日记!是 ta 一天里散落的瞬间,像 ta 在发微博,各自独立又拼出 ta 的一天。

【角色完整档案(项目统一 context)】
${coreContext}
${speechBlock}${scheduleBlock}
【输出形式 —— 严格 JSON 数组】
[
  { "time": "上午", "type": "physical", "text": "..." },
  { "time": "中午", "type": "reflection", "text": "..." },
  ...
]
- 共 ${targetTotal} 条 (整本手账一天 ≤ 2 页, 你的预算就这么多, 不要超也不要刻意凑)
- type 字段必填,**严格遵守如下配比**:
  - "physical"(物理细节,具体到角色身份的物件/动作): ${composition.physical} 条
  - "reflection"(内在反思,**基于上方"自我领悟"+"记忆痕迹"延伸**): ${composition.reflection} 条
  - "observation"(对路过事/世界/陌生人/媒体的观察,**不涉及 ${userName}**): ${composition.observation} 条
  - "user_thought"(短暂想到 ${userName}): ${composition.userThought} 条
- text 字段必填,正常条 ${composition.avgChars} 字。${composition.note}
- 允许 1 条**极短涂鸦句**(< 14 字),像 ta 突然在手账边角写一笔的随手感
  例 (按角色口吻自定): "再睡一会。" / "这破代码。" / "想喝咖啡了。" — 短句会被
  渲染成大字手写,放页面边角,不要为了凑字数硬写长
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

【可选 — 笔感修饰(让一两条更鲜活)】
text 里允许少量 markdown 语法,渲染时会变成对应的视觉效果:
- **粗** 真的想强调的词
- *斜* 引用/自语
- ==高亮== 马克笔划重点(每组最多 2 条用)
- ~~删除~~ 自嘲否定
- [color:red](文字) 彩笔颜色: red/pink/blue/sky/green/mint/yellow/purple/orange/gray
约束:**每条最多用 1 个修饰**,大部分句子纯文本就好。

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

// ─── 探测:统计 user 今天和指定角色们一共说了多少话 ────
export async function countUserMsgsToday(
    charIds: string[],
    date: string,
): Promise<number> {
    if (charIds.length === 0) return 0;
    const { start, end } = dayRange(date);
    let total = 0;
    for (const id of charIds) {
        try {
            const all = await DB.getMessagesByCharId(id, true);
            total += all.filter(m => m.timestamp >= start && m.timestamp < end && m.role === 'user').length;
        } catch {}
    }
    return total;
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

// 候选可写陪伴页的角色 = 全部角色（user 自己挑）。保留旧导出名以减小改动面。
export function pickLifestreamChars(characters: CharacterProfile[]): CharacterProfile[] {
    return characters.slice();
}

// ─── 篇幅预算规划 ────────────────────────────────────────
//
// 一天 ≤ 2 页, ~14 片 fragment 总预算。
// 按 user 当天聊天活跃度,先给 user 分一份,剩下的均摊给参与陪伴的角色。
// user 多话 → user 多写、char 少陪;user 少话 → char 来撑场。
//
export interface FragmentBudgetPlan {
    /** user_diary 的 fragment 数 */
    userBudget: number;
    /** key=charId, value=该角色 lifestream 的 fragment 数 */
    perChar: Record<string, number>;
    /** 估算总片数 */
    total: number;
    /** debug 用: 计算依据 */
    rationale: string;
}

export function planFragmentBudget(
    totalUserMsgsToday: number,
    selectedDiaryCharIds: string[],
    selectedLifeChars: CharacterProfile[],
): FragmentBudgetPlan {
    const TOTAL = 14;   // 2 页 × 7 片左右

    // user 份额: 没说话就 0;1~5 句给 4 片;6~15 句给 6 片;16~30 给 7 片;>30 给 8 片
    let userBudget: number;
    if (selectedDiaryCharIds.length === 0 || totalUserMsgsToday === 0) userBudget = 0;
    else if (totalUserMsgsToday < 6)  userBudget = 4;
    else if (totalUserMsgsToday < 16) userBudget = 6;
    else if (totalUserMsgsToday < 31) userBudget = 7;
    else                              userBudget = 8;

    // 角色份额 = 剩下的均摊
    const charPool = Math.max(0, TOTAL - userBudget);
    const numChars = selectedLifeChars.length;
    const perChar: Record<string, number> = {};
    if (numChars > 0 && charPool > 0) {
        // 平均每角色 ≥ 2 (太少没意思)、≤ 5 (单人不要霸屏)
        let basePerChar = Math.max(2, Math.min(5, Math.floor(charPool / numChars)));
        // 如果 basePerChar × numChars 超 charPool 太多, 缩到 charPool / numChars 向上取整
        if (basePerChar * numChars > charPool + 2) {
            basePerChar = Math.max(2, Math.ceil(charPool / numChars));
        }
        for (const c of selectedLifeChars) perChar[c.id] = basePerChar;
    } else if (numChars > 0 && charPool === 0) {
        // user 抢光了, 角色每人就给 2 片象征性陪一笔
        for (const c of selectedLifeChars) perChar[c.id] = 2;
    }

    const total = userBudget + Object.values(perChar).reduce((a, b) => a + b, 0);
    const rationale =
        `userMsgs=${totalUserMsgsToday}, chars=${numChars}; ` +
        `userBudget=${userBudget}, perChar=${Object.values(perChar)[0] ?? 0}, total=${total}`;
    return { userBudget, perChar, total, rationale };
}

// ─── 3. 单页拼贴排版（第二轮 LLM 调用）───────────────────────
//
// 把当日所有 fragment(user diary + 各 char lifestream + user 手写整页) 摆到
// 一张固定比例的"纸"上。LLM 输出每片的 {pageId, fragmentId, x%, y%, w%, rotate, role}。
// 失败 → 直接抛错,UI 捕获后显示"排版失败,请重试"。NOT 兜底 — 这是 user 明确要求。
//
export interface LayoutGenInput {
    date: string;
    pages: HandbookPage[];
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: ApiConfig;
    /** 这张纸的画布像素尺寸,只用于 LLM 估算换行;真实渲染按 % 缩放 */
    canvasPixelHint?: { width: number; height: number };
}

interface FlatPiece {
    pageId: string;
    fragmentId?: string;
    author: string;          // "我" / 角色名
    type: HandbookPage['type'];
    text: string;             // 完整文本
    charCount: number;
}

function flattenPiecesForLayout(pages: HandbookPage[], userName: string, characters: CharacterProfile[]): FlatPiece[] {
    const out: FlatPiece[] = [];
    for (const p of pages) {
        if (p.excluded) continue;
        const author = p.charId
            ? (characters.find(c => c.id === p.charId)?.name || '某角色')
            : userName;
        if (p.fragments && p.fragments.length > 0) {
            for (const f of p.fragments) {
                out.push({
                    pageId: p.id, fragmentId: f.id, author, type: p.type,
                    text: f.text, charCount: f.text.length,
                });
            }
        } else if (p.content && p.content.trim()) {
            // user_note / 编辑过的整页:作为单一大块进入排版
            out.push({
                pageId: p.id, author, type: p.type,
                text: p.content, charCount: p.content.length,
            });
        }
    }
    return out;
}

export async function generatePageLayout(input: LayoutGenInput): Promise<HandbookLayout[]> {
    const { date, pages, characters, userProfile, apiConfig, canvasPixelHint } = input;
    const userName = userProfile.name || '我';
    const pieces = flattenPiecesForLayout(pages, userName, characters);
    if (pieces.length === 0) return [];

    const W = canvasPixelHint?.width ?? 360;
    const H = canvasPixelHint?.height ?? 720;

    const piecesBlock = pieces.map((p, i) => {
        const headPreview = p.text.length > 40 ? p.text.slice(0, 40) + '…' : p.text;
        return `[${i}] author=${p.author} type=${p.type} chars=${p.charCount} preview="${headPreview.replace(/"/g, '\\"')}"`;
    }).join('\n');

    // 给 LLM 一个"高度估算"参考(基于 chars + 页面像素): 每行约 16 个汉字, 行高 23px
    // 卡片 widthPct 决定每行容字, 字数决定行数, 行数 × 23 ≈ 卡片高度 px → 转为 yPct
    // LLM 用这个公式自己算 → 才不会两片 y 撞
    const heightFormula = `卡片估高(px) ≈ ceil(chars / floor(${W} * widthPct/100 / 16)) * 23 + 32(padding)
卡片高度% ≈ 估高 / ${H} * 100`;

    const prompt = `你是手账排版师。${date} 这天有 ${pieces.length} 片内容(user 的碎片 + 不同角色"在 user 这页边角写一笔")。把它们摆到 ${W} x ${H} px 的瘦长手帐纸上,目标:**像真的手帐拼贴 — 错落但绝对不互相挡字**。

【输入】(下标 [N] = 后面 pieceIndex)
${piecesBlock}

【高度估算 — 摆位前必须心算】
${heightFormula}

【绝对禁令 - 违反即整组废】
- 任何两片**矩形不准重叠超过 2%**(参考估高公式;两片 bbox 任一组合都要有间隔)
- 同 page 内卡片总和(每片高 + 间距) ≤ 100% 高度,装不下就开 page 2
- **最多 2 页**(整本手账一天 ≤ 2 页);要是 1 页能装下就只开 1 页,不强行拆
- xPct + widthPct ≤ 100 (不允许溢出右侧)
- yPct + 估高% ≤ 96 (不允许溢出底)

【输出 — 仅纯 JSON,无 markdown,无解释】
{ "pages": [ { "pageNumber": 1, "placements": [
  { "pieceIndex": 0, "xPct": 6, "yPct": 12, "widthPct": 60, "rotate": -2, "zIndex": 10, "role": "main" }
] } ] }

【字段】
- pieceIndex: 整数,${pieces.length} 片**每片出现且只出现一次**(可跨 page)
- xPct/yPct: 左上角 % [0, 90]
- widthPct: [22, 90]
- rotate: ±8 (corner 可 ±12, margin ±5)
- zIndex: 1~50
- role: "main" | "side" | "corner" | "margin"
  · main: user 的 fragment / 长卡(chars > 50),widthPct 55~85,旋转 ≤ 3
  · side: 中型角色卡片,widthPct 40~62
  · corner: 角落小卡(chars ≤ 35),widthPct 28~50,可在四角
  · margin: 极短(chars ≤ 18),widthPct 22~36,贴页边
  注:**chars < 14 的极短句**会被渲染成大字"涂鸦"(无卡片框),所以 widthPct 给小一点
  (28~42),放在四角或两片大卡的留白处效果最好,不要塞主区中间

【布局节奏 — 仿真手帐】
1. **主流**: user 的 fragments 走 yPct 一列 (xPct 8~20 或 28~40 选一,纵向 stacked)
2. **角色"挤一笔"**: char fragments 在 user 主流的另一侧 / 下方 / 角落见缝插针
3. 同作者**不能堆叠**: 上下相邻两片必须不同作者,或 x 错开 ≥ 30%
4. 长卡片间留 ≥ 4% y-gap;短卡片间留 ≥ 2% y-gap
5. **第一片永远是 main**,放页眉下面 (yPct 8~14)
6. 装不下 → 开 page 2 (**最多 2 页, 不要 page 3**;1 页够就别拆)
7. 角度多样: ±8 之间,但相邻两片角度差 ≥ 3,避免"全部歪一个方向"

【再次提醒】
所有 ${pieces.length} 片必须**都被分配且只分配一次**,跨 page 也行。直接输出 JSON。`;

    let response: Response;
    try {
        response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.5,
                // 排版输出本身不长(~25 片 × 80 字 ≈ 2k 字),但 reasoning 模型
                // (Claude thinking / Gemini thinking / o1 / r1) 会把 thinking
                // token 也算进 max_tokens,被截断就丢片。给得宽,反正不计费部分
                // 也只用实际生成的 tokens。
                max_tokens: 32000,
            }),
        });
    } catch (e: any) {
        throw new Error(`排版 API 网络错误: ${e?.message || e}`);
    }
    if (!response.ok) {
        let body = '';
        try { body = (await response.text()).slice(0, 200); } catch {}
        throw new Error(`排版 API HTTP ${response.status}${body ? ' · ' + body : ''}`);
    }

    let data: any;
    try {
        data = await safeResponseJson(response);
    } catch (e: any) {
        throw new Error(`排版 API 响应不是 JSON: ${e?.message || e}`);
    }
    const raw: string = data?.choices?.[0]?.message?.content || '';
    if (!raw || raw.trim().length < 4) {
        throw new Error('排版 API 返回空内容');
    }

    const parsed = tolerantParseLayout(raw);
    if (!parsed) {
        throw new Error('排版返回无法解析为 JSON,请重试');
    }

    const layouts = normalizeLayoutShape(parsed, pieces);
    if (layouts.length === 0) {
        throw new Error('排版返回里没有任何有效 placement');
    }

    const usedIds = new Set<string>();
    for (const lay of layouts) {
        for (const pl of lay.placements) {
            usedIds.add(pl.fragmentId ?? `page:${pl.pageId}`);
        }
    }
    const expectedIds = new Set<string>();
    for (const p of pieces) {
        expectedIds.add(p.fragmentId ?? `page:${p.pageId}`);
    }
    const missing: string[] = [];
    for (const id of expectedIds) {
        if (!usedIds.has(id)) missing.push(id);
    }
    if (missing.length > 0) {
        throw new Error(`排版漏了 ${missing.length} / ${pieces.length} 片内容,请重试`);
    }

    return layouts;
}

// ─── 排版返回值的容错解析 ────────────────────────────────
//
// 实测里 LLM 经常输出:
//   - markdown 包裹的 JSON
//   - JSON 前后多一段说明文字
//   - 字段名变体 (piece_index / index / id, x / left, role / kind, ...)
//   - 顶层结构是 [...] 或 { placements: [...] } 或 { pages: [...] }
//   - 截断的 JSON (max_tokens 不够) → 走 extractJson 的 repair 兜底
//
// 这一层不"造"位置,只"翻译"和"清洗"。LLM 真返回不出来还是抛错。
function tolerantParseLayout(raw: string): any | null {
    const stripped = raw
        .replace(/^```(?:json|JSON)?\s*\n?/gm, '')
        .replace(/\n?```\s*$/gm, '')
        .trim();
    try { return JSON.parse(stripped); } catch {}
    try { return extractJson(stripped); } catch {}
    return null;
}

function pickField<T = any>(obj: any, keys: string[], fallback?: T): T | undefined {
    if (!obj || typeof obj !== 'object') return fallback;
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
    }
    return fallback;
}

function normalizeRole(raw: any): LayoutRole {
    const s = String(raw ?? '').toLowerCase().trim();
    if (s.startsWith('main') || s === 'center' || s === 'body' || s === 'central') return 'main';
    if (s.startsWith('side')) return 'side';
    if (s.startsWith('corner')) return 'corner';
    if (s.startsWith('margin') || s === 'edge' || s === 'border') return 'margin';
    return 'main';
}

function normalizeLayoutShape(parsed: any, pieces: FlatPiece[]): HandbookLayout[] {
    const clamp = (n: number, lo: number, hi: number) => {
        const v = Number(n);
        if (!Number.isFinite(v)) return (lo + hi) / 2;
        return Math.max(lo, Math.min(hi, v));
    };

    // 1. 拿到 pages 数组(顶层可能是各种形状)
    let pagesRaw: any[] = [];
    if (Array.isArray(parsed)) {
        // 可能是 [ {pageNumber, placements}... ] 或 [ ...placements... ]
        const looksLikePages = parsed.every(x =>
            x && typeof x === 'object' && (Array.isArray(x.placements) || Array.isArray(x.items)));
        if (looksLikePages) {
            pagesRaw = parsed;
        } else {
            pagesRaw = [{ pageNumber: 1, placements: parsed }];
        }
    } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.pages)) pagesRaw = parsed.pages;
        else if (Array.isArray(parsed.layout?.pages)) pagesRaw = parsed.layout.pages;
        else if (Array.isArray(parsed.placements)) pagesRaw = [{ pageNumber: 1, placements: parsed.placements }];
        else if (Array.isArray(parsed.items)) pagesRaw = [{ pageNumber: 1, placements: parsed.items }];
        else {
            // 找第一个像 placements 数组的字段值
            for (const v of Object.values(parsed)) {
                if (Array.isArray(v) && v.length > 0 && v.every(x => x && typeof x === 'object')) {
                    pagesRaw = [{ pageNumber: 1, placements: v }];
                    break;
                }
            }
        }
    }
    if (pagesRaw.length === 0) return [];

    const usedIndices = new Set<number>();

    // pieceId 反查表(支持 LLM 用 fragmentId / pageId 字符串引用)
    const idToIndex = new Map<string, number>();
    pieces.forEach((p, i) => {
        if (p.fragmentId) idToIndex.set(p.fragmentId, i);
        idToIndex.set(p.pageId, i);    // 同 pageId 多个 fragment 时,只指向第一片;LLM 通常用 index,这里只是兜底
    });

    const layouts: HandbookLayout[] = [];
    for (const pageObj of pagesRaw) {
        const placementsRaw = Array.isArray(pageObj?.placements) ? pageObj.placements
            : Array.isArray(pageObj?.items) ? pageObj.items
            : [];
        if (placementsRaw.length === 0) continue;

        const placements: LayoutPlacement[] = [];
        for (const pl of placementsRaw) {
            if (!pl || typeof pl !== 'object') continue;

            // 解析 piece 索引(支持多种字段名)
            let idx: number = -1;
            const idxRaw = pickField<any>(pl, [
                'pieceIndex', 'piece_index', 'index', 'pieceIdx', 'piece', 'i', 'n',
            ]);
            if (typeof idxRaw === 'number' && Number.isFinite(idxRaw)) {
                idx = Math.floor(idxRaw);
            } else if (typeof idxRaw === 'string' && /^\d+$/.test(idxRaw)) {
                idx = parseInt(idxRaw, 10);
            } else {
                // 用 id 字符串反查
                const idRef = pickField<any>(pl, [
                    'pieceId', 'fragmentId', 'fragment_id', 'pageId', 'page_id', 'id',
                ]);
                if (typeof idRef === 'string' && idToIndex.has(idRef)) {
                    idx = idToIndex.get(idRef)!;
                }
            }
            if (idx < 0 || idx >= pieces.length) continue;
            if (usedIndices.has(idx)) continue;   // 重复就丢掉,不让 LLM 双倍占位
            usedIndices.add(idx);
            const piece = pieces[idx];

            placements.push({
                pageId: piece.pageId,
                fragmentId: piece.fragmentId,
                xPct: clamp(pickField(pl, ['xPct', 'x', 'left', 'leftPct', 'xPercent'], 5)!, 0, 95),
                yPct: clamp(pickField(pl, ['yPct', 'y', 'top', 'topPct', 'yPercent'], 5)!, 0, 95),
                widthPct: clamp(pickField(pl, ['widthPct', 'width', 'w', 'widthPercent'], 50)!, 18, 92),
                rotate: clamp(pickField(pl, ['rotate', 'rotation', 'rot', 'angle'], 0)!, -18, 18),
                zIndex: Math.round(clamp(pickField(pl, ['zIndex', 'z', 'layer'], 10)!, 1, 99)),
                role: normalizeRole(pickField(pl, ['role', 'kind', 'type', 'slot'], 'main')),
            });
        }

        if (placements.length === 0) continue;
        layouts.push({
            pageNumber: typeof pageObj?.pageNumber === 'number' ? pageObj.pageNumber : layouts.length + 1,
            placements: resolveOverlaps(placements, pieces),
            generatedAt: Date.now(),
        });
    }

    return layouts;
}

// ─── 重叠消除 ───────────────────────────────────────────
// LLM 经常摆出"两片 bbox 直接互相挤"的位置 — 视觉上完全糊。
// 这里做一遍 sweep, 估算每片高度, 如果 (i, j) 两片 bbox 重叠 > 阈值,
// 就把后排片向下推到前一片的下沿之下 (保留 x, 保留 z, 不改 LLM 的整体意图)。
//
// 这不是"造内容",是"扫尘";LLM 本意是 "main 在中央 / corner 在角落",
// 这里只确保它们不互相遮文字。
//
function resolveOverlaps(placements: LayoutPlacement[], pieces: FlatPiece[]): LayoutPlacement[] {
    // 估算每片高度% — 中文 16 字/行 @ widthPct=100 (假设画布宽 360),
    // 实际行数 = ceil(chars / 字每行), 行高 ≈ 24px, 画布高 ≈ 720,
    // 高度% ≈ 行数 * 24 / 720 * 100 ≈ 行数 * 3.4
    const pieceById = new Map<string, FlatPiece>();
    pieces.forEach(p => pieceById.set(p.fragmentId ?? p.pageId, p));

    const estHeightPct = (pl: LayoutPlacement): number => {
        const piece = pieceById.get(pl.fragmentId ?? pl.pageId);
        const chars = piece?.charCount ?? 60;
        // 一行字数 ≈ widthPct 的 16% (画布 360px / 字宽 22px ≈ 16 字 @ widthPct=100)
        const charsPerLine = Math.max(8, Math.floor(pl.widthPct * 0.16));
        const lines = Math.ceil(chars / charsPerLine);
        // 行高 + 内边距 + 作者条 ≈ 行数*3.4 + 6 (% of page)
        // role 不同基础高度也不同
        const base = pl.role === 'margin' ? 4 : pl.role === 'corner' ? 6 : 9;
        return lines * 3.4 + base;
    };

    // bbox: [x1, y1, x2, y2] — 含 1.5% 的安全 padding
    type Box = { x1: number; y1: number; x2: number; y2: number };
    const PAD = 1.5;
    const toBox = (pl: LayoutPlacement): Box => ({
        x1: pl.xPct - PAD,
        y1: pl.yPct - PAD,
        x2: pl.xPct + pl.widthPct + PAD,
        y2: pl.yPct + estHeightPct(pl) + PAD,
    });
    const intersect = (a: Box, b: Box) => !(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1);

    const sorted = placements.map((p, idx) => ({ p, idx, box: toBox(p) }));
    // 排版顺序:先按 yPct 升序,稳定 idx 作为 tiebreaker
    sorted.sort((a, b) => a.p.yPct - b.p.yPct || a.idx - b.idx);

    const placed: typeof sorted = [];
    for (const cur of sorted) {
        let safety = 0;
        while (safety++ < 30) {
            const collides = placed.find(p => intersect(p.box, cur.box));
            if (!collides) break;
            // 把 cur 推到 collides 下沿之下
            const newY = collides.box.y2 + 0.4;
            cur.p.yPct = Math.min(95, newY);
            cur.box = toBox(cur.p);
            // 如果已经被推到底了,角度收一收避免出页
            if (cur.p.yPct >= 92) {
                cur.p.yPct = 92;
                cur.box = toBox(cur.p);
                break;
            }
        }
        placed.push(cur);
    }

    // 保持原 placements 顺序返回(LLM 给的逻辑 zIndex 还在 .p 上)
    return placements;
}
