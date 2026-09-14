import { NextRequest } from 'next/server';
import { one, tx } from '@/server/db';
import { ok, withApi, HttpError, clientIp } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { audit } from '@/server/services';
import { isModuleModerator } from '@/server/moderation';

export const dynamic = 'force-dynamic';

/**
 * 删除一条代祷。
 *
 * 权限：作者本人 / 「代祷」模块审核员 / 管理员。
 * 清理他人违规违法内容（涉政、涉黄、广告、骚扰等）是内容治理的必要手段；
 * 该权限下放给代祷模块审核员，避免管理员一个人处理不过来。
 * 普通审核员若未被分配代祷模块，仍然不能删他人代祷。
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

  const isOwner = row.user_id === viewer.id;
  const isAdmin = viewer.role === 'admin';
  // 代祷模块审核员可清理他人违规代祷（管理员仍保留全模块权限）
  const byModule = !isOwner && (await isModuleModerator(viewer, 'prayers'));
  if (!isOwner && !isAdmin && !byModule) {
    throw new HttpError(403, 'FORBIDDEN', '只能删除自己发布的代祷；清理他人代祷需要「代祷」模块审核员或管理员权限');
  }

  await tx(async (c) => {
    await c.query(`DELETE FROM prayer_amens WHERE prayer_id = ?`, [id]);
    await c.query(`DELETE FROM prayers WHERE id = ?`, [id]);
  });

  // 管理侧删他人代祷记审计，便于追溯与申诉；作者自删（含管理员删自己）不记
  if (!isOwner && (isAdmin || byModule)) {
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
