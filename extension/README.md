# SullyOS Meal Bridge — Chrome 扩展

让 SullyOS 里的 char 能在你**已登录的浏览器**里帮你下美团/饿了么/盒马的单。
**支付永远由你本人完成**——扩展只负责"打开店铺、加购物车、定位到结算页"。

## 它怎么工作

```
SullyOS 网页 (char 决定要点啥)
       │  window.postMessage
       ▼
扩展 bridge content script (注入在 SullyOS 域)
       │  chrome.runtime.sendMessage
       ▼
扩展 background service worker
       │  chrome.tabs.create
       ▼
新标签：h5.waimai.meituan.com (你已登录态)
       │  扩展平台 content script
       ▼
DOM 自动点击 → 购物车填好 → 停在结算页让你付款
```

**关键点**：所有请求是你浏览器以你身份发的，cookies 是浏览器自动带的，
扩展不需要、也不接触任何签名（mtgsig / x-pack / shadow-c-id）——
这些是平台用来防别的服务器伪造请求的，你浏览器自己访问根本不用。

## 安装（开发版 / 未上架）

1. 打开 Chrome → `chrome://extensions/`
2. 右上角打开"开发者模式"
3. 点"加载已解压的扩展程序"
4. 选这个 `extension/` 文件夹
5. 看到"SullyOS Meal Bridge v0.1.0"出现即可

icons/ 文件夹下需要 `icon-16.png` / `icon-48.png` / `icon-128.png` 三张图。
没有的话扩展依然能跑，只是 chrome 会报警告——把任意 png 改名丢进去即可。

## 使用

1. 进过一次 `h5.waimai.meituan.com`（饿了么/盒马同理）登录一下，让浏览器记住 cookies
2. 打开 SullyOS → 饭友 App
3. 顶部应当看到"扩展已就绪"小绿点。没看到的话刷新一下 SullyOS 页面
4. 跟 char 聊"想吃啥"——它选好后会调 `execute_in_browser` 工具
5. 浏览器自动开新标签页 → 加好购物车 → 跳到结算页 → **你点支付**

## 支持平台 / 功能矩阵

| 平台 | 搜店 | 看菜单 | 加购物车 | 跳到结算 |
|---|---|---|---|---|
| 美团外卖 | ✅ | ✅ | 🚧 best-effort | 🚧 |
| 饿了么 | 🚧 | 🚧 | 🚧 | 🚧 |
| 盒马 | 🚧 | 🚧 | 🚧 | 🚧 |

🚧 = 选择器写死了一版，平台改版了就要更新选择器。这种维护比逆向 mtgsig 轻一个量级，
看 [`platforms/`](./platforms/) 文件夹里的 const 选择器表就能改。

## 默认支持的 SullyOS 部署域名

扩展只会在已知的 SullyOS 域名上注入桥脚本，避免乱给其它网站塞东西：

- `localhost:*` / `127.0.0.1:*` — 本地 dev
- `*.github.io` — GitHub Pages（最常见的 SullyOS 部署形态）
- `*.netlify.app` / `*.vercel.app` / `*.pages.dev` — 三家主流静态托管
- `sullyos.app` — 主项目可能的官方域名

**用了别的自定义域名**（CNAME 到 github.io、自购 .com 等）：打开
`manifest.json`，把你的域名加进 `content_scripts.matches` 的第一段
（注入 SullyOS 桥脚本的那段），格式 `https://your-domain.com/*`，
然后回 `chrome://extensions/` 点扩展卡片上的"重新加载"。

## 故障排查

- **扩展没就绪**：检查 SullyOS 域名是否在 `manifest.json` 的 `content_scripts.matches` 里。
  自部署的话把你的域名加进去，重载扩展。
- **打开 meituan 没反应**：先去 `h5.waimai.meituan.com` 手动登录一次，让 cookies 落地。
- **加购按钮点不上**：平台改版了。打开 DevTools → 找按钮的真实 selector，更新对应
  `platforms/<name>.js` 里的常量。

## License

MIT — 跟主项目同步。
