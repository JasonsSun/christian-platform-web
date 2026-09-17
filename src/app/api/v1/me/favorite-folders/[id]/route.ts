import { NextRequest } from 'next/server';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { listFolders, updateFolder, deleteFolder } from '@/server/favoriteFolders';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * PATCH  /api/v1/me/favorite-folders/{id} { name?, color?, sortOrder? }
 * DELETE /api/v1/me/favorite-folders/{id}  删除分类（其中收藏退回未分类，不删除收藏本身）
 */

export const PATCH = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireUser(req)) as UserRow;
  const body = await req.json().catch(() => ({} as any));
  await updateFolder(user.id, ctx.params.id, {
    name: typeof body?.name === 'string' ? body.name : undefined,
    color: typeof body?.color === 'string' ? body.color : undefined,
    sortOrder: body?.sortOrder === undefined ? undefined : Number(body.sortOrder),
  });
  return ok(await listFolders(user.id));
});

export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireUser(req)) as UserRow;
  await deleteFolder(user.id, ctx.params.id);
  return ok(await listFolders(user.id));
});
