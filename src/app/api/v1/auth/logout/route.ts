import { NextRequest } from 'next/server';
import { ok, readJson, withApi, clientIp } from '@/server/http';
import { currentUser, revokeSession } from '@/server/auth';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

export const POST = withApi(async (req: NextRequest) => {
  const body = await readJson<{ refreshToken?: string }>(req).catch(() => ({} as any));
  const user = await currentUser(req);
  await revokeSession(body.refreshToken || null);
  if (user) await audit(user.id, 'LOGOUT', 'user', user.id, '退出登录', clientIp(req));
  return ok({ message: '已退出登录' });
});
