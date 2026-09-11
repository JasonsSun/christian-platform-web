import { NextRequest } from 'next/server';
import { exec, one, ts, newId } from '@/server/db';
import { ok, withApi, notFound } from '@/server/http';
import { requireUser } from '@/server/auth';
import { dispatchOutbox, emit } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const id = ctx.params.id;
  const content = await one<any>(`SELECT id, status FROM contents WHERE id = ?`, [id]);
  if (!content) throw notFound('内容不存在');

  const exist = await one<any>(`SELECT 1 AS x FROM content_likes WHERE content_id = ? AND user_id = ?`, [id, user.id]);
  if (exist) {
    await exec(`DELETE FROM content_likes WHERE content_id = ? AND user_id = ?`, [id, user.id]);
    await exec(`UPDATE contents SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?`, [id]);
  } else {
    await exec(`INSERT INTO content_likes (content_id, user_id, created_at) VALUES (?,?,?)`, [id, user.id, ts()]);
    await exec(`UPDATE contents SET like_count = like_count + 1 WHERE id = ?`, [id]);
    await emit('content.liked', { contentId: id, actorId: user.id, actorName: user.display_name });
    await dispatchOutbox();
  }

  const row = await one<any>(`SELECT like_count FROM contents WHERE id = ?`, [id]);
  return ok({ liked: !exist, likeCount: Number(row?.like_count || 0) });
});
