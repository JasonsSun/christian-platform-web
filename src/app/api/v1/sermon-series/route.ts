import { NextRequest } from 'next/server';
import { ok, readJson, withApi } from '@/server/http';
import { currentUser } from '@/server/auth';
import { requireModeratorModule } from '@/server/moderation';
import { createSeries, listSeries } from '@/server/sermons';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest) => {
  const viewer = (await currentUser(req)) as { id: string; role: string } | null;
  const includeDrafts = !!viewer && (viewer.role === 'admin' || viewer.role === 'moderator');
  const items = await listSeries({ includeDrafts });
  const res = ok({ items });
  res.headers.set('Cache-Control', 'no-store');
  return res;
});

export const POST = withApi(async (req: NextRequest) => {
  await requireModeratorModule(req, 'media');
  const body = await readJson(req);
  const created = await createSeries({
    title: body.title,
    description: body.description,
    cover: body.cover,
    sortOrder: body.sortOrder,
    status: body.status,
  });
  const res = ok(created);
  res.headers.set('Cache-Control', 'no-store');
  return res;
});
