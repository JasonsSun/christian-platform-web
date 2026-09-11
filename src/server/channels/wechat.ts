/* 通道:微信服务号模板消息 / 小程序订阅通知
 *
 * 关键事实(务必记住):
 * - 模板消息(服务号):用户需已关注,且有 7 天内互动或已授权;否则下发失败。
 * - 订阅通知(小程序):一次授权只能推一条,做不了「日常随时提醒」。
 * 因此本通道只用于少数高价值节点:投稿过审、活动开始前 1 天、直播开播。
 */

const API = 'https://api.weixin.qq.com';

export function wechatConfigured(): boolean {
  return !!(process.env.WECHAT_APPID && process.env.WECHAT_APPSECRET);
}

/** template=服务号模板消息(默认) | subscribe=小程序订阅通知 */
function msgApi(): 'template' | 'subscribe' {
  return process.env.WECHAT_MSG_API === 'subscribe' ? 'subscribe' : 'template';
}

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const appid = process.env.WECHAT_APPID;
  const secret = process.env.WECHAT_APPSECRET;
  if (!appid || !secret) throw new Error('wechat_not_configured');

  const url = `${API}/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
  const res = await fetch(url, { cache: 'no-store' });
  const json: any = await res.json().catch(() => ({}));
  if (!json?.access_token) {
    throw new Error(`wechat_token_failed:${json?.errcode || 'unknown'}:${json?.errmsg || ''}`);
  }
  tokenCache = {
    token: String(json.access_token),
    expiresAt: Date.now() + Number(json.expires_in || 7200) * 1000,
  };
  return tokenCache.token;
}

/** 按通知类型取模板 ID:WECHAT_TPL_CONTENT_APPROVED 等,回退到 WECHAT_TEMPLATE_ID */
function templateIdOf(kind: string): string {
  const key = `WECHAT_TPL_${String(kind || '').toUpperCase()}`;
  return process.env[key] || process.env.WECHAT_TEMPLATE_ID || '';
}

const clip = (s: string, n: number) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * 下发一条通知到微信。
 * @param openid   接收者在该公众号/小程序下的 openid
 * @param kind     通知类型,用于选择模板
 * @param title    标题
 * @param body     正文
 * @param link     点击跳转链接(需在公众号后台配置业务域名)
 */
export async function sendWechatTemplate(
  openid: string,
  kind: string,
  title: string,
  body: string,
  link = ''
): Promise<void> {
  if (!wechatConfigured()) throw new Error('wechat_not_configured');
  if (!openid) throw new Error('empty_openid');
  const templateId = templateIdOf(kind);
  if (!templateId) throw new Error('wechat_template_not_configured');

  const data = {
    first: { value: clip(title, 20) },
    keyword1: { value: clip(body, 20) || clip(title, 20) },
    keyword2: { value: new Date().toLocaleString('zh-CN', { hour12: false }) },
    remark: { value: '点击查看详情' },
  };

  let token = await getAccessToken();
  let payload: any;
  let path: string;
  if (msgApi() === 'subscribe') {
    path = '/cgi-bin/message/subscribe/bizsend';
    payload = { touser: openid, template_id: templateId, page: link ? `pages/webview/index?url=${encodeURIComponent(link)}` : '', data };
  } else {
    path = '/cgi-bin/message/template/send';
    payload = { touser: openid, template_id: templateId, url: link || '', data };
  }

  // access_token 失效时重试一次
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(`${API}${path}?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const json: any = await res.json().catch(() => ({}));
    if (json?.errcode === 0) return;
    const invalidToken = json?.errcode === 40001 || json?.errcode === 42001 || json?.errcode === 40014;
    if (invalidToken && attempt === 0) {
      token = await getAccessToken(true);
      continue;
    }
    throw new Error(`wechat_send_failed:${json?.errcode || 'unknown'}:${json?.errmsg || ''}`);
  }
  throw new Error('wechat_send_failed:retry_exhausted');
}
