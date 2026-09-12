# 在 Ubuntu / Debian VPS 部署基督教内容平台

**全 Docker 方案**：宿主机只需装 Docker，应用 + MySQL + nginx 全部在容器里。
Gitee 仓库：`https://gitee.com/jason-suns/christian-platform-web.git`

架构：`nginx(80/443)` → `web(3000)` → `db(3306)`，均在 Docker 内网，只有 nginx 对公网开放。

## 0. 准备 VPS
- 系统：Ubuntu 22.04/24.04 或 Debian 12
- 安全组/防火墙放行：`22`(SSH)、`80`、`443`（不要放行 3000/3306）
- 域名 A 记录指向 VPS 公网 IP（启用 HTTPS 时需要；先用 IP 访问可跳过）

## 1. 安装 Docker
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER     # 退出重登后免 sudo
docker compose version            # 确认 compose 插件可用
```

## 2. 拉取代码
```bash
sudo mkdir -p /opt && cd /opt
git clone https://gitee.com/jason-suns/christian-platform-web.git christian-platform
cd christian-platform
```

## 3. 配置环境变量
```bash
cp deploy/env.example .env
openssl rand -base64 48           # 复制输出，作为 JWT_SECRET
nano .env                         # 填 DB_PASSWORD 与 JWT_SECRET
```
`.env` 是敏感文件，已被 `.gitignore` 排除，不会进仓库。

## 4. 启动
```bash
docker compose up -d --build
docker compose logs -f web        # 看到"服务器已就绪"即成功，Ctrl+C 退出日志
docker compose ps                 # 三个容器应为 Up
```

## 5. 验证
```bash
curl -I http://127.0.0.1          # 经 nginx 返回 200/307
```
浏览器访问 `http://你的VPS公网IP` → 应看到首页。
管理员账号：`jasonssun` / `Hang.0212`（首次启动自动创建）。

## 6. 启用 HTTPS（有域名后）
1. 把域名 A 记录指向 VPS，等解析生效
2. 生成证书（宿主机装 certbot，或用任意方式拿到 fullchain.pem / privkey.pem）
3. 放进 `deploy/certs/`，编辑 `deploy/nginx.conf` 取消 HTTPS 段注释并改 `server_name`
4. `docker compose restart nginx`

## 7. 直播（MediaMTX）
平台内置直播：OBS/手机推 RTMP → MediaMTX 转 HLS → 网页播放。`docker-compose.yml` 已含 `mediamtx` 服务。

- **推流地址**：`rtmp://<DOMAIN>:8080/<streamKey>`（OBS 服务器填 `rtmp://<DOMAIN>:8080`，串流密钥填随机 streamKey）
  > 端口是 **8080** 不是默认的 1935：国内/跨境链路上 1935 的明文 RTMP 握手常被识别丢包，
  > 表现为「刚连上就断开」+ 日志 `closed: ... i/o timeout`（10s readTimeout）。
  > 三处必须一致：`deploy/mediamtx.yml` 的 `rtmpAddress`、compose 的端口映射、compose 里 web 的 `MEDIAMTX_RTMP_PORT`。
- **网页播放**：浏览器经 `https://<DOMAIN>/hls/<streamKey>/index.m3u8`（nginx 443 反代到 mediamtx:8888，全程 HTTPS）
- **控制 API**：`mediamtx:9997`，仅 web 容器内网调用，不暴露公网

### 7.1 首次启用
1. 确保 `.env` 有 `DOMAIN=<你的域名>`（或 `MEDIAMTX_PUBLIC_HOST=<域名>`）
2. 确认 Cloudflare 放行 8080 端口（RTMP 直连，不走代理，A 记录设为「仅 DNS / Grey cloud」）
3. `docker compose up -d --build` 拉起 mediamtx
4. 验证：`curl http://127.0.0.1:9997/v3/info` 应返回服务信息

### 7.2 直播流程
1. 登录平台 → 创建直播间 → 复制推流地址与串流密钥
2. OBS 填服务器 + 串流密钥 → 开始推流
3. 直播页自动检测在线状态（`/api/v1/live` 轮询 MediaMTX path 状态），观众即可播放

### 7.3 播放地址必须带 `?cookieCheck=1`（踩过的坑）
MediaMTX（v1.21）首次请求 `index.m3u8` 会先返回 **302**，且 `Location` 是**相对路径**
（`/live/<key>/index.m3u8?cookieCheck=1`），用于探测浏览器是否支持 Partitioned Cookie。
nginx **不会改写相对 Location**，浏览器于是跳到 `https://<域名>/live/...` —— 那是平台直播页路由，
返回 404，hls.js 只能永远停在「等待主播开始推流…」。

处理（两层都做了）：
- 应用侧 `hlsPlayUrl()` 直接拼 `.../index.m3u8?cookieCheck=1`，跳过探测重定向；
  MediaMTX 随后改用查询串下发会话密钥（`?_session=xxx`），鉴权一样通。
- nginx `/hls/` 段加 `proxy_redirect / /hls/;`，兜住手工打开裸地址的场景。

### 7.4 配置方式（重要）
配置文件 `deploy/mediamtx.yml` 是**基于 MediaMTX 官方默认配置生成**的，只改了两处：

| 改动 | 原因 |
|------|------|
| `api: false` → `true` | API 默认关闭，不开则 web 容器无法管理直播（9997 连不上） |
| 管理员用户 `ips: ["127.0.0.1","::1"]` → `[]` | 默认只放行容器本机，宿主机 curl / web 容器跨容器访问会 `authentication error` |

配置是**扁平式**（`api` / `rtmpAddress` / `hlsAddress`…），**不是**嵌套式。
切勿手写字段名——类型写错（如把 `api` 写成对象）会报
`cannot unmarshal object into Go value of type bool` 并导致容器反复重启。
要改配置：基于本文件改，或用环境变量 `MTX_<字段名大写>` 覆盖。

另外两个**非默认值**（已在仓库里改好，升级配置时别被官方默认值覆盖回去）：

| 字段 | 官方默认 | 本项目 | 原因 |
|------|---------|--------|------|
| `hlsVariant` | `lowLatency` | **`mpegts`** | LL-HLS 用 fMP4 + `EXT-X-PART`，VLC 完全不支持（表现：能连上、能拉数据、纯黑屏）；hls.js 也易卡死 |
| `rtmpAddress` | `:1935` | **`:8080`** | 明文 RTMP 握手特征明显，部分网络对 1935 做丢包干扰（表现：TCP 连上但握手字节不到，`i/o timeout` 被踢） |

### 7.5 Cloudflare 必须「仅 DNS / 灰云」（不拆域名的前提）
RTMP 不是 HTTP，Cloudflare **只代理 HTTP/HTTPS 的特定端口**，1935/8080 一律不代理。
`amen` 若为橙云（Proxied），域名解析到 CF 的 IP，推流必然连不上。所以：

- **推流**：域名必须灰云（DNS only），解析直达 VPS
- **代价**：灰云后 HTTPS 不再由 CF 出证书，源站证书必须换成公网可信证书（Let's Encrypt）。
  Cloudflare Origin CA 证书**只有 CF 自己信任**，公网客户端（尤其 VLC）会直接 TLS 失败 → 黑屏
- **不会报红**：换 LE 证书后浏览器访问 `https://...` 是绿锁；用 `http://` 访问会跳 301 到 HTTPS，
  nginx 已配 80 → 443 强制跳转

若既要 CF 加速又要直播，只能拆域名（`www` 橙云 + `live` 灰云），此时需在 `.env` 设置
`MEDIAMTX_PUBLIC_HOST=live.xxx`（推流域名）与 `MEDIAMTX_HLS_HOST=www.xxx`（播放域名）。

### 7.6 直播排障速查
手机**保持推流状态**时，一次性跑完：

```bash
cd /opt/christian-platform
echo "== 1. 公网证书 =="
openssl s_client -connect amen.dpdns.org:443 -servername amen.dpdns.org </dev/null 2>/dev/null | openssl x509 -noout -issuer -dates
echo "== 2. nginx 容器内的证书文件时间（应与宿主机 deploy/certs 一致）=="
docker exec cp_nginx ls -l /etc/nginx/certs/ ; ls -l deploy/certs/
echo "== 3. 推流是否真的进来 =="
curl -s http://127.0.0.1:9997/v3/paths/list | grep -o '"name":"[^"]*","confName":"[^"]*","ready":[a-z]*'
echo "== 4. MediaMTX 日志 =="
docker logs cp_mediamtx --tail 12
echo "== 5. 内网直取 m3u8（绕开证书/DNS，看分片格式）=="
docker exec cp_web node -e "fetch('http://mediamtx:8888/live/<KEY>/index.m3u8?cookieCheck=1').then(r=>r.text()).then(t=>console.log(t.slice(0,300)))"
```

判定：

| 现象 | 结论 | 处理 |
|------|------|------|
| 1 的 issuer 仍是 `CloudFlare Origin` | 证书没换成 LE | 重跑 certbot，cp 后 `docker compose restart nginx` |
| 1 已是 Let's Encrypt 但 2 的文件时间旧 | nginx 没重载 | `docker compose restart nginx` |
| 3 没有 `live/<KEY>`，或 `ready:false` | **推流根本没进来**，与播放无关 | 看 4：`is publishing` 才算成功；只有 `opened` 无 publishing＝握手没完成 |
| 3 `ready:true` 但 5 出现 `EXT-X-PART` / `.mp4` 分片 | HLS 变体还是 lowLatency，配置没生效 | 检查 `hlsVariant` 并 `--force-recreate mediamtx` |
| 3 `ready:true` 且 5 是 `#EXTM3U` + `.ts` | 服务端 100% 正常 | 去 VLC，**关掉所有窗口重开**再填地址 |

> 判断「手机有没有推成功」只看第 3 条 + 第 4 条，App 显示「推流中」不可信（弱网下会一直重连但 UI 不变）。

## 日常运维
```bash
docker compose ps                    # 查看状态
docker compose logs -f web           # 应用日志
docker compose restart web           # 重启应用
git pull && docker compose up -d --build   # 更新代码
docker compose down                  # 停止全部
```

## 数据备份

### 手动备份 / 恢复
```bash
# 手动备份（脚本自动压缩 + 命名 + 保留 7 天）
bash deploy/backup.sh

# 手动恢复
gunzip -c backups/christian_platform_YYYYmmdd_HHMMSS.sql.gz | \
  docker exec -i cp_db mysql -uroot -p"$DB_PASSWORD" christian_platform
```

### 自动备份（crontab，每天凌晨 3 点）
```bash
crontab -e
```
添加一行（路径改成你的项目实际路径）：
```
0 3 * * * cd /opt/christian-platform && bash deploy/backup.sh >> backups/backup.log 2>&1
```
- 备份落在 `backups/`，默认保留 7 天，可在脚本里改 `KEEP_DAYS`
- 验证定时任务：`crontab -l`

## 开机自启
容器已配 `restart: unless-stopped`，机器重启会自动拉起。只需确认 Docker 服务本身开机自启：
```bash
sudo systemctl enable docker
sudo systemctl enable containerd   # 若为独立 containerd 服务
```
重启验证：`sudo reboot` 后 `docker compose ps` 三个容器应为 Up。

## 常见问题
- **构建慢**：Next.js 首次 `npm ci` + `build` 需几分钟，属正常。
- **内存不足**：构建阶段建议 VPS ≥ 2GB 内存；1GB 机器可先加 swap。
- **数据库连不上**：确认 `cp_db` 健康（`docker compose ps` 显示 healthy）后再看 web 日志。
- **不用 MySQL 演示**：删掉 compose 里 `db` 服务并去掉 web 的 `DB_HOST`，应用会回退内置 mock 数据层（仅演示）。
- **直播（MediaMTX）**：可选，需额外放行 8080(RTMP)/8888(HLS，走 nginx 反代可不对外) 端口并注入 `MEDIAMTX_*` 环境变量；不做直播可忽略。
