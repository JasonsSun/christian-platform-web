import { NextRequest } from 'next/server';
import { ok, readJson, withApi, notFound } from '@/server/http';
import { requireModeratorModule } from '@/server/moderation';
import { deleteSeries, getSeries, updateSeries } from '@/server/sermons';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const s = await getSeries(ctx.params.id);
  if (!s) throw notFound('该系列不存在');
  const res = ok(s);
  res.headers.set('Cache-Control', 'no-store');
  return res;
});

export const PATCH = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  await requireModeratorModule(req, 'media');
  const body = await readJson(req);
  const updated = await updateSeries(ctx.params.id, {
    title: body.title,
    description: body.description,
    cover: body.cover,
    sortOrder: body.sortOrder,
    status: body.status,
  });
  const res = ok(updated);
  res.headers.set('Cache-Control', 'no-store');
  return res;
});

export const DELETE = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  await requireModeratorModule(req, 'media');
  const okDel = await deleteSeries(ctx.params.id);
  if (!okDel) throw notFound('该系列不存在');
  const res = ok({ ok: true });
  res.headers.set('Cache-Control', 'no-store');
  return res;
});
