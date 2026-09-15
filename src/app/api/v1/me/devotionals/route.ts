import { NextRequest } from 'next/server';
import { ok, withApi, readJson, num } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import {
  listDevotionals,
  createDevotional,
  devotionalStats,
  DEVOTIONAL_MOODS,
} from '@/server/devotionals';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/devotionals?q=&month=YYYY-MM&page=1&pageSize=20
 * 灵修日记列表（仅本人可见）
 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const sp = new URL(req.url).searchParams;
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 100);
  const result = await listDevotionals(user.id, {
    q: sp.get('q') || '',
    month: sp.get('month') || '',
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const r = ok({
    ...result,
    page,
    pageSize,
    stats: await devotionalStats(user.id),
    moods: DEVOTIONAL_MOODS,
  });
  r.headers.set('Cache-Control', 'no-store');
  return r;
});

/** POST /api/v1/me/devotionals  body:{title?,body,ref?,mood?} */
export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const body = await readJson<{ title?: string; body?: string; ref?: string; mood?: string }>(req);
  const created = await createDevotional(user.id, body);
  return ok(created, 201);
});
