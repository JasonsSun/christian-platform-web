/**
 * MediaMTX 媒体服务器客户端 (v1.21 REST API 前缀为 /v3)
 *
 * 职责:
 *  - 直播开始时,注册一条 path(source=publisher);
 *  - 直播结束时,删除该 path;
 *  - 探测某路流是否真正有主播在推(publisher 已连接)。
 *
 * 鉴权模型(见 bin/mediamtx/mediamtx.yml):
 *  - 媒体流(RTMP 推流 / HLS 拉流)对匿名开放,与各推流客户端(OBS/ffmpeg/手机)完全兼容。
 *    安全由「随机不可猜的 streamKey」隔离:他人无法猜到具体直播间路径;
 *    且平台应用层已限制谁能创建/开播直播间、谁能看到推流地址。
 *  - 控制 API 需要 live 用户凭证(服务端 Basic Auth),凭证不面向最终用户暴露。
 *
 * 网页播放:浏览器直连 HLS(:8888),MediaMTX 自带 CORS 支持;
 *           HLS 首次请求会 302 做 cookie 校验,浏览器/xhr 自动跟随即可(无需带凭证)。
 */

const API = process.env.MEDIAMTX_API || 'http://127.0.0.1:9997';
const HLS_PORT = process.env.MEDIAMTX_HLS_PORT || '8888';
const RTMP_PORT = process.env.MEDIAMTX_RTMP_PORT || '1935';
const PUBLIC_HOST = process.env.MEDIAMTX_PUBLIC_HOST || 'localhost';

/** 平台控制用户(仅用于服务端调用 REST API) */
const MEDIAMTX_USER = process.env.MEDIAMTX_USER || 'live';
const MEDIAMTX_PASS = process.env.MEDIAMTX_PASS || 'syq_live_2026';

/** 供服务端调用 REST API 使用的 Basic Auth 头 */
export const MEDIAMTX_AUTH =
  'Basic ' + Buffer.from(`${MEDIAMTX_USER}:${MEDIAMTX_PASS}`).toString('base64');

/** RTMP 推流地址 / 串流密钥(OBS/手机用,匿名推流)。
 *  OBS 用法: 服务器=rtmp://<host>:1935 ,串流密钥=<streamKey> */
export function rtmpPushUrl(streamKey: string): string {
  return `rtmp://${PUBLIC_HOST}:${RTMP_PORT}/${streamKey}`;
}

/** 网页 HLS 播放地址(浏览器直连,匿名可读,MediaMTX 自带 CORS) */
export function hlsPlayUrl(streamKey: string): string {
  return `http://${PUBLIC_HOST}:${HLS_PORT}/${streamKey}/index.m3u8`;
}

/** WebRTC 播放地址(低延迟,可选) */
export function webrtcPlayUrl(streamKey: string): string {
  return `ws://${PUBLIC_HOST}:8889/${streamKey}/ws`;
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

/** 注册一条直播路径(接受推流)。安全由随机不可猜的 streamKey 保证。 */
export async function registerPath(streamKey: string): Promise<boolean> {
  const r = await api('POST', `/v3/config/paths/add/${encodeURIComponent(streamKey)}`, {
    source: 'publisher',
  });
  return r.ok || r.status === 200;
}

/** 移除一条直播路径 */
export async function removePath(streamKey: string): Promise<boolean> {
  const r = await api('DELETE', `/v3/config/paths/delete/${encodeURIComponent(streamKey)}`);
  return r.ok || r.status === 200 || r.status === 404;
}

/** 该路径是否有主播在推流(publisher 已连接) */
export async function isPathLive(streamKey: string): Promise<boolean> {
  const r = await api('GET', `/v3/paths/get/${encodeURIComponent(streamKey)}`);
  if (!r.ok || !r.data || typeof r.data !== 'object') return false;
  const d = r.data as any;
  return d.ready === true || d.online === true;
}

/**
 * 批量取所有路径的在线状态(一次 HTTP,替代列表页对每个房间各查一次)。
 * 返回 Map<pathName, 是否在线>。
 */
export async function listPathsLive(): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const r = await api('GET', '/v3/paths/list');
  if (!r.ok || !r.data || typeof r.data !== 'object') return out;
  const items: any[] = Array.isArray(r.data.items) ? r.data.items : [];
  for (const it of items) {
    if (!it || typeof it.name !== 'string') continue;
    out.set(it.name, it.ready === true || it.online === true);
  }
  return out;
}

/** 媒体服务器是否在线 */
export async function mediaServerOnline(): Promise<boolean> {
  const r = await api('GET', '/v3/paths/list');
  return r.ok;
}
