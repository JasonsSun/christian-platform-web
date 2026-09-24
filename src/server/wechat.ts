import crypto from 'node:crypto';
import { one, exec, ts } from './db';
import { HttpError } from './http';

/* ==================== 微信账号绑定 ====================
 *
 * 为什么必须有这一步:
 *   扫「网站二维码」只能打开网页,微信不会因此获得给该用户推消息的权限。
 *   真正可用的是微信网页授权(snsapi_base,静默、用户无感):扫码 -> 微信带上
 *   code 回跳 -> 服务端用 code 换 openid,再靠 state 里的一次性 scene 把
 *   openid 和本站账号对齐。对齐之后才谈得上推送。
 *
 * 未配置 WECHAT_APPID 时进入「演示模式」:返回本站 /wechat/bind?scene=xxx
 * 链接,可用页面上的模拟扫码按钮走通同一条回调链路。
 */

const BIND_TTL_MS = 10 * 60 * 1000;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '').replace(/\/$/, '');
}

export function wechatEnabled(): boolean {
  return !!(process.env.WECHAT_APPID && process.env.WECHAT_APPSECRET);
}

const rand = (n: number) => crypto.randomBytes(n).toString('hex');

/** 生成一次性绑定令牌 */
export async function createBindToken(userId: string) {
  // 同一用户只保留一个有效令牌,避免码堆砌
  await exec(`UPDATE wechat_bind_tokens SET status='expired' WHERE user_id=? AND status='pending'`, [userId]);

  const token = `wbt_${rand(16)}`;
  const scene = `bind_${rand(8)}`;
  const expires = new Date(Date.now() + BIND_TTL_MS);
  await exec(
    `INSERT INTO wechat_bind_tokens (token, user_id, scene, status, openid, expires_at, created_at)
     VALUES (?,?,?,'pending','',?,?)`,
    [token, userId, scene, ts(expires), ts()]
  );

  return {
    token,
    scene,
    expiresAt: expires.toISOString(),
    /** 二维码里编码的内容 */
    qrContent: buildBindUrl(scene),
    mode: wechatEnabled() ? ('oauth' as const) : ('demo' as const),
  };
}

/** 二维码内容:微信网页授权地址(state 携带一次性 scene) */
export function buildBindUrl(scene: string): string {
  const appid = process.env.WECHAT_APPID;
  const base = siteUrl();
  if (appid && base) {
    const redirect = encodeURIComponent(`${base}/api/v1/wechat/callback`);
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appid}` +
      `&redirect_uri=${redirect}&response_type=code&scope=snsapi_base&state=${scene}#wechat_redirect`;
  }
  // 演示模式:指向本站模拟扫码页
  return `${base || ''}/wechat/bind?scene=${scene}`;
}

/** 用 code 换 openid(snsapi_base) */
export async function openidFromCode(code: string): Promise<string> {
  const appid = process.env.WECHAT_APPID;
  const secret = process.env.WECHAT_APPSECRET;
  if (!appid || !secret) throw new HttpError(400, 'WECHAT_NOT_CONFIGURED', '未配置微信凭证');
  const url = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const res = await fetch(url, { cache: 'no-store' });
  const json: any = await res.json().catch(() => ({}));
  if (!json?.openid) {
    throw new HttpError(400, 'WECHAT_CODE_INVALID', `换取 openid 失败：${json?.errcode || 'unknown'}`);
  }
  return String(json.openid);
}

/**
 * 回调核心:openid + scene -> 绑定。
 * 幂等:同一 openid 重复回调不会报错;已被他人占用的 openid 直接 409。
 */
export async function bindByScene(scene: string, openid: string): Promise<{ userId: string; displayName: string }> {
  if (!scene || !openid) throw new HttpError(400, 'BAD_REQUEST', '缺少 scene 或 openid');

  const row = await one<any>(
    // 库里存的是 UTC(由 ts() 写入),必须按 UTC 读回再比较,否则会被当成本地时间而误判过期
    `SELECT token, user_id, status, DATE_FORMAT(expires_at,'%Y-%m-%dT%H:%i:%sZ') AS expires_at
     FROM wechat_bind_tokens WHERE scene=?`, [scene]
  );
  if (!row) throw new HttpError(404, 'TOKEN_NOT_FOUND', '绑定令牌不存在');
  if (row.status === 'bound') {
    const u = await one<any>(`SELECT display_name FROM users WHERE id=?`, [row.user_id]);
    return { userId: row.user_id, displayName: u?.display_name || '' };
  }
  if (row.status !== 'pending') throw new HttpError(400, 'TOKEN_INVALID', '绑定令牌已失效');
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await exec(`UPDATE wechat_bind_tokens SET status='expired' WHERE token=?`, [row.token]);
    throw new HttpError(400, 'TOKEN_EXPIRED', '二维码已过期，请重新获取');
  }

  // 一个微信只能绑一个账号
  const taken = await one<any>(`SELECT id, display_name FROM users WHERE wechat_openid=? AND id<>?`, [openid, row.user_id]);
  if (taken) throw new HttpError(409, 'OPENID_ALREADY_BOUND', '该微信已绑定其他账号');

  await exec(
    `UPDATE users SET wechat_openid=?, wechat_bound_at=? WHERE id=?`,
    [openid, ts(), row.user_id]
  );
  await exec(
    `UPDATE wechat_bind_tokens SET status='bound', openid=?, bound_at=? WHERE token=?`,
    [openid, ts(), row.token]
  );

  const u = await one<any>(`SELECT display_name FROM users WHERE id=?`, [row.user_id]);
  return { userId: row.user_id, displayName: u?.display_name || '' };
}

export async function unbind(userId: string) {
  await exec(
    `UPDATE users SET wechat_openid=NULL, wechat_unionid='', wechat_nickname='', wechat_bound_at=NULL WHERE id=?`,
    [userId]
  );
  await exec(`UPDATE wechat_bind_tokens SET status='expired' WHERE user_id=? AND status='pending'`, [userId]);
}

export async function bindState(userId: string) {
  const u = await one<any>(
    `SELECT wechat_openid, wechat_nickname, DATE_FORMAT(wechat_bound_at,'%Y-%m-%dT%H:%i:%sZ') AS bound_at
     FROM users WHERE id=?`, [userId]
  );
  const pending = await one<any>(
    `SELECT token, scene, DATE_FORMAT(expires_at,'%Y-%m-%dT%H:%i:%sZ') AS expires_at, status
     FROM wechat_bind_tokens WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const openid = u?.wechat_openid || '';
  return {
    bound: !!openid,
    /** 只回传前后各 3 位,不在接口里暴露完整 openid */
    openidMasked: openid ? `${openid.slice(0, 3)}***${openid.slice(-3)}` : '',
    nickname: u?.wechat_nickname || '',
    boundAt: u?.bound_at || null,
    wechatEnabled: wechatEnabled(),
    pending: pending
      ? { token: pending.token, scene: pending.scene, expiresAt: pending.expires_at }
      : null,
  };
}

/** 公众号服务器配置校验(GET 回调) */
export function verifySignature(query: Record<string, string>): boolean {
  const token = process.env.WECHAT_TOKEN || '';
  if (!token) return false;
  const { signature = '', timestamp = '', nonce = '' } = query;
  const str = [token, timestamp, nonce].sort().join('');
  return crypto.createHash('sha1').update(str).digest('hex') === signature;
}

/** 极简 XML 取值(微信事件推送是 XML,不为此引入依赖) */
export function xmlPick(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? (m[1] ?? m[2] ?? '').trim() : '';
}
