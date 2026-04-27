// SullyOS Meal Bridge — popup
// 用户点扩展图标看到的小面板，主要是让用户能 sanity-check / 重置定位状态。

const STORAGE_KEY_LOC = 'sully_meituan_loc';

function fmtAge(ts) {
  if (!ts) return '';
  const ms = Date.now() - ts;
  const min = Math.floor(ms / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  return `${day} 天前`;
}

async function render() {
  // 版本
  try {
    const v = chrome.runtime.getManifest().version;
    document.getElementById('version').textContent = `v${v}`;
  } catch {}

  // 当前定位
  const card = document.getElementById('loc-card');
  const text = document.getElementById('loc-text');
  const meta = document.getElementById('loc-meta');
  let loc = null;
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY_LOC]);
    loc = data[STORAGE_KEY_LOC] || null;
  } catch {}
  if (loc?.lat && loc?.lng) {
    card.className = 'row ok';
    const addrLine = loc.addr ? `<strong>${loc.addr}</strong><br />` : '';
    const lat = Number(loc.lat).toFixed(4);
    const lng = Number(loc.lng).toFixed(4);
    text.innerHTML = `${addrLine}lat ${lat}, lng ${lng}`;
    meta.textContent = `保存于 ${fmtAge(loc.savedAt)}${loc.savedAt ? ` (${new Date(loc.savedAt).toLocaleString('zh-CN')})` : ''}`;
  } else {
    card.className = 'row warn';
    text.textContent = '还没记住地址。先打开美团 H5 选一下，或在饭友 App 里让 char 搜一次店，会自动记住。';
    meta.textContent = '';
  }
}

document.getElementById('btn-open').addEventListener('click', async () => {
  await chrome.tabs.create({ url: 'https://h5.waimai.meituan.com/', active: true });
  // 关闭 popup 的最佳方式
  window.close();
});

document.getElementById('btn-clear').addEventListener('click', async () => {
  if (!confirm('清掉记住的地址？下次让 char 搜店时会重新捕获。')) return;
  try {
    await chrome.storage.local.remove([STORAGE_KEY_LOC]);
  } catch {}
  await render();
});

render();
