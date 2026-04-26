// SullyOS Meal Bridge — 饿了么 H5 platform script (stub)
//
// 待补 selector。流程跟 platforms/meituan.js 完全一致，照着抄、把 SELECTORS 换了即可。
// 注意：饿了么大量流量已迁到淘宝闪购，独立 H5 用户活跃度下降——优先级低于美团。

function progress(status, extra = {}) {
  try {
    chrome.runtime.sendMessage({ type: 'platform_progress', status, ...extra });
  } catch {}
}

chrome.runtime.sendMessage({ type: 'platform_ready' });
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'meal_execute') {
    progress('error', {
      message: '饿了么 platform script 还没写自动加购逻辑，先用 deeplink 跳过去手动操作',
    });
  }
  return false;
});
