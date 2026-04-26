// 外卖助手 — 前端 Client
//
// 当前是 PoC 阶段：搜店/查菜单走自建 Cloudflare Worker 的 mock 数据。
// 真实接入饿了么/美团/盒马 H5 时，把请求体里加上用户提供的 cookie，
// Worker 端做签名 (eleme-shadow-c-id / mtgsig / x-pack)。
//
// 请求/响应都是普通 JSON，方便给 LLM 当工具直接调用。

const MEAL_WORKER_BASE = 'https://sully-n.qegj567.workers.dev';

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

export async function searchStores(
  platform: MealPlatform,
  query: string,
  cookie?: string
): Promise<{ stores: MealStore[]; source: string; reason?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers[`X-Meal-Cookie-${platform}`] = cookie;
  const resp = await fetch(`${MEAL_WORKER_BASE}/meal/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ platform, query }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`searchStores failed: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || 'searchStores failed');
  return { stores: data.stores || [], source: data.source || 'unknown', reason: data.reason };
}

export async function fetchMenu(
  platform: MealPlatform,
  storeId: string,
  cookie?: string
): Promise<{ store: MealStore | null; items: MealItem[]; source: string; reason?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers[`X-Meal-Cookie-${platform}`] = cookie;
  const resp = await fetch(`${MEAL_WORKER_BASE}/meal/menu`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ platform, storeId }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`fetchMenu failed: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || 'fetchMenu failed');
  return {
    store: data.store ?? null,
    items: data.items || [],
    source: data.source || 'unknown',
    reason: data.reason,
  };
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
