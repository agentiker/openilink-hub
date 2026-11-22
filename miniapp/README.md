# ClawBot 助手（OpeniLink Hub 小程序端）

微信小程序版的 Hub 控制台：**扫码登录 → 绑定 ClawBot → 查看 ClawBot 信息**。

## 架构

```
小程序 ──wx.cloud.callFunction──▶ 云函数 hub ──HTTPS──▶ OpeniLink Hub
          (自动带 OPENID)           │                      /api/auth/scan/*
                                    └─ 集合 hub_sessions   /api/bots/*
                                       OPENID → Hub session
```

- 小程序不直连 Hub，所以 **不需要在公众平台配置 request 合法域名**，Hub 的 session token 也不会下发到手机端。
- 云函数用 `OPENID` 识别微信用户，把它映射到 Hub 账号（保存在 `hub_sessions` 集合）。
- 云函数无法保持 WebSocket，所以 Hub 新增了 HTTP 短轮询接口：
  - `GET /api/auth/scan/poll/{session_id}?token={poll_token}`（`poll_token` 由 `POST /api/auth/scan/start` 返回）
  - `GET /api/bots/bind/poll/{session_id}`（需登录，且只能查询自己发起的会话）

## 页面

| 页面 | 内容 |
|---|---|
| `pages/scan/scan?mode=login` | iLink 二维码扫码登录；首次扫码自动创建 Hub 账号并绑定该 ClawBot |
| `pages/scan/scan?mode=bind` | 已登录后绑定新的 ClawBot |
| `pages/index/index` | 账号信息、统计数据、ClawBot 列表（状态和 24 小时窗口） |
| `pages/bot/bot?id=` | 单个 ClawBot：状态、24 小时窗口、基本信息、发送额度、消息 / 联系人 / App |

> 二维码由 iLink 生成，需要用微信「扫一扫」。只有一台手机时，点「放大识别」后长按图片识别。

## 部署步骤

1. **Hub 升级**：部署包含 `internal/api/scan_poll.go` 的 Hub 版本，并确保公网可以通过 HTTPS 访问（云函数要能访问到）。
2. **小程序 AppID**：把 `project.config.json` 里的 `appid` 从 `touristappid` 改成你的小程序 AppID，然后在微信开发者工具中开通云开发。
3. **环境 ID**：在 `config.js` 里填入 `envId`；留空则使用默认环境。
4. **部署云函数**：在开发者工具中右键 `cloudfunctions/hub` → 选择「上传并部署：云端安装依赖」。
5. **配置环境变量**：在云开发控制台 → 云函数 `hub` → 函数配置中设置：
   - `HUB_BASE_URL` = `https://你的-hub-域名`（必填，末尾不要带 `/`）
   - `HUB_TIMEOUT_MS` = `15000`（可选）
6. **数据库集合**：首次调用时会自动创建 `hub_sessions`；也可以手动创建，权限设为「仅管理端可读写」。

## 安全说明

- 扫码登录轮询需要 `poll_token`，只知道 `session_id` 无法获取 session。
- 绑定轮询需要登录态，并会校验发起人。
- Hub 的 session 有效期为 7 天，过期后小程序会自动跳回扫码页。
