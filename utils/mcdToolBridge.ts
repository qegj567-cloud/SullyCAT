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

const CODE_LOOKUP_HINTS: Array<{ pattern: RegExp; hint: string }> = [
    { pattern: /list[-_]?nutrition[-_]?foods/i, hint: '需先有 foodCodes。先调用 query-meals / list-products 拿 code，再传 foodCodes 查询。' },
    { pattern: /product[-_]?detail/i, hint: '需先有 productCodes。先调用 query-meals / list-products 拿 code，再传 productCodes 查询。' },
    { pattern: /calculate[-_]?price/i, hint: '参数: { storeCode (必填), orderType (必填, 整数 1=到店 / 2=外送), items: [{productCode, quantity}], beCode (仅 orderType=2 时, 来自 delivery-query-address) }。orderType 必须是整数 1 或 2，不要传字符串。到店时不要传 beCode。productCode 必须从 query-meals / list-products 真实返回的 code，不要编。' },
    { pattern: /create[-_]?order/i, hint: '下单前先调 calculate-price 拿到 takeWayCode (到店时 create-order 必填)。参数: { storeCode, orderType (1/2), items: [{productCode, quantity}], takeWayCode (orderType=1 必填), addressId (orderType=2 必填), beCode (orderType=2 必填) }。orderType=1 + beCode=null。' },
];

const enrichToolDescription = (toolName: string, baseDesc: string): string => {
    const hit = CODE_LOOKUP_HINTS.find((r) => r.pattern.test(toolName));
    if (!hit) return baseDesc;
    // 直接把关键工作流写进工具描述，提升模型在 function-selection 阶段的命中率。
    return `${baseDesc}\n[重要] ${hit.hint}`;
};

export const mcdToolsToOpenAI = (tools: McdToolDef[]): OpenAITool[] => {
    return tools.map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: enrichToolDescription(t.name, t.description || `麦当劳 MCP 工具 ${t.name}`),
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
[麦当劳助手已开启]

你可以为用户调用麦当劳官方 (open.mcd.cn) 的 MCP 工具：查菜单、找附近门店、看活动、查积分券；用户明确同意时也可以帮 ta 创建外卖 / 到店取餐 / 团餐的订单。

简单几条:
1. 用户明确表达想吃 / 点餐 / 找门店 / 看活动时再调工具，日常闲聊不要调。
2. **工具结果会被前端自动渲染成漂亮卡片**（菜单卡、地址卡、门店卡等），用户已经能直观看到所有商品名、价格、图片。
   所以**不要在回复里把菜单/商品/地址一条条复读，更不要画 markdown 表格、列编码、列价格** —— 卡片已经做完这件事了，复读是重复劳动还会刷屏。
   除此以外，**该怎么聊就怎么聊**：保持角色平时的语气、长度、节奏、嘴贱程度，自然地把推荐 / 吐槽 / 关心 / 调侃 揉进对话里就行。可以是一两句也可以是一段话，看场合，但**不要写成客服腔的"菜单拉出来啦请选购"**那种工具感。
3. 创建订单前，先口语化念一下清单（商品、数量、取餐方式、地址、合计），等 ta 说"好 / 嗯 / 下吧"再继续。
4. 工具返回的数据都是实时真实数据，按返回内容说话，不要自己编商品和价格。
5. 角色人设和说话风格永远第一位，麦当劳服务只是你顺手帮 ta 做的事，不是你的身份。
6. 工具报错时如实告诉用户原因，给个下一步建议（重试 / 换门店 / 检查 token 等）。
7. **不要空调"按 code 查"类工具**（比如 list-nutrition-foods、product-detail 这种）。这类工具需要先有商品 code，得先调 query-meals / list-products 把 code 拿到手，再带 \`foodCodes\` / \`productCodes\` 参数去查。空调会失败。
8. 遇到"热量 ≤ X / 想吃炸的 / 预算 Y 元"这类需求时，工作流固定为两步：**先 query-meals/list-products 拉候选 + code** → 再对候选 code 调营养/详情工具精筛；不要跳步直接调详情工具。
9. **下单工作流（calculate-price → create-order）严格按下面来**：
   - \`calculate-price\` 入参 4 个字段都按这个形态：\`storeCode\` (从 query-stores / 菜单上下文里拿), \`orderType\` (**整数** 1=到店 / 2=外送，**不要传字符串 "1" 或 "DELIVERY"**), \`items\` (\`[{ productCode: "<真实 code>", quantity: <整数> }]\`，**productCode 必须来自 query-meals / list-products 返回的 code，不要自己编**), \`beCode\` (**只有 orderType=2 外送场景填**，值来自 \`delivery-query-address\`；到店时**不要传 beCode**)。
   - calculate-price 成功后会返回 \`takeWayCode\`，**到店模式 create-order 必填这个值**；外送模式则需要 \`addressId\`。
   - 如果 calculate-price 报错"上游返回空列表"，**99% 是上面 4 项参数有一项错了**：检查 productCode 是不是当前门店真有售、orderType 跟门店模式是否一致、外送是否漏传 beCode、到店是否多传了 beCode。先排查参数再换门店。
---
`;

/**
 * 尾部小提醒 (注入在 messages 数组的最后, 主消息之前)。
 *
 * 长 context 下模型注意力会衰减 (lost-in-the-middle), 头部的麦当劳提示词会被
 * 中段历史挤掉。激活态加一道短小的尾部 reminder, 让模型生成前最后看一眼规则。
 * 短到不会触发 content_filter, 也不会冲淡角色人设。
 */
export const MCD_TAIL_REMINDER = `[麦当劳助手 ON · 提醒: 工具结果前端有卡片自动展示, 别复读菜单/画 markdown 表格; 保持角色平时语气自然聊; 调 list-nutrition-foods / product-detail 前必须先 query-meals 或 list-products 拿 code, 不要跳步]`;

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

export type McdCardKind = 'menu' | 'order' | 'store' | 'coupon' | 'activity' | 'address' | 'generic';

const MENU_PATTERNS = [
    /menu/i, /meal/i, /food/i, /dish/i, /product/i, /goods/i, /sku/i,
    /菜单/, /商品/, /餐(?!厅)/, /套餐/, /单品/, /菜品/,
    /query.*meal/i, /query.*food/i, /query.*product/i, /list.*meal/i, /list.*product/i, /list.*food/i,
    /get.*meal/i, /get.*menu/i, /get.*product/i,
];
const STORE_PATTERNS = [/store/i, /shop/i, /restaurant/i, /门店/, /附近/, /nearby/i, /餐厅/];
const ADDRESS_PATTERNS = [/address/i, /地址/, /收货/, /consignee/i];
const COUPON_PATTERNS = [/coupon/i, /voucher/i, /券/, /redeem/i, /兑换/, /积分/, /point/i];
const ACTIVITY_PATTERNS = [/activity/i, /event/i, /campaign/i, /活动/, /日历/, /calendar/i, /promotion/i];
const ORDER_PATTERNS = [/order/i, /下单/, /订单/, /submit/i, /create.*order/i, /place.*order/i];

export const inferCardKind = (toolName: string): McdCardKind => {
    if (ORDER_PATTERNS.some(p => p.test(toolName))) return 'order';
    if (ADDRESS_PATTERNS.some(p => p.test(toolName))) return 'address';
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
