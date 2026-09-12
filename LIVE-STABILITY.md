# 直播稳定性优化方案

> 对象：`amen.dpdns.org` + VPS Docker（nginx → web → MediaMTX）
> 现状：手机 Larix 推 RTMP(:8080)，观众走 HLS(`/hls/`，mpegts 2s×4 分片)，全站 Cloudflare **橙云**

---

## 一、结论先行

**"卡 / 看几秒就断 / 一直加载" 的真因排序（按概率）：**

| 排名 | 原因 | 证据 | 严重度 |
|---|---|---|---|
| 1 | **上行带宽打满**（观众数 × 码率 > VPS 上行） | 轻量 VPS 上行常 3–8 Mbps，2 Mbps 码率 5 个观众就满了 | 🔴 致命 |
| 2 | **Cloudflare 橙云代理直播流** | `deploy/nginx.conf:3` 注释写的是「Cloudflare(橙云)」；CDN 会缓冲/中转流媒体，延迟和卡顿放大 | 🔴 致命 |
| 3 | **`hlsAlwaysRemux: false`** — 没人看时切片器关闭，第一个观众要等冷启动 | `deploy/mediamtx.yml:347` | 🟠 高（"一直加载"的直接原因） |
| 4 | **RTMP over TCP 队头阻塞**（手机 4G 弱网推流） | 推流走 TCP 8080，丢包即整条流停顿 | 🟠 高（"卡卡的"直接原因） |
| 5 | **`record: true` 每场都落盘 fmp4** | `mediamtx.yml:593`，2 GB VPS 上白吃 CPU/磁盘 IO | 🟡 中 |
| 6 | WebRTC 实际不可用（UDP 8189 未映射） | `docker-compose.yml:92-95` 只映射了 TCP 8889 | 🟡 中（低延迟方案没用上） |

**证书不是卡顿原因**（TLS 只握手一次，HTTP/2 复用连接）。但它牵出上面第 2 条 —— 上 HTTPS 时顺手开了 Cloudflare 橙云，直播流被 CDN 代理才是问题。

**最该做的三件事（按顺序）：**
1. 直播域名/路径走 **Cloudflare 灰云**（DNS-only），或给直播单独子域并关闭代理
2. `hlsAlwaysRemux: true` + 短分片（1s）+ 关录制 → 秒开、不再转圈
3. **先量带宽**：`观众数 × 码率 ≤ 上行 × 0.8`，不满足就降码率或接云直播 CDN

---

## 二、先量再改（把结果发我，我按数据给你定档）

在 VPS 上跑：

```bash
# 1) 上行带宽（决定了能带几个观众）—— 最关键
curl -sL yabs.sh | bash -s -- -i -f  # 或: speedtest-cli --simple

# 2) CPU 核数 / 内存
nproc; free -m

# 3) 直播时实时占用（另开窗口，推流+多人观看时看）
docker stats cp_mediamtx cp_web cp_nginx

# 4) 当前在线读者数与吞吐（直播中跑）
curl -s http://127.0.0.1:9997/v3/paths/list | python3 -m json.tool

# 5) 手机→服务器链路质量（在推流的手机上用，或 VPS 上 mtr 到手机 IP 不可行则跳过）
#    重点看丢包率：>2% 就会明显卡
ping -c 50 <手机公网IP>
```

**判据：**
- 上行 < 10 Mbps → 自建转发最多带 3–5 个 720p 观众，**必须降码率或接 CDN**
- CPU 1 核 + 直播时 `docker stats` 常年 >70% → 关录制、别开转码
- 丢包 > 2% → 推流改 SRT（见 4.2）

---

## 三、P0：零成本配置修改（今天就改，效果立竿见影）

### 3.1 直播流量绕开 Cloudflare（🔴 最重要）

Cloudflare 免费/Pro 对流媒体会做缓冲与中转，直播表现为"延迟几十秒 + 周期性卡死"。

**做法（二选一）：**
- **A（推荐）**：Cloudflare DNS 里把 `amen.dpdns.org` 的 A 记录点成 **灰云（DNS only）**，HTTPS 用 Let's Encrypt 证书（certbot 已预留 `/.well-known/acme-challenge/` 路径）
- **B**：保留主站橙云，新增 `live.amen.dpdns.org` 子域 **灰云** 指向同 IP，直播页/播放地址全走这个子域

改完验证：`dig amen.dpdns.org` 返回的 IP 应是 VPS 真实 IP，而不是 `104.x/172.x`（CF 段）。

### 3.2 MediaMTX：秒开 + 抗抖

编辑 `apps/web/deploy/mediamtx.yml`：

```yaml
# ① 切片器常驻：消除第一个观众等冷启动（"一直加载"的直接原因）
hlsAlwaysRemux: true          # 原 false

# ② 缩短直播窗口：延迟 8s -> ~4s，追帧也更快
hlsSegmentDuration: 1s        # 原 2s
hlsSegmentCount: 6            # 原 4（窗口保持 6s，别太小否则弱网易断）

# ③ 弱网推流别被踢下线
readTimeout: 20s              # 原 10s
writeQueueSize: 1024          # 原 512

# ④ 关掉默认录制（省 CPU/磁盘 IO；需要录像时后台单场开启）
record: false                 # 原 true（在 paths 的 all_others 段）
```

改完：`docker compose up -d --force-recreate mediamtx`

### 3.3 播放器：缓冲稍微加厚（抗网络抖动）

`src/components/HlsPlayer.tsx:115-121`，弱网下 8s 缓冲偏薄，容易边播边卡：

```js
maxBufferLength: 12,        // 原 8（抗抖动；延迟略增但换取不卡）
liveSyncDurationCount: 3,   // 原 2
```

### 3.4 防火墙放行（为低延迟方案铺路）

```bash
# VPS 防火墙（若用 iptables/ufw）
iptables -A INPUT -p udp --dport 8189 -j ACCEPT   # WebRTC 媒体
iptables -A INPUT -p udp --dport 8890 -j ACCEPT   # SRT 推流
# 云厂商安全组同样要放行 UDP 8189 / 8890
```

---

## 四、P1：推流侧（"卡卡的"的源头）

### 4.1 推流参数（照抄，别用默认值）

| 项 | 值 | 说明 |
|---|---|---|
| 分辨率/帧率 | **720×1280 @30fps**（竖屏） | 别上 1080p，VPS 与手机都吃不消 |
| 视频码率 | **1500–2500 kbps CBR** | 弱网降到 800–1200 |
| 关键帧间隔 | **2s** | 与 `hlsSegmentDuration` 对齐，否则首帧慢 |
| 编码 | H.264 **Main/High**, preset **veryfast** | 别用 ultrafast（码率暴涨） |
| 音频 | AAC 128 kbps 44.1kHz | |
| Profile | Baseline/Main | 兼容性最好 |

- **OBS**：设置 → 输出 → 输出模式"高级" → 编码器 x264 → 码率 CBR 2000 Kbps → 关键帧间隔 2 → preset veryfast
- **Larix（手机）**：Settings → Video → 1280x720 / 30fps / 2000kbps，keyframe 2s；Advanced 里把 **Network buffer 调到 1–2s**（弱网救命设置）

### 4.2 弱网/跨运营商：推流改 SRT（强烈建议试）

RTMP 走 TCP，丢包时**队头阻塞**整条流停顿（手机 4G 尤其明显）。SRT 走 UDP + ARQ 重传，丢包 5% 内几乎无感。

```yaml
# mediamtx.yml
srt: true          # 默认已开
# docker-compose 增加端口映射
#   - "8890:8890/udp"
```

推流地址：`srt://amen.dpdns.org:8890?streamid=publish:live/<streamKey>&latency=1000000`（latency 单位 ns，1000000 = 1s 缓冲）

Larix / OBS(30+) 都支持 SRT。**RTMP(:8080) 保留做兜底**，网络好时用它、差时用 SRT。

### 4.3 开播前自检 SOP（固定流程，避免现场翻车）

```
1. 手机测速：上行 ≥ 码率 × 1.5（推 2 Mbps 就要 ≥3 Mbps 上行）
2. 平台创建直播 → 复制 streamKey（每次开播生成新的，别复用）
3. 推流软件填地址 → 点"开始推流"，观察 30 秒不掉线再正式开播
4. VPS 上确认：curl -s http://127.0.0.1:9997/v3/paths/list | grep ready
   → 应为 "ready": true，且 tracks 含 H264 + MPEG-4 Audio
5. 自己用 4G 网络（别用 WiFi）进观看页验一次，确认秒开不卡再通知观众
6. 开播中每 5 分钟扫一眼 docker stats：mediamtx CPU < 50%、内存 < 300MB 就正常
7. 下播：先停推流 → 等 10 秒 → 平台点"结束直播"（录像才完整）
```

---

## 五、P2：播放侧（低延迟 + 不中断）

### 5.1 WebRTC WHEP（延迟 8s → 亚秒，值得做）

现状：**WebRTC 其实没真正可用** —— 容器只映射了 TCP 8889，缺 UDP 8189（`webrtcLocalUDPAddress: :8189`），ICE 没有 UDP 候选。且 HTTPS 页面不能直接连 `ws://:8889`（混合内容）。

改法：
```yaml
# docker-compose.yml mediamtx.ports 增加
- "8189:8189/udp"     # WebRTC 媒体（必须）
```
```nginx
# nginx.conf 443 server 内增加
location /whep/ {
    proxy_pass http://mediamtx:8889/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 3600s;     # WS 长连接，别用 60s
    proxy_buffering off;
}
```
播放策略：**优先 WebRTC，失败自动降级 HLS**（WebRTC 需要灰云域名/直连 IP，橙云下不可用）。

### 5.2 断线自动恢复（现在会永久卡在"等待主播"）

`HlsPlayer.tsx` 目前 fatal 后只 `startLoad()`，网络长时间异常时状态会停在 `waiting` 不动。补三点：
1. 连续 N 次 fatal → **重建 hls 实例**（指数退避 1s/2s/4s，上限 30s）
2. `error` 次数超限 → 提示"网络不稳定，点击重试"按钮，而不是死等
3. 页面 `visibilitychange` 回到前台时，若 `video.currentTime` 落后直播边缘 >10s → 强制 `seek` 追到边缘

### 5.3 兜底降级（弱网观众）

hls.js 开 `capLevelToPlayerSize: false` + 多码率 ABR 需要服务端转码多档（吃 CPU）。**2 GB VPS 不建议做 ABR**，改为：主播统一推 720p/2 Mbps，弱网观众靠播放器缓冲扛。

---

## 六、P3：什么时候该换/加钱（决策表）

| 场景 | 建议 |
|---|---|
| 上行 ≥ 30 Mbps、CPU ≥ 2 核 | 继续自建，本方案 P0+P1 就够 |
| 上行 10–30 Mbps | 自建 + 码率压到 1200 kbps（720p/30），观众 ≤ 10 人 |
| 上行 < 10 Mbps 或观众常 > 10 人 | **接云直播 CDN**（见下） |
| 观众分布全国、跨运营商 | 云直播 CDN（BGP 接入质量远好于单台 VPS） |

### 推荐：接云直播（腾讯云 CSS / 阿里云直播）

架构变成：
```
主播 --SRT/RTMP--> 云直播中心（转码+录制+截图） --CDN--> 观众（就近边缘节点）
VPS 只跑业务（Next.js + DB），不再承担媒体转发
```

- **优点**：开播秒开、几乎不卡、延迟 2–4s（LL-HLS）/ 1s（WebRTC）、支持多码率自适应、并发无上限
- **成本**：流量费 ≈ 0.2–0.3 元/GB。一场 1 小时 20 个观众 ≈ 18 GB ≈ **4–5 元**
- **改造量**：`src/server/mediamtx.ts` 换成云 SDK 生成推流/播放地址（约 1 天），前端播放器不用大改
- 云直播自带录制、截图审核、禁播回调，比现在自建录像更稳

> 若坚持自建：升级到 **2 核 4 G + ≥30 Mbps 上行** 的国内 BGP 机器（腾讯云轻量/阿里云轻量，约 60–100 元/月），并把 MediaMTX 单独部署、与业务容器分离。

---

## 七、落地顺序

```
第 1 步（今天，30 分钟）
  ├─ Cloudflare 改灰云（或直播子域灰云）
  ├─ mediamtx.yml: hlsAlwaysRemux=true / segment 1s / readTimeout 20s / record=false
  ├─ docker compose up -d --force-recreate mediamtx
  └─ 手机 4G 实测一次：记录"首帧时间 / 是否中断"

第 2 步（本周）
  ├─ 推流参数统一（720p/2Mbps/GOP 2s），Larix 加 1s 网络缓冲
  ├─ 试 SRT 推流（8890/udp），对比 RTMP 卡顿次数
  ├─ 播放器缓冲调厚 + 断线自动重建
  └─ WebRTC 上 UDP 8189 + nginx /whep/ 反代（低延迟）

第 3 步（观众上量后）
  └─ 按第六节决策表：升级 VPS 或接云直播 CDN
```

**验收标准**：4G 网络下首帧 < 2s、连续观看 10 分钟中断 0 次、端到端延迟 < 5s（HLS）/ < 1s（WebRTC）。

---

## 八、VPS 实测数据解读（2026-09-13 yabs）

```
CPU      : QEMU Virtual CPU version 2.5+ ，2 核 @ 2.0 GHz   ← 老虚拟 CPU，单核偏弱
RAM/Swap : 1.9 GiB / 2.0 GiB       磁盘 19.6 GiB
VM       : KVM        Debian 13      IPv6 无
ISP      : GTT Americas（美国 Tier1）  ASN AS154107 DigitalLink Global Network
Location : 香港（IP 库标注）
```

**结论：配置"小"不是主要问题，线路才是。**

- **CPU/内存够用**：MediaMTX 是纯转发不转码，一路 720p 直播约 5–10% CPU、100–300 MB 内存。
  但 1.9 GB 内存跑 MySQL8 + Next.js + MediaMTX + nginx 已经很紧（靠 2 G swap 撑，用到 swap 就整体变慢）。
  ⚠️ **绝对不能开转码 / ABR 多档**，一开就满。
- **磁盘是定时炸弹**：19.6 GB 且 `record: true` 每场落盘 fmp4，几场直播就能写满，写满后整个平台 500。
  → `record: false` 是必改项，不是优化项。
- **线路是致命项**：IP 库标香港，但上游是 GTT Americas（美国 transit），ASN 是小型 IDC。
  这类组合常见于"IP 归属香港、实际路由绕美"。国内观众访问大概率 200–400 ms + 丢包，
  **HLS 分片跨国一跳一跳地拉，就是"看几秒就断"的物理原因**。
  → 这一条靠改配置救不回来，只能换线路或接 CDN。

### 必测两项（决定走哪条路）

```bash
# ① 上行带宽（决定能带几个观众）
apt install -y speedtest-cli && speedtest-cli --simple
# 或用 Ookla 官方客户端，手动选香港/新加坡节点测 upload

# ② 国内到这台机器的延迟与丢包（决定线路是否可用）
#    用 https://ping.chinaz.com 或 https://www.17ce.com 输入 VPS 公网 IP，
#    看电信/联通/移动三网的 延迟 与 丢包率
```

**判据：**

| 国内三网延迟 | 丢包 | 结论 |
|---|---|---|
| < 80 ms | < 1% | 线路可用，做 P0 优化即可 |
| 80–150 ms | 1–3% | 勉强：必须 SRT 推流 + 码率降到 1 Mbps |
| > 150 ms 或 | > 3% | **换线路或接 CDN**，配置怎么调都救不回来 |

### 三条路对比

| 方案 | 成本 | 效果 | 备注 |
|---|---|---|---|
| **A 留在这台 + P0 优化** | 0 | 解决"一直加载"，**解决不了国内卡顿** | 适合只服务香港/海外观众 |
| **B 换机器** | 腾讯云香港轻量 2核4G **30 Mbps** ≈ 292 元/年；国内轻量 2核4G 6 Mbps ≈ 528 元/3年 | 香港节点国内延迟 30–80 ms、上行 30 Mbps 可带 10–15 个 2 Mbps 观众 | ⚠️ 换**国内**机器域名必须 ICP 备案，否则 80/443 被封；香港/境外免备案 |
| **C 接云直播 CDN**（推荐） | 流量 ≈ 0.25–0.35 元/GB；1 小时 20 观众 ≈ 18 GB ≈ **5 元/场** | 主播就近接入、观众边缘节点拉流，延迟 2–4s（快直播 <1s），并发无上限 | VPS 只跑业务；国内 CDN 加速域名同样需备案，境外节点免备案 |

**推荐：先测②。** 若国内延迟/丢包落在第三档（大概率），走 **B（换香港轻量 30 Mbps）** 起步；
观众上量后接 **C（云直播 CDN）**，那时 VPS 只留业务，媒体全交给 CDN。

> 无论走哪条路，第三节 P0（灰云 / `hlsAlwaysRemux` / 关录制 / 短分片）都是必做项，先做了再测，
> 否则测出来的卡顿混着软件问题，判断会失真。

---

## 九、各设备推流软件推荐与操作指南

### 9.0 通用：先拿地址，再填软件

进入 **直播间页面 → 我的直播间**，`room.status` 未结束时页面会给出三项（可直接点复制）：

| 项 | 值（示例） |
|---|---|
| 服务器 | `rtmp://amen.dpdns.org:8080/live` |
| 串流密钥 | `a1b2c3d4...`（每场直播独立生成，勿复用） |
| 完整地址 | `rtmp://amen.dpdns.org:8080/live/a1b2c3d4...` |

两种填法都行：
- **拆分填**：服务器填"服务器"那行，密钥填"串流密钥"那行（OBS、Larix 推荐）
- **整条填**：把"完整地址"整条粘进 URL 栏，密钥留空（Moblin、部分手机 App 推荐）

> ⚠️ **端口是 8080 不是 1935**。且 RTMP/SRT 是裸 TCP/UDP，**不能被 Cloudflare 代理** ——
> 直播域名必须灰云（或直接用 VPS 公网 IP 当服务器地址），否则推流软件永远连不上。

### 9.1 统一编码参数（所有软件照抄）

| 项 | 推荐值 | 弱网降级 |
|---|---|---|
| 分辨率 | 1280×720（横屏）/ 720×1280（竖屏） | 640×360 |
| 帧率 | 30 fps（**不要 60**，码率翻倍且手机发热） | 24–30 |
| 视频码率 | 2000 Kbps **CBR** | 800–1200 Kbps |
| 关键帧间隔 | **2 秒**（= 帧率×2，30fps 填 60 帧） | 2 秒 |
| H.264 Profile | Main（Baseline 也行） | Main |
| 编码预设 | veryfast | veryfast |
| 音频 | AAC 128 Kbps / 44.1 kHz | 96 Kbps |

**绝不用** 1080p60、MP3 音频、VBR 动态码率。

---

### 9.2 iPhone / iPad

| 软件 | 费用 | 水印 | 登录 | 协议 | 说明 |
|---|---|---|---|---|---|
| **Moblin**（推荐） | 完全免费（开源 MIT） | 无 | 不需要 | RTMP/RTMPS/**SRT** | 功能全开无内购，弱网可走 SRT |
| Larix Broadcaster | 基础免费 | **有**（去水印需订阅） | 不需要 | RTMP/RTMPS/SRT | 老牌稳定，界面直观 |
| OctoStream | 免费 | 无 | 不需要 | RTMP | 轻量，功能少 |

**Moblin 操作步骤：**
1. 装 App → 允许相机/麦克风权限
2. 新建连接（Connections → Add）→ 类型选 **RTMP**（弱网改选 SRT）
3. RTMP：URL 填 `rtmp://amen.dpdns.org:8080/live`，Stream key 填 `<streamKey>`
   SRT：URL 填 `srt://amen.dpdns.org:8890?streamid=publish:live/<streamKey>&latency=1000000`
4. 设置 → Video：Resolution `1280x720`、FPS `30`、Bitrate `2000 kbps`、Keyframe interval `2s`
5. 设置 → Audio：AAC、128 kbps
6. 回到主界面点 **Start** → 观察右上角码率/丢包指示，稳定 30 秒再正式开讲

> 菜单名随版本略有差异，认准 Resolution / Bitrate / Keyframe / Audio codec 四项即可。

---

### 9.3 Android

| 软件 | 费用 | 水印 | 登录 | 协议 |
|---|---|---|---|---|
| **Larix Broadcaster**（推荐） | 免费 | 无 | 不需要 | RTMP/RTMPS/SRT |
| Streamlabs | 免费 | 有品牌元素 | **需登录** | RTMP |
| Prism Live Studio | 免费（含广告） | 有 | 可选 | RTMP |

**Larix 操作步骤：**
1. 装 App → 授权相机/麦克风
2. Settings → Connections → New connection → 填 URL 与 Stream name/key（同 9.0）
3. Settings → Video：1280×720 / 30fps / 2000 kbps，**Keyframe interval = 2**
4. Settings → Audio：AAC 128 kbps，采样率 44100
5. Settings → Advanced：**Network buffer（网络缓冲）调到 1000–2000 ms** ← 弱网救命设置
6. 主界面点录像键开始推流

---

### 9.4 Windows / macOS（电脑推流、课件分享、多机位）

| 软件 | 费用 | 说明 |
|---|---|---|
| **OBS Studio**（推荐） | 免费开源 | 全场最稳，支持场景切换/窗口捕获/字幕 |
| Streamlabs Desktop | 免费 | 需登录，界面更"直播感"，占用略高 |
| vMix / Wirecast | 付费 | 专业导播，非必要不上 |

**OBS 配置（一次性设置，之后每次只改串流密钥）：**

1. **设置 → 推流**
   - 服务：`自定义`
   - 服务器：`rtmp://amen.dpdns.org:8080/live`
   - 串流密钥：`<streamKey>`
2. **设置 → 输出 → 输出模式：高级**
   - 编码器：`x264`
   - 速率控制：`CBR`
   - 比特率：`2000 Kbps`
   - 关键帧间隔：`2` 秒
   - CPU 使用预设：`veryfast`
   - 配置（Profile）：`main`
   - 勾选"强制关键帧间隔"若存在
3. **设置 → 视频**
   - 输出（缩放）分辨率：`1280x720`
   - 帧率：`30`
4. **设置 → 音频**：采样率 `44.1 kHz`，音轨 1 比特率 `128`
5. **设置 → 高级 → 网络**：不要勾"低延迟模式"（会更敏感于抖动）
6. 来源里加「视频捕获设备」/「窗口捕获」/「图像」→ 点 **开始推流**

> 若要用 SRT（弱网/跨运营商）：服务器填
> `srt://amen.dpdns.org:8890?streamid=publish:live/<streamKey>&latency=1000000`，密钥留空。

---

### 9.5 命令行 / 无人值守（ffmpeg）

定时任务、循环播放预先录好的视频、或做自动化压测时用它。

```bash
# 推一个视频文件（循环）
ffmpeg -re -stream_loop -1 -i input.mp4 \
  -c:v libx264 -preset veryfast -b:v 2000k -maxrate 2000k -bufsize 4000k \
  -g 60 -keyint_min 60 -pix_fmt yuv420p -profile:v main \
  -c:a aac -b:a 128k -ar 44100 \
  -f flv "rtmp://amen.dpdns.org:8080/live/<streamKey>"

# SRT 版本（弱网优先）
ffmpeg -re -i input.mp4 -c:v libx264 -preset veryfast -b:v 2000k -g 60 \
  -c:a aac -b:a 128k -f mpegts \
  "srt://amen.dpdns.org:8890?streamid=publish:live/<streamKey>&latency=1000000"

# Windows 摄像头 + 麦克风
ffmpeg -f dshow -i video="Integrated Camera":audio="Microphone Array" \
  -c:v libx264 -preset veryfast -b:v 2000k -g 60 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -f flv "rtmp://amen.dpdns.org:8080/live/<streamKey>"

# macOS 摄像头 + 麦克风
ffmpeg -f avfoundation -i "0:0" -c:v libx264 -preset veryfast -b:v 2000k -g 60 \
  -pix_fmt yuv420p -c:a aac -b:a 128k -f flv "rtmp://amen.dpdns.org:8080/live/<streamKey>"
```

`-g 60` = 每 60 帧一个关键帧（30fps → 2 秒），**必须和服务器分片时长对齐，否则首帧慢**。

---

### 9.6 网页端开播（可选后续，免装 App）

MediaMTX 支持 **WHIP**（WebRTC 推流），浏览器打开页面授权摄像头即可开播，延迟 <1 秒，
最适合"临时分享/老年同工"场景 —— 不用教他装软件。

前提（当前未开通）：
- compose 补 `- "8189:8189/udp"`（见 5.1）
- nginx 反代 `/whip/` 到 `mediamtx:8889`（与 `/whep/` 同样写法）
- 前端用 `RTCPeerConnection` + WHIP 信令，约 100 行代码

---

### 9.7 推流故障对照表

| 现象 | 原因 | 处理 |
|---|---|---|
| 软件报"连接失败/超时" | ① 端口 8080 未放行 ② 域名走 Cloudflare 橙云（CF 不代理 RTMP） | 放行 8080；直播域名改灰云或直接填 VPS IP |
| 连上立刻断开 | streamKey 错 / 直播间未审核通过 | 复制新 key；确认直播间状态非"审核中/已结束" |
| 推流软件显示正常，网页无画面 | ① HLS 地址缺 `?cookieCheck=1` ② `hlsAlwaysRemux=false` 冷启动 | 查 `/v3/paths/list` 是否 ready:true；按 3.2 改配置 |
| 有画面没声音 | 音频编码不是 AAC（手机默认可能是 Opus/MP3） | 音频编码器改 AAC，采样率 44.1/48k |
| 画面卡住声音正常 | 码率超过上行带宽 | 降到 1200 Kbps；或改 SRT |
| 频繁断流重连 | `readTimeout` 太短 + 弱网 | `readTimeout: 20s`；改 SRT；加大网络缓冲 |
| 声音画面不同步 | 时间戳问题 / 码率抖动 | 用 CBR 固定码率，重启推流 |

**验证一条命令（VPS 上）：**
```bash
curl -s http://127.0.0.1:9997/v3/paths/list | python3 -m json.tool
# 看到 "ready": true 且 tracks 含 H264 + MPEG-4 Audio 即推流成功
```
