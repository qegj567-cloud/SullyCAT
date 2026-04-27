// SullyOS Meal Bridge — background service worker (MV3)
//
// 职责：
//   1. 接收来自 SullyOS bridge content script 的"下单"请求
//   2. 用 chrome.tabs.create 打开目标平台对应 URL（用户已登录态）
//   3. 等平台 content script 加载完成后转发"加购物车"指令
//   4. 把执行结果（成功/失败/进展）回传给 SullyOS

const PLATFORM_ENTRYPOINT = {
  meituan: 'https://h5.waimai.meituan.com/waimai/mindex/menu?dpShopId={storeId}&shopId={storeId}',
  eleme: 'https://h5.ele.me/shop/#{storeId}',
  hema: 'https://www.freshhema.com/?storeId={storeId}',
};

// 读取任务（搜店/看菜单）的 URL 拼装
//
// 注意：SullyOS 侧给的 storeId 带前缀 "m_"（区分平台），但 meituan 真实 ID
// 不带这个，所以对外打 URL 时要先 strip 掉，否则 meituan 看到 dpShopId=m_2003
// 直接报"参数错误"。
//
// 搜索路径不再用 ?searchKey= 这种猜的 query string——meituan H5 不认。
// 改成直接打开外卖首页，让 platform 脚本抓"附近店铺"列表给 char 自己挑。
const stripPlatformPrefix = id => String(id || '').replace(/^[a-z]_/, '');
const READ_URLS = {
  meituan_search: () => 'https://h5.waimai.meituan.com/',
  meituan_menu: payload => {
    const id = stripPlatformPrefix(payload.storeId);
    return `https://h5.waimai.meituan.com/waimai/mindex/menu?dpShopId=${encodeURIComponent(id)}&shopId=${encodeURIComponent(id)}`;
  },
};

// 待 ack 的写任务表：tabId -> { sullyTabId, payload, sent, createdAt }
const pendingByTab = new Map();
// 待 ack 的读任务表：tabId -> { sullyTabId, requestId, task, payload, deadline, sent }
const pendingReads = new Map();
// 反向：sullyTabId -> Set<jobTabId>，方便用户关 SullyOS 标签时清理
const sullyToJobTabs = new Map();

const READ_TIMEOUT_MS = 20000;

function buildEntrypoint(platform, storeId) {
  const tpl = PLATFORM_ENTRYPOINT[platform];
  if (!tpl) return null;
  return tpl.replace(/\{storeId\}/g, encodeURIComponent(storeId));
}

async function startOrderJob(senderTab, payload) {
  const { platform, storeId } = payload;
  const url = buildEntrypoint(platform, storeId);
  if (!url) {
    return { ok: false, error: `unsupported platform: ${platform}` };
  }
  const jobTab = await chrome.tabs.create({ url, active: true });
  pendingByTab.set(jobTab.id, {
    sullyTabId: senderTab?.id,
    payload,
    sent: false,
    createdAt: Date.now(),
  });
  if (senderTab?.id != null) {
    if (!sullyToJobTabs.has(senderTab.id)) sullyToJobTabs.set(senderTab.id, new Set());
    sullyToJobTabs.get(senderTab.id).add(jobTab.id);
  }
  return { ok: true, jobTabId: jobTab.id };
}

// 读 cookies 拿用户在 meituan 上保存的位置/地址，拼到 URL query string 上。
// 用户截给我看的页面源码里明确有：
//   var lat = query.get('lat'); var lng = query.get('lng');
// 所以 H5 是支持从 URL 强制覆盖定位的。
async function readMeituanLocationFromCookies() {
  if (!chrome.cookies?.getAll) return null;
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.meituan.com' });
    const map = Object.fromEntries(cookies.map(c => [c.name, c.value]));
    // 常见的 meituan 定位 cookie 名
    const latlng = map['latlng'] || map['_lx_pos'] || map['__mta'];
    if (latlng) {
      const m = String(latlng).match(/(-?\d+\.\d+)[,\s_]+(-?\d+\.\d+)/);
      if (m) return { lat: m[1], lng: m[2] };
    }
    if (map['lat'] && map['lng']) return { lat: map['lat'], lng: map['lng'] };
    return null;
  } catch {
    return null;
  }
}

function appendQuery(url, params) {
  if (!params) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.searchParams.set(k, String(v));
  }
  return u.toString();
}

// 找用户已经打开的 meituan tab — 复用它就能继承用户已选好的地址。
// 但只复用"安全"的 tab：在首页/店铺浏览的，避免把用户在结算/购物车里的操作给搞没了。
function isSafeToReuse(url) {
  if (!url) return false;
  // 结算 / 订单 / 支付类页面不动
  const unsafe = [/checkout/i, /confirm/i, /pay(ment)?\b/i, /\/order/i, /submit/i];
  if (unsafe.some(p => p.test(url))) return false;
  return true;
}

async function findExistingMeituanTab() {
  if (!chrome.tabs?.query) return null;
  try {
    // 把所有可能的 meituan H5 域名都包进来——之前漏了 m.meituan.com /
    // waimai.meituan.com 等不带 h5/i 前缀的形式
    const tabs = await chrome.tabs.query({
      url: [
        'https://*.meituan.com/*',
        'https://meituan.com/*',
      ],
    });
    // 过滤：只要 H5 外卖相关的，不要 PC 站、商家后台、订单详情等
    const isMeituanH5 = t => {
      if (!t.url) return false;
      const u = t.url;
      return /\b(h5\.waimai|i\.waimai|waimai|m|h5)\.meituan\.com/.test(u);
    };
    const candidates = tabs.filter(isMeituanH5);
    const safe = candidates.filter(t => isSafeToReuse(t.url));
    if (safe.length === 0) return null;
    const inactive = safe.find(t => !t.active);
    return inactive || safe[0] || null;
  } catch {
    return null;
  }
}

async function startReadJob(senderTab, task, payload, requestId) {
  const builder = READ_URLS[task];
  if (!builder) return { ok: false, error: `unsupported read task: ${task}` };

  let url;
  try {
    url = builder(payload || {});
  } catch (e) {
    return { ok: false, error: `bad payload: ${e?.message || e}` };
  }

  // 把用户保存的 lat/lng 拼进 URL — 解决"扩展开的新 tab 默认上海"
  const loc = await readMeituanLocationFromCookies();
  if (loc) url = appendQuery(url, loc);

  // 优先复用用户已打开的 meituan tab。它已经登录、已选地址、已经初始化好——
  // 我们直接 chrome.tabs.update 把它导航到目标 URL，避免新开 tab 触发"重新定位"。
  let jobTab = null;
  let reusedExisting = false;
  const existing = await findExistingMeituanTab();
  if (existing && existing.id != null) {
    try {
      jobTab = await chrome.tabs.update(existing.id, { url, active: true });
      reusedExisting = true;
    } catch {
      jobTab = null;
    }
  }
  if (!jobTab) {
    jobTab = await chrome.tabs.create({ url, active: true });
  }

  const deadline = setTimeout(() => {
    relayReadResult(jobTab.id, { ok: false, error: 'read timeout (页面没在 20s 内返回数据)' });
  }, READ_TIMEOUT_MS);
  pendingReads.set(jobTab.id, {
    sullyTabId: senderTab?.id,
    requestId,
    task,
    payload,
    deadline,
    sent: false,
    reusedExisting,
  });
  if (senderTab?.id != null) {
    if (!sullyToJobTabs.has(senderTab.id)) sullyToJobTabs.set(senderTab.id, new Set());
    sullyToJobTabs.get(senderTab.id).add(jobTab.id);
  }
  return { ok: true, jobTabId: jobTab.id, reusedExisting };
}

async function relayReadResult(tabId, result) {
  const pending = pendingReads.get(tabId);
  if (!pending) return;
  pendingReads.delete(tabId);
  clearTimeout(pending.deadline);
  if (pending.sullyTabId != null) {
    try {
      await chrome.tabs.sendMessage(pending.sullyTabId, {
        type: 'meal_read_result',
        requestId: pending.requestId,
        ok: !!result.ok,
        data: result.data,
        error: result.error,
      });
    } catch {}
    const set = sullyToJobTabs.get(pending.sullyTabId);
    if (set) set.delete(tabId);
  }
  if (result.ok) {
    // 成功：关掉，焦点自动回到 SullyOS
    try {
      await chrome.tabs.remove(tabId);
    } catch {}
  } else {
    // 失败：tab 留着让用户自己看页面真实长啥样、F12 找 selector，
    // 同时把 SullyOS 焦点拉回来方便用户继续跟 char 聊。
    if (pending.sullyTabId != null) {
      try {
        await chrome.tabs.update(pending.sullyTabId, { active: true });
      } catch {}
    }
  }
}

// 平台 content script 在 DOMContentLoaded 后会发 "platform_ready"。
// 根据 tabId 是写任务还是读任务，分别转发不同的指令。
async function handlePlatformReady(tabId) {
  const writePending = pendingByTab.get(tabId);
  if (writePending && !writePending.sent) {
    writePending.sent = true;
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'meal_execute',
        payload: writePending.payload,
      });
    } catch {}
    return;
  }
  const readPending = pendingReads.get(tabId);
  if (readPending && !readPending.sent) {
    readPending.sent = true;
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'meal_scrape',
        task: readPending.task,
        payload: readPending.payload,
      });
    } catch {}
    return;
  }
}

// 平台 content script 报告进度/完成。回传给 SullyOS 标签。
async function relayToSully(tabId, msg) {
  const pending = pendingByTab.get(tabId);
  if (!pending || pending.sullyTabId == null) return;
  try {
    await chrome.tabs.sendMessage(pending.sullyTabId, {
      type: 'meal_progress',
      jobTabId: tabId,
      ...msg,
    });
  } catch {
    // SullyOS 标签可能已关，安静失败
  }
  if (msg.status === 'done' || msg.status === 'error') {
    // 不主动关标签，让用户在结算页完成支付
    pendingByTab.delete(tabId);
    const set = sullyToJobTabs.get(pending.sullyTabId);
    if (set) set.delete(tabId);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  // 来自 SullyOS bridge：发起下单任务（写）
  if (msg.type === 'meal_dispatch') {
    startOrderJob(sender.tab, msg.payload).then(sendResponse);
    return true;
  }

  // 来自 SullyOS bridge：发起读取任务（搜店 / 看菜单）
  if (msg.type === 'meal_read') {
    startReadJob(sender.tab, msg.task, msg.payload, msg.requestId).then(sendResponse);
    return true;
  }

  // 来自 SullyOS bridge：握手探测
  if (msg.type === 'meal_ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  // 来自平台 content script：DOM ready，请发 payload 过来
  if (msg.type === 'platform_ready' && sender.tab?.id != null) {
    handlePlatformReady(sender.tab.id);
    return false;
  }

  // 来自平台 content script：写任务进度 / 完成
  if (msg.type === 'platform_progress' && sender.tab?.id != null) {
    relayToSully(sender.tab.id, msg);
    return false;
  }

  // 来自平台 content script：读任务结果
  if (msg.type === 'platform_read_result' && sender.tab?.id != null) {
    relayReadResult(sender.tab.id, msg.result || { ok: false, error: 'no result' });
    return false;
  }

  return false;
});

// 用户主动关 SullyOS 标签时，把对应未完成 job 标记取消
chrome.tabs.onRemoved.addListener(tabId => {
  if (sullyToJobTabs.has(tabId)) {
    for (const jobTabId of sullyToJobTabs.get(tabId)) {
      pendingByTab.delete(jobTabId);
      const r = pendingReads.get(jobTabId);
      if (r) {
        clearTimeout(r.deadline);
        pendingReads.delete(jobTabId);
      }
    }
    sullyToJobTabs.delete(tabId);
  }
  if (pendingByTab.has(tabId)) pendingByTab.delete(tabId);
  if (pendingReads.has(tabId)) {
    const r = pendingReads.get(tabId);
    clearTimeout(r.deadline);
    pendingReads.delete(tabId);
  }
});
