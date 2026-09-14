import { NextRequest } from 'next/server';
import { one, tx } from '@/server/db';
import { ok, withApi, HttpError, clientIp } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

/**
 * 删除一条代祷。
 *
 * 权限：作者本人，或管理员。
 * 仅管理员可删除他人代祷——用于及时清除违规违法内容（含涉政、涉黄、
 * 广告、骚扰等），是平台内容治理的必要手段。审核员（moderator）只有审核权限，
 * 不赋予任何删除权，故不可删他人代祷。
 *
 * 删除为硬删除。关联的「阿们」记录在事务内显式清理，不依赖外键级联是否已迁移到位。
 */
export const DELETE = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const viewer = (await requireUser(req)) as UserRow;
  const id = ctx.params.id;

  const row = await one<any>(
    `SELECT id, user_id, body FROM prayers WHERE id = ?`,
    [id]
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', '该代祷不存在或已被删除');

  const isAdmin = viewer.role === 'admin';
  if (row.user_id !== viewer.id && !isAdmin) {
    throw new HttpError(403, 'FORBIDDEN', '只能删除自己发布的代祷');
  }

  await tx(async (c) => {
    await c.query(`DELETE FROM prayer_amens WHERE prayer_id = ?`, [id]);
    await c.query(`DELETE FROM prayers WHERE id = ?`, [id]);
  });

  // 管理侧删他人代祷记审计，便于追溯与申诉；作者自删（含管理员删自己）不记
  if (isAdmin && row.user_id !== viewer.id) {
    const excerpt = String(row.body || '').slice(0, 60);
    await audit(
      viewer.id,
      'PRAYER_DELETE',
      'prayer',
      id,
      `删除 ${row.user_id} 的代祷：「${excerpt}」`,
      clientIp(req)
    );
  }

  return ok({ ok: true });
});
