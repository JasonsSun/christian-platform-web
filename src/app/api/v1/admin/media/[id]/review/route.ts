import { NextRequest } from 'next/server';
import { exec, one, ts } from '@/server/db';
import { ok, withApi, readJson, notFound, HttpError, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit, notify } from '@/server/services';
import { recomputeProfile, penalizeRejectedMedia, getQuota } from '@/server/quota';
import { requireModeratorModule } from '@/server/moderation';
import { purgeLiveRecording } from '@/server/liveRecord';
import { formatDuration } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** 媒体审核:通过 / 驳回 */
export const POST = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const staff = (await requireModeratorModule(req, 'media')) as UserRow;
  const body = await readJson<{ action?: 'approve' | 'reject'; reason?: string }>(req);
  const action = body.action;
  if (action !== 'approve' && action !== 'reject') throw new HttpError(422, 'VALIDATION_FAILED', 'action 必须为 approve 或 reject');

  const m = await one<any>(`SELECT id, owner_id, file_name, title, source, source_ref FROM media_files WHERE id = ?`, [ctx.params.id]);
  if (!m) throw notFound('文件不存在');

  const reviewStatus = action === 'approve' ? 'approved' : 'rejected';
  await exec(
    `UPDATE media_files SET review_status=?, review_reason=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?`,
    [reviewStatus, body.reason || '', staff.id, ts(), ts(), m.id]
  );
  await audit(staff.id, action === 'approve' ? 'MEDIA_APPROVE' : 'MEDIA_REJECT', 'media', m.id,
    `${action === 'approve' ? '通过' : '驳回'}:${m.file_name}${body.reason ? ' - ' + body.reason : ''}`, clientIp(req));

  // 直播录像被驳回:物理删除录像文件 + 软删记录,任何人(主播本人也)不可再回看。
  // 需求原话是「直接清理掉直播的视频」,所以这里真删文件而不只是打标记。
  let purgedLive = false;
  if (action === 'reject' && m.source === 'live') {
    purgedLive = await purgeLiveRecording(m.id).catch(() => false);
  }

  if (m.owner_id) {
    // 审核结果回流到成长画像:通过提升信任分(可解锁更长/更大上传),驳回则扣分
    if (action === 'reject') await penalizeRejectedMedia(m.owner_id);
    const after = await recomputeProfile(m.owner_id).catch(() => null);
    if (after) {
      const quota = await getQuota(m.owner_id).catch(() => null);
      // 原来写的是 Math.round(秒/60) + 「分钟」：30 秒的策略会被说成「1 分钟」，取不到配额就说「0 分钟」
      const limitText = quota ? ` · 视频最长 ${formatDuration(quota.policy.maxVideoSeconds)}` : '';
      await notify(m.owner_id, 'quota_changed', '你的上传额度已更新',
        `当前等级「${after.levelName}」· 信任分 ${after.trustScore}${limitText}`, '/upload');
    }
    await notify(m.owner_id, action === 'approve' ? 'media_approved' : 'media_rejected',
      action === 'approve' ? '媒体已通过审核' : '媒体未通过审核',
      action === 'approve'
        ? `「${m.title || m.file_name}」已通过审核`
        : `「${m.title || m.file_name}」未通过审核：${body.reason || '不符合社区规范'}${purgedLive ? '，该直播回放已被清理，无法再观看' : ''}`,
      // 直播回放被清理后回直播间页(那里会显示「回放已被驳回」),其余回个人中心
      purgedLive ? `/live/${m.source_ref || ''}` : (action === 'approve' ? '/media' : '/me?tab=uploads'));
  }
  return ok({ id: m.id, reviewStatus, updated: true, purgedLive });
});
