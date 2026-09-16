'use client';

/**
 * 确认动作注册表
 *
 * 背景：跳转式确认页 /confirm 原先依赖来源页内存里的回调闭包，
 * 一旦页面刷新或 chunk 版本错配，回调丢失就会提示「操作链接已失效」。
 *
 * 这里把每个可确认操作的「接口调用」抽成声明式动作：
 * 呼叫方只传 `action` 名 + `params`（可 JSON 序列化），
 * 确认页凭 sessionStorage 里的元数据即可重新执行，刷新后依然有效。
 *
 * 新增可确认操作时：在此登记一个 case，并在呼叫方补 action/params 即可。
 * 呼叫方仍可同时传 onConfirm 做乐观更新 / 定制提示，此时优先走 onConfirm。
 */

import { apiDelete, apiPatch, apiPost } from '@/lib/api';

export type ConfirmActionResult = { ok: boolean; message?: string };

type Params = Record<string, unknown>;
const s = (p: Params, k: string): string => String(p[k] ?? '');
const isAdminScope = (p: Params): boolean => p.byStaff === true || p.byStaff === 'true';

export async function runConfirmAction(
  name: string,
  params: Params,
  value: string
): Promise<ConfirmActionResult> {
  switch (name) {
    // ---------- 好友 ----------
    case 'friend.remove':
      await apiDelete(`/friends/${s(params, 'userId')}`);
      return { ok: true, message: '已解除好友关系' };

    // ---------- 内容评论 ----------
    case 'comment.delete':
      await apiDelete(`/contents/${s(params, 'contentId')}/comments/${s(params, 'commentId')}`);
      return { ok: true, message: '评论已删除' };

    // ---------- 代祷墙 ----------
    // 作者本人可删自己的；仅管理员可删任何一条（清理违规违法内容）。审核员无删除权。
    case 'prayer.delete':
      await apiDelete(`/prayers/${s(params, 'prayerId')}`);
      return { ok: true, message: isAdminScope(params) ? '该代祷已被移除' : '代祷已删除' };

    // ---------- 直播 ----------
    case 'live.end':
      await apiPost(`/live/${s(params, 'roomId')}/end`);
      return { ok: true, message: '本场直播已结束' };

    // ---------- 后台 ----------
    case 'admin.user.suspend':
      await apiPatch('/admin/users', { userId: s(params, 'userId'), status: 'suspended' });
      return { ok: true, message: '已封禁该用户' };

    case 'admin.user.delete': {
      const r = await apiDelete<{ groupsTransferred?: number; groupsDissolved?: number }>(
        '/admin/users',
        { userId: s(params, 'userId') },
      );
      const extra: string[] = [];
      if (r?.groupsTransferred) extra.push(`已移交 ${r.groupsTransferred} 个团契`);
      if (r?.groupsDissolved) extra.push(`已解散 ${r.groupsDissolved} 个空团契`);
      return { ok: true, message: extra.length ? `用户已删除，${extra.join('、')}` : '用户已删除' };
    }

    case 'admin.group.dissolve':
      await apiDelete(`/admin/groups/${s(params, 'groupId')}`);
      return { ok: true, message: '团契已解散' };

    case 'admin.group.removeMember':
      await apiPatch(`/admin/groups/${s(params, 'groupId')}`, { action: 'removeMember', userId: s(params, 'userId') });
      return { ok: true, message: '已将该成员移出团契' };

    case 'admin.group.transferOwner':
      await apiPatch(`/admin/groups/${s(params, 'groupId')}`, { action: 'transferOwner', userId: s(params, 'userId') });
      return { ok: true, message: '团长已移交' };

    case 'admin.org.delete':
      await apiDelete(`/admin/organizations?id=${encodeURIComponent(s(params, 'orgId'))}`);
      return { ok: true, message: '组织已删除' };

    // 取消活动：仅创建人与管理员可执行；会通知全部参与人，无需他们同意
    case 'admin.activity.cancel':
      await apiPatch('/admin/activities', { activityId: s(params, 'activityId'), status: 'cancelled' });
      return { ok: true, message: '活动已取消，已通知全部参与人' };

    case 'admin.media.reject':
      await apiPost(`/admin/media/${s(params, 'mediaId')}/review`, { action: 'reject', reason: value || '' });
      return { ok: true, message: '已驳回' };

    case 'admin.donation.reject':
      await apiPatch('/admin/donations', { id: s(params, 'id'), action: 'reject', note: value || '' });
      return { ok: true, message: '已驳回该捐赠记录' };

    // ---------- 支出公示 ----------
    case 'admin.expense.delete':
      await apiDelete(`/admin/expenses?id=${encodeURIComponent(s(params, 'id'))}`);
      return { ok: true, message: '已删除该支出记录' };

    // ---------- 灵修日记 ----------
    // 个人的默想记录，删掉即不可恢复，故走确认页而不是一键删除。
    case 'devotional.delete':
      await apiDelete(`/me/devotionals/${s(params, 'id')}`);
      return { ok: true, message: '这篇灵修日记已删除' };

    // ---------- 讲道体系 ----------
    // 讲道/系列属教会发布内容，删除不可逆，走确认页。
    case 'sermon.delete':
      await apiDelete(`/sermons/${s(params, 'id')}`);
      return { ok: true, message: '该讲道已删除' };

    case 'sermon-series.delete':
      await apiDelete(`/sermon-series/${s(params, 'id')}`);
      return { ok: true, message: '该讲道系列已删除（其下讲道的系列归属将置空）' };

    default:
      return { ok: false, message: `不支持的操作：${name}` };
  }
}
