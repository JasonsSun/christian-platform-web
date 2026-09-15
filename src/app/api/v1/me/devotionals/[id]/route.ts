import { NextRequest } from 'next/server';
import { ok, withApi, readJson } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { getDevotional, updateDevotional, deleteDevotional } from '@/server/devotionals';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/devotionals/:id —— 单篇（仅本人） */
export const GET = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = (await requireUser(req)) as UserRow;
  const item = await getDevotional(user.id, ctx.params.id);
  if (!item) return ok(null);
  const r = ok(item);
  r.headers.set('Cache-Control', 'no-store');
  return r;
});

/** PATCH /api/v1/me/devotionals/:id  body:{title?,body?,ref?,mood?} —— 部分更新 */
export const PATCH = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = (await requireUser(req)) as UserRow;
  const body = await readJson<{ title?: string; body?: string; ref?: string; mood?: string }>(req);
  const updated = await updateDevotional(user.id, ctx.params.id, body);
  return ok(updated);
});

/** DELETE /api/v1/me/devotionals/:id */
export const DELETE = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = (await requireUser(req)) as UserRow;
  const deleted = await deleteDevotional(user.id, ctx.params.id);
  return ok({ deleted });
});
