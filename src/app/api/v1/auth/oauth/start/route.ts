import { NextRequest } from 'next/server';
import { withApi, ok, HttpError } from '@/server/http';
import { currentUser } from '@/server/auth';
import { getProviderConfig, buildAuthorizeUrl } from '@/server/oauth';

export const dynamic = 'force-dynamic';

/**
 * 发起第三方登录：返回授权 URL，并种下一个 httpOnly 的 oauth_state cookie，
 * 供回调时做 CSRF 校验。前端拿到 url 后在新窗口打开即可。
 *
 * 带 bind=1 且当前已登录时，额外种下 oauth_bind=<userId>，
 * 回调据此把第三方身份关联到「当前登录账号」而不是新建账号（设置页绑定场景）。
 */
export const GET = withApi(async (req: NextRequest) => {
  const provider = req.nextUrl.searchParams.get('provider') || '';
  const wantBind = req.nextUrl.searchParams.get('bind') === '1';
  const cfg = getProviderConfig(provider);
  if (!cfg) throw new HttpError(400, 'OAUTH_PROVIDER_UNKNOWN', '未配置的第三方登录方式');

  const me = await currentUser(req);
  if (wantBind && !me) throw new HttpError(401, 'UNAUTHORIZED', '请先登录再绑定第三方账号');

  const state = crypto.randomUUID();
  const url = buildAuthorizeUrl(cfg, state);
  const res = ok({ url });
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  };
  res.cookies.set('oauth_state', state, cookieOpts);
  if (wantBind && me) res.cookies.set('oauth_bind', me.id, cookieOpts);
  return res;
});
