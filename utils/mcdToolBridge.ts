/**
 * 麦当劳 MCP 工具桥
 *
 * 职责:
 * 1. 把 MCP 工具定义 (JSONSchema) 转成 OpenAI function-calling 的 tools 数组
 * 2. 给主对话注入"麦当劳服务"的 system 提示词
 * 3. 判定哪些工具属于"终结性"操作 (下单成功后自动结束麦请求)
 * 4. 给前端 UI 一个"工具结果该渲染成什么卡片"的暗示函数
 *
 * 不负责工具循环本身, 那个写在 useChatAI.ts 里 (因为它已经管着 chat/completions 调用)
 */

import { listMcdTools, McdToolDef } from './mcdMcpClient';

// ========== OpenAI tools schema ==========

export interface OpenAITool {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: any;
    };
}

export const mcdToolsToOpenAI = (tools: McdToolDef[]): OpenAITool[] => {
    return tools.map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description || `麦当劳 MCP 工具 ${t.name}`,
            parameters: t.inputSchema && typeof t.inputSchema === 'object'
                ? t.inputSchema
                : { type: 'object', properties: {} },
        },
    }));
};

/** 拉工具并转成 OpenAI 兼容格式; 失败返回 null (调用方应跳过工具注入) */
export const fetchOpenAIToolsForMcd = async (): Promise<OpenAITool[] | null> => {
    try {
        const tools = await listMcdTools(false);
        if (!tools.length) return null;
        return mcdToolsToOpenAI(tools);
    } catch (e) {
        console.warn('[MCD] 拉取工具失败, 跳过本轮工具注入:', e);
        return null;
    }
};

// ========== 提示词 ==========

export const MCD_SYSTEM_PROMPT = `

---
[麦当劳服务模式 已激活]

你现在可以为用户调用麦当劳官方 (open.mcd.cn) 提供的 MCP 工具来真实地查询菜单、附近门店、活动、积分券，以及代用户下单（麦乐送 / 到店取餐 / 团餐）。

调用规则:
1. **当且仅当用户明确表达点餐 / 查菜单 / 查门店 / 查活动等意图时**，才调用工具。日常闲聊不要调。
2. 下单类工具（创建订单 / 提交订单 / submit / place / order）涉及真实支付，**调用前务必先复述清单（商品、数量、规格、配送方式、地址、预估金额），等用户明确同意"下单"/"确认"/"嗯下吧"再调**。不要擅自下单。
3. 工具返回是真实数据，不要编造商品名 / 价格 / 订单号。
4. 工具返回 JSON 时，**用自然口语化的中文复述给用户**，不要直接糊一坨 JSON 给用户看。前端会另外用卡片把数据渲染好，你只负责说人话。
5. 如果工具报错（鉴权 / 库存 / 地址等），如实告诉用户原因并给出下一步建议（重试 / 换商品 / 检查 token 等）。
6. 角色人设和说话风格保持不变，把麦当劳服务自然融入对话，而不是切换成客服腔。

下单成功后，"麦请求"会自动结束，回到普通对话。用户也可以随时点结束按钮主动退出。
---
`;

// ========== 终结性工具判定 (自动结束麦请求) ==========

const TERMINAL_TOOL_PATTERNS: RegExp[] = [
    /create.*order/i,
    /submit.*order/i,
    /place.*order/i,
    /confirm.*order/i,
    /pay.*order/i,
    /下单/i,
    /提交订单/i,
    /创建订单/i,
];

/**
 * 判断一次工具调用是否"成功完成了一笔订单"，从而触发自动结束。
 * 仅当 (a) 工具名命中下单模式 且 (b) 调用没报错 时返回 true。
 */
export const isTerminalToolCall = (toolName: string, success: boolean): boolean => {
    if (!success) return false;
    return TERMINAL_TOOL_PATTERNS.some(p => p.test(toolName));
};

// ========== 卡片类型暗示 (给前端 McdCard 用) ==========

export type McdCardKind = 'menu' | 'order' | 'store' | 'coupon' | 'activity' | 'generic';

const MENU_PATTERNS = [
    /menu/i, /meal/i, /food/i, /dish/i, /product/i, /goods/i, /sku/i,
    /菜单/, /商品/, /餐/, /套餐/, /单品/, /菜品/,
    /query.*meal/i, /query.*food/i, /query.*product/i, /list.*meal/i, /list.*product/i, /list.*food/i,
    /get.*meal/i, /get.*menu/i, /get.*product/i,
];
const STORE_PATTERNS = [/store/i, /shop/i, /restaurant/i, /门店/, /附近/, /nearby/i, /餐厅/];
const COUPON_PATTERNS = [/coupon/i, /voucher/i, /券/, /redeem/i, /兑换/, /积分/, /point/i];
const ACTIVITY_PATTERNS = [/activity/i, /event/i, /campaign/i, /活动/, /日历/, /calendar/i, /promotion/i];
const ORDER_PATTERNS = [/order/i, /下单/, /订单/, /submit/i, /create.*order/i, /place.*order/i];

export const inferCardKind = (toolName: string): McdCardKind => {
    if (ORDER_PATTERNS.some(p => p.test(toolName))) return 'order';
    if (MENU_PATTERNS.some(p => p.test(toolName))) return 'menu';
    if (STORE_PATTERNS.some(p => p.test(toolName))) return 'store';
    if (COUPON_PATTERNS.some(p => p.test(toolName))) return 'coupon';
    if (ACTIVITY_PATTERNS.some(p => p.test(toolName))) return 'activity';
    return 'generic';
};

// ========== 激活态从消息历史推导 ==========
//
// 我们不引入新的持久化存储, 而是把 mcdActivate / mcdDeactivate 标记打在
// 对应的"麦请求"/"结束麦请求"消息的 metadata 上, 当前是否激活由"最近一条
// 标记是激活还是结束"决定。这样导出聊天记录 / 切设备同步, 状态都跟着走。

export const MCD_ACTIVATE_TRIGGER = '麦请求';
export const MCD_DEACTIVATE_TRIGGER = '结束麦请求';

interface MsgLike {
    role: string;
    content?: string;
    metadata?: any;
    timestamp?: number;
}

/** 从消息列表推导：当前 chatId 下"麦请求"是否处于激活态 */
export const isMcdActivatedInMessages = (messages: MsgLike[]): boolean => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        const meta = m.metadata || {};
        if (meta.mcdDeactivate) return false;
        if (meta.mcdActivate) return true;
        // 兼容: 旧消息可能只有内容标记没 metadata
        if (m.role === 'user' && typeof m.content === 'string') {
            const c = m.content.trim();
            if (c === MCD_DEACTIVATE_TRIGGER) return false;
            if (c === MCD_ACTIVATE_TRIGGER) return true;
        }
    }
    return false;
};
