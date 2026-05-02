/**
 * 手账内页版式库 (v2)
 *
 * 6 套预置模板。一份 template = 一组带位置/容量/可写者/语义角色的槽 (SlotDef)。
 * orchestrator 按当天聊天活跃度 + 角色数 + 是否有照片 选模板,
 * 然后 user 先填,角色按顺序在剩余槽里填。槽里写不下/写不到的留白。
 *
 * 设计规则:
 *  - 每页 ≤ 7 个槽 (再多就乱)
 *  - 槽总占比 < 78% (留 ≥ 22% 真实留白)
 *  - 每页 ≤ 1 个 hero (isHero=true), 视觉权重最高
 *  - sticky-reaction 永远 char-only, 永远在已有内容附近
 *  - photo-caption 槽永远 user-only (照片只能 user 贴)
 *  - 同 SlotRole 的高度上限做了卡控, 写溢出渲染器会截
 *
 * 坐标都是 % of 整页 (左侧 ~6% 留给装订环, 顶/底各留 ~6%)。
 */

import { LayoutTemplate } from '../types';

// ─── A · plan-day · 计划型一日 ────────────────────────────
// 早上写计划 + 列待办 + 心情;角色在 sticky / corner 里凑热闹
const PLAN_DAY: LayoutTemplate = {
    id: 'plan-day',
    name: '计划型一日',
    suitFor: 'user 早上想理清今天要做什么; 角色少 (1~2)',
    paperStyle: 'dot',
    pages: [[
        {
            id: 'A',
            slotRole: 'timeline-plan',
            charBudget: [40, 110],
            eligibleAuthors: ['user'],
            hint: '今天的时间表 / 计划表,6~8 行,每行 时间 + 一句要做的事(≤12 字)',
            xPct: 6, yPct: 8, widthPct: 52, maxHeightPct: 48,
            isHero: true,
        },
        {
            id: 'B',
            slotRole: 'mood-card',
            charBudget: [12, 40],
            eligibleAuthors: ['user', 'char'],
            hint: '今日心情速记 (≤30 字) + 1~5 颗星',
            xPct: 62, yPct: 10, widthPct: 32, maxHeightPct: 22,
            rotate: 1.5,
            skinVariant: 'lavender',
        },
        {
            id: 'C',
            slotRole: 'todo',
            charBudget: [30, 80],
            eligibleAuthors: ['user'],
            hint: '今日待办,3~5 项,每项 ≤ 14 字',
            xPct: 62, yPct: 36, widthPct: 32, maxHeightPct: 32,
        },
        {
            id: 'D',
            slotRole: 'sticky-reaction',
            charBudget: [15, 50],
            eligibleAuthors: ['char'],
            hint: '看到 user 计划/待办里的某条, 吐槽/捧场/补刀 (引用一条)',
            xPct: 8, yPct: 60, widthPct: 36, maxHeightPct: 18,
            rotate: -1.2,
            skinVariant: 'mint',
        },
        {
            id: 'E',
            slotRole: 'sticky-reaction',
            charBudget: [15, 50],
            eligibleAuthors: ['char'],
            hint: '反应一条 user 写的内容 (跟 D 不同条) 或反应 D',
            xPct: 50, yPct: 64, widthPct: 36, maxHeightPct: 18,
            rotate: 1.5,
            skinVariant: 'rose',
        },
        {
            id: 'F',
            slotRole: 'corner-note',
            charBudget: [6, 20],
            eligibleAuthors: ['user', 'char'],
            hint: '边角小字, 一句独白/感叹, 不解释',
            xPct: 8, yPct: 86, widthPct: 30, maxHeightPct: 8,
            rotate: -2,
        },
    ]],
};

// ─── B · reflective-day · 反思型一日 ──────────────────────
// 大段日记 + 感恩 + 一两条角色 sticky;最适合"今天和角色聊很多"的日子
const REFLECTIVE_DAY: LayoutTemplate = {
    id: 'reflective-day',
    name: '反思型一日',
    suitFor: 'user 当天聊天 ≥ 8 句, 想写一段长日记; 角色数任意',
    paperStyle: 'lined',
    pages: [[
        {
            id: 'A',
            slotRole: 'hero-diary',
            charBudget: [80, 180],
            eligibleAuthors: ['user', 'char'],
            hint: '今天的主日记,第一人称,只写 *今天* 真发生过的事,不要把过去的事编进来',
            xPct: 6, yPct: 8, widthPct: 56, maxHeightPct: 48,
            isHero: true,
        },
        {
            id: 'B',
            slotRole: 'sticky-reaction',
            charBudget: [20, 60],
            eligibleAuthors: ['char'],
            hint: '反应 hero-diary 里的某句, 短便签, 必须引用具体内容',
            xPct: 65, yPct: 10, widthPct: 30, maxHeightPct: 22,
            rotate: 1.8,
            skinVariant: 'lavender',
        },
        {
            id: 'C',
            slotRole: 'sticky-reaction',
            charBudget: [20, 60],
            eligibleAuthors: ['char'],
            hint: '另一个角色的反应 (不要重复 B 引的同一句)',
            xPct: 65, yPct: 36, widthPct: 30, maxHeightPct: 22,
            rotate: -1.5,
            skinVariant: 'mint',
        },
        {
            id: 'D',
            slotRole: 'gratitude',
            charBudget: [30, 80],
            eligibleAuthors: ['user'],
            hint: '今日感恩, 3 条, 每条 ≤ 22 字, 必须是今天发生的',
            xPct: 6, yPct: 60, widthPct: 50, maxHeightPct: 24,
        },
        {
            id: 'E',
            slotRole: 'mood-card',
            charBudget: [10, 30],
            eligibleAuthors: ['user', 'char'],
            hint: '今日心情 (≤25 字) + 评分',
            xPct: 60, yPct: 62, widthPct: 32, maxHeightPct: 18,
            rotate: 1,
            skinVariant: 'rose',
        },
        {
            id: 'F',
            slotRole: 'corner-note',
            charBudget: [6, 18],
            eligibleAuthors: ['char'],
            hint: '页脚一句小字独白, 任意角色',
            xPct: 6, yPct: 87, widthPct: 28, maxHeightPct: 7,
            rotate: -2,
        },
    ]],
};

// ─── C · photo-day · 图记一日 ─────────────────────────────
// user 贴一张照片为中心, 角色配文/吐槽
const PHOTO_DAY: LayoutTemplate = {
    id: 'photo-day',
    name: '图记一日',
    suitFor: 'user 今天有想配图的时刻 (旅游/吃到好东西/天空)',
    paperStyle: 'plain',
    pages: [[
        {
            id: 'A',
            slotRole: 'photo-caption',
            charBudget: [10, 25],
            eligibleAuthors: ['user'],
            hint: '今天的一张照片 + 短描述 (≤25 字)',
            xPct: 6, yPct: 8, widthPct: 44, maxHeightPct: 36,
            isHero: true,
        },
        {
            id: 'B',
            slotRole: 'hero-diary',
            charBudget: [60, 130],
            eligibleAuthors: ['user'],
            hint: '围绕照片的当日日记,只写今天,不要把以前的回忆当今天讲',
            xPct: 53, yPct: 8, widthPct: 41, maxHeightPct: 36,
        },
        {
            id: 'C',
            slotRole: 'sticky-reaction',
            charBudget: [20, 55],
            eligibleAuthors: ['char'],
            hint: '看了照片或日记后的反应, 必须明确引用 (例: "你说的那个___")',
            xPct: 6, yPct: 50, widthPct: 36, maxHeightPct: 20,
            rotate: -1.5,
            skinVariant: 'lavender',
        },
        {
            id: 'D',
            slotRole: 'sticky-reaction',
            charBudget: [20, 55],
            eligibleAuthors: ['char'],
            hint: '另一个反应, 引用不同细节',
            xPct: 48, yPct: 52, widthPct: 36, maxHeightPct: 20,
            rotate: 1.8,
            skinVariant: 'mint',
        },
        {
            id: 'E',
            slotRole: 'mood-card',
            charBudget: [10, 30],
            eligibleAuthors: ['user'],
            hint: '今日心情 (≤25 字) + 评分',
            xPct: 6, yPct: 76, widthPct: 30, maxHeightPct: 16,
            skinVariant: 'rose',
        },
        {
            id: 'F',
            slotRole: 'corner-note',
            charBudget: [6, 18],
            eligibleAuthors: ['user', 'char'],
            hint: '边角小字, 一句, 不解释',
            xPct: 64, yPct: 84, widthPct: 30, maxHeightPct: 8,
            rotate: 2,
        },
    ]],
};

// ─── D · quiet-day · 安静的一天 ────────────────────────────
// user 今天没怎么说话; 角色少 (≤ 1) 或没有
// 结构很轻, 留白多, 一句心情 + 一段独白
const QUIET_DAY: LayoutTemplate = {
    id: 'quiet-day',
    name: '安静的一天',
    suitFor: 'user 当天聊天 < 4 句, 没什么可写的',
    paperStyle: 'grid',
    pages: [[
        {
            id: 'A',
            slotRole: 'hero-diary',
            charBudget: [30, 90],
            eligibleAuthors: ['user'],
            hint: '今天没什么大事, 写一段平淡的当日记录, ≤ 80 字, 不要硬挤事件',
            xPct: 8, yPct: 24, widthPct: 84, maxHeightPct: 32,
            isHero: true,
        },
        {
            id: 'B',
            slotRole: 'mood-card',
            charBudget: [10, 30],
            eligibleAuthors: ['user'],
            hint: '今日心情 (≤25 字) + 评分',
            xPct: 8, yPct: 8, widthPct: 84, maxHeightPct: 14,
            skinVariant: 'rose',
        },
        {
            id: 'C',
            slotRole: 'corner-note',
            charBudget: [6, 18],
            eligibleAuthors: ['char'],
            hint: '一个角色路过留下的小字, 极短, 不必呼应 user',
            xPct: 60, yPct: 62, widthPct: 32, maxHeightPct: 8,
            rotate: -2,
        },
        {
            id: 'D',
            slotRole: 'corner-note',
            charBudget: [6, 18],
            eligibleAuthors: ['char'],
            hint: '另一个角色 / 同角色第二句小字',
            xPct: 8, yPct: 78, widthPct: 32, maxHeightPct: 8,
            rotate: 1.8,
        },
    ]],
};

// ─── E · ensemble-day · 群像热闹日 ─────────────────────────
// 角色 ≥ 3, user 主轴 + 多角色合奏
const ENSEMBLE_DAY: LayoutTemplate = {
    id: 'ensemble-day',
    name: '群像热闹日',
    suitFor: '当天有 ≥ 3 个角色, 想搞群像页',
    paperStyle: 'dot',
    pages: [[
        {
            id: 'A',
            slotRole: 'hero-diary',
            charBudget: [60, 140],
            eligibleAuthors: ['user'],
            hint: '今日主线日记, 第一人称, 只写今天发生的',
            xPct: 6, yPct: 8, widthPct: 54, maxHeightPct: 42,
            isHero: true,
        },
        {
            id: 'B',
            slotRole: 'sticky-reaction',
            charBudget: [18, 50],
            eligibleAuthors: ['char'],
            hint: '反应 hero-diary 的某点',
            xPct: 63, yPct: 8, widthPct: 32, maxHeightPct: 16,
            rotate: 1.8,
            skinVariant: 'lavender',
        },
        {
            id: 'C',
            slotRole: 'sticky-reaction',
            charBudget: [18, 50],
            eligibleAuthors: ['char'],
            hint: '另一个角色, 反应不同细节',
            xPct: 63, yPct: 28, widthPct: 32, maxHeightPct: 16,
            rotate: -1.4,
            skinVariant: 'mint',
        },
        {
            id: 'D',
            slotRole: 'sticky-reaction',
            charBudget: [18, 50],
            eligibleAuthors: ['char'],
            hint: '第三个反应, 可以呼应/反驳前两个 sticky',
            xPct: 63, yPct: 48, widthPct: 32, maxHeightPct: 16,
            rotate: 1.2,
            skinVariant: 'rose',
        },
        {
            id: 'E',
            slotRole: 'mood-card',
            charBudget: [10, 30],
            eligibleAuthors: ['user'],
            hint: '今日心情 + 评分',
            xPct: 6, yPct: 56, widthPct: 30, maxHeightPct: 16,
            skinVariant: 'sky',
        },
        {
            id: 'F',
            slotRole: 'gratitude',
            charBudget: [25, 70],
            eligibleAuthors: ['user'],
            hint: '今日感恩 3 条 (≤ 22 字 / 条), 必须是今天的事',
            xPct: 6, yPct: 76, widthPct: 56, maxHeightPct: 18,
        },
        {
            id: 'G',
            slotRole: 'corner-note',
            charBudget: [6, 18],
            eligibleAuthors: ['char'],
            hint: '页脚小字, 任意角色',
            xPct: 65, yPct: 86, widthPct: 30, maxHeightPct: 7,
            rotate: -1.8,
        },
    ]],
};

// ─── F · todo-focus · 待办主导 ─────────────────────────────
// user 今天就想列 todo + 写一两句感想
const TODO_FOCUS: LayoutTemplate = {
    id: 'todo-focus',
    name: '待办主导',
    suitFor: 'user 偏功能型记录, 今天就是来打勾的',
    paperStyle: 'grid',
    pages: [[
        {
            id: 'A',
            slotRole: 'todo',
            charBudget: [50, 130],
            eligibleAuthors: ['user'],
            hint: '今日待办, 5~8 项, 每项 ≤ 16 字',
            xPct: 6, yPct: 8, widthPct: 56, maxHeightPct: 56,
            isHero: true,
        },
        {
            id: 'B',
            slotRole: 'mood-card',
            charBudget: [10, 30],
            eligibleAuthors: ['user'],
            hint: '今日心情 + 评分',
            xPct: 65, yPct: 8, widthPct: 30, maxHeightPct: 18,
            skinVariant: 'lavender',
        },
        {
            id: 'C',
            slotRole: 'sticky-reaction',
            charBudget: [15, 45],
            eligibleAuthors: ['char'],
            hint: '看到 user 的 todo, 吐槽某一项 (引用具体一条)',
            xPct: 65, yPct: 30, widthPct: 30, maxHeightPct: 16,
            rotate: 1.6,
            skinVariant: 'mint',
        },
        {
            id: 'D',
            slotRole: 'sticky-reaction',
            charBudget: [15, 45],
            eligibleAuthors: ['char'],
            hint: '另一个角色 / 引另一项 todo',
            xPct: 65, yPct: 50, widthPct: 30, maxHeightPct: 16,
            rotate: -1.2,
            skinVariant: 'rose',
        },
        {
            id: 'E',
            slotRole: 'corner-note',
            charBudget: [6, 18],
            eligibleAuthors: ['user'],
            hint: '边角一句 user 自语',
            xPct: 6, yPct: 70, widthPct: 32, maxHeightPct: 7,
            rotate: -2,
        },
        {
            id: 'F',
            slotRole: 'corner-note',
            charBudget: [6, 18],
            eligibleAuthors: ['char'],
            hint: '页脚一句角色独白',
            xPct: 6, yPct: 86, widthPct: 32, maxHeightPct: 7,
            rotate: 2,
        },
    ]],
};

// ─── 模板表 ──────────────────────────────────────────────
export const LAYOUT_TEMPLATES: Record<string, LayoutTemplate> = {
    'plan-day': PLAN_DAY,
    'reflective-day': REFLECTIVE_DAY,
    'photo-day': PHOTO_DAY,
    'quiet-day': QUIET_DAY,
    'ensemble-day': ENSEMBLE_DAY,
    'todo-focus': TODO_FOCUS,
};

export const TEMPLATE_IDS = Object.keys(LAYOUT_TEMPLATES);

/**
 * 按当日条件选模板。 user 也可以手动覆盖。
 *
 * 规则:
 *  - userMsgCount < 4               → quiet-day
 *  - userHasPhotoIntent === true    → photo-day
 *  - charCount >= 3                 → ensemble-day
 *  - userMsgCount >= 8              → reflective-day
 *  - 其它                            → plan-day
 *
 * todo-focus 不会被自动选 (user 主动挑), 因为它需要明确 "今天就是来打勾" 意图。
 */
export function pickTemplate(opts: {
    userMsgCount: number;
    charCount: number;
    userHasPhotoIntent?: boolean;
}): LayoutTemplate {
    if (opts.userHasPhotoIntent) return PHOTO_DAY;
    if (opts.userMsgCount < 4) return QUIET_DAY;
    if (opts.charCount >= 3) return ENSEMBLE_DAY;
    if (opts.userMsgCount >= 8) return REFLECTIVE_DAY;
    return PLAN_DAY;
}

export function getTemplate(id: string): LayoutTemplate | null {
    return LAYOUT_TEMPLATES[id] || null;
}
