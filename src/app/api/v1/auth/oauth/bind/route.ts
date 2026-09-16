import { NextRequest } from 'next/server';
import { withApi, ok, HttpError } from '@/server/http';
import { requireUser } from '@/server/auth';
import { exec } from '@/server/db';
import { ensureOAuthTable } from '@/server/oauth';

export const dynamic = 'force-dynamic';

/** 解绑某个第三方登录方式（需已登录）。 */
export const DELETE = withApi(async (req: NextRequest) => {
  await ensureOAuthTable();
  const user = await requireUser(req);
  const provider = req.nextUrl.searchParams.get('provider') || '';
  if (!provider) throw new HttpError(400, 'BAD_REQUEST', '缺少 provider');

  await exec(`DELETE FROM user_oauth WHERE user_id=? AND provider=?`, [user.id, provider]);
  return ok({ unlinked: provider });
});
