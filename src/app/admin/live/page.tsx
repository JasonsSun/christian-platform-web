'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApi, useAction } from '@/lib/useApi';
import { apiPost } from '@/lib/api';
import { useConfirmNav } from '@/lib/confirm';
import { useNotice } from '@/lib/notice';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { AdminLayout, StatCard, SectionTitle, Loading, Empty, ErrorBox } from '../_components';
import type { LiveRoomListItem } from '@/lib/types';

type Tab = 'all' | 'pending' | 'live' | 'closed';

export default function AdminLivePage() {
  // review=1:管理端可见全部房间(含待审/驳回/取消/过期)
  const { data, loading, error, reload } = useApi<{ rooms: LiveRoomListItem[] }>(`/live?review=1`, []);
  const { run, pending: busy } = useAction();
  const { user } = useAuth();
  const confirmNav = useConfirmNav();
  const notice = useNotice();
  const canManage = user?.role === 'admin';
  const isModerator = user?.role === 'moderator';
  // 审核员只需处理待审核,默认锁定在「待审核」tab,且不可切换到其他管理视角
  const [tab, setTab] = useState<Tab>(isModerator ? 'pending' : 'all');

  /* ---------- 录像清理运维入口（仅管理员） ---------- */
  const [cleanupHours, setCleanupHours] = useState(24);

  function cleanupAsk() {
    confirmNav({
      title: '清理过期直播录像',
      desc: `将删除距今 ${cleanupHours} 小时之前的过期录像文件及其存储对象，此操作不可恢复。\n生产环境建议由定时任务调用同一接口自动清理。`,
      danger: true,
      confirmText: '确认清理',
      back: '/admin/live',
      action: 'admin.live.cleanupRecordings',
      params: { maxAgeHours: String(cleanupHours) },
      onConfirm: async () => {
        await apiPost('/admin/live/cleanup-recordings', { maxAgeHours: cleanupHours });
        notice.success('过期录像已清理');
        reload();
      },
    });
  }

  const all = data?.rooms || [];
  const pendingCount = all.filter((r) => r.reviewStatus === 'pending' && !r.cancelled && r.status === 'created').length;
  const liveCount = all.filter((r) => r.status === 'live').length;
  const closedCount = all.filter((r) => r.cancelled || r.expired || r.status === 'ended' || r.reviewStatus === 'rejected').length;

  const rooms = all.filter((r) => {
    if (tab === 'pending') return r.reviewStatus === 'pending' && !r.cancelled && r.status === 'created';
    if (tab === 'live') return r.status === 'live';
    if (tab === 'closed') return r.cancelled || r.expired || r.status === 'ended' || r.reviewStatus === 'rejected';
    return true;
  });

  async function review(id: string, approve: boolean, note: string) {
    const r = await run(() => apiPost(`/live/${id}/review`, { approve, note: note || undefined }));
    if (r) {
      notice.success(approve ? '已通过审核,直播间可以开播' : '已驳回该直播间');
      reload();
    }
  }
  function reviewAsk(r: LiveRoomListItem, approve: boolean) {
    confirmNav({
      title: approve ? `通过「${r.title}」` : `驳回「${r.title}」`,
      desc: approve
        ? '通过后该直播间即可开始推流。'
        : '驳回后创建者无法开播,并会在直播页看到驳回原因。',
      danger: !approve,
      confirmText: approve ? '通过' : '驳回',
      cancelText: '再想想',
      input: { label: approve ? '备注(可选)' : '驳回原因(可选)', required: !approve },
      back: '/admin/live',
      onConfirm: async (v) => {
        await review(r.id, approve, v);
      },
    });
  }

  function cancelAsk(r: LiveRoomListItem, force: boolean) {
    confirmNav({
      title: force ? '强制关闭并取消直播' : '取消该直播间',
      desc: force
        ? `将立即结束「${r.title}」并标记取消,观众看到「已取消」。用于直播内容违规等紧急情况。`
        : `「${r.title}」将不再对外展示,数据保留。创建者如需再播请新建一场。`,
      danger: true,
      confirmText: force ? '强制关闭' : '确认取消',
      cancelText: '再想想',
      input: { label: '取消原因(可选)', required: false },
      back: '/admin/live',
      onConfirm: async (v) => {
        const r2 = await run(() => apiPost(`/live/${r.id}/cancel`, { reason: v || (force ? '管理员强制关闭' : undefined) }));
        if (r2) {
          notice.success(force ? '已强制关闭并取消本场直播' : '已取消该直播间');
          reload();
        }
      },
    });
  }

  /* 底色与文字成对：bg-ink-300/400/500 + text-white 在白底上是浅紫配白字，
     深色主题又不在白名单里，两头都读不出来。失效态统一走中性 chip。 */
  function badgeOf(r: LiveRoomListItem) {
    if (r.cancelled) return { text: '已取消', cls: 'bg-ink-100 text-ink-600 border border-ink-200' };
    if (r.expired) return { text: '已过期', cls: 'bg-ink-100 text-ink-600 border border-ink-200' };
    if (r.reviewStatus === 'rejected') return { text: '已驳回', cls: 'bg-rose-50 text-rose-700 border border-rose-200' };
    if (r.status === 'live') return { text: '● 直播中', cls: 'bg-rose-600 text-white' };
    if (r.status === 'ended') return { text: '已结束', cls: 'bg-ink-100 text-ink-600 border border-ink-200' };
    if (r.reviewStatus === 'pending') return { text: '待审核', cls: 'bg-amber-50 text-amber-700 border border-amber-200' };
    return { text: '预告', cls: 'bg-ink-700/80 text-white/90' };
  }

  const canReview = (r: LiveRoomListItem) =>
    r.status === 'created' && !r.cancelled && !r.expired && r.reviewStatus === 'pending';

  return (
    <AdminLayout>
      <SectionTitle as="h1">直播管理</SectionTitle>
      <p className="text-sm text-ink-500 -mt-2 mb-5">审核直播间、强制关闭违规直播、取消预约。取消/过期不删除数据,只对外隐藏。<span className="text-ink-400">（审核员仅可审核,强制关闭与取消由管理员操作）</span></p>

      {/* 超管看完整管理统计;审核员仅看「待审核」数,不暴露总数/直播中/已关闭等管理视角 */}
      {canManage ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title="直播间总数" value={all.length} />
          <StatCard title="待审核" value={pendingCount} hint="普通用户创建需审核" />
          <StatCard title="直播中" value={liveCount} hint="当前进行" />
          <StatCard title="已关闭/取消" value={closedCount} hint="含驳回与过期" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title="待审核" value={pendingCount} hint="待你审核的直播间" />
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {/* 审核员仅可看「待审核」;全部/直播中/已关闭为管理视角,仅超管可见 */}
        {(canManage
          ? ([['all', '全部'], ['pending', '待审核'], ['live', '直播中'], ['closed', '已关闭']] as [Tab, string][])
          : ([['pending', '待审核']] as [Tab, string][])
        ).map(([k, label]) => (
          <button
            key={k}
            className={`px-3 py-1.5 rounded-full text-sm ${tab === k ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600'}`}
            onClick={() => setTab(k)}
          >
            {label}
            {k === 'pending' && pendingCount ? <span className="ml-1 text-xs">({pendingCount})</span> : null}
          </button>
        ))}
      </div>

      {/* 录像清理：接口已存在但没有挂载运维入口，这里补上 */}
      {canManage ? (
        <div className="mb-4 rounded-2xl border border-ink-100 bg-ink-50/60 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-ink-700">录像清理</span>
          <span className="text-xs text-ink-500">删除距今超过</span>
          <input
            type="number"
            min={1}
            aria-label="清理超过多少小时的过期录像"
            className="input-styled w-24"
            value={cleanupHours}
            onChange={(e) => setCleanupHours(Math.max(1, Number(e.target.value) || 24))}
          />
          <span className="text-xs text-ink-500">小时的过期录像（生产环境建议挂定时任务调用同一接口）</span>
          <button
            onClick={cleanupAsk}
            className="ml-auto px-4 py-1.5 rounded-xl text-sm bg-primary-600 text-white hover:bg-primary-700"
          >
            立即清理
          </button>
        </div>
      ) : null}

      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {!loading && !rooms.length ? <Empty label={tab === 'pending' ? '没有待审核的直播间' : '暂无直播间'} /> : null}

      <div className="space-y-3">
        {rooms.map((r) => {
          const b = badgeOf(r);
          const cancellable = r.status === 'created' && !r.cancelled && !r.expired;
          return (
            <div key={r.id} className="glass rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 短标题（探针里 "asd" 只有 28px 宽）在触屏上点不中，左右各借 6px 命中区 */}
                    <Link href={`/live/${r.id}`} className="font-semibold text-ink-900 hover:underline truncate py-2 -my-2 px-1.5 -mx-1.5">{r.title}</Link>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${b.cls}`}>{b.text}</span>
                  </div>
                  <p className="text-xs text-ink-400 mt-1">
                    主播 {r.owner?.displayName || '—'} · 峰值 {r.viewerPeak} · 当前 {r.viewerCount}
                    {r.scheduledAt ? ` · 约定 ${formatDateTime(r.scheduledAt)}` : ''}
                  </p>
                  {r.cancelled && r.cancelReason ? <p className="text-xs text-rose-600 mt-1">取消原因:{r.cancelReason}</p> : null}
                  {r.reviewStatus === 'rejected' && r.reviewNote ? <p className="text-xs text-rose-600 mt-1">驳回:{r.reviewNote}</p> : null}
                  {r.reviewStatus === 'pending' && r.reviewVideoId ? (
                    <p className="text-xs text-ink-500 mt-1">
                      审核视频:
                      <Link href={`/media/${r.reviewVideoId}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline ml-1">
                        查看现场视频 →
                      </Link>
                    </p>
                  ) : null}
                </div>

                <div className="inline-flex items-center gap-1 flex-wrap">
                  <Link href={`/live/${r.id}`} className="btn-chip" aria-label={`查看直播间「${r.title}」`}>查看</Link>
                  {canReview(r) && (
                    <>
                      <button className="btn-chip btn-chip-safe" disabled={busy} onClick={() => reviewAsk(r, true)}>通过</button>
                      <button className="btn-chip btn-chip-danger" disabled={busy} onClick={() => reviewAsk(r, false)}>驳回</button>
                    </>
                  )}
                  {canManage && r.status === 'live' && (
                    <button className="btn-chip btn-chip-danger" disabled={busy} onClick={() => cancelAsk(r, true)}>强制关闭</button>
                  )}
                  {canManage && cancellable && (
                    <button className="btn-chip" disabled={busy} onClick={() => cancelAsk(r, false)}>取消</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AdminLayout>
  );
}
