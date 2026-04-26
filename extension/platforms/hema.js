// SullyOS Meal Bridge — 盒马 H5 platform script (stub)
//
// 待补 selector。流程跟 platforms/meituan.js 一致。
// 盒马 H5 比外卖类多一个"选自提门店"步骤，写自动化时记得处理。

function progress(status, extra = {}) {
  try {
    chrome.runtime.sendMessage({ type: 'platform_progress', status, ...extra });
  } catch {}
}

chrome.runtime.sendMessage({ type: 'platform_ready' });
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'meal_execute') {
    progress('error', {
      message: '盒马 platform script 还没写自动加购逻辑，先用 deeplink 跳过去手动操作',
    });
  }
  return false;
});
