import { NextRequest } from 'next/server';
import { ok, readJson, withApi, HttpError, num } from '@/server/http';
import { currentUser } from '@/server/auth';
import { requireModeratorModule } from '@/server/moderation';
import { createSermon, listSermons } from '@/server/sermons';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const viewer = (await currentUser(req)) as { id: string; role: string } | null;
  const includeDrafts =
    !!viewer && (viewer.role === 'admin' || viewer.role === 'moderator') && sp.get('includeDrafts') === '1';
  const r = await listSermons(
    {
      seriesId: sp.get('seriesId') || undefined,
      speaker: sp.get('speaker') || undefined,
      q: sp.get('q') || undefined,
      sort: (sp.get('sort') as any) || 'new',
      page: num(sp.get('page'), 1),
      pageSize: num(sp.get('pageSize'), 12),
      includeDrafts,
    },
    viewer?.id
  );
  return ok(r);
});

export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireModeratorModule(req, 'media')) as { id: string };
  const body = await readJson(req);
  const created = await createSermon({
    seriesId: body.seriesId ?? null,
    title: body.title,
    speaker: body.speaker,
    scripture: body.scripture,
    preachedAt: body.preachedAt ?? null,
    description: body.description,
    notes: body.notes,
    mediaType: body.mediaType,
    mediaUrl: body.mediaUrl,
    durationSec: body.durationSec,
    cover: body.cover,
    status: body.status,
  });
  const res = ok(created);
  res.headers.set('Cache-Control', 'no-store');
  return res;
});
