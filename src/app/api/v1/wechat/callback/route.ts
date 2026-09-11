import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { ok, withApi, readText } from '@/server/http';
import { requireUser } from '@/server/auth';
import { bindByScene, openidFromCode, verifySignature, wechatEnabled, xmlPick } from '@/server/wechat';
import { one } from '@/server/db';

export const dynamic = 'force-dynamic';

const home = (req: NextRequest, query: string) =>
  NextResponse.redirect(new URL(`/settings/notifications${query}`, req.url).toString());

/**
 * 微信回调统一入口。三种形态:
 *  1) GET  ?signature&timestamp&nonce&echostr  -> 公众号服务器配置校验,原样回显 echostr
 *  2) GET  ?code&state                          -> 网页授权回跳,用 code 换 openid 后绑定
 *  3) POST XML                                  -> 关注/扫码事件,EventKey 携带 scene
 * 另外:未配置公众号凭证时支持 ?demo=1&scene=xxx 走通同一条绑定链路(演示用)。
 */
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;

  // 1) 服务器配置校验
  if (sp.get('echostr')) {
    const q: Record<string, string> = {
      signature: sp.get('signature') || '',
      timestamp: sp.get('timestamp') || '',
      nonce: sp.get('nonce') || '',
    };
    if (!verifySignature(q)) return new NextResponse('forbidden', { status: 403 });
    return new NextResponse(sp.get('echostr') || '');
  }

  // 2) 演示模式:仅当未配置真实公众号凭证时可用,避免任何人冒名绑定
  if (sp.get('demo') === '1') {
    if (wechatEnabled()) return home(req, '?wechat=error&msg=demo_disabled');
    const scene = sp.get('scene') || '';
    try {
      const user = await requireUser(req);
      const row = await one<any>(`SELECT user_id FROM wechat_bind_tokens WHERE scene=? AND status='pending'`, [scene]);
      if (!row || row.user_id !== user.id) return home(req, '?wechat=error&msg=token_mismatch');
      await bindByScene(scene, `demo_${crypto.randomBytes(8).toString('hex')}`);
      return home(req, '?wechat=bound');
    } catch (e: any) {
      return home(req, `?wechat=error&msg=${encodeURIComponent(e?.code || 'bind_failed')}`);
    }
  }

  // 3) 网页授权回跳
  const code = sp.get('code');
  const state = sp.get('state') || '';
  if (!code) return home(req, '?wechat=error&msg=missing_code');
  try {
    const openid = await openidFromCode(code);
    await bindByScene(state, openid);
    return home(req, '?wechat=bound');
  } catch (e: any) {
    return home(req, `?wechat=error&msg=${encodeURIComponent(e?.code || 'bind_failed')}`);
  }
});

export const POST = withApi(async (req: NextRequest) => {
  const xml = await readText(req);
  const openid = xmlPick(xml, 'FromUserName');
  const event = xmlPick(xml, 'Event');
  if (!openid || !event) return ok({ ignored: true });

  // 关注事件带参二维码 EventKey = qrscene_xxx;已关注用户扫码为 SCAN,EventKey = xxx
  let scene = xmlPick(xml, 'EventKey');
  if (scene.startsWith('qrscene_')) scene = scene.slice('qrscene_'.length);
  if (!scene) return ok({ ignored: true });

  try {
    const r = await bindByScene(scene, openid);
    return ok({ bound: true, userId: r.userId });
  } catch {
    // 微信要求事件回调快速返回,绑定失败记录日志即可,不重试
    return ok({ bound: false });
  }
});
