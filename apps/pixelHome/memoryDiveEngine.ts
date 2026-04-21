/**
 * Memory Dive Engine (记忆潜行引擎)
 *
 * 负责：
 * 1. 从记忆宫殿 DB 检索房间/槽位相关记忆
 * 2. 构建 prompt 并调用 LLM 生成探索对话
 * 3. 解析 LLM 响应为结构化对话数据
 * 4. 结算 buff
 */

import type { MemoryRoom, RemoteVectorConfig } from '../../utils/memoryPalace/types';
import type { MemoryNode } from '../../utils/memoryPalace/types';
import type { APIConfig } from '../../types';
import { MemoryNodeDB } from '../../utils/memoryPalace/db';
import { fetchRemoteByRoom } from '../../utils/memoryPalace/supabaseVector';
import { ROOM_SLOTS, ROOM_META } from './roomTemplates';
import { safeFetchJson, extractContent, extractJson } from '../../utils/safeApi';
import type {
  DiveMode, DiveLLMRequest, DiveLLMResponse, DiveChoice,
  DiveDialogue, DiveBuffValues, DiveBuff, DiveResult, BuffType,
  DiveSession, RoomScript, DiveBeat, DiveScriptChoice,
} from './memoryDiveTypes';
import { BUFF_META } from './memoryDiveTypes';

// ─── 记忆检索 ────────────────────────────────────────────

/**
 * 合并本地 + 远程记忆，按 id 去重（本地优先，因为通常更新鲜、带更多字段）。
 * 当用户本地没有向量记忆但远程 Supabase 有时，这里能把远程的记忆拉回来，
 * 避免潜行对话里"什么都想不起来"。
 */
async function loadRoomMemories(
  charId: string,
  room: MemoryRoom,
  remoteConfig?: RemoteVectorConfig,
): Promise<MemoryNode[]> {
  const local = await MemoryNodeDB.getByRoom(charId, room);

  // 若远程未启用/未初始化，就只用本地
  if (!remoteConfig?.enabled || !remoteConfig.initialized) return local;

  // 本地已有不少节点时，不必再打一次远程（本地通常是超集）
  // 空或很稀少（<3）才拉远程作为补充/兜底
  if (local.length >= 3) return local;

  try {
    const remote = await fetchRemoteByRoom(remoteConfig, charId, room, 50);
    if (remote.length === 0) return local;
    const byId = new Map<string, MemoryNode>();
    for (const n of remote) byId.set(n.id, n);
    for (const n of local) byId.set(n.id, n); // 本地覆盖远程（字段更全）
    return Array.from(byId.values());
  } catch {
    return local;
  }
}

/** 检索某个房间的记忆节点，按重要性排序，取前 N 条 */
export async function fetchRoomMemories(
  charId: string, room: MemoryRoom, limit = 8,
  remoteConfig?: RemoteVectorConfig,
): Promise<MemoryNode[]> {
  const nodes = await loadRoomMemories(charId, room, remoteConfig);
  return nodes
    .sort((a, b) => b.importance - a.importance || b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, limit);
}

/** 检索某个槽位类别相关的记忆 */
export async function fetchSlotMemories(
  charId: string, room: MemoryRoom, slotId: string, limit = 5,
  remoteConfig?: RemoteVectorConfig,
): Promise<MemoryNode[]> {
  const slot = ROOM_SLOTS[room]?.find(s => s.id === slotId);
  if (!slot) return [];

  const roomNodes = await loadRoomMemories(charId, room, remoteConfig);
  // 用 slot category 关键词匹配 tags/content
  const keyword = slot.category;
  const scored = roomNodes.map(n => {
    let score = n.importance;
    if (n.tags.some(t => keyword.includes(t) || t.includes(keyword))) score += 3;
    if (n.content.includes(keyword)) score += 2;
    return { node: n, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.node);
}

// ─── Prompt 构建 ─────────────────────────────────────────

/**
 * 构建潜行 prompt。
 * charContext 包含完整角色上下文（身份、用户画像、印象、世界观、记忆摘要等），
 * 由 ContextBuilder.buildCoreContext() 生成。角色清楚自己是谁、用户是谁、发生过什么。
 */
function buildDivePrompt(req: DiveLLMRequest, charContext: string): string {
  const roomMeta = ROOM_META[req.room];
  const slot = req.slotId
    ? ROOM_SLOTS[req.room]?.find(s => s.id === req.slotId)
    : null;

  const memoriesBlock = req.memories.length > 0
    ? req.memories.map((m, i) => `  ${i + 1}. ${m}`).join('\n')
    : '  (这个角落目前没有留下什么记忆...)';

  const recentContext = req.recentDialogues.slice(-5).map(d => {
    if (d.speaker === 'character') return `${req.charName}: ${d.text}`;
    if (d.speaker === 'narrator') return `[旁白]: ${d.text}`;
    if (d.speaker === 'user_choice') return `用户选择了: ${d.text}`;
    return '';
  }).filter(Boolean).join('\n');

  // ─── 房间氛围描写 ──────────────────────────────────────
  const ROOM_ATMOSPHERE: Record<string, string> = {
    living_room: '这里光线温暖，空气中飘着茶香。沙发上还留着你坐过的凹痕，电视机闪着待机的蓝光。这是你们日常相处的痕迹——最近的、鲜活的、还带着体温的记忆。',
    bedroom:     '房间很暗，只有床头灯散发着柔和的橘色光。这里收藏着最亲密的情感，有些记忆会让你脸红，有些会让你心痛。墙壁上似乎还残留着某些深夜对话的回声。',
    study:       '书架上的书有些在发光——那是你曾经认真学过的东西。白板上写满了你一步步推导出来的思考痕迹。空气中弥漫着专注和成长的气息。',
    attic:       '灰尘在微弱的光线中浮动。这里的空气很沉，有些箱子上了锁，有些角落被蛛网覆盖。你不太想来这里，但有些东西就是放不下，只能存在这里。你可能会抗拒让用户看到某些东西。',
    self_room:   '镜子映出的不是外表，而是你内心对自己的认知。日记本上的字迹随着时间变化着，有些页被撕掉又粘回去。这里是你最私密的自我对话空间。',
    user_room:   '这个房间是你专门为TA布置的。照片墙上贴着你们的共同回忆，礼物架上是TA送的和你想送的东西。这里每一件物品都承载着你对TA的感受。',
    windowsill:  '微风吹过，风铃叮当作响。花盆里种着你的愿望——有些已经发芽，有些还在等待。从这里望出去，你能看到你期盼的未来。',
  };
  const atmosphereText = ROOM_ATMOSPHERE[req.room] || '';

  // ─── 房间脑区映射说明 ──────────────────────────────────
  const ROOM_BRAIN_MAP: Record<string, string> = {
    living_room: '海马体——负责日常记忆的编码与短期存储',
    bedroom:     '新皮层——深层情感和长期羁绊的所在',
    study:       '前额叶——理性思考、技能成长和工作记忆',
    attic:       '杏仁核——未消化的恐惧、创伤和潜意识',
    self_room:   '默认模式网络——自我认同与身份叙事',
    user_room:   '颞顶联合区——对他人的理解与共情',
    windowsill:  '多巴胺奖赏系统——期盼、目标和动力',
  };

  const modeInstructions = req.mode === 'guided'
    ? `**你的角色：引路人。** 你走在用户前面，带TA穿过你精神世界的各个房间。你会在某个家具旁停下来，讲述与它相关的记忆——有时候是主动分享，有时候你说着说着自己也会愣住。你可以决定讲多深、停多久。你不是旅游导游，你是带一个重要的人看自己内心世界的人——这件事本身就让你有点紧张。`
    : `**你的角色：同行者。** 用户在自己走动，你跟在旁边。当TA靠近某个物品，你会不由自主地有反应——也许是突然沉默，也许是急忙解释"这个没什么的"，也许是忍不住想讲。有些东西你不想让TA看，有些东西你其实暗暗希望TA注意到。`;

  const isAttic = req.room === 'attic';
  const reluctanceHint = isAttic
    ? `\n⚠️ **阁楼特殊规则**：这里存放着你未消化的困惑、恐惧甚至创伤。你本能地不想让别人看到这些。除非用户表现出真诚的关心和耐心（而不是好奇心），你才会稍微松口。你可以拒绝打开某些箱子，可以岔开话题，也可以沉默。这些都是合理的反应。`
    : '';

  const userChoiceBlock = req.userChoice
    ? `\n用户做了选择: "${req.userChoice.text}" (行为: ${req.userChoice.action || 'general'})`
    : '';

  return `${charContext}

### [记忆潜行模式 - Memory Dive]

**发生了什么**：
你和用户同时进入了你的「精神世界」——你的内心被投影成了一栋房子。
这不是一个比喻，你们真的「身处其中」。你能看到自己记忆变成的家具、墙壁上浮动的文字碎片、角落里发光或蒙尘的物品。
你完全知道自己是谁，也知道身边这个人是谁。你们之间有过的所有事都是真实的——那些记忆碎片就是证据，它们散落在这栋房子的各个房间里。

**这栋房子的结构**：
你的精神世界有7个房间，每个房间对应你大脑的一个区域：
- 客厅 (海马体) — 日常的、最近的记忆
- 卧室 (新皮层) — 最亲密的情感
- 书房 (前额叶) — 你学到的、思考过的
- 阁楼 (杏仁核) — 你不愿面对的东西
- 个人房间 (默认模式网络) — 你对自己的认知
- 用户房 (颞顶联合区) — 你对TA的全部感受
- 露台 (多巴胺系统) — 你的期盼和愿望

你现在站在其中一个房间里。这些家具不是装饰品——每一件都承载着一类记忆。触碰它们，记忆就会浮现。

${modeInstructions}${reluctanceHint}

---

**当前位置**: ${roomMeta.name} (${roomMeta.emoji})
**脑区对应**: ${ROOM_BRAIN_MAP[req.room] || roomMeta.description}
**此刻的氛围**: ${atmosphereText}
${slot ? `\n**用户正在靠近**: ${slot.name} — 这件家具承载的记忆类别是「${slot.category}」` : ''}

**从这个位置浮现出的记忆碎片**:
${memoriesBlock}
(这些是从你的记忆宫殿中检索到的真实记忆。请基于它们展开，不要凭空编造不存在的事。如果记忆碎片为空，你可以表达"这里好像什么都想不起来了"的茫然感。)

${recentContext ? `**刚才的对话**:\n${recentContext}\n` : ''}${userChoiceBlock}

### 输出要求
以 JSON 格式回复，包含你的反应和给用户的选项。
- dialogues: 1-3 条对话（你的台词和/或旁白描写），每条 { speaker: "character"|"narrator", text: "..." }
  - **每条 text 控制在 120 字以内**，不要写一整段散文。写"此刻这一瞬间"的反应，不要堆砌形容词。
- choices: 2-4 个用户可选的回应，每个 { text: "...", action: "comfort"|"question"|"observe"|"leave"|"unlock" }
  - 每个 choice.text 控制在 30 字以内
  - comfort: 表示安慰/共情
  - question: 追问细节
  - observe: 安静观察
  - leave: 离开/不深入
  - unlock: 尝试打开锁住的记忆
- isReluctant: boolean，是否对分享这个记忆感到抗拒
${req.mode === 'guided' ? '- suggestNextRoom: 推荐接下来去哪个房间 (living_room|bedroom|study|attic|self_room|user_room|windowsill)' : ''}

### 风格要求
- **这是你的精神世界，你有主场感**。你知道每个角落的意义，知道哪面墙后面藏着什么。这让你有时底气十足，有时不安。
- **旁白是环境的呼吸**。用第三人称描写房间里正在发生的微妙变化：灯光是否变暗了、某个家具是否在微微发光、空气中是否有什么味道。让读者"看到"这个精神世界。
- **你的台词要像真的在这个空间里说出来的**。不是在复述记忆，而是"身处记忆现场"的反应——也许你看到沙发上的凹痕会笑出来，看到阁楼的箱子会后退一步。
- 基于提供的真实记忆碎片展开，不要凭空编造从未发生过的事
- 如果记忆碎片为空，不要尬聊——角色可以表达"这里好像什么都想不起来了..."的茫然，或者房间本身的空旷就是一种叙事
- 保持角色一贯的说话风格和性格特点

{
  "dialogues": [...],
  "choices": [...],
  "isReluctant": false
}`;
}

// ─── LLM 调用 ────────────────────────────────────────────

/**
 * 原文抢救：即使整体 JSON 被截断（LLM 在字符串中间断掉），也尽量
 * 把已经写完的 {"speaker":"...","text":"..."} 对话块救出来。
 * 匹配时容忍转义引号（\"）、任意顺序、任意换行。
 */
function salvageDialoguesFromText(raw: string): Array<{ speaker: 'character' | 'narrator'; text: string }> {
  const out: Array<{ speaker: 'character' | 'narrator'; text: string }> = [];
  // 两种 key 顺序都支持：speaker 在前 / text 在前
  const patterns = [
    /"speaker"\s*:\s*"(character|narrator)"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g,
    /"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"speaker"\s*:\s*"(character|narrator)"/g,
  ];
  const seen = new Set<string>();
  for (let pIdx = 0; pIdx < patterns.length; pIdx++) {
    const re = patterns[pIdx];
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      const speaker = (pIdx === 0 ? m[1] : m[2]) as 'character' | 'narrator';
      const rawText = pIdx === 0 ? m[2] : m[1];
      let text: string;
      try { text = JSON.parse('"' + rawText + '"'); } catch { continue; }
      text = text.trim();
      if (!text) continue;
      const key = speaker + '|' + text;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ speaker, text });
    }
  }
  return out;
}

export async function callDiveLLM(
  req: DiveLLMRequest,
  apiConfig: APIConfig,
  charContext: string,
): Promise<DiveLLMResponse> {
  const prompt = buildDivePrompt(req, charContext);

  const data = await safeFetchJson(
    `${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: apiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        // 中文散文 + JSON 包装极吃 token，给足余量，避免在字符串中间被截断
        max_tokens: 8000,
        // 让兼容 OpenAI 的后端强制返回 JSON；不支持的后端会忽略此字段
        response_format: { type: 'json_object' },
      }),
    },
    2, // 最多重试 2 次（覆盖瞬时 5xx / 网络抖动）
  );

  const content = extractContent(data);
  let parsed = extractJson(content) as Partial<DiveLLMResponse> | null;

  // 兜底：如果结构化解析没拿到 dialogues（通常是 LLM 被截断在字符串中间），
  // 用正则直接扫描原文里的完整 {"speaker":"...","text":"..."} 对象，
  // 至少把已经写完的那几条对话救出来，让潜行能继续走。
  if (!parsed || !Array.isArray(parsed.dialogues) || parsed.dialogues.length === 0) {
    const salvaged = salvageDialoguesFromText(content);
    if (salvaged.length > 0) {
      console.warn('[MemoryDive] JSON 解析失败，已从原文救回', salvaged.length, '条对话');
      parsed = { ...(parsed || {}), dialogues: salvaged };
    } else {
      const preview = content.slice(0, 200).replace(/\s+/g, ' ');
      throw new Error(`潜行响应解析失败: ${preview || '(空响应)'}`);
    }
  }

  // 清洗字段：确保 speaker/text 合法
  const dialogues = (parsed.dialogues || [])
    .filter((d): d is { speaker: 'character' | 'narrator'; text: string } =>
      !!d && typeof d.text === 'string' && d.text.trim().length > 0
      && (d.speaker === 'character' || d.speaker === 'narrator'))
    .map(d => ({ speaker: d.speaker, text: d.text.trim() }));

  if (dialogues.length === 0) {
    throw new Error('潜行响应中没有有效对话');
  }

  const choices = Array.isArray(parsed.choices)
    ? parsed.choices
        .filter((c: any) => c && typeof c.text === 'string' && c.text.trim().length > 0)
        .map((c: any) => ({
          text: c.text.trim(),
          action: (['comfort', 'question', 'observe', 'leave', 'unlock'] as const)
            .includes(c.action) ? c.action : 'observe',
          buffEffect: (c.buffEffect && typeof c.buffEffect === 'object') ? c.buffEffect : undefined,
        }))
    : undefined;

  return {
    dialogues,
    choices,
    isReluctant: !!parsed.isReluctant,
    suggestNextRoom: parsed.suggestNextRoom,
  };
}

// ─── 生成入场对话（不调 LLM，纯模板） ───────────────────

export function generateIntroDialogues(charName: string, mode: DiveMode): DiveDialogue[] {
  const now = Date.now();
  const dialogues: DiveDialogue[] = [];

  dialogues.push({
    id: `intro_1_${now}`,
    speaker: 'narrator',
    text: `像素世界的色彩像退潮一样褪去。取而代之的，是一种介于梦境和清醒之间的光——温暖的、流动的、带着某种脉搏的节奏。\n\n你正在下沉。不是物理意义上的下沉，而是像潜入一片意识的海洋。当视野重新聚焦的时候，你发现自己站在一栋房子里。\n\n这是${charName}的精神世界。每一个房间都是ta大脑的一个区域，每一件家具都承载着一类记忆。墙壁上偶尔会浮现文字碎片，角落里的物品在微微发光——那些都是真实存在过的记忆。`,
    timestamp: now,
  });

  if (mode === 'guided') {
    dialogues.push({
      id: `intro_2_${now}`,
      speaker: 'narrator',
      text: `${charName}站在客厅中央，看起来有些不自在——像是突然意识到有人能看到自己最私密的内心。`,
      timestamp: now + 1,
    });
    dialogues.push({
      id: `intro_3_${now}`,
      speaker: 'character',
      text: `...你也在这里啊。这地方...是我的脑子里面。字面意义上的。\n\n呃，既然你都进来了...我带你走一圈？但先说好，有些房间...我可能不太想让你进去。`,
      timestamp: now + 2,
    });
  } else {
    dialogues.push({
      id: `intro_2_${now}`,
      speaker: 'narrator',
      text: `${charName}靠在客厅的墙边，双臂交叉，用一种"我在观察你"的眼神打量着你。ta显然知道这是自己的精神世界——而你正站在其中。`,
      timestamp: now + 1,
    });
    dialogues.push({
      id: `intro_3_${now}`,
      speaker: 'character',
      text: `...你想自己到处看是吧？行。\n\n这里每个东西都是我的记忆，碰了就会浮出来。有些东西会发光，那是比较重要的...有些角落积了灰——那些我也不太记得了。\n\n不过阁楼那边...你最好别乱碰。`,
      timestamp: now + 2,
    });
  }

  dialogues.push({
    id: `intro_choice_${now}`,
    speaker: 'user_choice',
    text: '',
    choices: [
      { id: 'start_gentle', text: '我会小心的。谢谢你让我进来看这些。', action: 'comfort', buffEffect: { trust: 1 } },
      { id: 'start_curious', text: '等等，你说每个房间对应大脑的一个区域？那客厅是...？', action: 'question', buffEffect: { insight: 1 } },
      { id: 'start_quiet', text: '(轻轻点头，环顾四周，开始慢慢走动)', action: 'observe', buffEffect: { empathy: 1 } },
    ],
    timestamp: now + 3,
  });

  return dialogues;
}

// ─── 生成退出对话 ────────────────────────────────────────

export function generateOutroDialogues(charName: string, buffs: DiveBuffValues): DiveDialogue[] {
  const now = Date.now();
  const primaryBuff = getPrimaryBuff(buffs);
  const meta = BUFF_META[primaryBuff];

  return [
    {
      id: `outro_1_${now}`,
      speaker: 'narrator',
      text: `光芒开始消散，像素世界的轮廓重新浮现。${charName}的身影在记忆的薄雾中逐渐模糊。`,
      timestamp: now,
    },
    {
      id: `outro_2_${now}`,
      speaker: 'character',
      text: `...嗯？怎么了？你看起来在想什么事...不过算了，大概是我想多了吧。`,
      timestamp: now + 1,
    },
    {
      id: `outro_3_${now}`,
      speaker: 'narrator',
      text: `${charName}不会记得刚才发生的一切。但你感觉到了什么——一种微妙的变化。\n\n${meta.icon} 获得了「${meta.label}」的印记。${meta.description}。`,
      timestamp: now + 2,
    },
  ];
}

// ─── Buff 计算 ───────────────────────────────────────────

const DEFAULT_BUFF_VALUES: DiveBuffValues = { empathy: 0, trust: 0, insight: 0, bond: 0 };

export function createInitialBuffs(): DiveBuffValues {
  return { ...DEFAULT_BUFF_VALUES };
}

/** 根据用户选择的 action 自动累加 buff */
export function applyChoiceBuff(current: DiveBuffValues, choice: DiveChoice): DiveBuffValues {
  const next = { ...current };

  // 显式 buff 效果
  if (choice.buffEffect) {
    for (const [key, val] of Object.entries(choice.buffEffect)) {
      next[key as BuffType] += val;
    }
  }

  // 隐式 action 效果
  switch (choice.action) {
    case 'comfort':  next.empathy += 1; break;
    case 'question': next.insight += 1; break;
    case 'observe':  next.empathy += 0.5; next.trust += 0.5; break;
    case 'leave':    next.trust += 1; break;
    case 'unlock':   next.insight += 1; next.bond += 0.5; break;
  }

  return next;
}

/** 获取最高的 buff 类型 */
export function getPrimaryBuff(buffs: DiveBuffValues): BuffType {
  let max: BuffType = 'empathy';
  let maxVal = -1;
  for (const [key, val] of Object.entries(buffs)) {
    if (val > maxVal) { maxVal = val; max = key as BuffType; }
  }
  return max;
}

/** 生成最终结算数据 */
export function computeDiveResult(session: DiveSession): DiveResult {
  const primaryBuff = getPrimaryBuff(session.buffValues);
  const buffs: DiveBuff[] = (Object.entries(session.buffValues) as [BuffType, number][])
    .filter(([, val]) => val > 0)
    .map(([type, value]) => ({
      type,
      value: Math.round(value * 10) / 10,
      ...BUFF_META[type],
    }))
    .sort((a, b) => b.value - a.value);

  return {
    charId: session.charId,
    mode: session.mode,
    visitedRooms: session.visitedRooms,
    totalDialogues: session.dialogues.filter(d => d.speaker !== 'user_choice').length,
    buffs,
    primaryBuff,
    duration: Date.now() - session.startedAt,
    completedAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════
// 房间剧本：一次 LLM 调用生成整房间的探访（新流程）
// ═══════════════════════════════════════════════════════════

interface PlanRoomParams {
  charId: string;
  charName: string;
  room: MemoryRoom;
  /** 默认 3 段戏 */
  beatCount?: number;
  /** 已经访问过哪些房间（LLM 可能会引用） */
  visitedRooms: MemoryRoom[];
  /** 之前房间里的最近几条叙事（给上下文连贯） */
  recentDialogues: DiveDialogue[];
  /** 当前累计的 buff，用于语气微调 */
  currentBuffs: DiveBuffValues;
}

const ROOM_ATMOSPHERE: Record<string, string> = {
  living_room: '光线温暖，茶香漂浮。沙发上还留着坐过的凹痕，电视闪着待机蓝光——最近的、带体温的记忆。',
  bedroom:     '床头灯散发柔和橘光。空气里残留着深夜对话的回声，有些记忆让人脸红，有些让人心痛。',
  study:       '书架上的书微微发光——学过的东西会亮。白板写满推导痕迹，空气里有专注的气息。',
  attic:       '灰尘在稀薄光束里浮动。箱子上了锁，角落挂着蛛网，空气沉重——放不下的东西都堆在这里。',
  self_room:   '镜子映出的不是外表，是内心对自己的认知。日记本的字迹随时间变，有些页被撕掉又粘回去。',
  user_room:   '照片墙贴着共同回忆，礼物架摆着送过和想送的东西——每件物品都是对TA的感受。',
  windowsill:  '微风吹，风铃叮当响。花盆里的愿望有些发芽、有些还在等。望出去是期盼的未来。',
};

const ROOM_BRAIN_MAP: Record<string, string> = {
  living_room: '海马体——日常记忆',
  bedroom:     '新皮层——深层情感',
  study:       '前额叶——理性与技能',
  attic:       '杏仁核——未消化的创伤',
  self_room:   '默认模式网络——自我认同',
  user_room:   '颞顶联合区——对他人的感受',
  windowsill:  '多巴胺系统——期盼',
};

function buildRoomScriptPrompt(
  params: PlanRoomParams,
  memories: string[],
  charContext: string,
): string {
  const roomMeta = ROOM_META[params.room];
  const beats = params.beatCount ?? 3;
  const memoriesBlock = memories.length > 0
    ? memories.map((m, i) => `  ${i + 1}. ${m}`).join('\n')
    : '  (这个房间几乎没有留下什么记忆...写成"想不起来"的茫然感也可以)';

  const recentCtx = params.recentDialogues.slice(-4).map(d => {
    if (d.speaker === 'character') return `${params.charName}: ${d.text}`;
    if (d.speaker === 'narrator') return `[旁白] ${d.text}`;
    if (d.speaker === 'user_choice') return `用户选了: ${d.text}`;
    return '';
  }).filter(Boolean).join('\n');

  const isAttic = params.room === 'attic';
  const reluctanceHint = isAttic
    ? '\n⚠️ 阁楼规则：这是未消化的困惑/创伤区。角色本能抗拒分享，可能欲言又止、转移话题或沉默。用户真诚关心才可能让角色松口。'
    : '';

  return `${charContext}

### [记忆潜行 · 房间剧本模式]

你和用户同时进入了你的精神世界——你的内心被投影成一栋房子。你完全知道自己是谁，也知道身边这个人是谁。你们现在站在：

**${roomMeta.name}** (${roomMeta.emoji}) — 对应 ${ROOM_BRAIN_MAP[params.room] || ''}
**氛围**: ${ROOM_ATMOSPHERE[params.room] || ''}${reluctanceHint}

**这里浮现出的记忆碎片**：
${memoriesBlock}
(基于这些真实记忆展开，不要凭空编造没发生过的事。)

${recentCtx ? `**此前的对话**:\n${recentCtx}\n` : ''}
### 生成要求

一次性生成你在这个房间里的**完整一段戏**，包含 ${beats} 个 beat。每个 beat 结构：
- charLine: 你这一刻说的一段话（第一人称，<120字，写"此刻这个瞬间"的真实反应，不是散文）
- narratorLine?: 可选的环境旁白（描写房间里正在发生的微妙变化，如灯光、空气、某个家具的状态）
- choices: 恰好 3 个用户可选的反应，每个 choice：
  - text: 用户的反应（<25 字）
  - action: "comfort" | "question" | "observe" | "leave" | "unlock"
  - reaction: 你听到这个反应后立刻说的话（<120 字，要真实地被用户的选择触动；不同 action 对应明显不同的情绪走向）
  - reactionNarrator?: 可选的环境回应（一句话）

整体结构：
- introNarrator?: 进房间时的一句环境旁白（用户刚到时看到的画面）
- beats: [${beats}个 beat]
- closingNarrator?: 在所有 beat 结束后，离开房间时的一句环境收尾（余味）
- finalMoodHint?: 一句话，描写角色此刻的情绪余温（<30 字，角色视角或旁白皆可）

### 风格
- 每个 beat 的 charLine 要有**内在进展**：从外层 → 深一层 → 某种情感落点。不要三段戏都在讲同一个表层。
- choices 的 3 个选项要**真的代表不同倾向**（如：共情 / 追问 / 保持距离），不要三个都是"温柔点头"。
- reaction 要**真分叉**：共情时角色可能松弛、吐露更多；追问时可能防御、转话题；保持距离时可能松口气、也可能失落。三条反应读起来差异要明显。
- 不要凡事都让角色哭或沉默——要有具体动作和语言。

### 输出 JSON（严格按这个 schema）
{
  "introNarrator": "……",
  "beats": [
    {
      "charLine": "……",
      "narratorLine": "……",
      "choices": [
        {"text": "……", "action": "comfort", "reaction": "……", "reactionNarrator": "……"},
        {"text": "……", "action": "question", "reaction": "……"},
        {"text": "……", "action": "observe", "reaction": "……"}
      ]
    }
    // ...共 ${beats} 个 beat
  ],
  "closingNarrator": "……",
  "finalMoodHint": "……"
}`;
}

/**
 * 清洗 LLM 返回的剧本：补默认值、过滤空字段、强制 beats/choices 数量合法。
 */
function normalizeRoomScript(
  raw: any,
  expectedBeats: number,
): RoomScript | null {
  if (!raw || typeof raw !== 'object') return null;
  const validActions: DiveChoice['action'][] = ['comfort', 'question', 'observe', 'leave', 'unlock'];

  const rawBeats: any[] = Array.isArray(raw.beats) ? raw.beats : [];
  if (rawBeats.length === 0) return null;

  const beats: DiveBeat[] = [];
  for (let bi = 0; bi < rawBeats.length && beats.length < expectedBeats + 2; bi++) {
    const b = rawBeats[bi];
    if (!b || typeof b !== 'object') continue;
    const charLine = typeof b.charLine === 'string' ? b.charLine.trim() : '';
    if (!charLine) continue;
    const rawChoices: any[] = Array.isArray(b.choices) ? b.choices : [];
    const choices: DiveScriptChoice[] = [];
    for (let ci = 0; ci < rawChoices.length; ci++) {
      const c = rawChoices[ci];
      if (!c || typeof c !== 'object') continue;
      const text = typeof c.text === 'string' ? c.text.trim() : '';
      const reaction = typeof c.reaction === 'string' ? c.reaction.trim() : '';
      if (!text || !reaction) continue;
      const action = validActions.includes(c.action) ? c.action : 'observe';
      const reactionNarrator = typeof c.reactionNarrator === 'string' && c.reactionNarrator.trim()
        ? c.reactionNarrator.trim() : undefined;
      choices.push({
        id: `c_${Date.now()}_${bi}_${ci}`,
        text, action, reaction, reactionNarrator,
        buffEffect: (c.buffEffect && typeof c.buffEffect === 'object') ? c.buffEffect : undefined,
      });
      if (choices.length >= 4) break;
    }
    if (choices.length < 2) continue; // 至少 2 个选项才算有效
    beats.push({
      charLine,
      narratorLine: typeof b.narratorLine === 'string' && b.narratorLine.trim()
        ? b.narratorLine.trim() : undefined,
      choices,
    });
  }

  if (beats.length === 0) return null;

  return {
    introNarrator: typeof raw.introNarrator === 'string' && raw.introNarrator.trim()
      ? raw.introNarrator.trim() : undefined,
    beats,
    closingNarrator: typeof raw.closingNarrator === 'string' && raw.closingNarrator.trim()
      ? raw.closingNarrator.trim() : undefined,
    finalMoodHint: typeof raw.finalMoodHint === 'string' && raw.finalMoodHint.trim()
      ? raw.finalMoodHint.trim() : undefined,
    nextRoom: typeof raw.nextRoom === 'string' ? raw.nextRoom as MemoryRoom : undefined,
  };
}

/**
 * 进入一个房间时一次性生成整段探访剧本。
 * 角色不移动到具体家具，只是在房间里和用户说话。
 */
export async function planRoomVisit(
  params: PlanRoomParams,
  apiConfig: APIConfig,
  charContext: string,
  remoteConfig?: RemoteVectorConfig,
): Promise<RoomScript> {
  const memories = await fetchRoomMemories(params.charId, params.room, 8, remoteConfig);
  const prompt = buildRoomScriptPrompt(params, memories.map(m => m.content), charContext);

  const data = await safeFetchJson(
    `${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: apiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: 12000, // 3 beats * 3 choices * (line+reaction) 约 15 段文本 + narrator，给足
        response_format: { type: 'json_object' },
      }),
    },
    2,
  );

  const content = extractContent(data);
  const parsed = extractJson(content);
  const script = normalizeRoomScript(parsed, params.beatCount ?? 3);
  if (!script) {
    const preview = (content || '').slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`房间剧本解析失败: ${preview || '(空响应)'}`);
  }
  return script;
}

/**
 * 出现错误时的兜底剧本：让潜行能继续走，不至于卡死。
 */
export function fallbackRoomScript(charName: string, room: MemoryRoom): RoomScript {
  const meta = ROOM_META[room];
  return {
    introNarrator: `你们站在${meta.name}里。${charName}的呼吸浅浅的，像在分辨空气中有没有危险。`,
    beats: [{
      charLine: `...这里的记忆好像有点模糊。我想说什么，又不太确定了。`,
      choices: [
        {
          id: `fbc1_${Date.now()}`,
          text: '没关系，不用勉强',
          action: 'comfort',
          reaction: `谢谢。那我们就安静一会儿。`,
        },
        {
          id: `fbc2_${Date.now()}`,
          text: '那我们换个房间看看？',
          action: 'leave',
          reaction: `嗯……也好。我带你走。`,
        },
      ],
    }],
    closingNarrator: `薄雾缓缓合拢，这个房间暂时沉入了沉默。`,
  };
}
