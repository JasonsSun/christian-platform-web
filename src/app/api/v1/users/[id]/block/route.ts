import { NextRequest } from 'next/server';
import { exec, one, ts, newId } from '@/server/db';
import { ok, withApi, notFound, conflict, HttpError } from '@/server/http';
import { requireUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** 屏蔽某个用户：POST 屏蔽 / DELETE 取消屏蔽 */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const targetId = ctx.params.id;
  if (targetId === user.id) throw new HttpError(400, 'BAD_REQUEST', '不能屏蔽自己');
  const target = await one<any>(`SELECT id FROM users WHERE id = ?`, [targetId]);
  if (!target) throw notFound('用户不存在');

  const exist = await one<any>(
    `SELECT 1 AS x FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`,
    [user.id, targetId]
  );
  if (exist) throw conflict('已屏蔽该用户');

  await exec(
    `INSERT INTO user_blocks (id, blocker_id, blocked_id, created_at) VALUES (?,?,?,?)`,
    [newId('ub'), user.id, targetId, ts()]
  );
  // 互相关注时屏蔽，顺手取消关注（避免信息仍从对方流入）
  await exec(`DELETE FROM follows WHERE follower_id = ? AND followee_id = ?`, [user.id, targetId]);
  const count = await one<any>(`SELECT COUNT(*) AS c FROM user_blocks WHERE blocker_id = ?`, [user.id]);
  return ok({ blocked: true, blockedCount: Number(count?.c || 0) });
});

export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const targetId = ctx.params.id;
  await exec(`DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`, [user.id, targetId]);
  const count = await one<any>(`SELECT COUNT(*) AS c FROM user_blocks WHERE blocker_id = ?`, [user.id]);
  return ok({ blocked: false, blockedCount: Number(count?.c || 0) });
});
