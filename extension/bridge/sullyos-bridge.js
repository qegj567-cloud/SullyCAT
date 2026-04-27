// SullyOS Meal Bridge — bridge content script
//
// 这个脚本注入到 SullyOS 网页（localhost / netlify / vercel / pages.dev / sullyos.app）。
// 它在 window 上跑 postMessage 协议跟 SullyOS 网页通信，再用 chrome.runtime 跟 background
// 通信。对 SullyOS 来说就像页面里多了一个能下单的 API。
//
// 协议（以 SullyOS 网页视角）：
//   要下单：window.postMessage({ source: 'sullyos-meal', type: 'dispatch', requestId, payload }, '*')
//   探活：  window.postMessage({ source: 'sullyos-meal', type: 'ping', requestId }, '*')
//   收响应：window.addEventListener('message', e => {
//             if (e.data?.source === 'sullyos-meal-bridge' && e.data.requestId === ...) ...
//           })
//
// 进度事件（来自平台 content script）：
//   { source: 'sullyos-meal-bridge', type: 'progress', jobTabId, status, message?, data? }
//   status ∈ 'opened' | 'searching' | 'adding' | 'done' | 'error'

(function () {
  if (window.__sullyMealBridgeInjected__) return;
  window.__sullyMealBridgeInjected__ = true;

  // 给 SullyOS 网页一个全局标记，方便它检测扩展是否就位
  // （content script 跑在 isolated world，不能直接写 window；改用 cookie + dataset
  // 都不优雅。我们用 data attribute 在 <html> 上打标。）
  try {
    document.documentElement.setAttribute('data-sully-meal-bridge', '0.1.1');
  } catch {}

  const MESSAGE_SOURCE_REQ = 'sullyos-meal';
  const MESSAGE_SOURCE_RES = 'sullyos-meal-bridge';

  function reply(requestId, payload) {
    window.postMessage({ source: MESSAGE_SOURCE_RES, requestId, ...payload }, window.location.origin);
  }

  // SullyOS 网页 → 扩展
  window.addEventListener('message', async event => {
    const msg = event.data;
    if (!msg || msg.source !== MESSAGE_SOURCE_REQ) return;
    if (event.source !== window) return; // 只接受同窗口的消息，防止 iframe 伪造

    const { requestId, type, payload } = msg;

    if (type === 'ping') {
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'meal_ping' });
        reply(requestId, { type: 'pong', ok: true, version: resp?.version });
      } catch (e) {
        reply(requestId, { type: 'pong', ok: false, error: String(e?.message || e) });
      }
      return;
    }

    if (type === 'dispatch') {
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'meal_dispatch', payload });
        reply(requestId, { type: 'dispatched', ...resp });
      } catch (e) {
        reply(requestId, { type: 'dispatched', ok: false, error: String(e?.message || e) });
      }
      return;
    }

    if (type === 'read') {
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'meal_read',
          requestId,
          task: msg.task,
          payload: msg.payload,
        });
        // 读任务的真实结果走异步 meal_read_result 通道（见下方 chrome.runtime.onMessage）
        // 这里只回 init ack；调度失败时直接返 read_result 让调用方早收到错误
        if (!resp?.ok) {
          reply(requestId, { type: 'read_result', ok: false, error: resp?.error || 'dispatch failed' });
        }
      } catch (e) {
        reply(requestId, { type: 'read_result', ok: false, error: String(e?.message || e) });
      }
      return;
    }
  });

  // 扩展 → SullyOS 网页（进度 / 读取结果回传）
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'meal_progress') {
      window.postMessage(
        {
          source: MESSAGE_SOURCE_RES,
          type: 'progress',
          jobTabId: msg.jobTabId,
          status: msg.status,
          message: msg.message,
          data: msg.data,
        },
        window.location.origin
      );
    }
    if (msg?.type === 'meal_read_result') {
      window.postMessage(
        {
          source: MESSAGE_SOURCE_RES,
          type: 'read_result',
          requestId: msg.requestId,
          ok: !!msg.ok,
          data: msg.data,
          error: msg.error,
        },
        window.location.origin
      );
    }
    return false;
  });
})();
