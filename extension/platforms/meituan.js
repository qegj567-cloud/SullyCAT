// SullyOS Meal Bridge — Meituan H5 platform script
//
// 注入到 h5.waimai.meituan.com / i.meituan.com / wx-i.meituan.com。
// 收到 background 转来的 meal_execute 后，按 itemName 在菜单页找按钮点。
//
// **重要**：所有 selector 是 2026-04 时点的 best-effort 快照。平台改版了
// 你只需要更新下面的 SELECTORS 表，不用改其它任何地方。

const SELECTORS = {
  // 菜单页里每个菜的 li/div 卡片
  menuItem: '[data-spuid], [data-test-id="food-item"], li.menuItem, .food-item',
  // 在 menuItem 里找标题文字
  itemName: '[class*="name"], [data-test-id="food-name"], h3, .name',
  // 加号按钮
  addButton: '[class*="add"][class*="btn"], [class*="addBtn"], button[aria-label*="加"], svg[class*="add"]',
  // 购物车 / 结算入口
  cartEntry: '[class*="cart"][class*="enter"], [data-test-id="cart-entry"], button[aria-label*="购物车"]',
  checkoutButton: '[class*="checkout"], [class*="settlement"], button[aria-label*="结算"], button[aria-label*="去支付"]',
};

function progress(status, extra = {}) {
  try {
    chrome.runtime.sendMessage({ type: 'platform_progress', status, ...extra });
  } catch {}
}

function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function findItemCard(itemName) {
  const lower = itemName.trim().toLowerCase();
  for (const card of $$(SELECTORS.menuItem)) {
    const nameEl = card.querySelector(SELECTORS.itemName);
    const text = (nameEl?.textContent || card.textContent || '').toLowerCase();
    if (!text) continue;
    if (text.includes(lower) || lower.includes(text.replace(/\s+/g, ''))) {
      return card;
    }
  }
  // 兜底：模糊匹配——拆字串看两两连续字符匹配
  for (const card of $$(SELECTORS.menuItem)) {
    const text = (card.textContent || '').toLowerCase();
    let hits = 0;
    for (let i = 0; i + 1 < lower.length; i++) {
      if (text.includes(lower.slice(i, i + 2))) hits++;
    }
    if (hits >= Math.max(2, lower.length - 2)) return card;
  }
  return null;
}

function clickAddButton(card) {
  const btn = card.querySelector(SELECTORS.addButton);
  if (!btn) return false;
  // 一些 React 版本的按钮要冒泡 click + touchend 才认
  const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
  btn.dispatchEvent(evt);
  return true;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForMenuLoaded(timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const items = $$(SELECTORS.menuItem);
    if (items.length > 0) return true;
    await delay(300);
  }
  return false;
}

async function executeOrder(payload) {
  const { items = [] } = payload || {};
  progress('opened', { message: `进入店铺：${location.host}${location.pathname}` });

  const ready = await waitForMenuLoaded();
  if (!ready) {
    progress('error', { message: '没等到菜单加载（可能未登录或店铺已下线）' });
    return;
  }

  let added = 0;
  const failed = [];
  for (const it of items) {
    progress('adding', { message: `找：${it.name}（×${it.quantity || 1}）` });
    const card = findItemCard(it.name);
    if (!card) {
      failed.push(it.name);
      continue;
    }
    const qty = Math.max(1, Number(it.quantity || 1));
    let ok = true;
    for (let i = 0; i < qty; i++) {
      if (!clickAddButton(card)) { ok = false; break; }
      await delay(200);
    }
    if (ok) added++;
    else failed.push(it.name);
  }

  if (added === 0) {
    progress('error', { message: '一道菜都没加进去——选择器可能过期了，去 extension/platforms/meituan.js 改 SELECTORS' });
    return;
  }

  // 尝试跳到结算页（可选——失败也不致命，用户能自己点购物车按钮）
  await delay(500);
  const checkout = document.querySelector(SELECTORS.checkoutButton) || document.querySelector(SELECTORS.cartEntry);
  if (checkout) {
    checkout.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  progress('done', {
    message: `加好 ${added}/${items.length} 道菜${failed.length ? `（找不到：${failed.join('、')}）` : ''}，结算页就在你眼前，付钱吧`,
    data: { added, failed },
  });
}

// 通知 background：DOM 就绪、可以接 payload 了
chrome.runtime.sendMessage({ type: 'platform_ready' });

// 接 background 转来的 payload
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'meal_execute') {
    executeOrder(msg.payload).catch(e => {
      progress('error', { message: String(e?.message || e) });
    });
  }
  return false;
});
