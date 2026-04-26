import {
  MealCartLine,
  MealItem,
  MealPlatform,
  MealStore,
  fetchMenu,
  searchStores,
  summarizeCart,
} from '../../utils/mealClient';
import { MealCredentials, getPlatformCookie } from './credentials';
import { dispatchMealOrder, isMealBridgeReady, MealBridgeProgress } from '../../utils/mealBridge';
import { MealAppState, MealCheckoutProposal, MealToolCall, MealToolResult } from './types';

const VALID_PLATFORMS: ReadonlySet<MealPlatform> = new Set<MealPlatform>(['eleme', 'meituan', 'hema']);

const TOOL_BLOCK_RE = /\[\[TOOL\]\]([\s\S]*?)\[\[\/TOOL\]\]/g;

export function parseToolCalls(text: string): { stripped: string; calls: MealToolCall[] } {
  const calls: MealToolCall[] = [];
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = TOOL_BLOCK_RE.exec(text)) !== null) {
    const raw = m[1].trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.name === 'string') {
        calls.push({
          id: `call_${Date.now()}_${idx++}`,
          name: parsed.name,
          args: parsed.args && typeof parsed.args === 'object' ? parsed.args : {},
        });
      }
    } catch {
      // 模型偶发输出格式错误，跳过这一块。
    }
  }
  const stripped = text.replace(TOOL_BLOCK_RE, '').trim();
  return { stripped, calls };
}

interface RunContext {
  // working copy — runOne 直接写这个对象的字段，runToolCalls 结束后再 commit。
  state: MealAppState;
  credentials: MealCredentials;
  /** 浏览器扩展进度回调；MealApp 注入，用来把 progress 事件刷到 UI */
  onBrowserProgress?: (p: MealBridgeProgress) => void;
}

function ensurePlatform(p: any): p is MealPlatform {
  return typeof p === 'string' && VALID_PLATFORMS.has(p as MealPlatform);
}

function formatStoreList(stores: MealStore[]) {
  return stores.map(s => ({
    id: s.id,
    name: s.name,
    rating: s.rating,
    deliveryTime: `${s.deliveryTime} 分钟`,
    deliveryFee: `${s.deliveryFee} 元`,
    minOrder: `${s.minOrder} 元起送`,
    distance: `${s.distance} km`,
    tags: s.tags,
    promo: s.promo,
  }));
}

function formatMenuList(items: MealItem[]) {
  return items.map(i => ({
    id: i.id,
    name: i.name,
    price: i.price,
    originalPrice: i.originalPrice,
    sales: i.sales,
    tags: i.tags,
    desc: i.desc || undefined,
  }));
}

async function runOne(call: MealToolCall, ctx: RunContext): Promise<MealToolResult> {
  const ok = (data: any): MealToolResult => ({ callId: call.id, name: call.name, ok: true, data });
  const fail = (error: string): MealToolResult => ({ callId: call.id, name: call.name, ok: false, error });

  try {
    switch (call.name) {
      case 'search_stores': {
        const platform = call.args.platform;
        if (!ensurePlatform(platform)) return fail('platform 必须是 eleme | meituan | hema');
        const query = typeof call.args.query === 'string' ? call.args.query : '';
        const cacheKey = `${platform}:${query}`;
        const cached = ctx.state.storeCache[cacheKey];
        let stores: MealStore[];
        let source = 'cache';
        let reason: string | undefined;
        if (cached) {
          stores = cached;
        } else {
          const r = await searchStores(platform, query, getPlatformCookie(ctx.credentials, platform));
          stores = r.stores;
          source = r.source;
          reason = r.reason;
          ctx.state.storeCache = { ...ctx.state.storeCache, [cacheKey]: stores };
        }
        return ok({ platform, query, source, reason, stores: formatStoreList(stores) });
      }

      case 'view_menu': {
        const platform = call.args.platform;
        const storeId = call.args.storeId;
        if (!ensurePlatform(platform)) return fail('platform 必须是 eleme | meituan | hema');
        if (typeof storeId !== 'string' || !storeId) return fail('storeId 必填');
        const cacheKey = `${platform}:${storeId}`;
        const cached = ctx.state.menuCache[cacheKey];
        let store: MealStore | null;
        let items: MealItem[];
        let source = 'cache';
        let reason: string | undefined;
        if (cached) {
          store = cached.store;
          items = cached.items;
        } else {
          const r = await fetchMenu(platform, storeId, getPlatformCookie(ctx.credentials, platform));
          store = r.store;
          items = r.items;
          source = r.source;
          reason = r.reason;
          ctx.state.menuCache = { ...ctx.state.menuCache, [cacheKey]: { store, items } };
        }
        return ok({
          platform,
          storeId,
          source,
          reason,
          storeName: store?.name,
          deliveryFee: store?.deliveryFee,
          minOrder: store?.minOrder,
          items: formatMenuList(items),
        });
      }

      case 'add_to_cart': {
        const platform = call.args.platform;
        const storeId = call.args.storeId;
        const itemId = call.args.itemId;
        const quantity = Number.isInteger(call.args.quantity) && call.args.quantity > 0 ? call.args.quantity : 1;
        if (!ensurePlatform(platform)) return fail('platform 必须是 eleme | meituan | hema');
        if (typeof storeId !== 'string' || !storeId) return fail('storeId 必填');
        if (typeof itemId !== 'string' || !itemId) return fail('itemId 必填');

        const menu = ctx.state.menuCache[`${platform}:${storeId}`];
        if (!menu) return fail('请先 view_menu 拿到这家店的菜单和真实 itemId');
        const item = menu.items.find(i => i.id === itemId);
        if (!item) return fail(`itemId ${itemId} 不在该店菜单里`);
        const storeName = menu.store?.name || storeId;

        const prevCart = ctx.state.cart;
        const idx = prevCart.findIndex(
          c => c.platform === platform && c.storeId === storeId && c.item.id === itemId
        );
        const newCart: MealCartLine[] = idx >= 0
          ? prevCart.map((c, i) => (i === idx ? { ...c, quantity: c.quantity + quantity } : c))
          : [...prevCart, { platform, storeId, storeName, item, quantity }];

        ctx.state.cart = newCart;
        ctx.state.checkout = null;

        const summary = summarizeCart(newCart);
        return ok({
          added: { name: item.name, price: item.price, quantity },
          totalItems: summary.totalItems,
          totalPrice: summary.totalPrice,
        });
      }

      case 'remove_from_cart': {
        const platform = call.args.platform;
        const storeId = call.args.storeId;
        const itemId = call.args.itemId;
        if (!ensurePlatform(platform)) return fail('platform 必须是 eleme | meituan | hema');
        if (typeof storeId !== 'string' || !storeId) return fail('storeId 必填');
        if (typeof itemId !== 'string' || !itemId) return fail('itemId 必填');
        const before = ctx.state.cart.length;
        const cart = ctx.state.cart.filter(
          c => !(c.platform === platform && c.storeId === storeId && c.item.id === itemId)
        );
        const removed = cart.length !== before;
        ctx.state.cart = cart;
        ctx.state.checkout = null;
        return ok({ removed });
      }

      case 'view_cart': {
        const summary = summarizeCart(ctx.state.cart);
        return ok({
          totalItems: summary.totalItems,
          totalPrice: summary.totalPrice,
          stores: summary.byStore.map(s => ({
            platform: s.platform,
            storeId: s.storeId,
            storeName: s.storeName,
            subtotal: s.subtotal,
            lines: s.lines.map(l => ({
              itemId: l.item.id,
              name: l.item.name,
              price: l.item.price,
              quantity: l.quantity,
            })),
          })),
        });
      }

      case 'execute_in_browser': {
        const platform = call.args.platform;
        const storeId = call.args.storeId;
        if (!ensurePlatform(platform)) return fail('platform 必须是 eleme | meituan | hema');
        if (typeof storeId !== 'string' || !storeId) return fail('storeId 必填');
        if (!isMealBridgeReady().ready) {
          return fail('扩展未就绪：用户没装 SullyOS Meal Bridge，或当前域名不在扩展白名单里');
        }
        const lines = ctx.state.cart.filter(c => c.platform === platform && c.storeId === storeId);
        if (lines.length === 0) return fail('购物车这家店是空的，先 add_to_cart');
        const storeName = lines[0].storeName;
        try {
          const handle = await dispatchMealOrder(
            {
              platform,
              storeId,
              storeName,
              items: lines.map(l => ({ itemId: l.item.id, name: l.item.name, quantity: l.quantity })),
            },
            p => ctx.onBrowserProgress?.(p)
          );
          return ok({
            jobTabId: handle.jobTabId,
            message: '已让扩展打开新标签开始加购物车，进度会在右下角实时显示。',
          });
        } catch (e: any) {
          return fail(e?.message || String(e));
        }
      }

      case 'propose_checkout': {
        const platform = call.args.platform;
        const storeId = call.args.storeId;
        const reasoning = typeof call.args.reasoning === 'string' ? call.args.reasoning : '';
        if (!ensurePlatform(platform)) return fail('platform 必须是 eleme | meituan | hema');
        if (typeof storeId !== 'string' || !storeId) return fail('storeId 必填');
        const lines = ctx.state.cart.filter(c => c.platform === platform && c.storeId === storeId);
        if (lines.length === 0) return fail('购物车这家店是空的，先 add_to_cart');

        const otherStores = ctx.state.cart.filter(c => !(c.platform === platform && c.storeId === storeId));
        if (otherStores.length > 0) {
          return fail(
            '同一次结账只允许一家店。先 remove_from_cart 把别家清掉再来 propose_checkout'
          );
        }

        const subtotal = lines.reduce((s, l) => s + l.item.price * l.quantity, 0);
        const proposal: MealCheckoutProposal = {
          platform,
          storeId,
          storeName: lines[0].storeName,
          lines,
          subtotal,
          reasoning,
        };
        ctx.state.checkout = proposal;
        return ok({
          ready: true,
          subtotal,
          itemCount: lines.reduce((s, l) => s + l.quantity, 0),
          message: '已生成待付款单，主人在右侧点"去支付"即可跳转到 App 完成支付。',
        });
      }

      default:
        return fail(`未知工具: ${call.name}`);
    }
  } catch (e: any) {
    return fail(e?.message || String(e));
  }
}

// 在 startState 上"克隆 + 顺序执行"，最后返回 (results, finalState)。
// 调用方拿到 finalState 之后再 setState 一次，React 状态语义就干净了。
export async function runToolCalls(
  calls: MealToolCall[],
  startState: MealAppState,
  credentials: MealCredentials,
  onBrowserProgress?: (p: MealBridgeProgress) => void
): Promise<{ results: MealToolResult[]; finalState: MealAppState }> {
  const working: MealAppState = {
    cart: [...startState.cart],
    checkout: startState.checkout,
    storeCache: { ...startState.storeCache },
    menuCache: { ...startState.menuCache },
  };
  const ctx: RunContext = { state: working, credentials, onBrowserProgress };
  const out: MealToolResult[] = [];
  for (const call of calls) {
    // eslint-disable-next-line no-await-in-loop -- 顺序执行避免并发改 cart
    out.push(await runOne(call, ctx));
  }
  return { results: out, finalState: working };
}
