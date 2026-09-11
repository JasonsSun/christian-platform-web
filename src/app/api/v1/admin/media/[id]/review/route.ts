import { NextRequest } from 'next/server';
import { exec, one, ts } from '@/server/db';
import { ok, withApi, readJson, notFound, HttpError, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit, notify } from '@/server/services';
import { recomputeProfile, penalizeRejectedMedia, getQuota } from '@/server/quota';

export const dynamic = 'force-dynamic';

/** 媒体审核:通过 / 驳回 */
export const POST = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const staff = (await requireRole(req, ['admin', 'moderator'])) as UserRow;
  const body = await readJson<{ action?: 'approve' | 'reject'; reason?: string }>(req);
  const action = body.action;
  if (action !== 'approve' && action !== 'reject') throw new HttpError(422, 'VALIDATION_FAILED', 'action 必须为 approve 或 reject');

  const m = await one<any>(`SELECT id, owner_id, file_name, title FROM media_files WHERE id = ?`, [ctx.params.id]);
  if (!m) throw notFound('文件不存在');

  const reviewStatus = action === 'approve' ? 'approved' : 'rejected';
  await exec(
    `UPDATE media_files SET review_status=?, review_reason=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?`,
    [reviewStatus, body.reason || '', staff.id, ts(), ts(), m.id]
  );
  await audit(staff.id, action === 'approve' ? 'MEDIA_APPROVE' : 'MEDIA_REJECT', 'media', m.id,
    `${action === 'approve' ? '通过' : '驳回'}:${m.file_name}${body.reason ? ' - ' + body.reason : ''}`, clientIp(req));
  if (m.owner_id) {
    // 审核结果回流到成长画像:通过提升信任分(可解锁更长/更大上传),驳回则扣分
    if (action === 'reject') await penalizeRejectedMedia(m.owner_id);
    const after = await recomputeProfile(m.owner_id).catch(() => null);
    if (after) {
      await notify(m.owner_id, 'quota_changed', '你的上传额度已更新',
        `当前等级「${after.levelName}」· 信任分 ${after.trustScore}· 视频最长 ${
          Math.round((await getQuota(m.owner_id).catch(() => null))?.policy.maxVideoSeconds || 0) / 60
        } 分钟`, '/upload');
    }
    await notify(m.owner_id, action === 'approve' ? 'media_approved' : 'media_rejected',
      action === 'approve' ? '媒体已通过审核' : '媒体未通过审核',
      `「${m.title || m.file_name}」${action === 'approve' ? '已通过审核' : '未通过' + (body.reason ? ':' + body.reason : '')}`,
      action === 'approve' ? '/media' : '/me?tab=uploads');
  }
  return ok({ id: m.id, reviewStatus, updated: true });
});
