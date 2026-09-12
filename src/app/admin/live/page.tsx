'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApi, useAction } from '@/lib/useApi';
import { apiPost } from '@/lib/api';
import { useConfirmNav } from '@/lib/confirm';
import { useNotice } from '@/lib/notice';
import { AdminLayout, StatCard, SectionTitle, Loading, Empty, ErrorBox } from '../_components';
import type { LiveRoomListItem } from '@/lib/types';

type Tab = 'all' | 'pending' | 'live' | 'closed';

export default function AdminLivePage() {
  // review=1:管理端可见全部房间(含待审/驳回/取消/过期)
  const { data, loading, error, reload } = useApi<{ rooms: LiveRoomListItem[] }>(`/live?review=1`, []);
  const { run, pending: busy } = useAction();
  const confirmNav = useConfirmNav();
  const notice = useNotice();
  const [tab, setTab] = useState<Tab>('all');

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

  function badgeOf(r: LiveRoomListItem) {
    if (r.cancelled) return { text: '已取消', cls: 'bg-ink-400 text-white' };
    if (r.expired) return { text: '已过期', cls: 'bg-ink-500 text-white' };
    if (r.reviewStatus === 'rejected') return { text: '已驳回', cls: 'bg-rose-500 text-white' };
    if (r.status === 'live') return { text: '● 直播中', cls: 'bg-rose-500 text-white' };
    if (r.status === 'ended') return { text: '已结束', cls: 'bg-ink-300 text-white' };
    if (r.reviewStatus === 'pending') return { text: '待审核', cls: 'bg-amber-400 text-white' };
    return { text: '预告', cls: 'bg-ink-700/80 text-white/90' };
  }

  const canReview = (r: LiveRoomListItem) =>
    r.status === 'created' && !r.cancelled && !r.expired && r.reviewStatus === 'pending';

  return (
    <AdminLayout>
      <SectionTitle>直播管理</SectionTitle>
      <p className="text-sm text-ink-500 -mt-2 mb-5">审核直播间、强制关闭违规直播、取消预约。取消/过期不删除数据,只对外隐藏。</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="直播间总数" value={all.length} />
        <StatCard title="待审核" value={pendingCount} hint="普通用户创建需审核" />
        <StatCard title="直播中" value={liveCount} hint="当前进行" />
        <StatCard title="已关闭/取消" value={closedCount} hint="含驳回与过期" />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {([
          ['all', '全部'],
          ['pending', '待审核'],
          ['live', '直播中'],
          ['closed', '已关闭'],
        ] as [Tab, string][]).map(([k, label]) => (
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

      {loading ? <Loading /> : null}
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
                    <Link href={`/live/${r.id}`} className="font-semibold text-ink-900 hover:underline truncate">{r.title}</Link>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${b.cls}`}>{b.text}</span>
                  </div>
                  <p className="text-xs text-ink-400 mt-1">
                    主播 {r.owner?.displayName || '—'} · 峰值 {r.viewerPeak} · 当前 {r.viewerCount}
                    {r.scheduledAt ? ` · 约定 ${new Date(r.scheduledAt).toLocaleString('zh-CN')}` : ''}
                  </p>
                  {r.cancelled && r.cancelReason ? <p className="text-xs text-rose-500 mt-1">取消原因:{r.cancelReason}</p> : null}
                  {r.reviewStatus === 'rejected' && r.reviewNote ? <p className="text-xs text-rose-500 mt-1">驳回:{r.reviewNote}</p> : null}
                  {r.reviewStatus === 'pending' && r.reviewVideoId ? (
                    <p className="text-xs text-ink-500 mt-1">
                      审核视频:
                      <Link href={`/media/${r.reviewVideoId}`} target="_blank" className="text-primary-600 hover:underline ml-1">
                        查看现场视频 →
                      </Link>
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/live/${r.id}`} className="btn-ghost">查看</Link>
                  {canReview(r) && (
                    <>
                      <button className="btn-primary" disabled={busy} onClick={() => reviewAsk(r, true)}>通过</button>
                      <button className="btn-danger" disabled={busy} onClick={() => reviewAsk(r, false)}>驳回</button>
                    </>
                  )}
                  {r.status === 'live' && (
                    <button className="btn-danger" disabled={busy} onClick={() => cancelAsk(r, true)}>强制关闭</button>
                  )}
                  {cancellable && (
                    <button className="btn-ghost text-rose-600" disabled={busy} onClick={() => cancelAsk(r, false)}>取消</button>
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
