import { NextRequest } from 'next/server';
import { exec, one, ts } from '@/server/db';
import { ok, withApi, notFound, conflict, HttpError } from '@/server/http';
import { requireUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const targetId = ctx.params.id;
  if (targetId === user.id) throw new HttpError(400, 'BAD_REQUEST', '不能关注自己');
  const target = await one<any>(`SELECT id FROM users WHERE id = ?`, [targetId]);
  if (!target) throw notFound('用户不存在');

  // 同样用 INSERT IGNORE 消除 check-then-act 竞态：follows 有复合主键，
  // 并发重复关注会撞主键、被 withApi 兜成 500。affectedRows=0 即代表原本已关注。
  const res = await exec(`INSERT IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?,?,?)`,
    [user.id, targetId, ts()]);
  if (Number(res?.affectedRows || 0) === 0) throw conflict('已关注该用户');
  const count = await one<any>(`SELECT COUNT(*) AS c FROM follows WHERE followee_id = ?`, [targetId]);
  return ok({ following: true, followers: Number(count?.c || 0) });
});

export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const targetId = ctx.params.id;
  await exec(`DELETE FROM follows WHERE follower_id = ? AND followee_id = ?`, [user.id, targetId]);
  const count = await one<any>(`SELECT COUNT(*) AS c FROM follows WHERE followee_id = ?`, [targetId]);
  return ok({ following: false, followers: Number(count?.c || 0) });
});
