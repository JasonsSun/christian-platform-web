import { NextRequest, NextResponse } from 'next/server';
import { getProviderConfig, handleOAuthCallback } from '@/server/oauth';
import { publicUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

function html(body: string): NextResponse {
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><title>第三方登录</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f7fb;color:#333}
.card{text-align:center;padding:24px 32px;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
.spin{width:28px;height:28px;border:3px solid #4f6df5;border-top-color:transparent;border-radius:50%;animation:r 1s linear infinite;margin:0 auto 12px}
@keyframes r{to{transform:rotate(360deg)}}</style></head>
<body><div class="card"><div class="spin"></div><div id="msg">正在完成登录…</div></div>
<script>${body}</script></body></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function fail(msg: string): Response {
  const body = `window.addEventListener('DOMContentLoaded',function(){var w=window.opener;if(w){w.postMessage({type:'oauth_error',message:${JSON.stringify(msg)}},location.origin);}document.getElementById('msg').textContent=${JSON.stringify(msg)};setTimeout(function(){if(w)window.close();},2500);});`;
  return html(body);
}

/** OAuth 回跳：换令牌 -> 签发本站令牌 -> 通过 postMessage 交给打开窗口并关闭。 */
export const GET = async (req: NextRequest) => {
  try {
    const provider = req.nextUrl.searchParams.get('provider') || '';
    const code = req.nextUrl.searchParams.get('code') || '';
    const state = req.nextUrl.searchParams.get('state') || '';
    if (!code) return fail('缺少授权码');

    const cfg = getProviderConfig(provider);
    if (!cfg) return fail('未配置的第三方登录方式');

    const cookieState = req.cookies.get('oauth_state')?.value;
    if (!cookieState || cookieState !== state) return fail('状态校验失败，请重试');

    const result = await handleOAuthCallback(cfg, code, req);
    const payload = {
      type: 'oauth_success',
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: publicUser(result.user),
      isNew: result.isNew,
    };
    const body = `window.addEventListener('DOMContentLoaded',function(){var w=window.opener;if(w){w.postMessage(${JSON.stringify(payload)},location.origin);}document.getElementById('msg').textContent='登录成功，正在跳转…';setTimeout(function(){if(w)window.close();},800);});`;
    const res = html(body);
    res.cookies.set('oauth_state', '', { path: '/', maxAge: 0 });
    return res;
  } catch (e: any) {
    return fail(e?.message || '第三方登录失败');
  }
};
