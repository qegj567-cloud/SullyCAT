import React from 'react';
import { ShoppingCart, ArrowSquareOut, Trash, Sparkle } from '@phosphor-icons/react';
import {
  MEAL_PLATFORM_LABEL,
  MealCartLine,
  buildPaymentDeeplink,
  summarizeCart,
} from '../../utils/mealClient';
import { MealCheckoutProposal } from './types';

interface Props {
  cart: MealCartLine[];
  checkout: MealCheckoutProposal | null;
  onRemove: (line: MealCartLine) => void;
  onClear: () => void;
}

const platformBadge = (platform: string) => {
  const cls =
    platform === 'eleme' ? 'bg-blue-100 text-blue-700'
    : platform === 'meituan' ? 'bg-yellow-100 text-yellow-700'
    : 'bg-emerald-100 text-emerald-700';
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cls}`}>
      {MEAL_PLATFORM_LABEL[platform as keyof typeof MEAL_PLATFORM_LABEL] || platform}
    </span>
  );
};

const openDeeplink = (platform: 'eleme' | 'meituan' | 'hema', storeId: string) => {
  const links = buildPaymentDeeplink(platform, storeId);
  // 移动端先尝试拉起原生 App，PC 浏览器拉不起来的兜底跳 H5。
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (isMobile) {
    const t = Date.now();
    window.location.href = links.app;
    setTimeout(() => {
      if (Date.now() - t < 1500) window.open(links.web, '_blank');
    }, 1200);
  } else {
    window.open(links.web, '_blank');
  }
};

const CartPanel: React.FC<Props> = ({ cart, checkout, onRemove, onClear }) => {
  const summary = summarizeCart(cart);

  return (
    <div className="flex flex-col h-full bg-white/80 backdrop-blur-md border-l border-black/5 text-slate-800">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
        <div className="flex items-center gap-2">
          <ShoppingCart size={18} weight="bold" />
          <span className="font-semibold">购物车</span>
          {summary.totalItems > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-bold">
              {summary.totalItems}
            </span>
          )}
        </div>
        {cart.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-slate-500 hover:text-red-500 transition flex items-center gap-1"
          >
            <Trash size={12} weight="bold" />
            清空
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {cart.length === 0 && !checkout && (
          <div className="text-center text-slate-400 text-sm mt-12 px-4">
            还没挑东西呢。<br />
            告诉 char 你的预算 / 口味 / 心情，<br />
            ta 会帮你看几家然后挑好。
          </div>
        )}

        {summary.byStore.map(group => (
          <div
            key={`${group.platform}|${group.storeId}`}
            className="rounded-xl bg-white border border-black/5 shadow-sm overflow-hidden"
          >
            <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {platformBadge(group.platform)}
                <span className="text-sm font-medium truncate">{group.storeName}</span>
              </div>
              <span className="text-xs text-slate-500 shrink-0 ml-2">
                小计 ¥{group.subtotal.toFixed(2)}
              </span>
            </div>
            <ul className="divide-y divide-black/5">
              {group.lines.map(line => (
                <li key={`${line.platform}-${line.storeId}-${line.item.id}`} className="px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{line.item.name}</div>
                    <div className="text-xs text-slate-400">¥{line.item.price} × {line.quantity}</div>
                  </div>
                  <button
                    onClick={() => onRemove(line)}
                    className="text-slate-400 hover:text-red-500 shrink-0"
                    title="移除"
                  >
                    <Trash size={14} weight="bold" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {checkout && (
        <div className="border-t border-black/5 px-4 py-3 bg-gradient-to-br from-orange-50 to-pink-50">
          <div className="flex items-center gap-1.5 mb-1 text-xs text-orange-600 font-semibold">
            <Sparkle size={14} weight="fill" />
            char 已替你挑好
          </div>
          <div className="text-sm font-medium mb-1">{checkout.storeName}</div>
          {checkout.reasoning && (
            <div className="text-xs text-slate-600 mb-2 leading-relaxed">{checkout.reasoning}</div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-orange-600">¥{checkout.subtotal.toFixed(2)}</span>
            <button
              onClick={() => openDeeplink(checkout.platform, checkout.storeId)}
              className="px-4 py-2 rounded-full bg-orange-500 text-white text-sm font-semibold flex items-center gap-1.5 shadow-sm hover:bg-orange-600 active:scale-95 transition"
            >
              去 {MEAL_PLATFORM_LABEL[checkout.platform]} 付款
              <ArrowSquareOut size={14} weight="bold" />
            </button>
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5 leading-snug">
            点击会拉起对应 App / H5，主人在 App 里确认地址和支付。
          </div>
        </div>
      )}

      {!checkout && cart.length > 0 && (
        <div className="border-t border-black/5 px-4 py-3 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="text-xs text-slate-500">当前总计</div>
            <div className="text-lg font-bold text-slate-800">¥{summary.totalPrice.toFixed(2)}</div>
          </div>
          <div className="text-xs text-slate-400 max-w-[55%] text-right leading-snug">
            还没敲定。让 char 调用 propose_checkout 后这里会出现"去支付"。
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPanel;
