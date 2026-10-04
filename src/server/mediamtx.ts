/**
 * MediaMTX 媒体服务器客户端 (v1.21 REST API 前缀为 /v3)
 *
 * 职责:
 *  - 直播开始时,注册一条 path(source=publisher);
 *  - 直播结束时,删除该 path;
 *  - 探测某路流是否真正有主播在推(publisher 已连接)。
 *
 * 鉴权模型:
 *  - 媒体流(RTMP 推流 / HLS 拉流)匿名开放,兼容 OBS/手机推流 App。
 *    安全由「随机不可猜的 streamKey」隔离。
 *  - 控制 API 需服务端调用(内网),凭证不面向最终用户暴露。
 */

const API = process.env.MEDIAMTX_API || 'http://127.0.0.1:9997';
const HLS_PORT = process.env.MEDIAMTX_HLS_PORT || '8888';
const RTMP_PORT = process.env.MEDIAMTX_RTMP_PORT || '1935';
const PUBLIC_HOST = process.env.MEDIAMTX_PUBLIC_HOST || 'localhost';
/**
 * HLS 播放专用域名，默认回退 PUBLIC_HOST。
 * 拆分域名部署时才需要：推流域名必须「灰云 DNS only」（RTMP 不走 CDN），
 * 而播放域名可以走「橙云 Proxied」拿 Cloudflare 的公共可信证书。
 * 两个域名不同就必须显式设 MEDIAMTX_HLS_HOST，否则播放会落到灰云域名的自签/源站证书上，
 * 浏览器和 VLC 都不信任 → 黑屏。
 */
const HLS_HOST = process.env.MEDIAMTX_HLS_HOST || PUBLIC_HOST;
// 网页 HLS 播放：生产走 nginx HTTPS 反代（/hls/<path>/index.m3u8），避免 HTTP 混入被 CDN 拦；
// 本地开发无 nginx 时直连 MediaMTX 的 :8888。
const HLS_VIA_PROXY = process.env.MEDIAMTX_HLS_VIA_PROXY !== 'false';

/**
 * RTMP app 段。
 * 多数推流软件(OBS)允许「服务器 + 串流密钥」两栏填写、app 段可为空；
 * 但 Larix 等手机 App 强制 URL 形如 rtmp://host:1935/<app>/<stream>，不接受裸路径。
 * 统一约定 app='live' 后，MediaMTX 内部 path 即为 'live/<streamKey>'，两种客户端都能推。
 */
const RTMP_APP = process.env.MEDIAMTX_RTMP_APP || 'live';

/** 平台控制用户(仅用于服务端调用 REST API) */
const MEDIAMTX_USER = process.env.MEDIAMTX_USER || 'admin';
const MEDIAMTX_PASS = process.env.MEDIAMTX_PASS || 'admin';

/** 供服务端调用 REST API 使用的 Basic Auth 头 */
export const MEDIAMTX_AUTH =
  'Basic ' + Buffer.from(`${MEDIAMTX_USER}:${MEDIAMTX_PASS}`).toString('base64');

/** 平台 streamKey → MediaMTX 内部 path */
export function mediaPath(streamKey: string): string {
  return `${RTMP_APP}/${streamKey}`;
}

/** MediaMTX path → 平台 streamKey(剥掉 app 前缀) */
export function streamKeyFromPath(path: string): string {
  return path.startsWith(`${RTMP_APP}/`) ? path.slice(RTMP_APP.length + 1) : path;
}

/** 推流软件填的「服务器」地址(含 app 段)。OBS: 服务器填此项,串流密钥填 streamKey。 */
export function rtmpServerUrl(): string {
  return `rtmp://${PUBLIC_HOST}:${RTMP_PORT}/${RTMP_APP}`;
}

/** 完整推流地址:服务器栏填这个时,串流密钥留空(部分手机 App 只接受完整 URL) */
export function rtmpPushUrl(streamKey: string): string {
  return `${rtmpServerUrl()}/${streamKey}`;
}

/**
 * 录像落盘根目录。必须与 liveRecord.ts 的 RECORD_DIR 完全一致,
 * 否则平台在 recordings 里找不到 MediaMTX 写出的文件(页面永远卡在「录像生成中」)。
 */
export function recordBaseDir(): string {
  const env = process.env.RECORD_DIR;
  if (env) return env.replace(/[/\\]+$/, '');
  return './recordings';
}

/**
 * 网页 HLS 播放地址。生产经 nginx HTTPS 反代(/hls/...)，本地开发直连 MediaMTX :8888。
 *
 * 关键坑(必须带 cookieCheck=1)：
 * MediaMTX(v1.21) 首次请求 index.m3u8 时会先返回 302,Location 为「相对路径」
 * (/live/<key>/index.m3u8?cookieCheck=1) 用来探测浏览器是否支持 Partitioned Cookie。
 * nginx 不会改写相对 Location,浏览器会跳到 https://域名/live/... —— 该前缀是平台
 * 直播页路由而非 HLS,直接 404,hls.js 永久停在「等待推流」。
 * 带上 cookieCheck=1 可跳过这次探测重定向;MediaMTX 会改用 URL 查询串(?_session=xxx)
 * 下发会话密钥,同样能正常鉴权拉流。
 */
export function hlsPlayUrl(streamKey: string): string {
  const p = mediaPath(streamKey);
  if (HLS_VIA_PROXY) return `https://${HLS_HOST}/hls/${p}/index.m3u8?cookieCheck=1`;
  return `http://${HLS_HOST}:${HLS_PORT}/${p}/index.m3u8?cookieCheck=1`;
}

/** WebRTC 播放地址(低延迟,可选) */
export function webrtcPlayUrl(streamKey: string): string {
  return `ws://${PUBLIC_HOST}:8889/${mediaPath(streamKey)}/ws`;
}

async function api(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: MEDIAMTX_AUTH,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    // 媒体服务器不可达:软失败,不影响主应用
    return { ok: false, status: 0, data: String(e) };
  }
}

/** 注册一条直播路径(接受推流)。安全由随机不可猜的 streamKey 保证。
 *
 *  record: 主播勾了「保存录像」时必须显式带上 record:true + recordPath。
 *  平台的直播路径是这里动态 add 出来的,不依赖 mediamtx.yml 的 pathDefaults
 *  (那份配置里 record 默认 false),不显式传就等于「勾了也不录」。
 *  路径模板刻意避开 %path:动态加的路径名含 RTMP_APP 前缀,不同版本展开行为不一致,
 *  用固定的 live 段 + streamKey 目录,和 liveRecord.ts 的查找逻辑严格对齐。 */
export async function registerPath(streamKey: string, opts: { record?: boolean } = {}): Promise<boolean> {
  const body: Record<string, unknown> = { source: 'publisher' };
  if (opts.record) {
    body.record = true;
    // 整场直播落一个文件:recordSegmentDuration 调大到 24h,
    // 否则超过 1h 的直播会被切成多段,回放只剩最后一小时。
    body.recordPath = `${recordBaseDir()}/live/${streamKey}/%Y-%m-%d_%H-%M-%S-%f`;
    body.recordFormat = 'fmp4';
    body.recordSegmentDuration = '24h';
    body.recordDeleteAfter = '168h'; // 3 天，配合 finalizeLiveRecording 的 24h 待审窗口兜底
  }
  const r = await api('POST', `/v3/config/paths/add/${encodeURIComponent(mediaPath(streamKey))}`, body);
  if (!r.ok && opts.record) {
    // 首次 add 可能因路径已存在而失败,退化成「更新该路径」
    const u = await api('PATCH', `/v3/config/paths/patch/${encodeURIComponent(mediaPath(streamKey))}`, body);
    return u.ok || u.status === 200;
  }
  return r.ok || r.status === 200;
}

/** 移除一条直播路径 */
export async function removePath(streamKey: string): Promise<boolean> {
  const r = await api('DELETE', `/v3/config/paths/delete/${encodeURIComponent(mediaPath(streamKey))}`);
  return r.ok || r.status === 200 || r.status === 404;
}

/** 该路径是否有主播在推流(publisher 已连接)。
 *  注意:path 含 app 段(如 live/xxx)时,MediaMTX 单条查询 API 对斜杠支持不可靠,
 *  故统一走 /v3/paths/list 批量接口(该接口已验证可用)。 */
export async function isPathLive(streamKey: string): Promise<boolean> {
  const all = await listPathsLive();
  return all.get(streamKey) === true || all.get(mediaPath(streamKey)) === true;
}

/**
 * 批量取所有路径的在线状态(一次 HTTP,替代列表页对每个房间各查一次)。
 * 返回 Map:key 同时支持「MediaMTX 原始 path」与「平台 streamKey」两种查法,便于兼容。
 */
export async function listPathsLive(): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const r = await api('GET', '/v3/paths/list');
  if (!r.ok || !r.data || typeof r.data !== 'object') return out;
  const items: any[] = Array.isArray(r.data.items) ? r.data.items : [];
  for (const it of items) {
    if (!it || typeof it.name !== 'string') continue;
    const live = it.ready === true || it.online === true;
    out.set(it.name, live);                    // 形如 live/5c33aa27f6b39a5b10
    out.set(streamKeyFromPath(it.name), live); // 形如 5c33aa27f6b39a5b10
  }
  return out;
}

/** 媒体服务器是否在线 */
export async function mediaServerOnline(): Promise<boolean> {
  const r = await api('GET', '/v3/paths/list');
  return r.ok;
}
