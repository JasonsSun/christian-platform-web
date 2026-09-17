import { NextRequest } from 'next/server';
import { ok, withApi, HttpError } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { listFollowed, followTopic } from '@/server/topicFollows';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/v1/me/topics            我关注的话题（带实时内容数）
 * POST /api/v1/me/topics { tag }    关注话题（幂等）
 */

export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const items = await listFollowed(user.id);
  return ok({ items, total: items.length });
});

export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const body = await req.json().catch(() => ({} as any));
  const tag = typeof body?.tag === 'string' ? body.tag : '';
  if (!tag.trim()) throw new HttpError(422, 'VALIDATION_FAILED', '请传入话题名');
  const res = await followTopic(user.id, tag);
  const items = await listFollowed(user.id);
  return ok({ ...res, items, total: items.length }, res.created ? 201 : 200);
});
