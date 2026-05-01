/**
 * 麦当劳小程序 (Phase 1)
 *
 * 替代之前"LLM 驱动 MCP 工具"的脆弱链路, 改成纯按钮驱动的小程序壳:
 *   模式选 → 拉地址/门店 → 拉菜单 → 加购 → (Phase 2 算价/下单)
 *
 * 全程直接调 callMcdTool, 不经过 LLM, 不会有 productCode 幻觉 / orderType
 * 错配 / 券 code 误用 这些坑。
 *
 * char 想参与时, user 在菜单某条点 💭 把单品作为候选发到聊天, 复用之前的
 * mcd_card kind=candidate 流。char 看不到 mini-app 的整体状态 (那是 Phase 3
 * 才接, 会以 system prompt 注入"用户购物车有 X")。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { callMcdTool, isMcdConfigured } from '../../utils/mcdMcpClient';
import { mcdItemEmoji } from '../../utils/mcdEmoji';
import type { McdCartItem } from '../chat/McdCard';

interface McdMiniAppProps {
    open: boolean;
    onClose: () => void;
    /** 角色 + API 配置, 用于在小程序内跟 char 协同聊天 */
    char?: any;
    userProfile?: any;
    apiConfig?: { baseUrl: string; apiKey: string; model: string };
    /** 协同聊天发出的消息要落库到主聊天历史 (持久化, 关闭后能回看) */
    onPersistChatTurn?: (userMsg: string, charMsg: string) => Promise<void> | void;
    /** 用户最终敲定下单时调 (Phase 1 仅展示摘要; Phase 2 会真调 create-order) */
    onConfirmOrder?: (cart: CartLine[], context: OrderContext) => void;
}

interface CartLine {
    code: string;
    name: string;
    price?: string | number;
    qty: number;
}

interface OrderContext {
    orderType: 1 | 2;
    storeCode: string;
    storeName?: string;
    beCode?: string;
    addressId?: string;
    addressLabel?: string;
}

type Step = 'mode' | 'pick' | 'menu' | 'review';

// ========== 通用 UI ==========

const fmtMoney = (v: any): string => {
    if (v == null) return '';
    const n = typeof v === 'string' ? parseFloat(v) : v;
    if (!isFinite(n)) return String(v);
    return `¥${n.toFixed(2)}`;
};

const Spinner: React.FC<{ label?: string }> = ({ label }) => (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-yellow-700">
        <div className="w-8 h-8 border-3 border-yellow-300 border-t-yellow-600 rounded-full animate-spin" />
        {label && <div className="text-[12px] text-yellow-700/70">{label}</div>}
    </div>
);

const ErrorBox: React.FC<{ msg: string; onRetry?: () => void }> = ({ msg, onRetry }) => (
    <div className="m-3 p-3 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700 leading-relaxed">
        <div className="font-bold mb-1">😣 出错了</div>
        <div className="mb-2 whitespace-pre-wrap break-all">{msg}</div>
        {onRetry && (
            <button onClick={onRetry} className="px-3 py-1 bg-red-500 text-white rounded-lg text-[11px] font-bold active:scale-95">重试</button>
        )}
    </div>
);

// ========== Step 1: 选模式 ==========

const ModeStep: React.FC<{ onPick: (t: 1 | 2) => void }> = ({ onPick }) => (
    <div className="px-4 py-6 space-y-3">
        <div className="text-[20px] font-bold text-yellow-900 text-center mb-1">🍟 想怎么吃？</div>
        <div className="text-[12px] text-yellow-800/70 text-center mb-4">麦当劳官方 MCP · 点完会让 ta 给点意见</div>
        <button
            onClick={() => onPick(2)}
            className="w-full p-4 rounded-2xl bg-gradient-to-br from-yellow-300 to-amber-300 border-2 border-yellow-400 active:scale-[0.98] transition-transform text-left"
        >
            <div className="flex items-center gap-3">
                <span className="text-3xl">🛵</span>
                <div className="flex-1">
                    <div className="text-[15px] font-bold text-yellow-900">麦乐送外卖</div>
                    <div className="text-[11px] text-yellow-800/70 mt-0.5">从已存的收货地址里选一个</div>
                </div>
                <span className="text-yellow-700 text-xl">›</span>
            </div>
        </button>
        <button
            onClick={() => onPick(1)}
            className="w-full p-4 rounded-2xl bg-gradient-to-br from-amber-100 to-yellow-100 border-2 border-yellow-300 active:scale-[0.98] transition-transform text-left"
        >
            <div className="flex items-center gap-3">
                <span className="text-3xl">🏪</span>
                <div className="flex-1">
                    <div className="text-[15px] font-bold text-yellow-900">到店取餐 / 堂食</div>
                    <div className="text-[11px] text-yellow-800/70 mt-0.5">从收藏门店里选, 或附近搜索</div>
                </div>
                <span className="text-yellow-700 text-xl">›</span>
            </div>
        </button>
    </div>
);

// ========== Step 2: 选地址 / 门店 ==========

interface AddressItem { addressId: string; storeCode: string; beCode: string; fullAddress?: string; storeName?: string; phone?: string; contactName?: string; }
interface StoreItem { storeCode: string; beCode?: string; storeName: string; address?: string; distance?: any; }

const AddressStep: React.FC<{ orderType: 1 | 2; onPick: (ctx: OrderContext) => void; onBack: () => void }> = ({ orderType, onPick, onBack }) => {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [addresses, setAddresses] = useState<AddressItem[]>([]);
    const [stores, setStores] = useState<StoreItem[]>([]);

    const reload = async () => {
        setLoading(true); setErr(null);
        try {
            if (orderType === 2) {
                // 麦乐送 (beType=2)
                const r = await callMcdTool('delivery-query-addresses', { beType: 2 });
                if (!r.success) throw new Error(r.error || '拉取地址失败');
                const list = (r.data?.addresses || r.data || []) as AddressItem[];
                setAddresses(Array.isArray(list) ? list : []);
            } else {
                // 到店: 先查收藏门店 (searchType=1)
                const r = await callMcdTool('query-nearby-stores', { searchType: 1, beType: 1 });
                if (!r.success) throw new Error(r.error || '拉取门店失败');
                const list = (Array.isArray(r.data) ? r.data : (r.data?.stores || r.data?.list || [])) as StoreItem[];
                setStores(list || []);
            }
        } catch (e: any) {
            setErr(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [orderType]);

    if (loading) return <Spinner label={orderType === 2 ? '正在拉取你的收货地址...' : '正在拉取收藏门店...'} />;
    if (err) return <ErrorBox msg={err} onRetry={reload} />;

    return (
        <div className="px-3 py-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
                <button onClick={onBack} className="text-[12px] text-yellow-700 active:scale-95">‹ 换模式</button>
                <div className="text-[13px] font-bold text-yellow-900">{orderType === 2 ? '选收货地址' : '选门店'}</div>
                <div className="w-12" />
            </div>
            {orderType === 2 ? (
                addresses.length === 0 ? (
                    <div className="text-center py-8 text-[12px] text-slate-500">
                        还没有收货地址。请先在麦当劳 App 里添加。
                    </div>
                ) : addresses.map((a: AddressItem) => (
                    <button
                        key={a.addressId}
                        onClick={() => onPick({
                            orderType: 2,
                            storeCode: a.storeCode,
                            beCode: a.beCode,
                            addressId: a.addressId,
                            addressLabel: a.fullAddress,
                            storeName: a.storeName,
                        })}
                        className="w-full p-3 rounded-xl bg-white border border-yellow-200 active:scale-[0.99] active:bg-yellow-50 transition text-left"
                    >
                        <div className="flex items-start gap-2">
                            <span className="text-xl shrink-0 mt-0.5">📍</span>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-[13px] text-slate-800 truncate">
                                    {a.contactName || '收货人'}
                                    {a.phone && <span className="text-[10px] text-slate-500 font-normal ml-1.5">{a.phone}</span>}
                                </div>
                                <div className="text-[11px] text-slate-600 line-clamp-2 leading-snug mt-0.5">{a.fullAddress}</div>
                                {a.storeName && <div className="text-[10px] text-yellow-700 mt-0.5">配送门店: {a.storeName}</div>}
                            </div>
                        </div>
                    </button>
                ))
            ) : (
                stores.length === 0 ? (
                    <div className="text-center py-8 text-[12px] text-slate-500 leading-relaxed">
                        没找到收藏门店。<br />请先在麦当劳 App 里收藏一家。
                    </div>
                ) : stores.map((s: StoreItem) => (
                    <button
                        key={s.storeCode}
                        onClick={() => onPick({
                            orderType: 1,
                            storeCode: s.storeCode,
                            storeName: s.storeName,
                        })}
                        className="w-full p-3 rounded-xl bg-white border border-yellow-200 active:scale-[0.99] active:bg-yellow-50 transition text-left"
                    >
                        <div className="flex items-start gap-2">
                            <span className="text-xl shrink-0 mt-0.5">🏪</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="font-bold text-[13px] text-slate-800 truncate flex-1">{s.storeName}</div>
                                    {s.distance != null && (
                                        <div className="text-[10px] text-yellow-700 shrink-0">
                                            {typeof s.distance === 'number'
                                                ? (s.distance > 1000 ? (s.distance / 1000).toFixed(1) + 'km' : s.distance + 'm')
                                                : s.distance}
                                        </div>
                                    )}
                                </div>
                                {s.address && <div className="text-[11px] text-slate-600 line-clamp-2 leading-snug mt-0.5">{s.address}</div>}
                            </div>
                        </div>
                    </button>
                ))
            )}
        </div>
    );
};

// ========== Step 3: 浏览菜单 + 加购 ==========

interface MealsData {
    categories?: Array<{ name: string; meals?: Array<{ code: string; tags?: string[] }> }>;
    meals?: Record<string, { name: string; currentPrice?: string }>;
}

const MenuStep: React.FC<{
    ctx: OrderContext;
    cart: Map<string, CartLine>;
    onCart: (code: string, delta: number, item?: { name: string; price?: any }) => void;
    onMenuLoaded?: (data: MealsData) => void;
    onBack: () => void;
    onReview: () => void;
}> = ({ ctx, cart, onCart, onMenuLoaded, onBack, onReview }) => {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [data, setData] = useState<MealsData | null>(null);
    const [activeCat, setActiveCat] = useState<number>(0);

    const reload = async () => {
        setLoading(true); setErr(null);
        try {
            const args: any = { storeCode: ctx.storeCode, orderType: ctx.orderType };
            if (ctx.orderType === 2 && ctx.beCode) args.beCode = ctx.beCode;
            const r = await callMcdTool('query-meals', args);
            if (!r.success) throw new Error(r.error || '拉取菜单失败');
            const d = r.data || {};
            setData(d);
            onMenuLoaded?.(d);
        } catch (e: any) {
            setErr(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [ctx.storeCode, ctx.orderType, ctx.beCode]);

    const cats = data?.categories || [];
    const mealMap = data?.meals || {};
    const cur = cats[activeCat];
    const items = (cur?.meals || []).map((m: any) => ({ code: m.code, ...mealMap[m.code], tags: m.tags })).filter((x: any) => x.name);

    const cartCount = (Array.from(cart.values()) as CartLine[]).reduce((s, l) => s + l.qty, 0);
    const cartTotal = (Array.from(cart.values()) as CartLine[]).reduce((s, l) => {
        const p = typeof l.price === 'string' ? parseFloat(l.price) : (typeof l.price === 'number' ? l.price : 0);
        return s + (isFinite(p) ? p * l.qty : 0);
    }, 0);

    if (loading) return <Spinner label="正在拉取菜单..." />;
    if (err) return <ErrorBox msg={err} onRetry={reload} />;

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-3 py-2 border-b border-yellow-200/60 bg-yellow-50/60">
                <button onClick={onBack} className="text-[12px] text-yellow-700 active:scale-95">‹ 换{ctx.orderType === 2 ? '地址' : '门店'}</button>
                <div className="text-[12px] font-bold text-yellow-900 truncate mx-2">
                    {ctx.storeName || ctx.storeCode}
                    <span className="text-[10px] text-yellow-700/60 font-normal ml-1.5">{ctx.orderType === 2 ? '外送' : '到店'}</span>
                </div>
                <div className="w-14" />
            </div>

            <div className="flex flex-1 min-h-0">
                {/* 左侧分类 */}
                <div className="w-20 shrink-0 overflow-y-auto bg-yellow-50/40 border-r border-yellow-100">
                    {cats.map((c: any, i: number) => (
                        <button
                            key={i}
                            onClick={() => setActiveCat(i)}
                            className={`block w-full px-2 py-3 text-[11px] leading-snug border-l-2 transition ${
                                i === activeCat
                                    ? 'bg-white text-yellow-900 font-bold border-yellow-500'
                                    : 'text-slate-600 border-transparent active:bg-yellow-100'
                            }`}
                        >{c.name}</button>
                    ))}
                </div>

                {/* 右侧商品网格 */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {items.length === 0
                        ? <div className="text-center py-8 text-[11px] text-slate-400">这个分类下没找到可售商品</div>
                        : items.map((it: any) => {
                            const inCart = cart.get(it.code);
                            const q = inCart?.qty || 0;
                            return (
                                <div key={it.code} className="flex gap-2 p-2 bg-white rounded-xl border border-yellow-100">
                                    <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-yellow-50 to-amber-50 shrink-0 flex items-center justify-center text-3xl">
                                        {mcdItemEmoji(it.name)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-[12px] text-slate-800 line-clamp-2 leading-snug">{it.name}</div>
                                        {it.tags && it.tags.length > 0 && (
                                            <div className="flex gap-1 mt-0.5 flex-wrap">
                                                {it.tags.slice(0, 2).map((t: string, j: number) => (
                                                    <span key={j} className="text-[9px] px-1 py-px rounded bg-red-100 text-red-600">{t}</span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between mt-1 gap-2">
                                            {it.currentPrice != null
                                                ? <div className="text-[12px] font-bold text-yellow-700">{fmtMoney(it.currentPrice)}</div>
                                                : <div className="flex-1" />}
                                            <div className="flex items-center gap-1 shrink-0">
                                                <div className="flex items-center bg-white border border-yellow-300 rounded-md overflow-hidden">
                                                    <button
                                                        onClick={() => onCart(it.code, -1)}
                                                        disabled={q <= 0}
                                                        className={`w-6 h-6 flex items-center justify-center text-[14px] font-bold ${q <= 0 ? 'text-slate-300' : 'text-yellow-700 active:bg-yellow-100'}`}
                                                    >−</button>
                                                    <span className="min-w-[20px] text-center text-[11px] font-bold text-slate-700">{q}</span>
                                                    <button
                                                        onClick={() => onCart(it.code, 1, { name: it.name, price: it.currentPrice })}
                                                        className="w-6 h-6 flex items-center justify-center text-[14px] font-bold text-yellow-700 active:bg-yellow-100"
                                                    >+</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </div>

            {/* 底部购物车浮条 */}
            {cartCount > 0 && (
                <div className="border-t border-yellow-300 bg-gradient-to-r from-yellow-100 to-amber-100 px-3 py-2.5 flex items-center gap-3">
                    <div className="text-2xl">🛒</div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-yellow-800/70">已选 {cartCount} 件</div>
                        {cartTotal > 0 && <div className="text-[15px] font-bold text-yellow-800">{fmtMoney(cartTotal)}</div>}
                    </div>
                    <button
                        onClick={onReview}
                        className="px-4 py-2 bg-yellow-600 text-white text-[12px] font-bold rounded-xl shadow active:scale-95"
                    >去结算 →</button>
                </div>
            )}
        </div>
    );
};

// ========== Step 4: 购物车确认 (Phase 1: 仅展示, Phase 2 接 calculate-price + create-order) ==========

const ReviewStep: React.FC<{
    ctx: OrderContext;
    cart: Map<string, CartLine>;
    onCart: (code: string, delta: number) => void;
    onBack: () => void;
    onConfirm: () => void;
}> = ({ ctx, cart, onCart, onBack, onConfirm }) => {
    const lines = (Array.from(cart.values()) as CartLine[]);
    const total = lines.reduce((s, l) => {
        const p = typeof l.price === 'string' ? parseFloat(l.price) : (typeof l.price === 'number' ? l.price : 0);
        return s + (isFinite(p) ? p * l.qty : 0);
    }, 0);
    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-3 py-2 border-b border-yellow-200/60 bg-yellow-50/60">
                <button onClick={onBack} className="text-[12px] text-yellow-700 active:scale-95">‹ 继续选</button>
                <div className="text-[13px] font-bold text-yellow-900">确认订单</div>
                <div className="w-12" />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <div className="text-[10px] text-yellow-700/70 font-bold uppercase">送达 / 取餐</div>
                <div className="bg-white rounded-xl border border-yellow-100 p-2.5 text-[12px] text-slate-700">
                    {ctx.orderType === 2
                        ? <>📍 <span className="text-slate-500">{ctx.storeName || '配送门店'} → </span>{ctx.addressLabel || ctx.addressId}</>
                        : <>🏪 {ctx.storeName || ctx.storeCode} (到店取餐)</>}
                </div>
                <div className="text-[10px] text-yellow-700/70 font-bold uppercase mt-2">商品</div>
                <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
                    {lines.map((l) => (
                        <div key={l.code} className="flex items-center gap-2 p-2 border-b border-yellow-50 last:border-b-0">
                            <span className="text-2xl shrink-0">{mcdItemEmoji(l.name)}</span>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-[12px] text-slate-800 truncate">{l.name}</div>
                                {l.price != null && <div className="text-[10px] text-yellow-700">{fmtMoney(l.price)}</div>}
                            </div>
                            <div className="flex items-center bg-yellow-50 border border-yellow-200 rounded-md overflow-hidden shrink-0">
                                <button onClick={() => onCart(l.code, -1)} className="w-6 h-6 flex items-center justify-center text-[14px] font-bold text-yellow-700 active:bg-yellow-100">−</button>
                                <span className="min-w-[20px] text-center text-[11px] font-bold text-slate-700">{l.qty}</span>
                                <button onClick={() => onCart(l.code, 1)} className="w-6 h-6 flex items-center justify-center text-[14px] font-bold text-yellow-700 active:bg-yellow-100">+</button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="text-[10px] text-slate-400 italic mt-3 leading-relaxed px-1">
                    Phase 1: 暂未接入实际下单流程, 点"敲定"会把购物车摘要发给角色让 ta 评论, 真正的 calculate-price + create-order 在 Phase 2 接入。
                </div>
            </div>
            <div className="border-t border-yellow-300 bg-gradient-to-r from-yellow-100 to-amber-100 px-3 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-yellow-800/70">合计</div>
                    {total > 0 && <div className="text-[17px] font-bold text-yellow-800">{fmtMoney(total)}</div>}
                </div>
                <button
                    onClick={onConfirm}
                    disabled={lines.length === 0}
                    className="px-5 py-2.5 bg-yellow-600 text-white text-[13px] font-bold rounded-xl shadow active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                >敲定 →</button>
            </div>
        </div>
    );
};

// ========== 协同聊天面板 (modal 内嵌) ==========

interface MiniChatMsg { role: 'user' | 'assistant'; content: string; ts: number; }

const buildSystemPrompt = (
    char: any,
    userProfile: any,
    step: Step,
    ctx: OrderContext | null,
    cart: CartLine[],
    nutritionData: string,
    menu: MealsData | null,
): string => {
    const userName = userProfile?.name || '用户';
    const charName = char?.name || '你';
    const persona = (char?.personality || '').slice(0, 800);
    const lines: string[] = [];

    lines.push(`你是 ${charName}。${persona ? '人设要点: ' + persona : ''}`);
    lines.push('');
    lines.push(`---`);
    lines.push(`[麦当劳点餐协同模式 — 你和 ${userName} 正在一个小程序里一起选餐]`);
    lines.push('');
    lines.push(`# 当前状态`);
    lines.push(`- 当前步骤: ${step === 'mode' ? '选模式' : step === 'pick' ? '选地址/门店' : step === 'menu' ? '浏览菜单' : '确认订单'}`);
    if (ctx) {
        lines.push(`- 取餐方式: ${ctx.orderType === 1 ? '到店取餐' : '麦乐送外卖'}`);
        lines.push(`- 门店: ${ctx.storeName || ctx.storeCode}`);
        if (ctx.addressLabel) lines.push(`- 收货地址: ${ctx.addressLabel}`);
    }
    if (cart.length) {
        const total = cart.reduce((s, l) => {
            const p = typeof l.price === 'string' ? parseFloat(l.price) : (typeof l.price === 'number' ? l.price : 0);
            return s + (isFinite(p) ? p * l.qty : 0);
        }, 0);
        lines.push(`- 当前购物车 (${cart.length} 项, 合计 ¥${total.toFixed(2)}):`);
        for (const l of cart) {
            const p = typeof l.price === 'string' ? parseFloat(l.price) : (typeof l.price === 'number' ? l.price : 0);
            lines.push(`    · ${l.name} ×${l.qty}${isFinite(p) && p > 0 ? ` (¥${p.toFixed(2)}/份)` : ''}`);
        }
    } else {
        lines.push(`- 当前购物车: 空`);
    }
    lines.push('');

    if (menu?.meals) {
        const mealEntries = Object.entries(menu.meals).slice(0, 80);
        if (mealEntries.length) {
            lines.push(`# 当前门店在售菜单 (前 ${mealEntries.length} 项)`);
            lines.push('格式: 商品名 ¥价格');
            for (const [, m] of mealEntries) {
                const v = m as any;
                if (!v?.name) continue;
                lines.push(`- ${v.name}${v.currentPrice ? ` ¥${v.currentPrice}` : ''}`);
            }
            lines.push('');
        }
    }

    if (nutritionData) {
        lines.push(`# 全量营养表 (toon 紧凑格式, 头部是字段名顺序)`);
        lines.push('用户问热量/营养时, 直接查这个表给数据, 不要自己编。');
        lines.push('');
        lines.push(nutritionData.length > 6000 ? nutritionData.slice(0, 6000) + '\n...(截断)' : nutritionData);
        lines.push('');
    }

    lines.push(`# 协同规则 (重要)`);
    lines.push(`- ${userName} 在小程序里跟你聊"吃啥/帮我挑/这个怎么样", 你就按平时人设自然回应。`);
    lines.push(`- 推荐时**直接念商品名 + 简短理由**, 让 ${userName} 自己点 + 加进购物车。**不要列 markdown 表格**, **不要贴 productCode**, **不要复述全部菜单**。`);
    lines.push(`- 用户问热量 / 营养 / "X 大卡以内挑组合" → 在营养表里查准确数值再回答, 推荐组合时尽量用菜单里有的商品。`);
    lines.push(`- 用户已经选了东西 → 看一眼购物车, 点评搭配 (够不够 / 重不重 / 配不配饮料), 别复读购物车清单。`);
    lines.push(`- 别强推, 给意见但尊重 ${userName} 决定。回应保持你平时的语气、节奏和长度。`);
    lines.push(`- 你**不能直接修改购物车**, 加减都得用户自己点按钮。但可以引导, 比如 "我推荐加杯小可乐 (147 大卡), 你点一下加号"。`);

    return lines.join('\n');
};

const InAppChat: React.FC<{
    char: any;
    userProfile: any;
    apiConfig?: { baseUrl: string; apiKey: string; model: string };
    step: Step;
    ctx: OrderContext | null;
    cart: CartLine[];
    nutritionData: string;
    menu: MealsData | null;
    onPersistChatTurn?: (userMsg: string, charMsg: string) => Promise<void> | void;
}> = ({ char, userProfile, apiConfig, step, ctx, cart, nutritionData, menu, onPersistChatTurn }) => {
    const [expanded, setExpanded] = useState(false);
    const [messages, setMessages] = useState<MiniChatMsg[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading, expanded]);

    const send = async () => {
        const text = input.trim();
        if (!text || loading || !char || !apiConfig?.baseUrl) return;
        const userTs = Date.now();
        const userMsg: MiniChatMsg = { role: 'user', content: text, ts: userTs };
        setMessages((prev: MiniChatMsg[]) => [...prev, userMsg]);
        setInput('');
        setLoading(true);
        setExpanded(true);
        try {
            const sys = buildSystemPrompt(char, userProfile, step, ctx, cart, nutritionData, menu);
            const apiMsgs: any[] = [{ role: 'system', content: sys }];
            // 只带最近 10 轮 in-app 对话, 避免无限累积
            const recent = ([...messages, userMsg] as MiniChatMsg[]).slice(-20);
            for (const m of recent) apiMsgs.push({ role: m.role, content: m.content });

            const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
            const resp = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: apiMsgs,
                    temperature: 0.85,
                    max_tokens: 800,
                    stream: false,
                }),
            });
            if (!resp.ok) {
                const errTxt = await resp.text().catch(() => '');
                throw new Error(`API ${resp.status}: ${errTxt.slice(0, 200)}`);
            }
            const data = await resp.json();
            const reply: string = data?.choices?.[0]?.message?.content || '...';
            const charMsg: MiniChatMsg = { role: 'assistant', content: reply, ts: Date.now() };
            setMessages((prev: MiniChatMsg[]) => [...prev, charMsg]);
            // 落库主聊天历史 (持久化)
            try { await onPersistChatTurn?.(text, reply); } catch { /* ignore */ }
        } catch (e: any) {
            setMessages((prev: MiniChatMsg[]) => [...prev, { role: 'assistant', content: `(出错了: ${e?.message || e})`, ts: Date.now() }]);
        } finally {
            setLoading(false);
        }
    };

    const lastChar = [...messages].reverse().find((m: MiniChatMsg) => m.role === 'assistant');
    const charAvatar = char?.avatar;
    const charName = char?.name || 'TA';

    return (
        <div className="border-t-2 border-yellow-300/60 bg-gradient-to-b from-yellow-100/60 to-amber-50 shrink-0 flex flex-col" style={{ maxHeight: expanded ? '50%' : '52px' }}>
            {/* 折叠条 / 展开切换 */}
            <button
                onClick={() => setExpanded((v: boolean) => !v)}
                className="flex items-center gap-2 px-3 py-2 bg-yellow-100/80 active:bg-yellow-200/60 transition border-b border-yellow-200/60"
            >
                <div className="w-7 h-7 rounded-full bg-yellow-300 overflow-hidden shrink-0 flex items-center justify-center text-sm">
                    {charAvatar ? <img src={charAvatar} alt="" className="w-full h-full object-cover" /> : '🐾'}
                </div>
                <div className="flex-1 min-w-0 text-left">
                    {!expanded && lastChar
                        ? <div className="text-[11px] text-slate-700 truncate"><span className="text-yellow-700 font-bold">{charName}: </span>{lastChar.content}</div>
                        : <div className="text-[11px] font-bold text-yellow-900">跟 {charName} 一起选 · {expanded ? '点这里收起' : '点这里展开聊'}</div>}
                </div>
                <span className="text-yellow-700 text-xs shrink-0">{expanded ? '▼' : '▲'}</span>
            </button>

            {expanded && (
                <>
                    <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
                        {messages.length === 0 && (
                            <div className="text-center py-4 text-[11px] text-slate-500 leading-relaxed">
                                可以这样问 {charName}:<br />
                                <span className="text-yellow-700">"帮我挑个 800 大卡以内的"</span><br />
                                <span className="text-yellow-700">"我已经选了这些, 你看怎么样"</span><br />
                                <span className="text-yellow-700">"今天想吃辣的"</span>
                            </div>
                        )}
                        {messages.map((m: MiniChatMsg, i: number) => (
                            <div key={i} className={`flex gap-1.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {m.role === 'assistant' && (
                                    <div className="w-6 h-6 rounded-full bg-yellow-300 overflow-hidden shrink-0 flex items-center justify-center text-xs mt-0.5">
                                        {charAvatar ? <img src={charAvatar} alt="" className="w-full h-full object-cover" /> : '🐾'}
                                    </div>
                                )}
                                <div className={`max-w-[78%] px-2.5 py-1.5 rounded-2xl text-[12px] leading-relaxed whitespace-pre-wrap break-words ${
                                    m.role === 'user'
                                        ? 'bg-yellow-500 text-white rounded-br-sm'
                                        : 'bg-white border border-yellow-200 text-slate-800 rounded-bl-sm'
                                }`}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex gap-1.5 justify-start">
                                <div className="w-6 h-6 rounded-full bg-yellow-300 overflow-hidden shrink-0 flex items-center justify-center text-xs">
                                    {charAvatar ? <img src={charAvatar} alt="" className="w-full h-full object-cover" /> : '🐾'}
                                </div>
                                <div className="px-2.5 py-1.5 rounded-2xl bg-white border border-yellow-200">
                                    <span className="inline-flex gap-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="border-t border-yellow-200/60 p-2 flex items-end gap-2 bg-white">
                        <textarea
                            value={input}
                            onChange={(e: any) => setInput(e.target.value)}
                            onKeyDown={(e: any) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    send();
                                }
                            }}
                            placeholder={`问问 ${charName}...`}
                            rows={1}
                            className="flex-1 resize-none bg-yellow-50/60 border border-yellow-200 rounded-xl px-3 py-1.5 text-[12px] focus:outline-none focus:border-yellow-400 max-h-20"
                        />
                        <button
                            onClick={send}
                            disabled={!input.trim() || loading}
                            className="px-3 py-1.5 bg-yellow-500 text-white text-[12px] font-bold rounded-xl shadow active:scale-95 disabled:opacity-40 shrink-0"
                        >发送</button>
                    </div>
                </>
            )}
        </div>
    );
};

// ========== 主组件 ==========

const McdMiniApp: React.FC<McdMiniAppProps> = ({ open, onClose, char, userProfile, apiConfig, onPersistChatTurn, onConfirmOrder }) => {
    const [step, setStep] = useState<Step>('mode');
    const [orderType, setOrderType] = useState<1 | 2 | null>(null);
    const [ctx, setCtx] = useState<OrderContext | null>(null);
    const [cart, setCart] = useState<Map<string, CartLine>>(new Map());
    const [menuData, setMenuData] = useState<MealsData | null>(null);
    const [nutritionData, setNutritionData] = useState<string>('');

    useEffect(() => {
        if (open) {
            // 重新打开时重置
            setStep('mode');
            setOrderType(null);
            setCtx(null);
            setCart(new Map());
            setMenuData(null);
            // 营养表全量, 一次性拉, 给 char 选品时参考
            if (!nutritionData) {
                callMcdTool('list-nutrition-foods', {}).then((r: any) => {
                    if (r?.success) {
                        if (typeof r.data === 'string') setNutritionData(r.data);
                        else if (typeof r.rawText === 'string') setNutritionData(r.rawText);
                    }
                }).catch(() => { /* 没拉到也不阻塞主流程 */ });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const updateCart = (code: string, delta: number, item?: { name: string; price?: any }) => {
        setCart((prev: Map<string, CartLine>) => {
            const next = new Map<string, CartLine>(prev);
            const cur = next.get(code);
            if (cur) {
                const nextQty = Math.max(0, Math.min(20, cur.qty + delta));
                if (nextQty === 0) next.delete(code);
                else next.set(code, { ...cur, qty: nextQty });
            } else if (delta > 0 && item) {
                next.set(code, { code, name: item.name, price: item.price, qty: delta });
            }
            return next;
        });
    };

    const handleConfirm = () => {
        if (!ctx) return;
        const lines = (Array.from(cart.values()) as CartLine[]);
        if (!lines.length) return;
        onConfirmOrder?.(lines, ctx);
        onClose();
    };

    if (!open) return null;
    if (!isMcdConfigured()) {
        return (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
                <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center" onClick={(e: any) => e.stopPropagation()}>
                    <div className="text-3xl mb-2">🍔</div>
                    <div className="font-bold text-slate-800 mb-2">麦当劳还没开启</div>
                    <div className="text-[12px] text-slate-500 mb-4 leading-relaxed">请到设置 → 麦当劳填入 MCP token 并开启功能</div>
                    <button onClick={onClose} className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-[12px] font-bold">知道了</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div
                className="bg-gradient-to-b from-yellow-50 to-amber-50 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
                style={{ height: '85vh', maxHeight: '85vh' }}
                onClick={(e: any) => e.stopPropagation()}
            >
                {/* 顶栏 */}
                <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-yellow-400 to-amber-400 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🍟</span>
                        <div>
                            <div className="text-[13px] font-bold text-yellow-900">麦当劳</div>
                            <div className="text-[9px] text-yellow-900/70">官方 MCP · 直连下单</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/40 flex items-center justify-center text-yellow-900 active:scale-90">✕</button>
                </div>

                {/* 内容区 */}
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    {step === 'mode' && (
                        <ModeStep onPick={(t: 1 | 2) => { setOrderType(t); setStep('pick'); }} />
                    )}
                    {step === 'pick' && orderType && (
                        <AddressStep
                            orderType={orderType}
                            onBack={() => setStep('mode')}
                            onPick={(c: OrderContext) => { setCtx(c); setStep('menu'); }}
                        />
                    )}
                    {step === 'menu' && ctx && (
                        <MenuStep
                            ctx={ctx}
                            cart={cart}
                            onCart={updateCart}
                            onMenuLoaded={setMenuData}
                            onBack={() => setStep('pick')}
                            onReview={() => setStep('review')}
                        />
                    )}
                    {step === 'review' && ctx && (
                        <ReviewStep
                            ctx={ctx}
                            cart={cart}
                            onCart={updateCart}
                            onBack={() => setStep('menu')}
                            onConfirm={handleConfirm}
                        />
                    )}
                </div>

                {/* 协同聊天面板: 跟着 modal 永久挂在底部, 进入选地址那步开始就能聊 */}
                {char && step !== 'mode' && (
                    <InAppChat
                        char={char}
                        userProfile={userProfile}
                        apiConfig={apiConfig}
                        step={step}
                        ctx={ctx}
                        cart={(Array.from(cart.values()) as CartLine[])}
                        nutritionData={nutritionData}
                        menu={menuData}
                        onPersistChatTurn={onPersistChatTurn}
                    />
                )}
            </div>
        </div>
    );
};

export default McdMiniApp;
export type { CartLine, OrderContext };
