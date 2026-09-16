import { NextRequest } from 'next/server';
import { ok, readJson, withApi, HttpError, notFound } from '@/server/http';
import { currentUser } from '@/server/auth';
import { requireModeratorModule } from '@/server/moderation';
import { bumpSermonView, deleteSermon, getSermon, updateSermon } from '@/server/sermons';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const id = ctx.params.id;
  const viewer = (await currentUser(req)) as { id: string; role: string } | null;
  const s = await getSermon(id, viewer?.id);
  // 草稿仅媒体模块审核员/管理员可见；匿名或其他会员视为不存在
  if (!s) throw notFound('该讲道不存在');
  const isStaff = !!viewer && (viewer.role === 'admin' || viewer.role === 'moderator');
  if (s.status === 'draft' && !isStaff) throw notFound('该讲道不存在');
  await bumpSermonView(id);
  const refreshed = await getSermon(id, viewer?.id);
  const res = ok(refreshed);
  res.headers.set('Cache-Control', 'no-store');
  return res;
});

export const PATCH = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  await requireModeratorModule(req, 'media');
  const body = await readJson(req);
  const updated = await updateSermon(ctx.params.id, {
    seriesId: body.seriesId,
    title: body.title,
    speaker: body.speaker,
    scripture: body.scripture,
    preachedAt: body.preachedAt,
    description: body.description,
    notes: body.notes,
    mediaType: body.mediaType,
    mediaUrl: body.mediaUrl,
    durationSec: body.durationSec,
    cover: body.cover,
    status: body.status,
  });
  const res = ok(updated);
  res.headers.set('Cache-Control', 'no-store');
  return res;
});

export const DELETE = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  await requireModeratorModule(req, 'media');
  const okDel = await deleteSermon(ctx.params.id);
  if (!okDel) throw notFound('该讲道不存在');
  const res = ok({ ok: true });
  res.headers.set('Cache-Control', 'no-store');
  return res;
});
