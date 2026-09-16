import { NextRequest } from 'next/server';
import { withApi, ok, HttpError } from '@/server/http';
import { getProviderConfig, buildAuthorizeUrl } from '@/server/oauth';

export const dynamic = 'force-dynamic';

/**
 * 发起第三方登录：返回授权 URL，并种下一个 httpOnly 的 oauth_state cookie，
 * 供回调时做 CSRF 校验。前端拿到 url 后在新窗口打开即可。
 */
export const GET = withApi(async (req: NextRequest) => {
  const provider = req.nextUrl.searchParams.get('provider') || '';
  const cfg = getProviderConfig(provider);
  if (!cfg) throw new HttpError(400, 'OAUTH_PROVIDER_UNKNOWN', '未配置的第三方登录方式');

  const state = crypto.randomUUID();
  const url = buildAuthorizeUrl(cfg, state);
  const res = ok({ url });
  res.cookies.set('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  return res;
});
