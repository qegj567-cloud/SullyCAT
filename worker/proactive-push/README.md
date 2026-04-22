# 主动消息 Push 加速器 · 部署剧本

这个 Worker 的作用：给主动消息 1.0 提供"到点喊醒浏览器"的能力。
cron 每分钟扫 D1，对**心跳活着**的订阅发一个极小的 wake push；
SW 收到后 postMessage 给主线程，AI 生成完全在浏览器里本地完成。
Worker 全程看不到聊天内容。

费用：Cloudflare 免费档，30 分钟间隔随便用。

> ⚠️ 建议你为这个 Worker **单独注册一个 CF 账号**，和你现有
> `worker/index.js`（Brave/飞书/小红书代理）隔离开。

---

## 零 · 本机准备（一次性）

```bash
# 装命令行工具
npm install -g wrangler

# 登录你的新 CF 账号（会打开浏览器做 OAuth）
wrangler login
```

---

## 一 · 建 D1 数据库

```bash
cd worker/proactive-push

# 创建数据库。输出里会有一行 database_id = "xxxxxxxx-xxxx-..."，抄下来。
wrangler d1 create proactive-db
```

把输出的 `database_id` 贴进 `wrangler.toml` 的 `[[d1_databases]]` 那段，
替换掉 `REPLACE_WITH_YOUR_D1_ID`。

然后建表：

```bash
wrangler d1 execute proactive-db --remote --file=schema.sql
```

---

## 二 · 生成 VAPID 密钥对

在本机跑一行（需要 Node，已经有 `npx`）：

```bash
npx web-push generate-vapid-keys
```

输出类似：

```
=======================================
Public Key:
BBr...（87 个字符）
Private Key:
F3j...（43 个字符）
=======================================
```

两个都复制下来，下一步用。

---

## 三 · 配置 Worker 密钥

```bash
# 私钥（永远不对外）
wrangler secret put VAPID_PRIVATE_KEY
# 粘贴上一步的 Private Key，回车

# 公钥（写进 secret 以免泄漏到 git；客户端通过 /vapid-public-key 拿）
wrangler secret put VAPID_PUBLIC_KEY
# 粘贴上一步的 Public Key，回车
```

然后改一下 `wrangler.toml` 的 `[vars]`：

- `VAPID_SUBJECT`：改成你的邮箱，比如 `mailto:you@example.com`。push 服务
  挂了要联系运维时会用到这个。
- `CLIENT_TOKEN`：随便一串长字符串（比如 UUID），留空则不校验来源。
  **强烈建议填一个**，不然别人可以拿你的 Worker 替自己订阅发 push。
  填完后同步在 app 设置里填一样的。

也可以用 secret 形式（推荐）：

```bash
wrangler secret put CLIENT_TOKEN
# 粘贴你生成的随机字符串
```

secret 会覆盖 vars，更安全。

---

## 四 · 部署

```bash
wrangler deploy
```

终端会打出部署 URL，类似：

```
https://proactive-push.你的用户名.workers.dev
```

把这个 URL 复制下来。

---

## 五 · 在 app 里填配置

打开 app → 系统设置 → "主动消息 Push 加速" section：

1. Worker URL：填上一步拿到的 `https://proactive-push.xxx.workers.dev`
2. VAPID 公钥：填第二步的 Public Key
3. Client Token：如果你在 Worker 里设了，这里填一样的
4. 打开"启用"开关

然后给任意角色开主动消息，到点就会收到 push。如果关掉所有 tab
5 分钟以上，Worker 会自动停止给你发 push（避免误扰）。下次你打开
app，心跳恢复，下一轮就会继续。

---

## 六 · 验证

```bash
# 看健康
curl https://proactive-push.xxx.workers.dev/health

# 看当前订阅（app 开启主动消息后，刷一下）
curl -H "X-Client-Token: 你的token" \
  "https://proactive-push.xxx.workers.dev/status?endpoint=<endpoint>"

# 看 cron 日志
wrangler tail
```

`wrangler tail` 开着不关，到点会看到类似 `[cron] fired=1 dropped=0`。

---

## 常见问题

**Q：CF 免费档够吗？**

A：30 分钟间隔下，每个订阅每天 48 次 wake push + 720 次 heartbeat = 768 次
请求/天。免费档 10 万请求/天，理论上能撑 130+ 个订阅。D1 读 500 万/天、写
10 万/天，更宽松。

**Q：iOS 用户呢？**

A：iOS Safari 16.4+ 才支持 web push，而且**必须**先"添加到主屏"把网站
装成 PWA。普通标签页收不到。Android/桌面全浏览器原生支持。

**Q：换设备/清了浏览器数据怎么办？**

A：旧的 subscription 会变成 404/410，cron 会自动清理。新设备打开 app
会重新订阅，无需手动操作。

**Q：Worker 会看到我的聊天内容吗？**

A：不会。Worker 只发一个 `{type:'proactive-wake', charId}`。聊天上下文
读取、AI 调用、消息生成全部在你的浏览器本地完成。

---

## 目录结构

```
worker/proactive-push/
├── README.md          你现在看的文档
├── wrangler.toml      CF Worker 配置（D1 绑定、cron、vars）
├── schema.sql         D1 建表脚本
└── src/
    ├── index.ts       HTTP 路由 + cron 入口
    └── webpush.ts     VAPID JWT + aes128gcm 加密（无依赖实现）
```
