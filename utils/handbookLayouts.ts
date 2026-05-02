/**
 * 手账内页版式库 (v2)
 *
 * 6 套预置模板。一份 template = 一组带位置/容量/可写者/语义角色的槽 (SlotDef)。
 * orchestrator 按当天聊天活跃度 + 角色数 + 是否有照片 选模板,
 * 然后所有参与者 (user + 选中的角色) 按顺序在剩余槽里挑 1 个填或 pass。
 *
 * 哲学: "大家共写的一本手账", 不是 "user 主写 + 角色伴奏"。
 *  - user 没素材就完全跳过 user 步, 不留假货
 *  - 大部分槽 user/char 都能写 (hero-diary 可以是 user 今天的日记, 也可以是某角色今天的)
 *  - 只有 timeline-plan / todo / gratitude 是 user 专属 (user 的"计划/打卡"性质强)
 *  - sticky-reaction 永远 char-only, 永远要 refersTo
 *  - photo-caption 永远 user-only (照片只能 user 贴)
 *
 * 设计规则:
 *  - 每页 ≤ 7 个槽
 *  - 槽总占比 < 78% (留 ≥ 22% 真实留白)
 *  - 每页 ≤ 1 个 hero (isHero=true)
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
            hint: 'user 今天的时间表 / 计划表, 6~8 行, 每行 时间 + 一句要做的事(≤12 字)',
            xPct: 6, yPct: 8, widthPct: 52, maxHeightPct: 48,
            isHero: true,
        },
        {
            id: 'B',
            slotRole: 'mood-card',
            charBudget: [12, 40],
            eligibleAuthors: ['user', 'char'],
            hint: '今日心情速记 (≤30 字) + 1~5 颗星。可以是 user 自己, 也可以是某个角色路过留下 ta 今天的心情',
            xPct: 62, yPct: 10, widthPct: 32, maxHeightPct: 22,
            rotate: 1.5,
            skinVariant: 'lavender',
        },
        {
            id: 'C',
            slotRole: 'todo',
            charBudget: [30, 80],
            eligibleAuthors: ['user'],
            hint: 'user 今日待办, 3~5 项, 每项 ≤ 14 字',
            xPct: 62, yPct: 36, widthPct: 32, maxHeightPct: 32,
        },
        {
            id: 'D',
            slotRole: 'sticky-reaction',
            charBudget: [15, 50],
            eligibleAuthors: ['char'],
            hint: '看到本页某条已填的内容 (引用 slotId), 吐槽/捧场/补刀',
            xPct: 8, yPct: 60, widthPct: 36, maxHeightPct: 18,
            rotate: -1.2,
            skinVariant: 'mint',
        },
        {
            id: 'E',
            slotRole: 'sticky-reaction',
            charBudget: [15, 50],
            eligibleAuthors: ['char'],
            hint: '反应另一条已填内容 (跟 D 不同条) 或反应 D',
            xPct: 50, yPct: 64, widthPct: 36, maxHeightPct: 18,
            rotate: 1.5,
            skinVariant: 'rose',
        },
        {
            id: 'F',
            slotRole: 'corner-note',
            charBudget: [6, 20],
            eligibleAuthors: ['user', 'char'],
            hint: '边角小字, 一句独白/感叹, 不解释。任何人都可以留',
            xPct: 8, yPct: 86, widthPct: 30, maxHeightPct: 8,
            rotate: -2,
        },
    ]],
};

// ─── B · reflective-day · 反思型一日 ──────────────────────
// 大段日记 + 感恩 + 一两条 sticky;反思日, hero-diary 共写
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
            hint: '今日主日记本体, 第一人称。可以是 user 也可以是某个角色写自己今天发生的事',
            xPct: 6, yPct: 8, widthPct: 56, maxHeightPct: 48,
            isHero: true,
        },
        {
            id: 'B',
            slotRole: 'sticky-reaction',
            charBudget: [20, 60],
            eligibleAuthors: ['char'],
            hint: '反应 hero-diary 或其他已填槽里的某句, 短便签, 必须引用具体内容',
            xPct: 65, yPct: 10, widthPct: 30, maxHeightPct: 22,
            rotate: 1.8,
            skinVariant: 'lavender',
        },
        {
            id: 'C',
            slotRole: 'sticky-reaction',
            charBudget: [20, 60],
            eligibleAuthors: ['char'],
            hint: '另一个角色的反应 (不要重复 B 引的同一条)',
            xPct: 65, yPct: 36, widthPct: 30, maxHeightPct: 22,
            rotate: -1.5,
            skinVariant: 'mint',
        },
        {
            id: 'D',
            slotRole: 'gratitude',
            charBudget: [30, 80],
            eligibleAuthors: ['user'],
            hint: 'user 的今日感恩, 3 条, 每条 ≤ 22 字, 必须是今天发生的',
            xPct: 6, yPct: 60, widthPct: 50, maxHeightPct: 24,
        },
        {
            id: 'E',
            slotRole: 'mood-card',
            charBudget: [10, 30],
            eligibleAuthors: ['user', 'char'],
            hint: '今日心情 (≤25 字) + 评分。user / 角色都可以填自己的',
            xPct: 60, yPct: 62, widthPct: 32, maxHeightPct: 18,
            rotate: 1,
            skinVariant: 'rose',
        },
        {
            id: 'F',
            slotRole: 'corner-note',
            charBudget: [6, 18],
            eligibleAuthors: ['user', 'char'],
            hint: '页脚一句小字独白, 任何人',
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
            hint: 'user 今天的一张照片 + 短描述 (≤25 字)',
            xPct: 6, yPct: 8, widthPct: 44, maxHeightPct: 36,
            isHero: true,
        },
        {
            id: 'B',
            slotRole: 'hero-diary',
            charBudget: [60, 130],
            eligibleAuthors: ['user', 'char'],
            hint: '围绕照片 / 当日的日记。可以是 user, 也可以是某角色写 ta 今天的事',
            xPct: 53, yPct: 8, widthPct: 41, maxHeightPct: 36,
        },
        {
            id: 'C',
            slotRole: 'sticky-reaction',
            charBudget: [20, 55],
            eligibleAuthors: ['char'],
            hint: '看了照片或日记后的反应, 必须明确引用 (refersTo)',
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
            eligibleAuthors: ['user', 'char'],
            hint: '今日心情 + 评分。user / 角色都可',
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
// user 今天没怎么说话; 角色们各自留一笔, 像"大家路过的一本本子"
const QUIET_DAY: LayoutTemplate = {
    id: 'quiet-day',
    name: '安静的一天',
    suitFor: 'user 当天聊天 < 4 句; 角色们各自路过留一笔',
    paperStyle: 'grid',
    pages: [[
        {
            id: 'A',
            slotRole: 'hero-diary',
            charBudget: [40, 110],
            eligibleAuthors: ['user', 'char'],
            hint: '今天的一段记录。如果 user 没素材, 就让某个角色写自己今天的事',
            xPct: 8, yPct: 22, widthPct: 84, maxHeightPct: 32,
            isHero: true,
        },
        {
            id: 'B',
            slotRole: 'mood-card',
            charBudget: [10, 30],
            eligibleAuthors: ['user', 'char'],
            hint: '今日心情 (≤25 字) + 评分。user 没填就让角色填自己的',
            xPct: 8, yPct: 6, widthPct: 84, maxHeightPct: 14,
            skinVariant: 'rose',
        },
        {
            id: 'C',
            slotRole: 'corner-note',
            charBudget: [6, 18],
            eligibleAuthors: ['user', 'char'],
            hint: '一句小字, 任何人',
            xPct: 60, yPct: 60, widthPct: 32, maxHeightPct: 8,
            rotate: -2,
        },
        {
            id: 'D',
            slotRole: 'corner-note',
            charBudget: [6, 18],
            eligibleAuthors: ['user', 'char'],
            hint: '另一句小字',
            xPct: 8, yPct: 76, widthPct: 32, maxHeightPct: 8,
            rotate: 1.8,
        },
        {
            id: 'E',
            slotRole: 'sticky-reaction',
            charBudget: [12, 40],
            eligibleAuthors: ['char'],
            hint: '可选: 反应别人写的内容 (refersTo)。没人写就 pass',
            xPct: 56, yPct: 78, widthPct: 36, maxHeightPct: 14,
            rotate: 1.2,
            skinVariant: 'mint',
        },
    ]],
};

// ─── E · ensemble-day · 群像热闹日 ─────────────────────────
// 角色 ≥ 3, 大家一起写, 多 hero 共构
const ENSEMBLE_DAY: LayoutTemplate = {
    id: 'ensemble-day',
    name: '群像热闹日',
    suitFor: '当天有 ≥ 3 个角色, 大家共写',
    paperStyle: 'dot',
    pages: [[
        {
            id: 'A',
            slotRole: 'hero-diary',
            charBudget: [60, 140],
            eligibleAuthors: ['user', 'char'],
            hint: '今日主线日记。第一人称, 谁写都行 (写自己今天发生的)',
            xPct: 6, yPct: 8, widthPct: 54, maxHeightPct: 42,
            isHero: true,
        },
        {
            id: 'B',
            slotRole: 'sticky-reaction',
            charBudget: [18, 50],
            eligibleAuthors: ['char'],
            hint: '反应已填某条 (refersTo)',
            xPct: 63, yPct: 8, widthPct: 32, maxHeightPct: 16,
            rotate: 1.8,
            skinVariant: 'lavender',
        },
        {
            id: 'C',
            slotRole: 'mood-card',
            charBudget: [10, 30],
            eligibleAuthors: ['user', 'char'],
            hint: '心情卡, 谁写都行 (写自己的)',
            xPct: 63, yPct: 28, widthPct: 32, maxHeightPct: 16,
            skinVariant: 'mint',
        },
        {
            id: 'D',
            slotRole: 'sticky-reaction',
            charBudget: [18, 50],
            eligibleAuthors: ['char'],
            hint: '另一个反应, 可以呼应/反驳前面的 sticky',
            xPct: 63, yPct: 48, widthPct: 32, maxHeightPct: 16,
            rotate: 1.2,
            skinVariant: 'rose',
        },
        {
            id: 'E',
            slotRole: 'corner-note',
            charBudget: [6, 20],
            eligibleAuthors: ['user', 'char'],
            hint: '边角小字, 任何人',
            xPct: 6, yPct: 56, widthPct: 30, maxHeightPct: 8,
            skinVariant: 'sky',
            rotate: -1.5,
        },
        {
            id: 'F',
            slotRole: 'gratitude',
            charBudget: [25, 70],
            eligibleAuthors: ['user'],
            hint: 'user 的今日感恩 3 条 (≤ 22 字 / 条)',
            xPct: 6, yPct: 70, widthPct: 56, maxHeightPct: 22,
        },
        {
            id: 'G',
            slotRole: 'corner-note',
            charBudget: [6, 18],
            eligibleAuthors: ['user', 'char'],
            hint: '页脚小字, 任何人',
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
            hint: 'user 今日待办, 5~8 项, 每项 ≤ 16 字',
            xPct: 6, yPct: 8, widthPct: 56, maxHeightPct: 56,
            isHero: true,
        },
        {
            id: 'B',
            slotRole: 'mood-card',
            charBudget: [10, 30],
            eligibleAuthors: ['user', 'char'],
            hint: '今日心情 + 评分 (谁的都行)',
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
            eligibleAuthors: ['user', 'char'],
            hint: '边角一句独白',
            xPct: 6, yPct: 70, widthPct: 32, maxHeightPct: 7,
            rotate: -2,
        },
        {
            id: 'F',
            slotRole: 'corner-note',
            charBudget: [6, 18],
            eligibleAuthors: ['user', 'char'],
            hint: '页脚一句独白',
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
