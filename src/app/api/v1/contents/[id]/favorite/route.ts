import { NextRequest } from 'next/server';
import { exec, one, newId, ts } from '@/server/db';
import { ok, withApi, notFound } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** POST /api/v1/contents/{id}/favorite -> 切换内容收藏(稍后读) */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireUser(req)) as UserRow;
  const contentId = ctx.params.id;
  const content = await one<any>(`SELECT id, status FROM contents WHERE id = ?`, [contentId]);
  if (!content) throw notFound('内容不存在');
  const existing = await one<any>(
    `SELECT id FROM content_favorites WHERE user_id = ? AND content_id = ?`, [user.id, contentId]
  );
  if (existing) {
    await exec(`DELETE FROM content_favorites WHERE id = ?`, [existing.id]);
    return ok({ favorited: false });
  }
  await exec(
    `INSERT INTO content_favorites (id, user_id, content_id, created_at) VALUES (?,?,?,?)`,
    [newId('fav'), user.id, contentId, ts()]
  );
  return ok({ favorited: true });
});
