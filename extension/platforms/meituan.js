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

// ============ 读取模式（scrape）============
//
// 后台标签 + DOM 抓取，避免 mtgsig — 因为是用户已登录浏览器自己访问页面，
// 平台压根儿没法分辨这是不是机器人。

const SCRAPE_SELECTORS = {
  // 搜店 / 首页店铺卡
  storeCard: '[class*="poi"]:not([class*="banner"]), [class*="shop-card"], [class*="restaurant"], li[class*="item"][data-id]',
  storeName: '[class*="name"], h3, h4, [data-test-id*="name"]',
  storeRating: '[class*="rating"], [class*="score"]',
  storeSales: '[class*="sales"], [class*="月售"]',
  storeDelivery: '[class*="delivery"], [class*="配送"]',
  storeMin: '[class*="min"], [class*="起送"]',
  storeDistance: '[class*="distance"]',
  storeTags: '[class*="tag"], [class*="category"]',
  storePromo: '[class*="discount"], [class*="promo"], [class*="满减"]',
};

function pickText(root, selector) {
  if (!root || !selector) return '';
  const el = root.querySelector(selector);
  return (el?.textContent || '').trim().replace(/\s+/g, ' ');
}

function pickNumber(text, fallback = 0) {
  if (!text) return fallback;
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : fallback;
}

function findStoreId(card) {
  // meituan 常见的 dom data attribute
  const direct = card.getAttribute('data-id') || card.getAttribute('data-poiid') || card.getAttribute('data-shop-id');
  if (direct) return `m_${direct}`;
  const link = card.querySelector('a[href*="dpShopId="], a[href*="shopId="]');
  if (link) {
    const href = link.getAttribute('href') || '';
    const m = href.match(/(?:dpShopId|shopId)=([^&]+)/);
    if (m) return `m_${decodeURIComponent(m[1])}`;
  }
  return null;
}

async function scrapeSearch(payload) {
  await waitForMenuLoaded(8000); // 复用菜单等待逻辑——首页店铺加载也需要时间
  const cards = $$(SCRAPE_SELECTORS.storeCard);
  const stores = [];
  for (const card of cards) {
    const name = pickText(card, SCRAPE_SELECTORS.storeName);
    if (!name) continue;
    const id = findStoreId(card) || `m_unknown_${stores.length}`;
    const rating = pickNumber(pickText(card, SCRAPE_SELECTORS.storeRating), 0);
    const monthlySales = pickNumber(pickText(card, SCRAPE_SELECTORS.storeSales), 0);
    const deliveryTime = pickNumber(pickText(card, SCRAPE_SELECTORS.storeDelivery), 30);
    const minOrder = pickNumber(pickText(card, SCRAPE_SELECTORS.storeMin), 0);
    const distance = (() => {
      const t = pickText(card, SCRAPE_SELECTORS.storeDistance);
      if (!t) return 0;
      if (t.includes('km')) return pickNumber(t);
      if (t.includes('m')) return pickNumber(t) / 1000;
      return pickNumber(t);
    })();
    const tags = $$(SCRAPE_SELECTORS.storeTags, card)
      .map(el => (el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 5);
    const promo = pickText(card, SCRAPE_SELECTORS.storePromo);
    stores.push({
      id,
      name,
      rating,
      deliveryTime,
      deliveryFee: 0,
      minOrder,
      distance,
      monthlySales,
      tags,
      promo,
    });
  }
  return { ok: true, data: { source: 'real_bridge', stores: stores.slice(0, 15) } };
}

async function scrapeMenu(payload) {
  const ready = await waitForMenuLoaded(8000);
  if (!ready) return { ok: false, error: '没等到菜单加载（可能要先选个地址或店铺已下线）' };
  const items = [];
  for (const card of $$(SELECTORS.menuItem)) {
    const nameEl = card.querySelector(SELECTORS.itemName);
    const name = (nameEl?.textContent || '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const id =
      card.getAttribute('data-spuid') ||
      card.getAttribute('data-id') ||
      card.getAttribute('data-test-id') ||
      `i_${items.length}`;
    const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
    const priceText = (priceEl?.textContent || '').trim();
    const price = pickNumber(priceText, 0);
    const salesEl = card.querySelector('[class*="sale"], [class*="Sale"], [class*="月售"]');
    const sales = pickNumber((salesEl?.textContent || '').trim(), 0);
    const tags = Array.from(card.querySelectorAll('[class*="tag"]'))
      .map(el => (el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    items.push({
      id,
      name,
      price,
      originalPrice: price,
      sales,
      tags,
      img: null,
      desc: '',
    });
  }
  // 店铺基本信息（从页面顶部抓）
  const headerName = pickText(document, '[class*="poi-name"], [class*="shop-name"], h1');
  const store = headerName
    ? {
        id: payload.storeId,
        name: headerName,
        rating: pickNumber(pickText(document, '[class*="poi-score"], [class*="score"]'), 0),
        deliveryTime: pickNumber(pickText(document, '[class*="delivery-time"]'), 30),
        deliveryFee: pickNumber(pickText(document, '[class*="delivery-fee"], [class*="shipping"]'), 0),
        minOrder: pickNumber(pickText(document, '[class*="min-price"], [class*="起送"]'), 0),
        distance: 0,
        monthlySales: 0,
        tags: [],
        promo: '',
      }
    : null;
  return { ok: true, data: { source: 'real_bridge', store, items: items.slice(0, 50) } };
}

async function handleScrape(task, payload) {
  try {
    const result =
      task === 'meituan_search'
        ? await scrapeSearch(payload)
        : task === 'meituan_menu'
          ? await scrapeMenu(payload)
          : { ok: false, error: `unknown scrape task: ${task}` };
    chrome.runtime.sendMessage({ type: 'platform_read_result', result });
  } catch (e) {
    chrome.runtime.sendMessage({
      type: 'platform_read_result',
      result: { ok: false, error: String(e?.message || e) },
    });
  }
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
  if (msg?.type === 'meal_scrape') {
    handleScrape(msg.task, msg.payload || {}).catch(e => {
      chrome.runtime.sendMessage({
        type: 'platform_read_result',
        result: { ok: false, error: String(e?.message || e) },
      });
    });
  }
  return false;
});
