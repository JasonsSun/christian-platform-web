import { NextRequest } from 'next/server';
import { ok, withApi } from '@/server/http';
import { requireUser } from '@/server/auth';
import { likeSermon, unlikeSermon } from '@/server/sermons';

export const dynamic = 'force-dynamic';

export const POST = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = (await requireUser(req)) as { id: string };
  await likeSermon(ctx.params.id, user.id);
  const res = ok({ ok: true });
  res.headers.set('Cache-Control', 'no-store');
  return res;
});

export const DELETE = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = (await requireUser(req)) as { id: string };
  await unlikeSermon(ctx.params.id, user.id);
  const res = ok({ ok: true });
  res.headers.set('Cache-Control', 'no-store');
  return res;
});
