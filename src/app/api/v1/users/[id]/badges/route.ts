import { NextRequest } from 'next/server';
import { one } from '@/server/db';
import { ok, withApi, notFound } from '@/server/http';
import { earnedBadges } from '@/server/badges';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: { id: string } };

/** 他人的成就徽章墙（只返回已获得的）。支持 id 或 username。 */
export const GET = withApi(async (_req: NextRequest, ctx: Ctx) => {
  const key = ctx.params.id;
  const row = await one<{ id: string }>(`SELECT id FROM users WHERE id = ? OR username = ?`, [key, key]);
  if (!row) throw notFound('用户不存在');
  const badges = await earnedBadges(String(row.id));
  return ok({ userId: String(row.id), total: badges.length, badges });
});
