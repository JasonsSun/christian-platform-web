# 圣约社区 · 基督教内容传播与社交社区平台
**Covenant Community · A Christian content-publishing & social-community platform**

> **English / 摘要 Abstract:** A self-hosted, full-stack Christian content & community platform (Simplified Chinese UI).
> Next.js 14 (App Router) + MySQL 8, deployed with Docker Compose.
> It is **live in production today** — this repository is the real thing, not a demo.
> 🌱 **Seeking hosting support.** The server costs are currently borne by an individual; we are looking for hosting sponsors —
> the use of funds is public and verifiable; see [服务器与资金用途 / Server & Funding](#五服务器与资金用途)
> and [支持本项目 / Support](#六支持本项目).
> The infrastructure uses a **layered architecture** (app / object storage / transcoding-live / off-site backup) that scales layer by layer as the project grows;
> see [目标架构：四层分离 / Target Architecture: 4-Layer Split](#目标架构四层分离).
>
> *This document is bilingual — every section below has a Chinese version followed by its English translation.*

---

## 一、项目是什么
**What this project is**

一个为中文教会与信徒群体打造的**内容传播 + 社交社区**平台，把日常信仰生活里分散的几件事收拢到一处：
读经、灵修、诗歌、讲道、团契小组、活动报名、代祷、直播 —— 以及支撑这些内容流转的发布、审核、通知与管理后台。

A **content-publishing + social-community** platform built for Chinese-speaking churches and believers. It brings the scattered pieces of everyday faith life into one place: Bible reading, devotions, hymns, sermons, fellowship groups, event sign-ups, prayer requests, and live streaming — plus the publishing, moderation, notification, and admin tooling that keeps all of it flowing.

它不是内容聚合站，也不是单一功能的小工具，而是一套**可自主部署、可长期运营**的社区基础设施：任何一间教会、一个团契或一支服侍团队，拿到代码就能在自己的服务器上跑起来，数据完全归属自己。

It is not a content aggregator, nor a single-purpose gadget. It is **self-hostable, long-term-operable** community infrastructure: any church, fellowship, or serving team can take the code, run it on their own server, and own their data completely.

- **线上实例 / Live instance**：`https://amen.dpdns.org`
- **形态 / Form**：Web（响应式 + PWA，可添加到手机桌面）；目前无独立 App<br>Responsive web + PWA (installable to phone home screen); no standalone app yet.

---

## 二、当前开发状态
**Current development status**

**状态：生产运行中（已上线对外提供服务），功能面完整，处于运营与推广阶段。**
**Status: In production (publicly serving). Feature-complete across the board; now in the operations & outreach phase.**

### 量化现状
**Quantitative snapshot**

| 维度 / Dimension | 数量 / Count | 说明 / Notes |
|---|---|---|
| 页面 Pages | 87 | 含前台、个人中心、30 个管理后台页面<br>Frontend, user center, and 30 admin pages |
| API 端点 API endpoints | 188 | `/api/v1/**`，统一鉴权、统一错误码<br>Unified auth & error codes |
| 数据表 Tables | 62 | MySQL，全部可在运行时幂等补齐<br>MySQL; all created idempotently at runtime |
| 代码量 Lines of code | 约 72,900 行 ~72,900 | 487 个 TS/TSX 文件<br>487 TS/TSX files |
| 服务端模块 Server modules | 61 | 自研服务层，无外部 ORM/框架依赖<br>Hand-written service layer, no external ORM/framework |
| 组件 Components | 57 | |
| 回归脚本 Regression scripts | 13 个 e2e + 支付/2FA/权限等离线单测 | CI 可一键跑全量<br>13 e2e + offline unit tests (payments/2FA/perms); one-click in CI |

### 已完整实现的功能
**Fully implemented features**

**内容社区 / Content community**
图文内容发布（草稿/发布/编辑）、评论与点赞、收藏与自定义收藏夹、标签与话题聚合页、关注流、热门 Feed、举报与内容审核流（稿件先审后发）、内容关联媒体。
Article publishing (draft/publish/edit), comments & likes, bookmarks & custom collections, tag/topic hubs, follow feed, hot feed, report & moderation flow (review-before-publish), media attachments.

**圣经与灵修 / Bible & devotions**
和合本（CUV）经文逐章阅读、书签、阅读历史与已读标记、逐节朗读（Edge TTS，可整章连读）、读经计划与每日打卡、灵修短文（Devotionals）、简繁转换（OpenCC）。
CUV Bible chapter reading, bookmarks, reading history & read-marks, per-verse read-aloud (Edge TTS, whole-chapter playback), reading plans & daily check-ins, devotionals, simplified/traditional conversion (OpenCC).

**诗歌 / Hymns**
诗歌库与详情、**和弦谱渲染与一键移调**（原调/选调显示）、分类与标签、收藏、歌词批量导入（后台粘贴多首自动解析入库）、歌本集合。
Hymn library & detail, **chord-chart rendering with one-click transposition** (original/selected key), categories & tags, favorites, bulk lyric import (paste multiple songs → auto-parse), songbook sets.

**讲道 / Sermons**
讲道系列（Sermon Series）、音视频讲道、讲道文稿、点赞、详情页动态 SEO。
Sermon series, audio/video sermons, sermon notes, likes, dynamic per-page SEO.

**团契与小组 / Groups & fellowships**
小组/团契创建与加入、成员管理、**群聊（WebSocket 实时 + 轮询兜底）**、群公告、小组帖子。
Create/join groups, member management, **group chat (WebSocket realtime + polling fallback)**, announcements, group posts.

**活动 / Events**
活动发布、报名与名额、签到（Check-in）、地点地图标注、活动提醒通知。
Event publishing, sign-up with capacity, check-in, map pin, reminder notifications.

**代祷 / Prayer**
代祷墙、代为代祷（Amen）、代祷更新与回应。
Prayer wall, pray-for-others (Amen), prayer updates & responses.

**直播 / Live streaming**
自建 RTMP 直播（MediaMTX）、主播开播与推流配置、直播间实时聊天、观看人数、开播提醒、**回放录制与三态审核**（公开 / 审核中仅作者可见 / 驳回即物理删除）、HLS 播放。
Self-hosted RTMP live (MediaMTX), broadcaster go-live & stream config, live-room chat, viewer count, go-live alerts, **recording with 3-state review** (public / author-only while pending / hard-deleted on rejection), HLS playback.

**社交与通知 / Social & notifications**
关注/粉丝、好友申请、私信（含撤回、隐私策略、黑名单双向拦截）、@与互动通知、通知偏好设置、Web Push 浏览器推送、邮件通知。
Follow/fans, friend requests, direct messages (with recall, privacy policy, mutual blocklist), @-mentions & interaction notifications, notification preferences, Web Push, email notifications.

**媒体 / Media**
上传 → 异步转码（ffmpeg，HLS 切片）→ 播放；音频/视频/图片/文档；**存储抽象层：本地磁盘 ⇄ S3 兼容对象存储**（阿里云 OSS / 腾讯云 COS / AWS S3 / MinIO）一键切换，切换无需改业务代码。
Upload → async transcode (ffmpeg, HLS) → playback; audio/video/image/docs; **storage abstraction: local disk ⇄ S3-compatible object storage** (Aliyun OSS / Tencent COS / AWS S3 / MinIO) swappable via one env var, no business-code change.

**捐赠与财务透明（本项目自身的赞助通道） / Donations & financial transparency (this project's own sponsorship channel)**
捐赠项目、在线支付、**支出记账**、对外公开的**财务透明页**。
Donation campaigns, online payments, expense ledger, and a public financial-transparency page.

**管理与治理 / Admin & governance**
30 个后台页面：用户、内容、评论、审核、直播、媒体、讲道、诗歌、组织、活动、小组、标签、角色与权限（细分到模型的审核员授权）、配额策略、审计日志、系统诊断（含错误环形缓冲）、数据备份与恢复、报表、财务（捐赠/支出）、反馈处理。
30 admin pages: users, content, comments, moderation, live, media, sermons, hymns, organization, events, groups, tags, roles & permissions (model-level reviewer grants), quota policies, audit log, system diagnostics (error ring buffer), backup & restore, reports, finance (donations/expenses), feedback handling.

**体验与系统 / UX & system**
⌘K 全局命令面板（40+ 页面 + 经文直达 + 全站搜索）、阅读进度条、主题切换（浅色/深色/护眼）、PWA（manifest + Service Worker）、sitemap/robots、每篇内容独立 OG 分享图、404/错误页、徽章与成长体系（积分/热力图）、日历视图、无障碍与移动端触控优化、模块开关（可按业务逐项启停）、系统监控端点。
⌘K command palette (40+ pages + direct Bible jump + global search), reading progress bar, theme switch (light/dark/eye-care), PWA (manifest + Service Worker), sitemap/robots, per-content OG share image, 404/error pages, badges & growth system (points/heatmap), calendar view, a11y & mobile touch optimization, per-module feature toggles, system monitoring endpoints.

### 已知限制与在办事项（如实列出）
**Known limitations & backlog (stated honestly)**

| 项 / Item | 现状 / Status |
|---|---|
| 独立移动 App Standalone mobile app | **未开发**，目前靠响应式 Web + PWA<br>Not built; responsive web + PWA for now |
| 讲道音频自动转文字 Sermon audio → text | **未做**，需接 ASR 服务（有成本）<br>Not done; needs ASR service (costs money) |
| 大规模并发压测 Large-scale load test | 尚未做公开压测报告<br>No public load-test report yet |
| 微信/支付宝/Stripe 在线支付 WeChat/Alipay/Stripe payments | 代码已完整实现（含签名与回调验签），但**需对应商户资质才能真实开通**<br>Code complete (signing & callback verification), but needs merchant credentials to go live |
| 短信 / 邮件送达 SMS / email delivery | 依赖第三方服务商，需自行配置<br>Depends on third-party providers; configure yourself |
| 内容审核 Content moderation | 人工 + 志愿审核员，暂无 AI 初审<br>Human + volunteer reviewers; no AI pre-screen yet |
| 多语言 i18n | 仅简体中文界面（含简繁转换）<br>Simplified-Chinese UI only (incl. simp/trad conversion) |
| 媒体存储位置 Media storage location | 默认落**本地磁盘**；迁对象存储为配置级改动（见 [四层分离 / 4-Layer](#目标架构四层分离)），尚未默认启用<br>Defaults to **local disk**; moving to object storage is a config change, not yet default-on |

> 以上"未完成"项均不影响现有功能使用，属增强与规模化方向。
> None of the above blocks current usage — they are enhancement & scaling directions.

---

## 三、技术架构
**Technical architecture**

### 当前形态（单台 VPS 全栈）
**Current shape (single VPS, full stack)**

```
浏览器 ──▶ nginx(80/443) ──▶ Next.js 14 App Router(3000) ──▶ MySQL 8(3306)
                                    │
                                    ├── 自研实时总线（WebSocket，ws）
                                    ├── ffmpeg 异步转码 → HLS
                                    └── 存储抽象层 → 本地磁盘 或 S3 兼容对象存储
直播旁路：OBS ──RTMP──▶ MediaMTX ──HLS──▶ 浏览器（hls.js）

Browser ──▶ nginx(80/443) ──▶ Next.js 14 App Router(3000) ──▶ MySQL 8(3306)
                                    │
                                    ├── in-house realtime bus (WebSocket, ws)
                                    ├── ffmpeg async transcode → HLS
                                    └── storage abstraction → local disk or S3-compatible
Live side-path: OBS ──RTMP──▶ MediaMTX ──HLS──▶ Browser (hls.js)
```

### 目标架构：四层分离
**Target architecture: 4-layer split**

项目涉及**音视频与直播**，把所有东西压在同一台 VPS 上不是长期方案。合理的做法是按**负载性质**拆分 —— 因为它们的瓶颈完全不同：Web 与数据库吃内存与 IOPS，媒体文件吃存储容量，转码与推流吃 CPU 和出口带宽，备份则要求"不在同一块磁盘上"。

The project involves **audio/video and live streaming**, so cramming everything onto one VPS is not a long-term plan. The sensible approach is to split by **load type** — because their bottlenecks are completely different: web & DB eat memory and IOPS, media files eat storage capacity, transcoding & streaming eat CPU and egress bandwidth, and backups must live "not on the same disk."

```
                        ┌─────────────────────────────┐
   浏览器/CDN  ─────────▶│  ① 应用节点（Linux VPS）     │
                        │  nginx → Next.js 14 → MySQL8 │
                        │  实时总线（WebSocket）        │
                        └──────┬────────────┬──────────┘
                    媒体读写   │            │  转码/推流任务
                        ┌─────▼──────┐  ┌──▼───────────────┐
                        │ ② 对象存储 │  │ ③ 转码/直播节点  │
                        │ 音频 视频  │  │ ffmpeg → HLS     │
                        │ 封面 附件  │  │ MediaMTX(RTMP→HLS)
                        │ (S3 兼容)  │  └──────────────────┘
                        └─────┬──────┘
                   定时快照   │   ┌──────────────────────┐
                              └──▶│ ④ 备份存储（异地）    │
                                  │ DB + 元数据 + 资料   │
                                  └──────────────────────┘

   ① App node (Linux VPS): nginx → Next.js 14 → MySQL8, realtime bus (WebSocket)
   ② Object storage (S3-compatible): audio, video, covers, attachments
   ③ Transcode / live node: ffmpeg → HLS, MediaMTX (RTMP→HLS)
   ④ Backup storage (off-site): DB + metadata + assets
```

| 层 / Layer | 职责 / Role | 承载内容 / Holds | 瓶颈资源 / Bottleneck | 代码现状 / Status |
|---|---|---|---|---|
| ① 应用 + 数据库 App + DB | 网站、API、数据库、实时通信<br>Site, API, DB, realtime | 业务数据、会话、通知<br>Business data, sessions, notifications | 内存 / IOPS / 连接数<br>RAM / IOPS / connections | ✅ 生产运行中<br>In production |
| ② 对象存储 Object storage | 媒体文件持久化<br>Media persistence | 诗歌音频、讲道音视频、封面、附件<br>Hymn audio, sermon A/V, covers, attachments | 存储容量 + 下行流量<br>Capacity + egress | ✅ 抽象层已实现，**改一个环境变量即可启用**<br>Abstraction done; enable with one env var |
| ③ 转码 / 直播 Transcode / live | 高强度计算与推流<br>Heavy compute & streaming | ffmpeg 转码、RTMP 收流、HLS 分发<br>ffmpeg, RTMP ingest, HLS | CPU / 出口带宽<br>CPU / egress | ✅ 已实现；可与应用同机，也可独立<br>Done; co-locate or separate |
| ④ 备份存储 Backup | 容灾<br>Disaster recovery | 数据库 SQL、应用快照、关键资料<br>DB SQL, app snapshots, assets | 容量（要求异地）<br>Capacity (off-site) | ✅ 脚本 + 后台备份页已实现，异地存放需配置<br>Scripts + admin backup page done; off-site needs config |

**为什么这样分 / Why split this way**：四层的成本曲线与扩展方式各不相同，绑在一起就必须按"最贵那层"的标准买整台机器。分开之后，媒体量涨了只加对象存储（按量付费、容量无上限），观看人数涨了只给直播节点加带宽，业务量涨了才升级应用节点 —— **每一分钱都花在真正紧张的地方**。
The four layers have different cost curves and scaling methods; bundling them forces you to buy a whole machine sized for the most expensive layer. Split apart, more media only adds object storage (pay-as-you-go, unbounded capacity), more viewers only add bandwidth to the live node, and more business load only upgrades the app node — **every yuan lands exactly where the pressure is.**

### 选型
**Tech stack**

| 层 / Layer | 选型 / Choice |
|---|---|
| 前端 Frontend | Next.js **14.2.15**（App Router）+ React **18.3.1** + Tailwind CSS |
| 服务端 Server | 同仓 API Routes + 自研服务层（61 个模块），无 ORM，SQL 全参数化<br>Same-repo API Routes + in-house service layer (61 modules), no ORM, fully parameterized SQL |
| 数据库 Database | MySQL 8（62 张表，运行时幂等建表与补列，漏迁移也不会 500）<br>MySQL 8 (62 tables, runtime idempotent DDL; a missed migration never 500s) |
| 实时 Realtime | WebSocket 自研总线（通知、群聊、直播聊天）<br>In-house WebSocket bus (notifications, group chat, live chat) |
| 媒体 Media | ffmpeg 转码 → HLS；MediaMTX 接收 RTMP 推流<br>ffmpeg → HLS; MediaMTX ingests RTMP |
| 存储 Storage | 本地磁盘 或 S3 兼容（零依赖 AWS Signature V4，不增加镜像体积）<br>Local disk or S3-compatible (zero-dep AWS Signature V4; no image bloat) |
| 朗读 TTS | Edge TTS（node-edge-tts） |
| 推送 Push | Web Push + Nodemailer 邮件<br>Web Push + Nodemailer email |
| 支付 Payments | 微信支付 v3（RSA2048 + AES-GCM）、支付宝 RSA2、Stripe、线下转账<br>WeChat Pay v3 (RSA2048 + AES-GCM), Alipay RSA2, Stripe, offline transfer |
| 部署 Deploy | Docker Compose（`nginx` + `web` + `db` + `mediamtx`），单台 VPS 即可起步<br>Docker Compose (nginx + web + db + mediamtx); one VPS to start |

**代码位置 / Code location**：本仓库即唯一可交付实现。历史迭代中另有 Java / NestJS 的平行原型，均不再维护，勿使用。
This repo is the only deliverable implementation. Earlier Java / NestJS parallel prototypes exist but are abandoned — do not use them.

---

## 四、部署说明
**Deployment**

> 完整步骤见 [`DEPLOY.md`](./DEPLOY.md)，直播专项见 [`LIVE-STABILITY.md`](./LIVE-STABILITY.md)。
> Full steps in [`DEPLOY.md`](./DEPLOY.md); live-streaming specifics in [`LIVE-STABILITY.md`](./LIVE-STABILITY.md).

### 分层容量建议
**Capacity recommendations per layer**

| 层 / Layer | 起步配置 / Starter | 随什么增长 / Grows with | 何时应独立 / When to separate |
|---|---|---|---|
| ① 应用 + 数据库 App + DB | 2 核 4G / 40G SSD | 日活、请求量、数据量<br>DAU, request volume, data size | 磁盘被媒体占满，或转码拖慢页面响应<br>Disk filled by media, or transcode slows pages |
| ② 对象存储 Object storage | 50G 起，按量付费<br>50G+, pay-as-you-go | 媒体存量与下载量<br>Media stock & downloads | **现在就能切** —— 不增加运维负担<br>Switchable now — no extra ops burden |
| ③ 转码 / 直播 Transcode / live | 起步可并入 ①；独立则需 4 核 8G 起<br>Start co-located; separate needs 4C8G+ | 并发观众数、上传转码量<br>Concurrent viewers, upload transcode | 直播卡顿，或转码任务排队<br>Live stutters, or transcode queues |
| ④ 备份 Backup | 100G，异地<br>100G, off-site | 数据量<br>Data size | 一开始就该有（最低成本：应用内快照 + 定期异地拷贝）<br>From day one (cheapest: in-app snapshots + periodic off-site copy) |

> 带宽按观看人数估算：单路 720p 约 2~4 Mbps/观众；这层压力应由 ② ③ 承担，不该压在应用节点上。
> Bandwidth estimate by viewers: one 720p stream ≈ 2–4 Mbps per viewer; this load should be carried by layers ② ③, not the app node.

### 快速部署（单台 VPS 起步）
**Quick deploy (single VPS to start)**

```bash
# 1. 一台 Ubuntu 22.04/24.04 或 Debian 12 的 VPS，放行 22/80/443（直播另需 1935）
#    A VPS running Ubuntu 22.04/24.04 or Debian 12; open 22/80/443 (1935 for live)
curl -fsSL https://get.docker.com | sudo sh

# 2. 拉取代码 / Clone the code
sudo mkdir -p /opt && cd /opt
git clone <本仓库地址> christian-platform
cd christian-platform

# 3. 配置环境变量 / Configure environment variables
cp deploy/env.example .env
openssl rand -base64 48          # 作为 JWT_SECRET
nano .env                        # 填 DB_PASSWORD 与 JWT_SECRET

# 4. 启动（nginx + web + db + mediamtx 容器）
#    Start (nginx + web + db + mediamtx containers)
docker compose up -d --build
docker compose logs -f web       # 看到"服务器已就绪"即可，Ctrl+C 退出
```

架构上只有 nginx 对公网开放，应用与数据库都在 Docker 内网，**不要放行 3000/3306**。
Architecturally only nginx is public; the app and DB live inside the Docker network — **do not expose 3000/3306**.

### 把媒体迁到对象存储
**Moving media to object storage**

这是四层里**性价比最高、改动最小**的一步 —— 应用代码完全不用动，只需在 `.env` 里设置：
This is the **highest-ROI, lowest-change** step among the four layers — the app code stays untouched; just set these in `.env`:

```bash
STORAGE_PROVIDER=s3
S3_BUCKET=your-bucket
S3_REGION=oss-cn-hangzhou
S3_ENDPOINT=oss-cn-hangzhou.aliyuncs.com   # 不含协议与 bucket 前缀 / no scheme or bucket prefix
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_PUBLIC_URL=https://cdn.example.com      # 可选，缺省推导为 https://{bucket}.{endpoint}
S3_PATH_STYLE=1                            # 可选，MinIO 等自部署需要 / optional, for MinIO etc.
```

改完重启容器即可。历史上传的文件仍是本地路径，可整体同步到 bucket 后保持一致。
Restart the container after editing. Files uploaded before remain on local disk; sync them to the bucket to stay consistent.

配置 CDN 见 [`deploy/cloudflare-cdn.md`](./deploy/cloudflare-cdn.md)。
For CDN setup see [`deploy/cloudflare-cdn.md`](./deploy/cloudflare-cdn.md).

### 更新与备份
**Updates & backups**

```bash
# 更新（源码改动必须重建镜像，不能只重启容器）
# Update (source changes require rebuilding the image, not just restarting)
git pull && docker compose up -d --build web

# 备份：应用内 JSON 快照 + 数据库 SQL 定时备份
# Backup: in-app JSON snapshots + scheduled DB SQL backups
#   deploy/backup.sh            — 手动/定时执行 / manual or scheduled
#   deploy/install-backup-cron.sh — 安装定时任务 / install cron job
#   /admin/backups              — 后台备份与恢复 / admin backup & restore
```

> 备份务必**挪出应用节点**（拷贝到 ④ 的对象存储/另一台机器）。备份与源数据同盘，等于没有备份。
> Backups must be **moved off the app node** (copy to layer ④ object storage / another machine). A backup on the same disk as the source is no backup at all.

### 关键环境变量
**Key environment variables**

| 变量 / Var | 用途 / Purpose |
|---|---|
| `JWT_SECRET` | 令牌签发密钥，**必填强随机串**（弱密钥会拒绝签发 → 登录 500）<br>Token signing key, **required strong random** (weak key → sign rejected → login 500) |
| `DB_PASSWORD` | MySQL 密码<br>MySQL password |
| `STORAGE_PROVIDER` | `local`（默认）或 `s3` —— 四层架构里 ② 的开关<br>`local` (default) or `s3` — the toggle for layer ② |
| `S3_*` | 对象存储的 bucket/region/endpoint/密钥<br>Object storage bucket/region/endpoint/keys |
| `MEDIAMTX_PUBLIC_HOST` | 对外推流域名（需 DNS only，不能套 CDN）<br>Public ingest domain (DNS-only, no CDN) |
| `REDIS_URL` | 可选；配置了且装有 ioredis 时限流走 Redis，否则走 MySQL 共享计数（多副本同样生效）<br>Optional; if set + ioredis installed, rate-limit uses Redis, else MySQL shared counter (works across replicas too) |

> 多副本部署时，限流、媒体任务接管、全文索引补齐都已做共享存储与乐观锁处理，不会因多实例而错乱。
> Under multi-replica deployment, rate-limiting, media-task takeover, and fulltext-index backfill all use shared storage + optimistic locking, so they stay correct across instances.

---

## 五、服务器与资金用途
**Server & funding usage**

> ⚠️ **待填写 / TODO**: 以下内容涉及你的实际账单，请替换为真实数字后再对外。<br>The figures below are your real bills — replace with actual numbers before publishing.

**目前的全部资源都用于这一个项目**。服务器不共享给他人，也不跑与本项目无关的东西。
**Every resource right now goes to this one project.** The server is not shared with anyone, nor does it run anything unrelated.

### 月度支出（公开，按四层分列）
**Monthly expenses (public, broken down by layer)**

| 层 / Layer | 项目 / Item | 月支出 / Month | 年支出 / Year |
|---|---|---|---|
| ① 应用 + 数据库 App + DB | VPS（⚠️ 待填写配置与金额）<br>VPS (TODO config & amount) | ¥____ | ¥____ |
| ② 对象存储 Object storage | 容量 + 下行流量（超出免费额度部分）<br>Capacity + egress (above free tier) | ¥____ | ¥____ |
| ③ 转码 / 直播 Transcode / live | 起步并入 ①；独立后另计（⚠️ 待填写）<br>Starts co-located; separate later (TODO) | ¥____ | ¥____ |
| ④ 备份存储 Backup | 异地备份空间<br>Off-site backup space | ¥____ | ¥____ |
| 公共 Common | 域名 Domain | — | ¥____ |
| 公共 Common | SSL 证书（Let's Encrypt） | ¥0 | ¥0 |
| 公共 Common | 邮件 / 推送服务 Email / push | ¥0 ~ ____ | |
| | **合计 Total** | **¥____** | **¥____** |

**钱花在哪一层，取决于项目长到哪一步** —— 这也是分层架构对赞助者的意义：支出是**可预期、可分阶段**的，不会出现"因为视频变多，被迫整体升级高配服务器"这种浪费。
**Which layer the money goes to depends on how far the project has grown** — that is the point of the layered architecture for sponsors: spending is **predictable and phased**, with no "forced to upgrade the whole server because videos grew" waste.

| 阶段 / Phase | 支出重心 / Where the money concentrates |
|---|---|
| 现在（起步期） Now (early) | 主要是 ① 的应用 VPS；② 走对象存储免费额度，几乎为 0<br>Mostly the layer-① app VPS; layer ② rides the free tier, near zero |
| 内容增长期 Growth | ② 的存储与流量随讲道/诗歌库存上升（按量，几元到几十元/月）<br>Layer ② storage & traffic rise with sermon/hymn stock (pay-per-use, a few to tens of RMB/month) |
| 直播常态化 Live becomes routine | ③ 的带宽成为主要支出，按并发人数线性增长<br>Layer ③ bandwidth becomes the main cost, linear in concurrent viewers |
| 稳定期 Steady | ④ 的异地备份是固定小额成本，但不可省<br>Layer ④ off-site backup is a small fixed cost, but non-skippable |

> **财务透明 / Financial transparency**：本项目已内置财务公开机制 —— 每一笔捐赠与支出都记录在案，并在站内的
> **财务透明页**（`/donate/transparency`）对外公开。赞助者可以直接看到钱从哪里来、花到哪里去，
> 而不是只看到一句"感谢支持"。<br>This project has a built-in public-finance mechanism — every donation and expense is recorded and published on the in-site **transparency page** (`/donate/transparency`). Sponsors see exactly where money comes from and goes, not just a "thanks for the support."

---

## 六、支持本项目
**Support this project**

> ⚠️ **待填写 / TODO**: 保留你实际启用的渠道，删掉没有的。<br>Keep only the channels you actually enable; delete the rest.

**资金支持（用于服务器续费与持续开发） / Financial support (server renewal & ongoing development)**

| 方式 / Method | 入口 / Entry |
|---|---|
| 站内在线捐赠（微信 / 支付宝 / Stripe） In-site donation (WeChat / Alipay / Stripe) | `/donate` —— 一次性或按月<br>One-time or monthly |
| GitHub Sponsors | ⚠️ 待填写（如已开启，放链接）<br>TODO (link if enabled) |
| 其他（PayPal / 银行转账） Other (PayPal / bank transfer) | ⚠️ 待填写<br>TODO |

**非资金支持（同样重要） / Non-financial support (equally important)**

- 内容贡献：诗歌录入、讲道整理、经文校对、灵修稿件<br>Content: hymn entry, sermon organization, verse proofreading, devotionals
- 技术贡献：Issue、PR、性能优化、安全建议<br>Technical: issues, PRs, performance, security advice
- 传播：把它介绍给需要的教会/团契（自部署不需要额外成本）<br>Spread: introduce it to churches/fellowships in need (self-hosting costs nothing extra)
- 反馈：站内的 `/feedback`<br>Feedback: the in-site `/feedback`

**赞助者还可以直接认领某一层**（如"承担对象存储"或"承担备份存储"），每层的成本边界清晰，认领后在该层的账单上直接体现。
**Sponsors can also directly adopt a layer** (e.g. "cover object storage" or "cover backup storage") — each layer's cost boundary is clear, and the adoption shows up directly on that layer's bill.

**给赞助者的一句话 / One sentence for sponsors**：
这不是一个停在 PPT 上的项目 —— 它已经在公网稳定运行，有 62 张表承载真实数据、有完整的后台与财务公开机制，
并且**架构上是按负载分层的，钱花在哪一层、为何而增长，都说得清楚**。
你的支持直接对应到服务器账单和下一个功能，而不是一个模糊的承诺。
This is not a project stuck on a slide deck — it runs stably on the public internet, with 62 tables holding real data and a complete admin + public-finance mechanism, and **its architecture is layered by load, so where the money goes and why it grows is clear**. Your support maps directly to the server bill and the next feature, not to a vague promise.

---

## 七、路线图与后续维护
**Roadmap & maintenance**

### 基础设施演进（四层分离路径）
**Infrastructure evolution (the 4-layer path)**

| 阶段 / Phase | 动作 / Action | 收益 / Benefit | 触发条件 / Trigger |
|---|---|---|---|
| **阶段 0**（当前） Stage 0 (now) | 单台 VPS 承载全部：nginx + 应用 + MySQL + MediaMTX + 本地磁盘<br>One VPS holds all: nginx + app + MySQL + MediaMTX + local disk | 成本最低，运维最简单<br>Lowest cost, simplest ops | — |
| **阶段 1** Stage 1 | 媒体外置：启用 `STORAGE_PROVIDER=s3`<br>Externalize media: enable `STORAGE_PROVIDER=s3` | VPS 磁盘压力立刻释放；媒体容量不再受机型限制；改动仅一个环境变量<br>VPS disk pressure gone instantly; media capacity no longer bound by machine type; one env var | **立即可做**，也是投入产出比最高的一步<br>Doable now; highest ROI step |
| **阶段 2** Stage 2 | 转码与推流分离：ffmpeg/MediaMTX 移到独立节点，或改用云转码<br>Split transcode & ingest: move ffmpeg/MediaMTX to a separate node, or use cloud transcode | 转码不再抢占应用 CPU；直播卡顿与页面变慢解耦<br>Transcode stops stealing app CPU; live-stutter and page-slow decoupled | 直播常态化，或转码任务开始排队<br>Live becomes routine, or transcode queues |
| **阶段 3** Stage 3 | 应用水平扩展：多副本 + 共享存储（MySQL 计数 / Redis）+ 数据库读写分离<br>App horizontal scale: multi-replica + shared storage (MySQL counter / Redis) + DB read/write split | 可承载更大规模访问；单点故障影响下降<br>Handles larger scale; single-point failure impact drops | 日活持续增长，单机成为瓶颈<br>DAU keeps growing; single machine becomes the bottleneck |

> 限流、媒体任务接管、全文索引补齐这三处**已经按多副本设计好**（MySQL 共享计数 + 乐观锁），
> 走到阶段 3 时不需要回头重构。<br>Rate-limiting, media-task takeover, and fulltext backfill are **already designed for multi-replica** (MySQL shared counter + optimistic locking), so reaching stage 3 needs no rework.

### 产品功能
**Product features**

**短期（1~3 个月） / Short term (1–3 months)**

- 内容冷启动与日常运营：诗歌/讲道/灵修的内容录入与校对<br>Content cold-start & daily ops: hymn/sermon/devotional entry & proofreading
- **基础设施：完成阶段 1（媒体迁至对象存储）**<br>**Infra: finish stage 1 (media → object storage)**
- 移动端体验打磨（触控目标、加载性能、弱网）<br>Mobile UX polish (touch targets, load perf, weak network)
- 监控与告警完善（错误环形缓冲 → 主动告警）<br>Monitoring & alerting (error ring buffer → proactive alerts)
- 定期备份演练与恢复验证<br>Periodic backup drills & restore verification

**中期（3~12 个月） / Mid term (3–12 months)**

- **基础设施：阶段 2（转码/直播独立）**<br>**Infra: stage 2 (transcode/live separate)**
- 讲道音频自动转文字（需 ASR，有成本）<br>Sermon audio → text (needs ASR, costs money)
- 独立移动端 App（React Native 或 PWA 增强）<br>Standalone mobile app (React Native or PWA+)
- 多语言界面（英文优先）<br>Multi-language UI (English first)
- 内容 AI 初审，减轻人工审核压力<br>AI pre-moderation to reduce human load

**长期 / Long term**

- 开放 API，供教会/机构二次集成<br>Open API for church/org secondary integration
- 面向多教会的多租户托管（同一套代码服务多个群体）<br>Multi-tenant hosting for multiple churches (one codebase, many communities)
- 更完善的权限与协作治理体系<br>More complete permissions & collaboration governance

### 维护承诺
**Maintenance commitments**

| 项 / Item | 做法 / Practice |
|---|---|
| 更新频率 Update frequency | ⚠️ 待填写（如：每周迭代，紧急问题 24 小时内响应）<br>TODO (e.g. weekly iterations, urgent issues within 24h) |
| 数据安全 Data safety | 定时备份 + 定期恢复演练；**备份存放于异地，不与应用同盘**<br>Scheduled backups + restore drills; **backups stored off-site, not on the app disk** |
| 安全响应 Security response | 发现漏洞请通过下方联系方式私密反馈，不公开披露<br>Report vulnerabilities privately via contact below; no public disclosure |
| 依赖维护 Dependency upkeep | 定期升级依赖与安全补丁<br>Regular dependency & security-patch upgrades |

---

## 八、联系
**Contact**

- **邮箱 / Email**：⚠️ 待填写<br>TODO
- **问题反馈 / Feedback**：站内 `/feedback`
- **安全漏洞 / Security vulnerability**：⚠️ 待填写（建议单独留一个私密渠道）<br>TODO (recommend a separate private channel)

---

## 九、许可说明
**License**

> ⚠️ 待填写 / TODO: 本仓库当前为**私有仓库**，代码暂未对外授权。
> 若你希望对外开源，建议在此明确 LICENSE（如 MIT / AGPL-3.0）；
> 若不打算开源，可改为"如需使用或自部署，请联系作者获取授权"。<br>This repo is currently **private**; the code is not yet licensed for external use. If you want to open-source it, state a LICENSE here (e.g. MIT / AGPL-3.0); if not, change this to "to use or self-host, contact the author for permission."

---

<div align="center">

*Soli Deo Gloria.*

**如果这个项目对你有价值，欢迎通过 `/donate` 支持它继续运行下去。**
**If this project is valuable to you, please support its continued operation via `/donate`.**

</div>
