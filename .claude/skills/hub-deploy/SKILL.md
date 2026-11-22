---
name: hub-deploy
description: 把 OpeniLink Hub 部署到远程 Docker 主机（默认 xdimspace-01，对外域名 hub.xdimspace.cn）的流程、脚本与运维要点：发布指定提交、首次创建管理员并关闭公开注册、健康检查与自动回滚、对外发布（nginx + HTTPS + WebSocket）、数据备份。用于「部署 / 发布 / 上线 / 回滚 / 看线上日志」类请求。移植自 tengdao-mirrors 的 tendata-deploy。
---

# OpeniLink Hub 部署

一条命令发布一个**已提交**的版本：

```sh
.claude/skills/hub-deploy/scripts/deploy.sh --origin https://hub.xdimspace.cn   # 部署 HEAD 到 xdimspace-01（先跑 go vet + go test）
.claude/skills/hub-deploy/scripts/deploy.sh --ref <sha>                         # 部署指定提交，也用于回滚
.claude/skills/hub-deploy/scripts/deploy.sh --dry-run                           # 只做检查，不上传
```

`--origin` 只需在第一次或改域名时传，会写进主机上的 `site.env` 并一直保留。它决定 `RP_ORIGIN` / `RP_ID`：Passkey、服务号网页授权回调地址、媒体链接都依赖它，必须是 `https://` 公网域名。

可选环境变量：`DEPLOY_HOST`（默认 `xdimspace-01`）、`DEPLOY_DIR`（`/opt/openilink-hub`）、`DEPLOY_PORT`（`9800`）、`DEPLOY_KEEP_RELEASES`（`5`）。

## 脚本做了什么

1. 解析 `--ref` 为提交号。线上正在运行的版本（`REVISION`）必须是该提交的祖先，否则拒绝部署（防止覆盖别人已上线的改动）；确实要回退时加 `--rollback`。工作区有未提交改动只提示不阻止——部署的永远是该提交的 `git archive`。
2. 在临时目录导出该提交，**本机构建前端**（`web/` → `internal/web/dist`，需要本机已 `pnpm install`）。原因：xdimspace-01 拉不到 `node` 镜像。
3. 本机跑 `go vet ./...` 和 `go test ./internal/...`（SQLite 与单元测试；依赖 PostgreSQL 的根目录集成测试不在其内）。`--skip-tests` 跳过，只在刚跑过时用。
4. 检查目标端口空闲或本来就是 Hub 的。
5. 上传源码 + 构建好的前端到 `releases/<sha>/`，远程用 `Dockerfile.deploy` 构建 `openilink-hub:<sha>`：Go 依赖走 `goproxy.cn` 并用 BuildKit 缓存，Alpine 包走阿里云镜像（官方源从国内主机极慢）。镜像已存在时不重建（回滚很快）。
6. `docker compose up -d`，轮询 `http://127.0.0.1:<port>/api/info` 最多 60 秒：通过则 `current` 指向新版本、写 `REVISION`；不通过则打印日志并**自动回滚**到上一镜像，脚本非零退出。
7. 保留最近 5 个版本目录和镜像。部署记录追加到 `deploy.log`。

## 远程布局（xdimspace-01）

| 路径 | 内容 |
|---|---|
| `/opt/openilink-hub/releases/<sha>/` | 每个版本的源码（含构建好的前端） |
| `/opt/openilink-hub/current` | 指向正在运行的版本 |
| `/opt/openilink-hub/data/`（700） | 容器的 `/var/lib/openilink-hub`：`openilink.db`（SQLite，WAL）、`media/`（收发的图片文件）。部署**从不**改动 |
| `/opt/openilink-hub/compose.yml` | 来自 `compose.deploy.yml`：单容器、端口只绑 `127.0.0.1`、镜像按提交号打标签 |
| `/opt/openilink-hub/site.env`（600） | 主机级配置：`SECRET`（首次自动生成，**改了所有人会被登出、已加密的 token 失效**）、`RP_ORIGIN`、`RP_ID`，以及按需添加的 `WECHAT_MP_APP_ID` 等。每次部署追加进 `.env`，部署只改它的 `RP_*`（传 `--origin` 时） |
| `/opt/openilink-hub/.env`（600） | 每次部署生成：版本号、端口、数据目录 + `site.env` |
| `/root/.openilink-hub/admin-password`（600） | 首个管理员 `admin` 的密码 |

compose 项目名固定为 `openilink-hub`，容器名 `openilink-hub-hub-1`。仓库自带的 `docker-compose.yml`（Postgres + MinIO、端口开在所有网卡）是本地开发用的，**线上不用**。

## 首次部署与管理员

Hub 的规则是**第一个注册的用户自动成为超级管理员，且公开注册默认开启**——站点先上公网再注册，谁先打开谁就是管理员。所以首次部署时（主机上还没有 `REVISION`，即从未成功部署过），脚本在服务器上从 `127.0.0.1` 注册 `admin`（随机密码，只存在服务器上），用 `/api/me` 确认拿到的是 `superadmin` 后**立即关闭公开注册**，之后才去配 nginx。没拿到超级管理员时只记警告，不要发布站点，先查原因。

密码**不经过本机**，需要时让用户自己看：

```sh
ssh xdimspace-01 cat /root/.openilink-hub/admin-password
```

不要把密码打印进对话或写进仓库。登录后在「设置」改密码或绑定 Passkey；要让别人注册，在「管理后台」临时打开注册。

## 访问

默认只监听 `127.0.0.1:9800`，公网不可达。临时访问用 SSH 隧道：

```sh
ssh -N -L 9800:127.0.0.1:9800 xdimspace-01    # 然后打开 http://127.0.0.1:9800
```

### 对外发布（nginx + HTTPS）

目标主机是共用机器：宿主机 nginx 占 80/443，已有别的站点，证书由 certbot 管理。发布时**只新增**一个站点文件，不改别人的，也不改全局 `nginx.conf`。

| 文件 | 用途 |
|---|---|
| `nginx/site-bootstrap.conf` | 签证书前的临时配置，只有 HTTP |
| `nginx/site.conf` | 最终配置：80 跳转、443、gzip、WebSocket、反代 |

```sh
cd .claude/skills/hub-deploy
HOST=xdimspace-01 DOMAIN=hub.xdimspace.cn PORT=9800
render() { sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$PORT/g" "$1"; }

# 1. 先上 HTTP，让域名能到达本站
render nginx/site-bootstrap.conf | ssh $HOST "cat > /etc/nginx/sites-available/$DOMAIN && ln -sfn /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN && nginx -t && systemctl reload nginx"
# 2. 签证书（certonly：只签发，站点文件仍由仓库模板管理）
ssh $HOST "certbot certonly --nginx -d $DOMAIN --non-interactive --agree-tos"
# 3. 换成最终配置（会显示差异、备份、nginx -t 通过才 reload，失败自动恢复）
scripts/install-nginx.sh --host $HOST --domain $DOMAIN
```

改已有站点的配置也用 `install-nginx.sh`（`--dry-run` 只看差异）。线上文件应与模板渲染结果逐字节一致。

`nginx -t` 失败时不要 reload——会影响同机其他站点。**不要把 `nginx -t` 接到管道里再用 `&&` 判断**（退出码是管道最后一个命令的）。

配置里几处不能省的：

- **WebSocket**（`Upgrade` / `Connection` + `map`）：浏览器实时推送 `/api/ws`、扫码绑定状态 `/api/bots/bind/status/*`、渠道 `/api/v1/channels/connect`、App `/bot/v1/ws` 都是 WebSocket，缺了扫码绑定会卡住不动。
- `proxy_read_timeout 3600s` 与 `proxy_buffering off`：长连接与 MCP 流式响应。
- `client_max_body_size 32m`：控制台发送文件的上限（服务端 multipart 32 MB）。
- `X-Forwarded-For $remote_addr`：覆盖而非追加，防伪造来源。
- **没开 `http2`**：nginx 1.18 的 `http2` 作用于整个 `IP:443`，会把同机所有站点一起切换。xdimspace-01 其他站点（b2b 等）已统一开启 HTTP/2，若要一致可在 `listen 443 ssl` 后加 `http2`，效果相同。

已发布的站点：

| 域名 | 主机 | 证书验证 | 续期 |
|---|---|---|---|
| `hub.xdimspace.cn` | xdimspace-01 | HTTP（`--nginx`） | certbot 定时任务自动续期 |

## 服务号网页授权（真实微信身份绑定）

1. 公众平台「设置与开发 → 公众号设置 → 功能设置 → **网页授权域名**」填 `hub.xdimspace.cn`，下载 `MP_verify_xxx.txt`。
2. Hub「管理后台 → 微信服务号（身份绑定）」填 AppID / AppSecret，校验文件名填 `MP_verify_xxx.txt`（Hub 会在根路径提供它），然后回公众平台点保存。
3. 也可写进 `site.env`：`WECHAT_MP_APP_ID=…`、`WECHAT_MP_APP_SECRET=…`，重新部署生效（后台配置优先）。

## Bot 与本机实例

线上是全新实例，没有任何 Bot，需要在线上重新扫码绑定。**同一个 Bot 不要同时在两个 Hub 实例上运行**（例如本机开发实例和线上）：两边都会长轮询 `getupdates`，消息会被一边取走、另一边收不到，额度计数也会对不上。把 Bot 迁到线上后，删掉或停掉本机那份。不要把本机 `openilink.db` 拷到服务器。

## 运维

```sh
ssh xdimspace-01 'cd /opt/openilink-hub && cat REVISION && tail -5 deploy.log'     # 当前版本与部署记录
ssh xdimspace-01 'docker logs --tail 100 openilink-hub-hub-1'                      # 日志（json-file，10 MB × 5 轮转）
ssh xdimspace-01 'curl -s 127.0.0.1:9800/api/info'
ssh xdimspace-01 'docker stats --no-stream openilink-hub-hub-1'                    # 内存（空载约 30 MB）
```

回滚到旧版本：`deploy.sh --ref <旧 sha> --skip-tests --rollback`（镜像还在时不重新构建）。

备份：`data/` 整个目录。SQLite 是 WAL 模式，在线备份用

```sh
ssh xdimspace-01 'cd /opt/openilink-hub && sqlite3 data/openilink.db ".backup /root/openilink-$(date +%F).db"'
```

或先 `docker compose -p openilink-hub stop`。`site.env` 里的 `SECRET` **单独**保存——丢了它，已登录会话和加密存储的 token 全部失效。

## 踩过的坑

- **macOS 打包带出 `._*` 文件**：BSD tar 会把扩展属性写成 AppleDouble 文件，`migrations/._0001_initial.sql` 会被迁移工具当成迁移解析而启动失败。脚本用 `COPYFILE_DISABLE=1`、排除 `._*`，并在主机上再删一遍。
- **xdimspace-01 拉不到 `node` 镜像、Alpine 官方源极慢**：所以前端在本机构建，`Dockerfile.deploy` 用阿里云 Alpine 镜像与 `goproxy.cn`。首次构建约 5 分钟（下载 Go 依赖），之后有缓存。

## 红线

- 只部署已提交的版本；不要在服务器上直接改代码。
- 端口永远只绑 `127.0.0.1`；公网只通过 nginx + HTTPS。
- 首次部署必须先由脚本占住管理员并关闭注册，再发布 nginx。
- 不碰同机其他服务（tengdao-mirror、adp-biz-portal、tencent-adp-gateway 及其容器、数据库、站点配置）。
- 不打印、不提交管理员密码、`SECRET`、服务号 AppSecret、Bot token。
- 部署会重启容器（几秒不可用，Bot 长轮询会重连；Hub 持久化了 `get_updates_buf` 游标，重启期间的消息预计重连后补收，未专门验证）；有人在用时先说一声。
