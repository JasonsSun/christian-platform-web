import { NextRequest } from 'next/server';
import { ok, withApi, HttpError } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { listFolders, createFolder } from '@/server/favoriteFolders';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/v1/me/favorite-folders           分类列表（含计数）
 * POST /api/v1/me/favorite-folders { name, color }  新建分类
 */

export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  return ok(await listFolders(user.id));
});

export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const body = await req.json().catch(() => ({} as any));
  const name = typeof body?.name === 'string' ? body.name : '';
  if (!name.trim()) throw new HttpError(422, 'VALIDATION_FAILED', '请填写分类名');
  const folder = await createFolder(user.id, name, typeof body?.color === 'string' ? body.color : 'primary');
  const meta = await listFolders(user.id);
  return ok({ folder, folders: meta.folders, unfiled: meta.unfiled, total: meta.total }, 201);
});
