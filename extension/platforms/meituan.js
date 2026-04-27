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
//
// 反爬抗性策略：
//   1. 先按"显式选择器"找
//   2. 找不到则用"文本关键字"启发式（"起送"/"配送"/"月售"）反推卡片
//   3. 还是找不到，**返回错误并附带 DOM 摘要**，让上层告诉用户"扩展抓不到"
//      而不是静默落 mock 假装自己抓到了

const SCRAPE_SELECTORS = {
  storeCard: '[class*="poi"]:not([class*="banner"]), [class*="shop-card"], [class*="restaurant"], li[class*="item"][data-id], a[href*="dpShopId"], a[href*="shopId="]',
  storeName: '[class*="name"], h3, h4, [data-test-id*="name"]',
  storeRating: '[class*="rating"], [class*="score"]',
  storeSales: '[class*="sales"], [class*="月售"], [class*="sale"]',
  storeDelivery: '[class*="delivery"], [class*="time"]',
  storeMin: '[class*="min"]',
  storeDistance: '[class*="distance"]',
  storeTags: '[class*="tag"], [class*="category"]',
  storePromo: '[class*="discount"], [class*="promo"]',
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
  const direct =
    card.getAttribute?.('data-id') ||
    card.getAttribute?.('data-poiid') ||
    card.getAttribute?.('data-shop-id');
  if (direct) return `m_${direct}`;
  const link =
    card.tagName === 'A' && card.href ? card : card.querySelector?.('a[href*="dpShopId="], a[href*="shopId="]');
  if (link) {
    const href = link.getAttribute?.('href') || link.href || '';
    const m = href.match(/(?:dpShopId|shopId)=([^&]+)/);
    if (m) return `m_${decodeURIComponent(m[1])}`;
  }
  return null;
}

// 启发式：找所有同时含"起送"和"分钟"或"km"的元素，往上回溯三层当作卡片
function heuristicCards() {
  const out = new Set();
  const all = Array.from(document.querySelectorAll('div, li, article, a'));
  for (const el of all) {
    const t = el.textContent || '';
    if (t.length > 800) continue; // 太长的元素肯定不是单卡片
    if (!/起送/.test(t)) continue;
    if (!/(分钟|km|公里|m)/.test(t)) continue;
    // 回溯到一个含 store 链接或 data-id 的祖先
    let cur = el;
    for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
      if (
        findStoreId(cur) ||
        cur.querySelector?.('[class*="name"]')
      ) {
        out.add(cur);
        break;
      }
      cur = cur.parentElement;
    }
  }
  return Array.from(out);
}

function snapshotDom(maxLen = 600) {
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();

  // 找所有可能是店铺链接的 anchor（dpShopId / shopId / poiId / waimai/shop）
  const shopAnchors = Array.from(
    document.querySelectorAll(
      'a[href*="dpShopId"], a[href*="shopId"], a[href*="poiId"], a[href*="/shop/"], a[href*="/menu"]'
    )
  ).slice(0, 6);

  // 抓住每个 shop anchor 往上 3 层祖先的 class，给我看真实卡片结构
  const anchorAncestors = shopAnchors.map(a => {
    const ancestors = [];
    let cur = a;
    for (let i = 0; i < 4 && cur; i++) {
      ancestors.push({
        tag: cur.tagName,
        class: typeof cur.className === 'string' ? cur.className.slice(0, 100) : '',
        id: cur.id || null,
        dataAttrs: Array.from(cur.attributes || [])
          .filter(at => at.name.startsWith('data-'))
          .slice(0, 4)
          .map(at => `${at.name}=${at.value.slice(0, 30)}`),
      });
      cur = cur.parentElement;
    }
    return {
      href: a.href,
      text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
      ancestors,
    };
  });

  // 直接抓所有"含『起送』文本的元素"的 class（这是店卡最稳定的标识）
  const qisongCandidates = [];
  for (const el of document.querySelectorAll('div, li, span, p')) {
    const t = el.textContent || '';
    if (t.length > 0 && t.length < 300 && /起送/.test(t) && !el.querySelector('div')) {
      qisongCandidates.push({
        tag: el.tagName,
        class: typeof el.className === 'string' ? el.className.slice(0, 100) : '',
        text: t.replace(/\s+/g, ' ').trim().slice(0, 60),
      });
      if (qisongCandidates.length >= 3) break;
    }
  }

  return {
    title: document.title,
    url: location.href,
    bodyTextHead: text.slice(0, maxLen),
    shopAnchorCount: shopAnchors.length,
    anchorAncestors,
    qisongCandidates,
    likelyState:
      /地址|定位|授权/.test(text.slice(0, 200))
        ? 'needs_location'
        : /参数错误|出错|404|迷路/.test(text.slice(0, 200))
          ? 'error_page'
          : /登录|未登录/.test(text.slice(0, 200))
            ? 'not_logged_in'
            : shopAnchors.length === 0
              ? 'rendered_no_shops'
              : 'rendered_with_shops',
  };
}

async function scrapeSearch(payload) {
  // 等首屏加载——meituan 首屏渲染慢，宽松一点
  await waitForMenuLoaded(10000);
  await delay(800); // 多等一阵让懒加载的店铺出现

  let cards = $$(SCRAPE_SELECTORS.storeCard);
  let extractStrategy = 'selector';
  if (cards.length === 0) {
    cards = heuristicCards();
    extractStrategy = 'heuristic_qisong';
  }
  if (cards.length === 0) {
    // 最后兜底：每个含 dpShopId/shopId/poiId 的 anchor，回溯到含店名的祖先节点
    const anchors = Array.from(
      document.querySelectorAll('a[href*="dpShopId"], a[href*="shopId"], a[href*="poiId"]')
    );
    const set = new Set();
    for (const a of anchors) {
      let cur = a;
      for (let i = 0; i < 5 && cur; i++) {
        if (cur.querySelector?.('h3, h4, [class*="name"]')) {
          set.add(cur);
          break;
        }
        cur = cur.parentElement;
      }
    }
    cards = Array.from(set);
    extractStrategy = 'heuristic_anchor';
  }

  if (cards.length === 0) {
    const diag = snapshotDom();
    let hint = '';
    if (diag.likelyState === 'needs_location') hint = '页面要求选地址 —— 先在 meituan 选好地址';
    else if (diag.likelyState === 'error_page') hint = '页面是错误页（参数错误/出错了）';
    else if (diag.likelyState === 'not_logged_in') hint = '页面要求登录 —— 先登录 meituan';
    else hint = '页面打开了但抓不到店——选择器需要更新，留着这个 tab 让你看';
    return {
      ok: false,
      error: hint,
      data: { source: 'real_bridge_empty', diagnostic: diag },
    };
  }

  const stores = [];
  const seen = new Set();
  for (const card of cards) {
    const id = findStoreId(card);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = pickText(card, SCRAPE_SELECTORS.storeName) || (card.textContent || '').trim().split(/\s+/)[0];
    if (!name) continue;
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

  if (stores.length === 0) {
    return {
      ok: false,
      error: `找到 ${cards.length} 个候选元素但提不出 storeId——选择器需要更新`,
      data: { source: 'real_bridge_empty', diagnostic: snapshotDom() },
    };
  }

  return {
    ok: true,
    data: {
      source: 'real_bridge',
      query: payload?.query || '',
      stores: stores.slice(0, 15),
      meta: { foundCards: cards.length, extractStrategy },
    },
  };
}

async function scrapeMenu(payload) {
  const ready = await waitForMenuLoaded(10000);
  if (!ready) {
    return {
      ok: false,
      error: '没等到菜单加载（可能要先选个地址或店铺已下线）',
      data: { source: 'real_bridge_empty', diagnostic: snapshotDom() },
    };
  }
  await delay(500);
  const items = [];
  const seen = new Set();
  for (const card of $$(SELECTORS.menuItem)) {
    const nameEl = card.querySelector(SELECTORS.itemName);
    const name = (nameEl?.textContent || '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const id =
      card.getAttribute('data-spuid') ||
      card.getAttribute('data-id') ||
      card.getAttribute('data-test-id') ||
      `i_${name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
    const price = pickNumber((priceEl?.textContent || '').trim(), 0);
    const salesEl = card.querySelector('[class*="sale"], [class*="Sale"], [class*="月售"]');
    const sales = pickNumber((salesEl?.textContent || '').trim(), 0);
    const tags = Array.from(card.querySelectorAll('[class*="tag"]'))
      .map(el => (el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    items.push({ id, name, price, originalPrice: price, sales, tags, img: null, desc: '' });
  }
  if (items.length === 0) {
    return {
      ok: false,
      error: '菜单页打开了但 0 道菜——可能是错误页（"参数错误"/"出错了"）或选择器过期',
      data: { source: 'real_bridge_empty', diagnostic: snapshotDom() },
    };
  }
  const headerName = pickText(document, '[class*="poi-name"], [class*="shop-name"], h1');
  const store = headerName
    ? {
        id: payload?.storeId || '',
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
