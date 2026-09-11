# 在 Ubuntu / Debian VPS 部署基督教内容平台

容器化部署（推荐）：应用 + MySQL 用 Docker Compose 一条命令起；nginx 在宿主机做反代 + HTTPS。
端口约定：应用在容器内监听 **3000**，仅对宿主机 `127.0.0.1` 开放，公网流量走 nginx(443)。

## 0. 准备 VPS
- 系统：Ubuntu 22.04/24.04 或 Debian 12
- 安全组/防火墙放行：`22`(SSH)、`80`、`443`；**不要**放行 3000/3306 到公网
- 域名 A 记录指向该 VPS 公网 IP（HTTPS 需要）

## 1. 安装 Docker
```bash
# Ubuntu/Debian 通用
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # 退出重登后免 sudo
docker compose version          # 确认 compose 插件可用
```

## 2. 上传代码
方式 A（有 git）：把仓库 clone 到 VPS，再 `cd platform-v1.10/apps/web`。
方式 B（无 git）：本地把 `platform-v1.10/apps/web` 打成 zip，scp 上去解压。

## 3. 配置环境变量
```bash
cd platform-v1.10/apps/web
cp deploy/env.example .env
# 编辑 .env：DB_PASSWORD / JWT_SECRET 务必改成强随机值
nano .env
```

## 4. 启动
```bash
docker compose up -d --build
docker compose logs -f web      # 看到 "服务器已就绪 http://localhost:3000" 即成功
```
- 应用镜像构建时会跑 `npm run build`，这一步在本机/VPS 正常，个别沙箱环境因文件删除保护会失败（你本地 Windows 沙箱遇到过），**真实 VPS 不受影响**。
- 首次启动会自动建 `christian_platform` 库；若需导入既有数据，先把 SQL 灌进 `cp_db` 容器。

## 5. 反代 + HTTPS（宿主机 nginx）
```bash
sudo apt install -y nginx
sudo cp deploy/nginx-proxy.conf /etc/nginx/sites-available/christian-platform
sudo ln -s /etc/nginx/sites-available/christian-platform /etc/nginx/sites-enabled/
sudo sed -i 's/your-domain.com/你的域名/g' /etc/nginx/sites-available/christian-platform
sudo nginx -t && sudo systemctl reload nginx

# 申请免费证书
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```
证书每 90 天自动续期。

## 6. 验证
浏览器打开 `https://你的域名`，应能访问首页；`/admin` 为后台。

## 不用 MySQL 的极简模式（演示/内网）
若只想先跑起来、不要数据库：删掉 `docker-compose.yml` 里的 `db` 服务，并把 `web` 的
`DB_HOST` 去掉，应用会自动回退到内置 mock 数据层（零依赖可演示）。生产环境建议用真实 MySQL。

## 直播功能（可选）
直播用到 MediaMTX（仓库 `bin/mediamtx/`）。需要：
- 在 `.env` 注入 `MEDIAMTX_API / MEDIAMTX_USER / MEDIAMTX_PASS / MEDIAMTX_PUBLIC_HOST`；
- 防火墙放行 `1935`(RTMP 推流)、`8888`(HLS 播放) 给对应用户。
不开直播可忽略。

## 日常运维
```bash
docker compose ps
docker compose logs -f web
docker compose down          # 停止
docker compose up -d --build # 更新代码后重建
```
