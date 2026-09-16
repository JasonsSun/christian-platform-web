import { withApi, ok } from '@/server/http';
import { requireUser } from '@/server/auth';
import { one, q } from '@/server/db';
import { ensureOAuthTable } from '@/server/oauth';

export const dynamic = 'force-dynamic';

/** 当前账号已绑定的第三方登录方式。 */
export const GET = withApi(async (req: Request) => {
  await ensureOAuthTable();
  const user = await requireUser(req);
  const rows = await q<{ provider: string; provider_email: string | null; display_name: string | null; created_at: number }>(
    `SELECT provider, provider_email, display_name, created_at FROM user_oauth WHERE user_id=? ORDER BY created_at`,
    [user.id]
  );
  return ok({ linked: rows });
});
