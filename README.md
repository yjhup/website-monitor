# 网站监测（Website Monitor）

一个可部署在 **Cloudflare Workers** 上的网站变化监测工具。适合监测学校通知、公告、官网新闻等网页：页面内容一旦更新，立即通过 **Webhook** 或 **Resend 邮件** 通知你。

## ✨ 功能特性

- 🔍 **监测任意网页**：按整页文本或指定 CSS 选择器（如公告列表区域）检测内容变化
- ⏱️ **自定义检查间隔**：每个监测目标可独立设置间隔（最小 1 分钟，最长 7 天），例如每小时检查一次
- 📢 **多种通知方式**：
  - **Webhook**：变化时向你的地址发送 POST JSON 请求，可对接钉钉/企业微信机器人、自建服务等
  - **Resend 邮件**：自行填写 API Key、发件邮箱、收件邮箱，直接发送邮件
- 👥 **多用户**：通过环境变量配置多组「用户名:密码」，各用户的监测目标与通知设置相互隔离
- 🧪 **通知测试**：配置好 Webhook / Resend 后可一键「发送测试」，立即验证配置是否可用（失败会给出具体原因）
- 🖥️ **自带前端页面**：登录后可视化地管理监测目标与通知方式，支持手动“立即检查”
- ☁️ **纯 Cloudflare 技术栈**：Workers + D1（全部数据）+ Cron（定时检查）
- 🚀 **GitHub Actions 自动部署**：推送代码即自动创建并绑定 D1、写入密钥、初始化数据库、部署 Worker

## 🗂️ 项目结构

```
website-monitor/
├── src/                      # Worker 代码
│   ├── index.ts              # 入口：Hono 应用 + Cron 定时任务
│   ├── api.ts                # 业务 API（监测目标 CRUD / 通知设置 / 手动检查）
│   ├── auth.ts               # 多用户认证与会话（D1）
│   ├── checker.ts            # 变化检测 + Webhook / Resend 通知
│   ├── db.ts                 # D1 初始化、建表与迁移
│   ├── hash.ts               # 通用工具：SHA-256 摘要
│   ├── frontend.ts           # 内嵌前端页面（登录 + 管理面板）
│   └── types.ts              # 类型定义
├── schema.sql                # D1 表结构
├── wrangler.toml             # Workers 配置（D1 / Cron）
├── scripts/ensure-resources.sh  # 自动创建并绑定 D1 的脚本
├── .github/workflows/deploy.yml # GitHub Actions 自动部署
└── README.md                 # 本教程
```

## 📋 工作原理

```
┌────────────────────────────────────────────────────────────┐
│  Cloudflare Cron（每分钟触发一次）                          │
│        │                                                    │
│        ▼                                                    │
│  Worker scheduled 处理器                                    │
│        │ 遍历所有“已启用”的监测目标                          │
│        │ 仅对「当前时间 - 上次检查 ≥ 该目标间隔」的目标抓取   │
│        ▼                                                    │
│  抓取网页 → 提取文本（或选择器部分）→ 计算 SHA-256 哈希      │
│        │                                                    │
│        ▼ 与 D1 中上次哈希（monitors.last_hash）对比          │
│  相同 ─── 更新 last_checked_at（无通知）                     │
│  不同 ─── 发送 Webhook / Resend 通知 → 更新 D1 中的哈希      │
└────────────────────────────────────────────────────────────┘
```

- **D1 数据库**：保存用户、监测目标、通知设置、每个目标的「上次内容哈希」（变化检测基线），以及登录会话——全部数据都在 D1，**不使用 KV**（避开 KV 免费版每天读写次数限制）
- **登录会话**：Cookie 只保存随机 token，数据库里存的是 token 的 SHA-256（即使数据库泄露也无法伪造会话）
- **第一次检查**只建立基线哈希，不会触发通知，避免一添加就收到“变化”假警报

---

## 🚀 部署教程

有两种方式，**推荐方式二（GitHub Actions 自动部署）**，全程自动完成资源创建与绑定。

### 方式一：手动部署（Cloudflare Dashboard / 本地 CLI）

> 需要已安装 [Node.js 18+](https://nodejs.org/) 并登录 Cloudflare 账号。

**1. 获取代码**

```bash
git clone <你的仓库地址> website-monitor
cd website-monitor
npm install
```

**2. 登录 Cloudflare（会打开浏览器授权）**

```bash
npx wrangler login
```

**3. 创建 D1 数据库**

```bash
npx wrangler d1 create website-monitor-db
```

输出类似：

```
✅ Successfully created DB 'website-monitor-db' in region APAC
[[d1_databases]]
binding = "DB"              # ← 不要改这个 binding 名
database_name = "website-monitor-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # ← 记下这个 ID
```

> 本项目所有数据（含登录会话与内容哈希）都存储在 D1，**无需创建 KV 命名空间**。

**4. 修改 `wrangler.toml`，填入上面的数据库 ID**

```toml
[[d1_databases]]
binding = "DB"
database_name = "website-monitor-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # ← 你的 D1 ID
```

**5. 配置多用户账号（环境变量）**

本地开发时创建 `.dev.vars` 文件（已被 .gitignore 忽略，不会提交）：

```bash
# .dev.vars
USERS=alice:password123,bob:secret456
```

> 格式：`用户名:密码`，多个用户用**英文逗号**分隔。生产环境用 Secret 方式设置（见第 7 步），不要把密码写进代码仓库。

**6. 初始化数据库表**

```bash
npx wrangler d1 execute website-monitor-db --remote --file=schema.sql
```

**7. 设置生产环境变量/密钥**

```bash
# 使用 .dev.vars 中的内容，把账号信息写入 Secret（不会出现在代码里）
echo '{"USERS":"alice:password123,bob:secret456"}' | npx wrangler secret bulk
```

**8. 部署**

```bash
npm run deploy
```

部署成功后，输出中会给出你的 Worker 域名，例如 `https://website-monitor.<你的子域>.workers.dev`，打开即可使用。

> Cron 定时任务（每分钟）已写在 `wrangler.toml` 的 `[triggers]` 中，部署时自动生效。

**本地预览（可选）**

```bash
npm run dev
```

`wrangler dev` 会使用本地模拟的 D1（首次运行会自动初始化表），访问 `http://localhost:8787` 体验完整流程。

---

### 方式二：GitHub Actions 自动部署（推荐）

推送代码到 GitHub 后，工作流会自动完成：**创建/绑定 D1 → 写入 USERS 密钥 → 初始化数据库 → 部署 Worker**，无需手动执行任何 wrangler 命令。

**1. 创建 GitHub 仓库并推送代码**

```bash
git init
git add .
git commit -m "init website monitor"
git branch -M main
git remote add origin git@github.com:<你的用户名>/website-monitor.git
git push -u origin main
```

**2. 配置仓库 Secrets**

进入仓库页面：**Settings → Secrets and variables → Actions → New repository secret**，添加以下三个：

| Secret 名称 | 说明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token。在 [Cloudflare Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) 创建，权限勾选 **Workers Scripts: Edit** 与 **Account: Workers D1: Edit**（建议直接使用模板 “Edit Cloudflare Workers” 并确认包含 D1 权限）。 |
| `CLOUDFLARE_ACCOUNT_ID` | 你的 Cloudflare 账号 ID（Dashboard 首页右侧或 URL 中可找到）。 |
| `USERS` | 多用户账号，如 `alice:password123,bob:secret456`（逗号分隔，作为密钥保存）。 |

**3. 推送触发部署**

完成以上配置后，再次推送代码（或进入 **Actions** 页面手动触发 `Deploy`），等待工作流绿色通过即可。

> 工作流每次运行都会执行 `scripts/ensure-resources.sh`：如果 D1 已存在则复用并读取其 ID，不存在则自动创建，随后把 ID 写回 `wrangler.toml`，因此重复部署是幂等安全的。

**4. 首次部署后**

到 Cloudflare Dashboard → Workers 找到 `website-monitor` 的 URL，打开并登录使用。

---

## 🔐 环境变量说明

| 变量 | 必填 | 说明 |
|---|---|---|
| `USERS` | ✅ | 多用户账号，格式 `用户名:密码`，多组用英文逗号分隔，如 `alice:pass1,bob:pass2` |

- **生产环境**：通过 `wrangler secret bulk` 或 GitHub Actions 的 Secret 设置
- **本地开发**：写入 `.dev.vars` 文件

## 📖 使用说明

1. **登录**：使用 `USERS` 中配置的任一用户名/密码登录（不同用户的数据完全隔离）
2. **添加监测目标**：点击「＋ 添加监测」→ 填写名称、网址、检查间隔（可自定义，如 60 分钟）
   - 可选填写 **CSS 选择器**：只监测页面某一部分（如 `.notice-list`），可有效避免整页动态元素导致的误报
3. **配置通知**：「通知设置」→ 填写 Webhook 地址 和/或 Resend 邮箱信息
   - Webhook：网站变化时向该地址发送 `POST`，JSON 内容示例：

     ```json
     {
       "event": "website_changed",
       "monitor": { "id": "...", "name": "学校教务处通知", "url": "https://..." },
       "changedAt": "2026-08-22T08:00:00.000Z"
     }
     ```

   - Resend：在 [resend.com](https://resend.com) 注册后创建 API Key（`re_xxx`），并**验证你的发件域名**（添加 DNS 记录），发件邮箱需使用该域名下的地址；收件邮箱可填多个（逗号分隔）
4. **测试通知**：填好 Webhook / Resend 配置后，点击对应卡片里的「发送测试」，立即向该地址/邮箱发送一条测试通知。成功显示绿色提示；失败会给出具体原因（如 `Webhook 返回 HTTP 404`、Resend 返回的错误信息）。测试后记得点「保存通知设置」。
5. **手动检查**：点击某目标行中的「检查」，立即触发一次抓取对比，无需等待定时任务

## 🔌 Webhook 配置说明（对接你自己的接口）

**本工具发送的数据格式是固定的**（变化时）：

```json
{
  "event": "website_changed",
  "monitor": { "id": "...", "name": "学校教务处通知", "url": "https://..." },
  "changedAt": "2026-08-22T08:00:00.000Z"
}
```

点击「发送测试」时发送：

```json
{
  "event": "test",
  "message": "这是一条测试通知，说明你的 Webhook 配置正确。",
  "changedAt": "2026-08-22T08:00:00.000Z"
}
```

**如果我要对接的接口期望的是别的字段（例如 `{"to":"boss@example.com","subject":"订单通知","text":"..."}`），该怎么配置？**

本工具不能直接改成任意格式，但在中间加一层“转换”即可：收到本工具发来的 JSON 后，重新拼成目标接口需要的字段再转发。下面用 Vercel Serverless Function 演示（同样适用于 Cloudflare Worker 或任何 Node 服务）：

```js
// 例如保存为 vercel/api/webhook.js，部署到 Vercel 后填入得到的地址
export default async function handler(req) {
  const { event, monitor, changedAt } = JSON.parse(req.body);
  // 目标接口期望的格式（示例：按你的接口字段拼装）
  await fetch('https://<your-domain>.vercel.app/api/你真实的接口地址', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: 'boss@example.com',
      subject: `【${monitor?.name || '网站监测'}】检测到更新`,
      text: `网页 ${monitor?.url} 于 ${changedAt} 发生变化`,
    }),
  });
  return new Response('ok');
}
```

把「Webhook 地址」填成转换层地址（如 `https://<your-domain>.vercel.app/api/webhook`）即可。常用接收端速查：

- **钉钉 / 企业微信 / 飞书机器人**：直接把机器人 Webhook 地址填进来即可（飞书机器人需先建群，在设置里添加自定义机器人）
- **webhook.site / request.bin**：填地址后打开页面即可看到收到的 JSON，适合调试
- **只关心“有没有更新”的自建服务**：直接消费 `event` 字段即可

## ❓ 常见问题

**Q：Cron 一分钟触发一次，为什么我的目标没有每分钟都被检查？**
A：Cron 每分钟唤醒 Worker，但代码只会对「到达检查间隔」的目标执行抓取。间隔 60 分钟的目标一小时只抓一次。

**Q：免费版够用吗？**
A：够。所有数据（用户、监测目标、通知设置、内容哈希、会话）都放在 D1，免费额度很充足（每天 500 万行读、10 万行写），不受 KV 每天 10 万次读/1000 次写/2000 次删除的限制。每个 Cron 触发有 CPU 时间限制，若监测目标数量很大（例如上百个），建议适当调大间隔；个人/家庭使用完全没问题。

**Q：页面总被判定为“变化”怎么办？**
A：很多站点首页带有动态内容（时间戳、验证码、推荐位等）。请使用 **CSS 选择器** 只监测公告区域，例如 `#notice-list`、`.news ul` 等，可大幅减少误报。也可以在「编辑」中更换选择器后点「检查」确认。

**Q：Resend 发件失败？**
A：确认在 Resend 后台已验证发件域名，发件邮箱必须是该域名下的邮箱（免费测试请先添加你的域名验证），API Key 必须有效。

**Q：如何新增/删除用户？**
A：修改 `USERS` 环境变量（重新设置 Secret 并重新部署）即可，用户无需单独建库。

**Q：Webhook 收不到通知？**
A：先点「检查」手动触发一次，确认目标 URL 能正常抓取；再确认 Webhook 地址公网可达、能接收 POST JSON。

## 📄 License

MIT
