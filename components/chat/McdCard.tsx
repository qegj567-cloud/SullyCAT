import React, { useMemo, useState } from 'react';

/**
 * 麦当劳 MCP 工具结果卡片
 *
 * 渲染策略: 我们不知道每个工具具体返回什么字段, 所以做"启发式 + 通用展示":
 *  - 探测常见字段: items / products / stores / coupons / orderId / total ...
 *  - 命中已知形态 → 漂亮的专用卡片
 *  - 未命中 → 折叠的 JSON 详情 (可点击展开)
 *
 * 商品图直接从麦当劳 CDN 加载 (用户已同意)。
 */

interface McdCardProps {
    toolName: string;
    args?: Record<string, any>;
    result?: any;
    error?: string | null;
    rawText?: string;
    kind?: 'menu' | 'order' | 'store' | 'coupon' | 'activity' | 'generic';
}

// ========== 通用辅助 ==========

const fmtMoney = (v: any): string => {
    if (v == null) return '';
    const n = typeof v === 'string' ? parseFloat(v) : v;
    if (!isFinite(n)) return String(v);
    return `¥${n.toFixed(2)}`;
};

const pickFirst = <T,>(obj: any, keys: string[]): T | undefined => {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const k of keys) if (obj[k] != null) return obj[k];
    return undefined;
};

const findArray = (obj: any, keys: string[]): any[] | null => {
    if (!obj || typeof obj !== 'object') return null;
    for (const k of keys) {
        const v = obj[k];
        if (Array.isArray(v) && v.length) return v;
    }
    // 兜底: 找第一个非空数组字段
    for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
    }
    return null;
};

/**
 * 比 findArray 更宽: 还接受"以 SKU/ID 为键的 dict-of-object" (常见于麦当劳菜单返回),
 * 自动 Object.values 拍扁成数组。
 */
const extractItems = (data: any, prefKeys: string[] = ['items', 'products', 'goods', 'list', 'data', 'meals']): any[] | null => {
    if (!data) return null;
    if (Array.isArray(data) && data.length) return data;
    if (typeof data !== 'object') return null;
    // 1) 优先 prefKeys
    for (const k of prefKeys) {
        const v = data[k];
        if (Array.isArray(v) && v.length) return v;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            const vals = Object.values(v).filter(x => x && typeof x === 'object');
            if (vals.length) return vals as any[];
        }
    }
    // 2) data 本身就是 dict-of-objects (键是 SKU 这种)
    const vals = Object.values(data).filter(x => x && typeof x === 'object');
    if (vals.length >= 2 && vals.every(x => !Array.isArray(x))) {
        // 至少两个对象值, 视为 dict-of-objects
        // 进一步要求至少一个值有 name/title/productName 等标识字段, 避免误判
        const looksLikeItem = (v: any) => {
            if (!v || typeof v !== 'object') return false;
            return ['name', 'title', 'productName', 'goodsName', 'mealName'].some(k => typeof v[k] === 'string');
        };
        if (vals.some(looksLikeItem)) return vals as any[];
    }
    return null;
};

// ========== 子卡片: 商品/菜单 ==========

const MenuItemRow: React.FC<{ item: any }> = ({ item }) => {
    const name = pickFirst<string>(item, ['name', 'productName', 'title', 'goodsName', 'mealName', 'displayName']) || '麦当劳商品';
    const desc = pickFirst<string>(item, ['description', 'desc', 'subtitle', 'shortDesc', 'remark']);
    const price = pickFirst<any>(item, ['currentPrice', 'price', 'salePrice', 'memberPrice', 'realPrice', 'amount', 'sellPrice']);
    const image = pickFirst<string>(item, ['image', 'imageUrl', 'pic', 'picUrl', 'img', 'icon', 'thumbnail', 'productImage']);
    return (
        <div className="flex gap-2 p-2 border-b border-yellow-50 last:border-b-0">
            <div className="w-14 h-14 rounded-lg bg-yellow-50 overflow-hidden shrink-0 flex items-center justify-center">
                {image ? (
                    <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={(e: any) => { e.target.style.display = 'none'; }} />
                ) : (
                    <span className="text-2xl">🍔</span>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-bold text-[12px] text-slate-800 truncate">{name}</div>
                {desc && <div className="text-[10px] text-slate-500 line-clamp-2 leading-snug mt-0.5">{desc}</div>}
                {price != null && <div className="text-[12px] font-bold text-yellow-700 mt-1">{fmtMoney(price)}</div>}
            </div>
        </div>
    );
};

// ========== 子卡片: 订单 ==========

const OrderSummary: React.FC<{ data: any }> = ({ data }) => {
    const orderId = pickFirst<string>(data, ['orderId', 'orderNo', 'id', 'orderSn', 'tradeNo']);
    const total = pickFirst<any>(data, ['totalAmount', 'total', 'amount', 'payAmount', 'realPayAmount']);
    const status = pickFirst<string>(data, ['status', 'statusText', 'orderStatus', 'state']);
    const deliveryType = pickFirst<string>(data, ['deliveryType', 'orderType', 'channel']);
    const address = pickFirst<string>(data, ['address', 'deliveryAddress', 'consigneeAddress']);
    const items = findArray(data, ['items', 'goods', 'products', 'orderItems', 'goodsList']);
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-yellow-700/70 font-bold uppercase">订单</span>
                {status && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-bold">{status}</span>}
            </div>
            {orderId && <div className="text-[11px] text-slate-500 font-mono">#{orderId}</div>}
            {deliveryType && <div className="text-[10px] text-slate-500">{deliveryType}</div>}
            {address && <div className="text-[10px] text-slate-500 line-clamp-2">📍 {address}</div>}
            {items && items.length > 0 && (
                <div className="bg-white/70 rounded-lg overflow-hidden border border-yellow-100">
                    {items.slice(0, 5).map((it, i) => <MenuItemRow key={i} item={it} />)}
                    {items.length > 5 && <div className="text-[10px] text-slate-400 text-center py-1.5">还有 {items.length - 5} 项…</div>}
                </div>
            )}
            {total != null && (
                <div className="flex items-center justify-between border-t border-yellow-200/60 pt-1.5">
                    <span className="text-[11px] text-slate-600">合计</span>
                    <span className="text-[14px] font-bold text-yellow-700">{fmtMoney(total)}</span>
                </div>
            )}
        </div>
    );
};

// ========== 子卡片: 门店 ==========

const StoreList: React.FC<{ data: any }> = ({ data }) => {
    const stores = findArray(data, ['stores', 'shops', 'restaurants', 'list', 'data', 'items']) || [];
    if (!stores.length) return null;
    return (
        <div className="space-y-1.5">
            <div className="text-[10px] text-yellow-700/70 font-bold uppercase">附近门店</div>
            {stores.slice(0, 5).map((s, i) => {
                const name = pickFirst<string>(s, ['name', 'storeName', 'shopName', 'restaurantName']) || '麦当劳门店';
                const addr = pickFirst<string>(s, ['address', 'storeAddress', 'shopAddress']);
                const distance = pickFirst<any>(s, ['distance', 'distanceM']);
                return (
                    <div key={i} className="bg-white/70 rounded-lg p-2 border border-yellow-100">
                        <div className="flex items-center justify-between">
                            <div className="font-bold text-[12px] text-slate-800 truncate">{name}</div>
                            {distance != null && <div className="text-[10px] text-yellow-700 shrink-0 ml-2">📍 {typeof distance === 'number' ? (distance > 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm') : distance}</div>}
                        </div>
                        {addr && <div className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{addr}</div>}
                    </div>
                );
            })}
            {stores.length > 5 && <div className="text-[10px] text-slate-400 text-center">还有 {stores.length - 5} 家门店…</div>}
        </div>
    );
};

// ========== 子卡片: 优惠券/券 ==========

const CouponList: React.FC<{ data: any }> = ({ data }) => {
    const coupons = findArray(data, ['coupons', 'vouchers', 'list', 'data', 'items']) || [];
    if (!coupons.length) return null;
    return (
        <div className="space-y-1.5">
            <div className="text-[10px] text-yellow-700/70 font-bold uppercase">券</div>
            {coupons.slice(0, 6).map((c, i) => {
                const title = pickFirst<string>(c, ['title', 'name', 'couponName', 'goodsName']) || '麦当劳券';
                const value = pickFirst<any>(c, ['value', 'amount', 'discountAmount', 'price', 'points']);
                const expire = pickFirst<string>(c, ['expireDate', 'endTime', 'validTo', 'expireTime']);
                return (
                    <div key={i} className="flex items-center justify-between bg-white/70 rounded-lg p-2 border border-yellow-100">
                        <div className="min-w-0">
                            <div className="font-bold text-[12px] text-slate-800 truncate">🎟️ {title}</div>
                            {expire && <div className="text-[10px] text-slate-400">有效期至 {expire}</div>}
                        </div>
                        {value != null && <div className="text-[12px] font-bold text-yellow-700 shrink-0 ml-2">{typeof value === 'number' ? fmtMoney(value) : String(value)}</div>}
                    </div>
                );
            })}
        </div>
    );
};

// ========== 通用 JSON 折叠展示 ==========

const RawJsonFallback: React.FC<{ data: any; rawText?: string }> = ({ data, rawText }) => {
    const [expanded, setExpanded] = useState(false);
    // 字符串 (说明文档/markdown 之类) → 直接展示原文, 不再 JSON.stringify 加引号转义;
    // 对象/数组 → JSON.stringify 缩进展示
    const text = useMemo(() => {
        if (typeof data === 'string') return data;
        if (data != null) {
            try { return JSON.stringify(data, null, 2); } catch { /* ignore */ }
        }
        return rawText || '';
    }, [data, rawText]);
    if (!text) return <div className="text-[11px] text-slate-400">(空响应)</div>;
    const preview = text.length > 80 ? text.slice(0, 80).replace(/\n/g, ' ') + '…' : text;
    return (
        <div className="bg-white/70 rounded-lg border border-yellow-100">
            <button onClick={() => setExpanded(v => !v)} className="w-full text-left px-2 py-1.5 text-[10px] text-slate-500 font-mono active:scale-[0.99]">
                {expanded ? '▼ 收起' : '▶ 详情'} {!expanded && <span className="text-slate-400">{preview}</span>}
            </button>
            {expanded && (
                <pre className="text-[10px] text-slate-600 px-2 pb-2 overflow-auto max-h-64 leading-tight whitespace-pre-wrap break-all">{text}</pre>
            )}
        </div>
    );
};

// ========== 主入口 ==========

const McdCard: React.FC<McdCardProps> = ({ toolName, args, result, error, rawText, kind = 'generic' }) => {
    const isError = !!error;
    const menuItems = useMemo(() => result ? extractItems(result, ['items', 'products', 'goods', 'list', 'data', 'meals']) : null, [result]);
    // 如果 kind 是 generic 但能抽出 items (说明就是个菜单/商品列表), 也按菜单渲染
    const effectiveKind: McdCardProps['kind'] = useMemo(() => {
        if (kind && kind !== 'generic') return kind;
        if (menuItems && menuItems.length) return 'menu';
        return 'generic';
    }, [kind, menuItems]);

    return (
        <div className="w-72 rounded-2xl overflow-hidden border border-yellow-200 shadow-sm bg-gradient-to-br from-yellow-50 to-amber-50">
            {/* 头部: 麦当劳红黄条 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-yellow-400 to-amber-400">
                <span className="text-lg">🍟</span>
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-yellow-900">麦当劳</div>
                    <div className="text-[9px] text-yellow-900/70 font-mono truncate">{toolName}</div>
                </div>
                {isError ? (
                    <span className="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-bold">失败</span>
                ) : (
                    <span className="text-[9px] px-1.5 py-0.5 bg-white/70 text-yellow-900 rounded-full font-bold">已返回</span>
                )}
            </div>

            <div className="p-3 space-y-2">
                {isError ? (
                    <div className="text-[11px] text-red-600 leading-relaxed">{error}</div>
                ) : (
                    <>
                        {effectiveKind === 'menu' && menuItems && menuItems.length > 0 ? (
                            <div className="bg-white/70 rounded-lg overflow-hidden border border-yellow-100">
                                {menuItems.slice(0, 6).map((it, i) => <MenuItemRow key={i} item={it} />)}
                                {menuItems.length > 6 && <div className="text-[10px] text-slate-400 text-center py-1.5">还有 {menuItems.length - 6} 项…</div>}
                            </div>
                        ) : effectiveKind === 'order' && result ? (
                            <OrderSummary data={result} />
                        ) : effectiveKind === 'store' && result ? (
                            <StoreList data={result} />
                        ) : effectiveKind === 'coupon' && result ? (
                            <CouponList data={result} />
                        ) : (
                            <RawJsonFallback data={result} rawText={rawText} />
                        )}
                    </>
                )}
                {args && Object.keys(args).length > 0 && (
                    <div className="text-[9px] text-slate-400 font-mono truncate" title={JSON.stringify(args)}>
                        参数: {Object.keys(args).join(', ')}
                    </div>
                )}
            </div>
        </div>
    );
};

export default McdCard;
