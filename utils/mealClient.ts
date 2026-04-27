// 外卖助手 — 前端 Client
//
// 当前是 PoC 阶段：搜店/查菜单走自建 Cloudflare Worker 的 mock 数据。
// 真实接入饿了么/美团/盒马 H5 时，把请求体里加上用户提供的 cookie，
// Worker 端做签名 (eleme-shadow-c-id / mtgsig / x-pack)。
//
// **离线兜底**：Worker 不通时（用户在国内不开梯子访问 Cloudflare 会失败），
// 自动落到 utils/mealMockData.ts 里的同款静态数据。所以 SullyOS 装了扩展之后
// 完全不再依赖梯子——meituan 走扩展，eleme/hema 走前端静态 mock。

import { staticMenu, staticSearch } from './mealMockData';

const MEAL_WORKER_BASE = 'https://sully-n.qegj567.workers.dev';
const WORKER_TIMEOUT_MS = 3500;

export type MealPlatform = 'eleme' | 'meituan' | 'hema';

export const MEAL_PLATFORM_LABEL: Record<MealPlatform, string> = {
  eleme: '饿了么',
  meituan: '美团',
  hema: '盒马',
};

export interface MealStore {
  id: string;
  name: string;
  rating: number;
  deliveryTime: number;   // 分钟
  deliveryFee: number;    // 元
  minOrder: number;       // 起送，元
  distance: number;       // km
  monthlySales: number;
  tags: string[];
  promo: string;
}

export interface MealItem {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  sales: number;
  tags: string[];
  img: string | null;
  desc: string;
}

export interface MealCartLine {
  platform: MealPlatform;
  storeId: string;
  storeName: string;
  item: MealItem;
  quantity: number;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function searchStores(
  platform: MealPlatform,
  query: string,
  cookie?: string
): Promise<{ stores: MealStore[]; source: string; reason?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers[`X-Meal-Cookie-${platform}`] = cookie;
  try {
    const resp = await fetchWithTimeout(
      `${MEAL_WORKER_BASE}/meal/search`,
      { method: 'POST', headers, body: JSON.stringify({ platform, query }) },
      WORKER_TIMEOUT_MS
    );
    if (!resp.ok) throw new Error(`status_${resp.status}`);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'worker_not_ok');
    return { stores: data.stores || [], source: data.source || 'unknown', reason: data.reason };
  } catch (e: any) {
    // Worker 不通（梯子断 / 超时 / CORS），用前端静态 mock 兜底
    return {
      stores: staticSearch(platform, query),
      source: 'static_mock',
      reason: `worker_offline:${e?.message || e}`,
    };
  }
}

export async function fetchMenu(
  platform: MealPlatform,
  storeId: string,
  cookie?: string
): Promise<{ store: MealStore | null; items: MealItem[]; source: string; reason?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers[`X-Meal-Cookie-${platform}`] = cookie;
  try {
    const resp = await fetchWithTimeout(
      `${MEAL_WORKER_BASE}/meal/menu`,
      { method: 'POST', headers, body: JSON.stringify({ platform, storeId }) },
      WORKER_TIMEOUT_MS
    );
    if (!resp.ok) throw new Error(`status_${resp.status}`);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'worker_not_ok');
    return {
      store: data.store ?? null,
      items: data.items || [],
      source: data.source || 'unknown',
      reason: data.reason,
    };
  } catch (e: any) {
    const fallback = staticMenu(platform, storeId);
    return {
      ...fallback,
      source: 'static_mock',
      reason: `worker_offline:${e?.message || e}`,
    };
  }
}

// 用户最终付款用的跳转链接。
//
// 三家 App 都支持 URL Scheme 唤起。我们把购物车的店铺 ID 拼进去，
// 用户点一下会跳到对应店铺，已加入购物车的菜在 PoC 阶段需要重新确认
// （真实接入时会用 H5 的"分享购物车"链接，能直接带上选好的菜）。
export function buildPaymentDeeplink(
  platform: MealPlatform,
  storeId: string
): { app: string; web: string } {
  const idShort = storeId.replace(/^[a-z]_/, '');
  if (platform === 'eleme') {
    return {
      app: `eleme://shop?id=${encodeURIComponent(idShort)}`,
      web: `https://h5.ele.me/shop/#${encodeURIComponent(idShort)}`,
    };
  }
  if (platform === 'meituan') {
    return {
      app: `imeituan://www.meituan.com/firstfood/?id=${encodeURIComponent(idShort)}`,
      web: `https://i.meituan.com/firstfood/${encodeURIComponent(idShort)}.html`,
    };
  }
  return {
    app: `hema://navigate?id=${encodeURIComponent(idShort)}`,
    web: `https://www.freshhema.com/?storeId=${encodeURIComponent(idShort)}`,
  };
}

export function summarizeCart(cart: MealCartLine[]): {
  totalItems: number;
  totalPrice: number;
  byStore: { platform: MealPlatform; storeId: string; storeName: string; lines: MealCartLine[]; subtotal: number }[];
} {
  const groups = new Map<string, { platform: MealPlatform; storeId: string; storeName: string; lines: MealCartLine[]; subtotal: number }>();
  let totalItems = 0;
  let totalPrice = 0;
  for (const line of cart) {
    const key = `${line.platform}|${line.storeId}`;
    const lineTotal = line.item.price * line.quantity;
    totalItems += line.quantity;
    totalPrice += lineTotal;
    if (!groups.has(key)) {
      groups.set(key, {
        platform: line.platform,
        storeId: line.storeId,
        storeName: line.storeName,
        lines: [],
        subtotal: 0,
      });
    }
    const g = groups.get(key)!;
    g.lines.push(line);
    g.subtotal += lineTotal;
  }
  return { totalItems, totalPrice, byStore: Array.from(groups.values()) };
}
