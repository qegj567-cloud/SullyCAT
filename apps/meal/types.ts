import { MealCartLine, MealItem, MealPlatform, MealStore } from '../../utils/mealClient';

export type MealChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface MealChatMessage {
  id: string;
  role: MealChatRole;
  content: string;
  // assistant 消息里 char 自己说出来的"对话部分"（已剥掉 [[TOOL]] 块），用来渲染气泡。
  display?: string;
  // 这条 assistant 消息触发了哪些工具调用（仅展示用）。
  toolCalls?: MealToolCall[];
  // tool 角色消息：装一组工具结果。
  toolResults?: MealToolResult[];
  createdAt: number;
}

export interface MealToolCall {
  id: string;
  name: MealToolName;
  args: Record<string, any>;
}

export interface MealToolResult {
  callId: string;
  name: MealToolName;
  ok: boolean;
  data?: any;
  error?: string;
}

export type MealToolName =
  | 'search_stores'
  | 'view_menu'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'view_cart'
  | 'propose_checkout';

export interface MealCheckoutProposal {
  platform: MealPlatform;
  storeId: string;
  storeName: string;
  lines: MealCartLine[];
  subtotal: number;
  reasoning: string;
}

export interface MealAppState {
  cart: MealCartLine[];
  // char 提议结账时 surface 的"待付款单"。用户点"去支付"才真正跳出 deeplink。
  checkout: MealCheckoutProposal | null;
  // 缓存最近一次搜索/菜单结果，工具调用时不必每次重打 worker。
  storeCache: Record<string, MealStore[]>; // key = `${platform}:${query}`
  menuCache: Record<string, { store: MealStore | null; items: MealItem[] }>; // key = `${platform}:${storeId}`
}

export const EMPTY_MEAL_STATE: MealAppState = {
  cart: [],
  checkout: null,
  storeCache: {},
  menuCache: {},
};
