# 音乐 App — 网易云音乐接入说明

> 给用户写的。懒得读的看最下面的"三步跑通"。

## 它能做什么

- **搜索** 网易云曲库里任意歌曲
- **播放** 歌曲（用户自备 MUSIC_U cookie，就能解锁 VIP / 黑胶音质）
- **同步歌词**（含翻译字幕）
- **专辑封面 / 歌手 / 时长** 等信息

## 架构：前端静态 + Cloudflare Worker 薄代理

```
浏览器 (GitHub Pages / Capacitor)
   │  POST /netease/{search,song/url,lyric,...}
   │  Header: X-Netease-Cookie: MUSIC_U=xxx
   ▼
sully-n Worker (Cloudflare Workers, 免费)
   │  weapi 加密 → POST /weapi/...
   ▼
music.163.com
```

**为什么选 Cloudflare Workers**：
- 免费计划 **每天 10 万请求**
- **不绑信用卡就能用**，超额直接返回错误，**永远不会扣钱**
- 没有 Vercel / Netlify 那种"超限自动计费"的惊吓

**为什么不用 api-enhanced / 任何现成 Node API**：
- Binaryify 原版 2024-04 被网易法务函 archive 了
- api-enhanced 只支持 Vercel / 腾讯云 SCF，国内访问差或需备案
- CF Workers 上没有现成可用的活跃 port
- 所以 `worker/index.js` 里我们自己写了 weapi 加密（Web Crypto + BigInt，零依赖，~90 行）

## 对开发者：部署自己的 Worker（可选）

如果你不想用默认的 `sully-n.qegj567.workers.dev`，自己部署：

```bash
# 1. 安装 wrangler
npm i -g wrangler

# 2. 登录
wrangler login

# 3. 创建 wrangler.toml（仓库里还没有，自己建一个）
cat > wrangler.toml <<EOF
name = "my-music-worker"
main = "worker/index.js"
compatibility_date = "2024-09-23"
EOF

# 4. 部署
wrangler deploy
```

部署后拿到 `https://my-music-worker.你的账号.workers.dev`，在 App 设置里替换即可。

**注意**：这个 worker 还包含了 Brave / Notion / 飞书 / 小红书 / WebDAV 代理，如果你只想部署网易云那部分，可以把 `/netease/` 块单独抽出来（它是自包含的，依赖的 `neteaseWeapi*` 函数和 `corsHeaders`/`jsonResponse` 都在同一个文件里）。

## 对用户：怎么获取 MUSIC_U cookie

1. 浏览器打开 <https://music.163.com>，登录你的会员账号
2. 按 **F12** 打开开发者工具
3. 切到 **Application**（Chrome）或 **存储**（Firefox）标签
4. 左侧找 **Cookies** → `https://music.163.com`
5. 找到名字叫 **`MUSIC_U`** 的那一行，复制它的 **Value**
6. 回到音乐 App → 右上齿轮 → 粘贴成这个格式：
   ```
   MUSIC_U=你复制的那串值
   ```
7. 保存。音质选 `exhigh` / `lossless` / `hires`（后两者要黑胶 SVIP）

**cookie 只存在你浏览器的 localStorage 里**，不会上传任何服务器（只在每次请求时发到 Worker，Worker 立即转发给网易云，不记录）。

## 三步跑通（最短路径）

1. 在音乐 App 里右上齿轮 → 粘贴 `MUSIC_U=xxx`
2. 音质选 `exhigh`（320kbps，大部分会员够用）
3. 搜歌 → 点播放

## 已知限制

- Worker 免费额度 10 万请求/天。5000 DAU 粗略估算每人 20 次请求才会打满，正常使用 OK；就算超了也只是那天后续用户会收到 429 错误，**不会产生费用**
- `lossless` / `hires` 音质需要黑胶 SVIP，普通会员选了会自动回退到 `exhigh`
- 部分地区版权灰标歌曲即使有 VIP 也拿不到 URL，这是网易云侧的限制
- 下载功能没做（不做，版权敏感）

## API 接口列表（给想扩展的人）

所有都是 `POST application/json`，Header 带 `X-Netease-Cookie: MUSIC_U=xxx`（可选）。

| 路径 | Body | 说明 |
|------|------|------|
| `/netease/search` | `{ keyword, type?, limit?, offset? }` | 搜索，type=1 单曲 |
| `/netease/song/url` | `{ ids:[id], level? }` | 播放链接 |
| `/netease/lyric` | `{ id }` | 歌词（含 tlyric 翻译） |
| `/netease/song/detail` | `{ ids:[id] }` | 歌曲详情 |
| `/netease/login/status` | `{}` | 当前 cookie 登录状态 |
| `/netease/user/playlist` | `{ uid, limit?, offset? }` | 用户歌单 |
| `/netease/playlist/detail` | `{ id, n? }` | 歌单详情 |

要加新接口：去 `worker/index.js` 的 `/netease/` 块里照葫芦画瓢，`neteaseWeapiRequest('/weapi/...')` 就行。
