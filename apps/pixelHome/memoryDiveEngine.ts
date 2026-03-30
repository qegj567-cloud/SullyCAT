/**
 * Memory Dive Engine (记忆潜行引擎)
 *
 * 负责：
 * 1. 从记忆宫殿 DB 检索房间/槽位相关记忆
 * 2. 构建 prompt 并调用 LLM 生成探索对话
 * 3. 解析 LLM 响应为结构化对话数据
 * 4. 结算 buff
 */

import type { MemoryRoom } from '../../utils/memoryPalace/types';
import type { MemoryNode } from '../../utils/memoryPalace/types';
import type { APIConfig } from '../../types';
import { MemoryNodeDB } from '../../utils/memoryPalace/db';
import { ROOM_SLOTS, ROOM_META } from './roomTemplates';
import { safeResponseJson } from '../../utils/safeApi';
import type {
  DiveMode, DiveLLMRequest, DiveLLMResponse, DiveChoice,
  DiveDialogue, DiveBuffValues, DiveBuff, DiveResult, BuffType,
  DiveSession,
} from './memoryDiveTypes';
import { BUFF_META } from './memoryDiveTypes';

// ─── 记忆检索 ────────────────────────────────────────────

/** 检索某个房间的记忆节点，按重要性排序，取前 N 条 */
export async function fetchRoomMemories(
  charId: string, room: MemoryRoom, limit = 8,
): Promise<MemoryNode[]> {
  const nodes = await MemoryNodeDB.getByRoom(charId, room);
  return nodes
    .sort((a, b) => b.importance - a.importance || b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, limit);
}

/** 检索某个槽位类别相关的记忆 */
export async function fetchSlotMemories(
  charId: string, room: MemoryRoom, slotId: string, limit = 5,
): Promise<MemoryNode[]> {
  const slot = ROOM_SLOTS[room]?.find(s => s.id === slotId);
  if (!slot) return [];

  const roomNodes = await MemoryNodeDB.getByRoom(charId, room);
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

function buildDivePrompt(req: DiveLLMRequest, charSystemPrompt: string): string {
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

  const modeInstructions = req.mode === 'guided'
    ? `你正在引导用户参观你的记忆空间。你走在前面，会主动讲述与这个地方相关的回忆，偶尔停下来等待用户的反应。你的态度取决于房间的性质——客厅轻松，阁楼可能有些不安。`
    : `用户在自由探索你的记忆空间。你跟在旁边。当用户靠近某个物品时你会有反应——有些记忆你愿意分享，有些你会犹豫或抗拒。`;

  const isAttic = req.room === 'attic';
  const reluctanceHint = isAttic
    ? `\n⚠️ 这是阁楼——存放着未消化的困惑与创伤。你对这里的记忆有些抗拒，不会轻易打开。用户需要表现出真诚的关心，你才可能稍微松口。`
    : '';

  const userChoiceBlock = req.userChoice
    ? `\n用户做了选择: "${req.userChoice.text}" (行为: ${req.userChoice.action || 'general'})`
    : '';

  return `${charSystemPrompt}

### [记忆潜行模式 - Memory Dive]
你正处于一个特殊的记忆可视化空间中。这里是你内心世界的投影。
${modeInstructions}${reluctanceHint}

**当前位置**: ${roomMeta.name} (${roomMeta.emoji}) — ${roomMeta.description}
${slot ? `**正在查看**: ${slot.name} — 对应记忆类别: 「${slot.category}」` : ''}

**这个位置关联的记忆碎片**:
${memoriesBlock}

${recentContext ? `**最近的对话**:\n${recentContext}\n` : ''}${userChoiceBlock}

### 输出要求
以 JSON 格式回复，包含你的反应和给用户的选项。
- dialogues: 1-3 条对话（你的台词和/或旁白描写），每条 { speaker: "character"|"narrator", text: "..." }
- choices: 2-4 个用户可选的回应，每个 { text: "...", action: "comfort"|"question"|"observe"|"leave"|"unlock" }
  - comfort: 表示安慰/共情
  - question: 追问细节
  - observe: 安静观察
  - leave: 离开/不深入
  - unlock: 尝试打开锁住的记忆
- isReluctant: boolean，是否对分享这个记忆感到抗拒
${req.mode === 'guided' ? '- suggestNextRoom: 推荐接下来去哪个房间 (living_room|bedroom|study|attic|self_room|user_room|windowsill)' : ''}

### 风格要求
- 对话要有情感张力，不是平铺直叙
- 旁白用第三人称，描写环境和角色的微表情
- 基于真实记忆碎片展开，不要凭空编造
- 如果没有相关记忆，角色可以表达"这里好像什么都想不起来了..."的感觉
- 保持角色一贯的说话风格

{
  "dialogues": [...],
  "choices": [...],
  "isReluctant": false
}`;
}

// ─── LLM 调用 ────────────────────────────────────────────

export async function callDiveLLM(
  req: DiveLLMRequest,
  apiConfig: APIConfig,
  charSystemPrompt: string,
): Promise<DiveLLMResponse> {
  const prompt = buildDivePrompt(req, charSystemPrompt);

  const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: apiConfig.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM 请求失败 (HTTP ${response.status})`);
  }

  const data = await safeResponseJson(response);
  let content = data.choices?.[0]?.message?.content || '';
  content = content.replace(/```json/g, '').replace(/```/g, '').trim();

  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    content = content.substring(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(content) as DiveLLMResponse;
  return parsed;
}

// ─── 生成入场对话（不调 LLM，纯模板） ───────────────────

export function generateIntroDialogues(charName: string, mode: DiveMode): DiveDialogue[] {
  const now = Date.now();
  const dialogues: DiveDialogue[] = [];

  dialogues.push({
    id: `intro_1_${now}`,
    speaker: 'narrator',
    text: `空气变得朦胧，像素世界的色彩渐渐褪去，取而代之的是一种温暖的、半透明的光芒。你感觉自己正在沉入一个更深的层次——${charName}的内心世界。`,
    timestamp: now,
  });

  if (mode === 'guided') {
    dialogues.push({
      id: `intro_2_${now}`,
      speaker: 'character',
      text: `...你来了？好吧，既然你都走到这里了...我带你看看？不过有些地方...可能我不太想打开。`,
      timestamp: now + 1,
    });
  } else {
    dialogues.push({
      id: `intro_2_${now}`,
      speaker: 'character',
      text: `...这里是...嗯，你想自己走走看？随便吧。不过，有些东西碰了可不能怪我。`,
      timestamp: now + 1,
    });
  }

  dialogues.push({
    id: `intro_3_${now}`,
    speaker: 'user_choice',
    text: '',
    choices: [
      { id: 'start_gentle', text: '我会小心的，谢谢你让我进来', action: 'comfort', buffEffect: { trust: 1 } },
      { id: 'start_curious', text: '这里好有趣...每个角落都代表什么？', action: 'question', buffEffect: { insight: 1 } },
      { id: 'start_quiet', text: '(点头，安静地往前走)', action: 'observe', buffEffect: { empathy: 1 } },
    ],
    timestamp: now + 2,
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
