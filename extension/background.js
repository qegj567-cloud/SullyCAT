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

// 待 ack 的任务表：tabId -> { sullyTabId, requestId, payload, sent }
const pendingByTab = new Map();
// 反向：sullyTabId -> Set<jobTabId>，方便用户关 SullyOS 标签时清理
const sullyToJobTabs = new Map();

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

// 平台 content script 在 DOMContentLoaded 后会发 "platform_ready"。
// 收到后立刻把 add_to_cart 列表转发过去。
async function handlePlatformReady(tabId) {
  const pending = pendingByTab.get(tabId);
  if (!pending || pending.sent) return;
  pending.sent = true;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'meal_execute',
      payload: pending.payload,
    });
  } catch (e) {
    // content script 可能在 navigation 中临时没听，忽略错误下次再试
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

  // 来自 SullyOS bridge：发起下单任务
  if (msg.type === 'meal_dispatch') {
    startOrderJob(sender.tab, msg.payload).then(sendResponse);
    return true; // async response
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

  // 来自平台 content script：进度 / 完成
  if (msg.type === 'platform_progress' && sender.tab?.id != null) {
    relayToSully(sender.tab.id, msg);
    return false;
  }

  return false;
});

// 用户主动关 SullyOS 标签时，把对应未完成 job 标记取消
chrome.tabs.onRemoved.addListener(tabId => {
  if (sullyToJobTabs.has(tabId)) {
    for (const jobTabId of sullyToJobTabs.get(tabId)) {
      pendingByTab.delete(jobTabId);
    }
    sullyToJobTabs.delete(tabId);
  }
  if (pendingByTab.has(tabId)) pendingByTab.delete(tabId);
});
