# amen.dpdns.org 接入 Cloudflare CDN（当前状态：已托管，只差开代理）

## 现状诊断（2026-09-14 实测）

```
NS:  aitana.ns.cloudflare.com / paul.ns.cloudflare.com   ← 已经在 Cloudflare
A:   69.33.211.6                                        ← 源站真实 IP，说明记录是「仅 DNS(灰云)」
```

**域名早就托管在 Cloudflare 上了，但 A 记录没开代理，访客一直在直连香港源站**。所以之前所有的慢（TTFB 1–16s、丢包、白屏）都不是 CDN 的问题——根本没走 CDN。

同一时间的对比：

| 目标 | TCP | TLS 握手 |
|---|---|---|
| Cloudflare 边缘 | 175 – 200 ms | 350 – 400 ms |
| 源站 69.33.211.6 | 3277 ms | 超时 |

开橙云后，握手从 3s+ 掉到 0.4s 左右。

---

## 〇、先破除一个误解：直播 ≠ 必须整站灰云

**只有「主播推流地址」需要灰云。网页、API、观众看直播，全都可以橙云。**

| 环节 | 协议 / 端口 | 能否走橙云 |
|---|---|---|
| 网页、API、图片、静态资源 | HTTPS 443 | ✅ 橙云（这正是要加速的部分） |
| 观众看直播 | HTTPS 443 `/hls/<path>/index.m3u8`（nginx 反代 MediaMTX:8888） | ✅ 橙云，且默认不被缓存、不会串播 |
| **主播推流** | RTMP 裸 TCP :8080 | ❌ **必须灰云**（CF 只认 HTTP/WS，RTMP 握手直接被拒） |

结论：**留一个灰云主机名只影响"主播在 OBS 里填的那一行"，观众体验完全不受影响**，而且那行地址填一次就固定了。

### 为什么没有「一个全橙云域名也能推流」的办法？

| 思路 | 结论 |
|---|---|
| RTMP 走 CF 支持的 HTTP 端口（8080/8443/2053…） | ❌ 端口能转发，但 CF 只接受 HTTP 报文，RTMP 握手会被当非法请求丢掉 |
| 改 SRT / WebRTC / WHIP 推流 | ❌ 都是 UDP，CF 免费代理不转发 UDP |
| Cloudflare Spectrum（任意 TCP 代理） | ⚠️ 要 Enterprise 套餐，成本远超这台 VPS |
| cloudflared tunnel 暴露 TCP | ⚠️ 主播电脑必须装 cloudflared，不适合外部主播 |

所以**留一个灰云主机名是唯一零成本可行解**。

---

## 一、打开代理（核心一步，1 分钟）

Cloudflare → **DNS → 记录**：

| 类型 | 名称 | 内容 | 改成 |
|---|---|---|---|
| A | `amen` | 69.33.211.6 | **已代理（橙云）** |
| CNAME | `www` | amen.dpdns.org | **已代理（橙云）** |

点那朵灰云，变橙色即可。等 1–2 分钟，`nslookup amen.dpdns.org 223.5.5.5` 应该不再返回 69.33.211.6，而是 CF 的 IP（104.x / 172.x / 188.x 段）。

## 二、配套必做的 4 件事（不做会出事）

### 1. SSL/TLS 模式

SSL/TLS → 概述 → 选 **`Full (strict)`**。
源站 nginx 用的就是 CF Origin 证书（`deploy/certs/fullchain.pem`），strict 模式校验得通过。

### 2. 给推流单独建一个「灰云」子域

在 CF DNS 里加：

| 类型 | 名称 | 内容 | 代理状态 | 用途 |
|---|---|---|---|---|
| A | `push` | 69.33.211.6 | **仅 DNS（灰云）** | 主播 OBS / 手机 App 推流 |
| A | `up` | 69.33.211.6 | **仅 DNS（灰云）** | 大文件投稿（CF 免费版单请求上限 100MB） |

然后在服务器 `.env` 里设置并重启 —— **两行都要设**，只设第一行会让观众播放地址也落到灰云域名上，证书不匹配 → 黑屏：

```bash
MEDIAMTX_PUBLIC_HOST=push.amen.dpdns.org   # 推流：灰云
MEDIAMTX_HLS_HOST=amen.dpdns.org           # 播放：橙云主域
cd /opt/christian-platform && docker compose up -d web
```

> 嫌多记一个域名，也可以让主播直接填 `rtmp://69.33.211.6:8080/live`
> （`MEDIAMTX_PUBLIC_HOST=69.33.211.6`）。代价是换服务器时所有主播都要改一次地址。

验证：进直播间页面 →「我的直播间」，看到的**推流服务器**应显示 `rtmp://push.amen.dpdns.org:8080/live`，
**播放地址**应显示 `https://amen.dpdns.org/hls/live/<key>/index.m3u8?cookieCheck=1`。

### 3. 缓存规则（CF → 缓存 → Cache Rules）

CF 默认不缓存 HTML，只缓存静态资源。建 2 条规则：

**① 公开页面 HTML 缓存 60s**

表达式：

```
http.host eq "amen.dpdns.org"
and not http.request.uri.path contains "/api/"
and not http.request.uri.path contains "/admin"
and not http.request.uri.path contains "/me"
and not http.request.uri.path contains "/messages"
and http.request.headers["accept"][0] contains "text/html"
```

设置：缓存资格 = **符合缓存条件**；边缘 TTL = **忽略源站 cache-control，60 秒**。

> 源站 nginx 已经同步给公开页面发了 `Cache-Control: public, s-maxage=60`（`deploy/nginx.conf`），
> 若 CF 仍不缓存 HTML，就靠这条规则兜底。
> 页面 HTML 不含个性化内容（登录 token 在 localStorage），缓存安全。

**② 直播不缓存**

表达式：`http.request.uri.path contains "/hls/"` → 缓存资格 = **绕过缓存**。

> 直播分片 URL 会滚动复用，任何一层缓存都会让观众看到几十秒前的内容。
> （实际上 `.m3u8` / `.ts` 不在 CF 默认缓存扩展名里，这条规则是双保险。）

### 4. 其他开关（速度 / 网络）

- Brotli：**开**
- Early Hints：**开**
- 0-RTT：**开**
- HTTP/3：先开，实测卡就关（国内 UDP 有时被限速）
- Rocket Loader / Auto Minify：**关**（Next 产物已压缩，容易出 JS 问题）
- WebSocket：**开**（直播聊天/通知要用）

---

## 三、代码侧已经改好的（重新部署即生效）

- `deploy/nginx.conf`：
  - 加了 `real_ip_header CF-Connecting-IP` + CF 全部 IP 段 —— 否则应用看到的全是 CF 节点 IP，
    注册/登录的 IP 限流（5 次/10 分钟）会把所有访客当同一个人互相连坐。
  - 公开页面发 `Cache-Control: public, s-maxage=60`；`/api/`、`/admin`、`/me`、`/messages`、
    `/login` 等走 `no-store`；`/hls/` 保持 `no-store`（直播实时性）。
- `src/server/http.ts`：`clientIp()` 支持 `CF-Connecting-IP`，需显式 `TRUST_CDN_HEADER=1` 才启用
  （默认关闭，防止伪造头绕过限流；推荐用上面的 nginx real_ip 方案）。
- `src/server/mediamtx.ts` + `docker-compose.yml`：推流主机（`MEDIAMTX_PUBLIC_HOST`）与
  播放主机（`MEDIAMTX_HLS_HOST`）已拆成两个变量，支持「推流灰云 / 播放橙云」混跑。

部署：

```bash
cd /opt/christian-platform && git pull && docker compose up -d --build web && docker compose restart nginx
```

## 四、验收

```bash
curl -I https://amen.dpdns.org/
# server: cloudflare        ← 已走 CDN
# cf-cache-status: HIT      ← 第二次起命中缓存
# cache-control: public, s-maxage=60

curl -s https://amen.dpdns.org/cdn-cgi/trace | grep colo   # 看落到哪个边缘节点
```

再打开 DevTools 看各页面的首字节时间，应该从 1–16s 降到 1s 内。

## 五、回滚

CF 里把记录点回「仅 DNS(灰云)」，解析恢复直连源站，站点照常可用，代码无需改动。

## 六、还想更快

1. **Argo Smart Routing**（约 $5/月 + 流量费）：让 CF 走最优回源路径，通常再省 30%–50%。
2. **换机房**：香港 CN2 GIA / 日本软银 / 国内 BGP（需备案）。现在瓶颈会从「跨境直连」变成
   「CF 边缘 → 香港源站」这一跳，换机房仍然是最彻底的解法。
