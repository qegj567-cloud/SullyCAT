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
    { pattern: /^list[-_]?nutrition[-_]?foods$/i, hint: '该工具入参为空, 直接调用即可拿到全部餐品的营养信息 (toon 紧凑格式)。' },
    { pattern: /^query[-_]?meal[-_]?detail$/i, hint: '需先有 code。先调用 query-meals 拿到餐品 code (单数 string)，再传 code + storeCode + orderType 查套餐组成。**仅用于让用户看套餐里都有什么子单品**, 当前版本 v1.0.3 不支持更换套餐内单品, 不要试图用此工具的输出去拼 calculate-price 的 items, 套餐下单直接用顶层套餐 productCode 即可。' },
    { pattern: /^query[-_]?meals$/i, hint: '查门店菜单。必填 storeCode + orderType (整数 1=到店 / 2=外送)。外送时还要传 beCode (来自 delivery-query-addresses)。返回的 meals 字典里, key 是 code, 后续 calculate-price/query-meal-detail 都用这个 code。' },
    { pattern: /^calculate[-_]?price$/i, hint: '参数: { storeCode (必填), orderType (必填, **整数** 1=到店 / 2=外送), items: [{productCode, quantity}], beCode (仅 orderType=2 时, 来自 delivery-query-addresses) }。orderType 必须是整数 1 或 2，不要传字符串。到店时不要传 beCode。productCode 必须从 query-meals 返回的 meals 字典 key 拿，不要编。' },
    { pattern: /^create[-_]?order$/i, hint: '下单前先调 calculate-price 拿 takeWayCode (到店必填)。参数: { storeCode, orderType (1/2), items: [{productCode, quantity}], takeWayCode (orderType=1 必填), addressId (orderType=2 必填), beCode (orderType=2 必填) }。' },
    { pattern: /^delivery[-_]?query[-_]?addresses$/i, hint: '查询用户外送地址。入参 beType (整数, 麦乐送=2, 团餐=6)。返回的 addresses 数组每项都带 storeCode + beCode + addressId, 这些是后续 query-meals / calculate-price / create-order 的关键。' },
    { pattern: /^query[-_]?nearby[-_]?stores$/i, hint: '查附近门店, 用于到店模式。searchType=1 收藏 / =2 按位置, beType 默认 1。返回数组里每项有 storeCode + beCode。' },
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
7. **不要空调 query-meal-detail**: 这工具按 code 查餐品详情，必须先 \`query-meals\` 拿到餐品 code 再调用，参数是单数 string \`code\`。
8. 遇到"热量 ≤ X / 想吃炸的 / 预算 Y 元"这类需求时，直接调 \`list-nutrition-foods\` (无入参) 拿全量营养表筛即可，不要绕到 query-meals。
9. **下单工作流（query-meals → calculate-price → create-order）严格按下面来**：
   - 第一步定门店模式: 到店 → \`query-nearby-stores\` 拿 storeCode (orderType=1, 不要 beCode); 外送 → \`delivery-query-addresses\` (beType=2 麦乐送 / 6 团餐) 拿 addressId + storeCode + beCode (orderType=2)。
   - 第二步拉菜单: \`query-meals\` (storeCode + orderType + 外送时 beCode), 返回的 \`data.meals\` 是 \`{code: {name, currentPrice}}\` 字典, **后续 productCode 必须来自这里的 key，不要编**。
   - 第三步算价: \`calculate-price\` 4 个字段：\`storeCode\`, \`orderType\` (**整数** 1 / 2，**不要传字符串 "1" 或 "DELIVERY"**), \`items: [{ productCode: "<真实 code>", quantity: <整数> }]\`, \`beCode\` (**只有 orderType=2 外送场景填**，到店时**不要传 beCode**)。返回的 \`takeWayList\` 包含 takeWayCode。
   - 第四步下单: \`create-order\` 同样 4 字段 + 到店必填 \`takeWayCode\` (从 calculate-price 拿) / 外送必填 \`addressId\` (从 delivery-query-addresses 拿)。
   - 如果 calculate-price 报错"上游返回空列表"，**99% 是上面参数有一项错了**：检查 productCode 是不是 query-meals 真返回过的、orderType 是否整数且匹配模式、外送是否漏传 beCode、到店是否多传了 beCode。先排查参数再换门店。
10. **套餐怎么下单 (重要, 模型在这里经常卡住)**：
   - 套餐 (比如"培根安格斯厚牛堡大套餐") 在 \`query-meals\` 返回的 \`meals\` 字典里就是一个顶层 code, **跟单品地位完全一样**。下单时直接把套餐的 productCode 塞进 \`items[]\`、\`quantity:1\` 就行, 上游会自动用默认子单品组合。
   - \`query-meal-detail\` **只用来给用户看套餐组成**（汉堡、薯条、可乐分别是什么），**不是用来选子单品的**。官方文档明写：当前版本 v1.0.3 **不支持更换套餐内的单品**, 你也别尝试逐 round 选 choices 再传给 calculate-price/create-order, 那样要么报错要么把套餐拆成单点丢掉套餐价。
   - 如果用户说"我想要 X 套餐", 直接走 query-meals → 找到该套餐的 code → 进 items 算价下单, **不要中途调 query-meal-detail 折腾**, 顶多在用户问"这套餐里都有啥"时调一次给 ta 看看然后回到主流程。
11. **productCode 形态识别 (避免券 code 用错)**:
   - 真实麦当劳 productCode **全是纯数字**, 比如 \`9900008139\`, \`920215\`, \`1533\`, \`521517\`, 来自 \`query-meals\` 返回的 \`meals\` 字典 key。
   - **字母开头的 code (如 \`W000002024\`) 几乎都是优惠券商品 spu code**, 出现在 \`query-store-coupons\` / \`available-coupons\` / \`query-my-coupons\` 这类工具的返回里。这类 code **不能单独塞进 items**, 必须在同一个 item 里**同时**带上 \`couponId\` 和 \`couponCode\` (从该券对象里取), 否则上游会拒绝并返回空列表:
     \`\`\`
     items: [{ productCode: "<券 spu code>", quantity: 1, couponId: "<...>", couponCode: "<...>" }]
     \`\`\`
   - 如果用户没明确说要用券, **不要主动塞券 code**, 用 query-meals 的纯数字 productCode 即可。
---
`;

/**
 * 尾部小提醒 (注入在 messages 数组的最后, 主消息之前)。
 *
 * 长 context 下模型注意力会衰减 (lost-in-the-middle), 头部的麦当劳提示词会被
 * 中段历史挤掉。激活态加一道短小的尾部 reminder, 让模型生成前最后看一眼规则。
 * 短到不会触发 content_filter, 也不会冲淡角色人设。
 */
export const MCD_TAIL_REMINDER = `[麦当劳助手 ON · 提醒: 工具结果前端有卡片自动展示, 别复读菜单/画 markdown 表格; 保持角色平时语气自然聊; 下单链路严格走 query-nearby-stores 或 delivery-query-addresses → query-meals → calculate-price → create-order; orderType 是整数 1/2, 到店不传 beCode, 外送 beCode 来自 delivery-query-addresses; productCode 必须来自 query-meals 返回的 meals 字典 key; 套餐就用 meals 里那个顶层 code 直接下单, 不要拆解套餐, query-meal-detail 仅用于给用户看套餐组成]`;

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

// ========== McdMiniApp 协同模式: 给主 systemPrompt 追加的上下文块 ==========
//
// 跟 LLM-tool-call 那条死路完全不同, 这里 LLM 只负责聊天, 不调任何工具。
// 所以注入的不是工具说明也不是人设替代, 只是"当前小程序里的实时状态 + 协同规则"。
// 主 systemPrompt 的人设、记忆、日程、情绪 全部保留, 这段就是末尾贴一张快照。

export interface McdMiniAppSnapshot {
    open: boolean;
    step?: 'mode' | 'pick' | 'menu' | 'review';
    orderType?: 1 | 2;
    storeCode?: string;
    storeName?: string;
    addressLabel?: string;
    cart?: Array<{ code: string; name: string; price?: any; qty: number }>;
    /** query-meals 当前门店菜单 (data.meals 字典) */
    menuMeals?: Record<string, { name?: string; currentPrice?: string }>;
    /** list-nutrition-foods 返回的 toon 字符串 */
    nutritionData?: string;
}

export const buildMcdMiniAppContextBlock = (snap?: McdMiniAppSnapshot, userName: string = '用户'): string => {
    if (!snap || !snap.open) return '';
    const lines: string[] = [];
    lines.push('');
    lines.push('---');
    lines.push(`[麦当劳协同点餐 — ${userName} 现在打开了麦当劳小程序, 跟你一起选餐]`);
    lines.push('');
    lines.push('# 当前状态 (实时)');
    lines.push(`- 步骤: ${snap.step === 'mode' ? '选模式' : snap.step === 'pick' ? '选地址/门店' : snap.step === 'menu' ? '浏览菜单' : snap.step === 'review' ? '确认订单' : '?'}`);
    if (snap.orderType) lines.push(`- 取餐方式: ${snap.orderType === 1 ? '到店取餐' : '麦乐送外卖'}`);
    if (snap.storeName || snap.storeCode) lines.push(`- 门店: ${snap.storeName || snap.storeCode}`);
    if (snap.addressLabel) lines.push(`- 收货地址: ${snap.addressLabel}`);
    const cart = snap.cart || [];
    if (cart.length) {
        const total = cart.reduce((s, l) => {
            const p = typeof l.price === 'string' ? parseFloat(l.price) : (typeof l.price === 'number' ? l.price : 0);
            return s + (isFinite(p) ? p * l.qty : 0);
        }, 0);
        lines.push(`- 购物车 (${cart.length} 项, 合计 ¥${total.toFixed(2)}):`);
        for (const l of cart) {
            const p = typeof l.price === 'string' ? parseFloat(l.price) : (typeof l.price === 'number' ? l.price : 0);
            lines.push(`    · ${l.name} ×${l.qty}${isFinite(p) && p > 0 ? ` (¥${p.toFixed(2)}/份)` : ''}`);
        }
    } else {
        lines.push(`- 购物车: 空`);
    }
    lines.push('');

    if (snap.menuMeals && Object.keys(snap.menuMeals).length) {
        const entries = Object.entries(snap.menuMeals).slice(0, 80);
        lines.push(`# 当前门店在售 (前 ${entries.length} 项, 推荐时从这里挑)`);
        for (const [, m] of entries) {
            const v = m as any;
            if (!v?.name) continue;
            lines.push(`- ${v.name}${v.currentPrice ? ` ¥${v.currentPrice}` : ''}`);
        }
        lines.push('');
    }

    if (snap.nutritionData) {
        lines.push(`# 全量营养表 (toon 紧凑表; 头部是字段名顺序)`);
        lines.push(`用户问热量/蛋白质/脂肪/碳水时, 直接查这表回答, 不要自己编。`);
        lines.push('');
        const nd = snap.nutritionData;
        lines.push(nd.length > 6000 ? nd.slice(0, 6000) + '\n...(截断)' : nd);
        lines.push('');
    }

    lines.push(`# 协同规则 (这段优先级高于其它通用规则)`);
    lines.push(`- ${userName} 在小程序里跟你聊"吃啥 / 帮我挑 / 这个怎么样", 你按平时人设自然回应。`);
    lines.push(`- 推荐时**直接念商品名 + 简短理由** (例: "推荐麦辣鸡腿堡, 428 大卡顶饿"), 让 ${userName} 自己点小程序里那个 + 加进购物车。`);
    lines.push(`- **不要画 markdown 表格 / 不要贴 productCode / 不要复述全部菜单**, 那些信息小程序界面已经在显示。`);
    lines.push(`- 用户问热量/营养 → 在营养表里查准确数值再答。"挑 X 大卡以内"这种 → 在营养表里筛能凑出组合的, 同时尽量挑当前门店在售的。`);
    lines.push(`- 用户已经选了东西, 看一眼购物车给点评 (够不够吃 / 配不配饮料 / 有没有重的), 但不要复读购物车清单。`);
    lines.push(`- **你不能直接改购物车 / 不能直接下单**, 加减、敲定都要用户在小程序里自己点。但可以引导。`);
    lines.push('---');
    return lines.join('\n');
};

//
// 模型每轮调工具的结果都存进 mcd_card 消息里 (见 useChatAI.ts), 但跨轮时
// JSON 字符串塞在 tool/assistant content 里很容易被注意力衰减, 模型经常
// "上一轮明明拿到了 storeCode, 这一轮就忘了"。
//
// 解法: 每次构 system prompt 时, 反向扫一遍当前激活区间内的 mcd_card,
//      把 storeCode / beCode / orderType / addressId / takeWayCode /
//      已见过的 productCode 抽出来, 编一段紧凑的"当前会话状态"塞进
//      system prompt。占用不到几百 token, 但模型每轮都能一眼看到正确 ID。

interface McdAddressTriplet {
    addressId?: string;
    storeCode?: string;
    beCode?: string;
    label?: string;
}

interface McdStoreEntry {
    storeCode?: string;
    beCode?: string;
    storeName?: string;
}

interface McdSessionState {
    storeCode?: string;
    storeName?: string;
    beCode?: string;
    orderType?: 1 | 2;
    addressId?: string;
    addressLabel?: string;
    takeWayCode?: string;
    knownProductCodes: Array<{ code: string; name?: string; price?: string | number }>;
    /** 全部已查到的外送地址 (用同一条里的 storeCode + beCode, 不要混搭) */
    addresses: McdAddressTriplet[];
    /** 全部已查到的附近门店 */
    nearbyStores: McdStoreEntry[];
    lastOrderId?: string;
}

const pickStr = (obj: any, keys: string[]): string | undefined => {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const k of keys) {
        const v = obj[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
        if (typeof v === 'number') return String(v);
    }
    return undefined;
};

const collectProductCodes = (mealsResult: any): Array<{ code: string; name?: string; price?: string }> => {
    const out: Array<{ code: string; name?: string; price?: string }> = [];
    if (!mealsResult) return out;
    // query-meals 返回结构: data.meals = { code: { name, currentPrice } }
    const meals = mealsResult.meals && typeof mealsResult.meals === 'object' && !Array.isArray(mealsResult.meals)
        ? mealsResult.meals : null;
    if (meals) {
        for (const code of Object.keys(meals)) {
            const m = meals[code];
            if (!m || typeof m !== 'object') continue;
            out.push({
                code,
                name: typeof m.name === 'string' ? m.name : undefined,
                price: typeof m.currentPrice === 'string' ? m.currentPrice : (typeof m.currentPrice === 'number' ? String(m.currentPrice) : undefined),
            });
        }
    }
    return out;
};

/**
 * 反向扫描当前激活区间内的 mcd_card 消息, 把关键 ID 抽出来。
 * 遇到 mcdActivate 之前 / mcdDeactivate 之后就停 (上一段会话的状态不要带过来)。
 */
export const extractMcdSessionState = (messages: MsgLike[]): McdSessionState => {
    const state: McdSessionState = { knownProductCodes: [], addresses: [], nearbyStores: [] };
    // 先确定本次激活区间起点 (最近一次 mcdActivate)
    let activateIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        const meta = m.metadata || {};
        if (meta.mcdDeactivate) break;
        if (meta.mcdActivate || (m.role === 'user' && typeof m.content === 'string' && m.content.trim() === MCD_ACTIVATE_TRIGGER)) {
            activateIdx = i;
            break;
        }
    }
    if (activateIdx === -1) return state;

    // 从激活点往后扫, 后面的 tool 结果覆盖前面的 (除了 productCodes 是累积)
    const seenCodes = new Set<string>();
    for (let i = activateIdx; i < messages.length; i++) {
        const m: any = messages[i];
        const meta = m.metadata || {};
        if (meta.mcdDeactivate) break;
        if ((m.type as string) !== 'mcd_card') continue;
        const tool = String(meta.mcdToolName || '').toLowerCase();
        const args = meta.mcdToolArgs || {};
        const result = meta.mcdToolResult;
        if (meta.mcdToolError || result == null) continue;

        // calculate-price / create-order: args 里的 storeCode/orderType/beCode 就是模型当时
        // 用的, 是最权威的 "当前会话决策状态"
        if (/calculate[-_]?price|create[-_]?order/.test(tool)) {
            if (args.storeCode) state.storeCode = String(args.storeCode);
            if (args.beCode) state.beCode = String(args.beCode);
            if (args.orderType === 1 || args.orderType === '1') state.orderType = 1;
            else if (args.orderType === 2 || args.orderType === '2') state.orderType = 2;
            if (args.addressId) state.addressId = String(args.addressId);
        }

        // delivery-query-addresses: 把每条地址的 (addressId, storeCode, beCode) 三元组都存下来,
        // 模型选地址时必须用同一条里成对的 storeCode + beCode, 不能混搭
        if (/delivery[-_]?query[-_]?addresses/.test(tool)) {
            const list = result.addresses || result;
            const arr = Array.isArray(list) ? list : [];
            for (const a of arr) {
                if (!a || typeof a !== 'object') continue;
                const triplet: McdAddressTriplet = {
                    addressId: pickStr(a, ['addressId', 'id']),
                    storeCode: pickStr(a, ['storeCode']),
                    beCode: pickStr(a, ['beCode']),
                    label: pickStr(a, ['fullAddress', 'address', 'storeName']),
                };
                if (triplet.addressId || triplet.storeCode) {
                    // 去重 (按 addressId)
                    const key = triplet.addressId || `${triplet.storeCode}|${triplet.beCode}`;
                    if (!state.addresses.some(x => (x.addressId || `${x.storeCode}|${x.beCode}`) === key)) {
                        state.addresses.push(triplet);
                    }
                }
            }
            const first = arr[0];
            if (first && typeof first === 'object') {
                state.addressId = state.addressId || pickStr(first, ['addressId', 'id']);
                state.storeCode = state.storeCode || pickStr(first, ['storeCode']);
                state.beCode = state.beCode || pickStr(first, ['beCode']);
                state.addressLabel = state.addressLabel || pickStr(first, ['fullAddress', 'address']);
                if (state.orderType == null) state.orderType = 2; // 调了外送地址 = 外送模式
            }
        }

        // query-nearby-stores: 每家门店的 storeCode/beCode 都记下来
        if (/query[-_]?nearby[-_]?stores/.test(tool)) {
            const list = Array.isArray(result) ? result : (result?.stores || result?.list);
            const arr = Array.isArray(list) ? list : [];
            for (const s of arr) {
                if (!s || typeof s !== 'object') continue;
                const entry: McdStoreEntry = {
                    storeCode: pickStr(s, ['storeCode']),
                    beCode: pickStr(s, ['beCode']),
                    storeName: pickStr(s, ['storeName', 'name']),
                };
                if (entry.storeCode && !state.nearbyStores.some(x => x.storeCode === entry.storeCode)) {
                    state.nearbyStores.push(entry);
                }
            }
            const first = arr[0];
            if (first && typeof first === 'object') {
                if (!state.storeCode) state.storeCode = pickStr(first, ['storeCode']);
                if (!state.beCode) state.beCode = pickStr(first, ['beCode']);
                state.storeName = state.storeName || pickStr(first, ['storeName', 'name']);
                if (state.orderType == null) state.orderType = 1; // 查附近门店 = 到店模式
            }
        }

        // query-meals: 拉到 productCode 字典, 累积起来
        if (/query[-_]?meals/.test(tool)) {
            if (args.storeCode && !state.storeCode) state.storeCode = String(args.storeCode);
            if (args.beCode && !state.beCode) state.beCode = String(args.beCode);
            const codes = collectProductCodes(result);
            for (const c of codes) {
                if (!seenCodes.has(c.code)) {
                    seenCodes.add(c.code);
                    state.knownProductCodes.push(c);
                }
            }
        }

        // calculate-price 成功响应里 takeWayList[0].takeWayCode 就是到店下单要用的
        if (/calculate[-_]?price/.test(tool)) {
            const tw = result?.takeWayList;
            if (Array.isArray(tw) && tw.length) {
                const code = pickStr(tw[0], ['takeWayCode', 'code']);
                if (code) state.takeWayCode = code;
            }
        }

        // create-order 成功 → 拿 orderId
        if (/create[-_]?order/.test(tool)) {
            const oid = pickStr(result, ['orderId']) || pickStr(result?.orderDetail, ['orderId']);
            if (oid) state.lastOrderId = oid;
        }
    }
    return state;
};

/**
 * 把 session state 编译成一段紧凑的 system prompt 段落。无任何已知字段时返回空串,
 * 调用方拿到空串就不用往 prompt 里塞这段。
 */
export const buildMcdSessionContextPrompt = (state: McdSessionState): string => {
    const lines: string[] = [];
    if (state.orderType) {
        lines.push(`- 取餐模式: orderType=${state.orderType} (${state.orderType === 1 ? '到店' : '外送'})`);
    }
    if (state.storeCode) {
        lines.push(`- 当前选中 storeCode: ${state.storeCode}${state.storeName ? ` (${state.storeName})` : ''}`);
    }
    if (state.beCode) {
        lines.push(`- 当前选中 beCode: ${state.beCode}`);
    } else if (state.orderType === 1) {
        lines.push(`- beCode: 不传 (到店模式)`);
    }
    if (state.addressId) {
        lines.push(`- 当前选中 addressId: ${state.addressId}${state.addressLabel ? ` (${state.addressLabel})` : ''}`);
    }
    if (state.takeWayCode) {
        lines.push(`- takeWayCode: ${state.takeWayCode} (到店模式 create-order 直接用这个)`);
    }
    if (state.lastOrderId) {
        lines.push(`- 最近 orderId: ${state.lastOrderId}`);
    }
    if (state.addresses.length > 1) {
        // 列出全部外送地址, 让模型知道每条地址的 storeCode/beCode 是绑定的, 不能混搭
        const addrLines = state.addresses.map((a, i) => {
            const tag = a.addressId === state.addressId ? ' ← 当前选中' : '';
            return `    ${i + 1}. addressId=${a.addressId || '?'} | storeCode=${a.storeCode || '?'} | beCode=${a.beCode || '?'} | ${a.label || ''}${tag}`;
        }).join('\n');
        lines.push(`- 全部已知外送地址 (storeCode + beCode 必须用同一行的, 千万不要从不同地址混搭):\n${addrLines}`);
    }
    if (state.nearbyStores.length > 1) {
        const storeLines = state.nearbyStores.map((s, i) => {
            const tag = s.storeCode === state.storeCode ? ' ← 当前选中' : '';
            return `    ${i + 1}. storeCode=${s.storeCode || '?'} | beCode=${s.beCode || '(空)'} | ${s.storeName || ''}${tag}`;
        }).join('\n');
        lines.push(`- 全部已知附近门店:\n${storeLines}`);
    }
    if (state.knownProductCodes.length) {
        // 只列前 30 个, 多了占 token; 模型记不住全部也无所谓, 它能调 query-meals 重拉
        const sample = state.knownProductCodes.slice(0, 30).map(p => {
            const priceStr = p.price ? ` ¥${p.price}` : '';
            return `${p.code}=${p.name || '?'}${priceStr}`;
        }).join(', ');
        const more = state.knownProductCodes.length > 30 ? ` ...还有 ${state.knownProductCodes.length - 30} 个` : '';
        lines.push(`- 当前 storeCode 下已确认存在的 productCode (从 query-meals 拿到的, calculate-price/create-order 的 productCode 必须从这里选, 不要编):\n  ${sample}${more}`);
    }
    if (!lines.length) return '';
    return `\n[麦当劳本轮会话已沉淀的状态 — 调工具时直接复用下面这些 ID, 不要再问用户也不要重新查]\n${lines.join('\n')}\n`;
};
