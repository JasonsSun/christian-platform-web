'use client';

import { useState } from 'react';
import { apiPatch } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { formatDateTime } from '@/lib/format';
import { activityCategoryLabel } from '@/lib/labels';
import {
  AdminLayout, StatCard, Badge, TableSkeleton, TableShell, Th, Empty, ErrorBox,
  PageHead, Toolbar,
} from '../_components';

interface AdminActivity {
  id: string; title: string; category: string; city: string; location: string;
  capacity: number; status: string; startAt: string; createdAt: string;
  organizer: string; confirmed: number; waitlist: number; checkins: number;
}

const STATUS_MAP: Record<string, { tone: 'green' | 'gold' | 'red' | 'gray'; label: string }> = {
  published: { tone: 'green', label: '已上线' },
  offline: { tone: 'gray', label: '已下架' },
  cancelled: { tone: 'red', label: '已取消' },
  pending: { tone: 'gold', label: '待审核' },
};

export default function AdminActivitiesPage() {
  const notice = useNotice();
  const confirmNav = useConfirmNav();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const { data, loading, error, reload } = useApi<{
    items: AdminActivity[];
    total: number;
    byStatus: { status: string; c: number }[];
  }>(`/admin/activities?q=${encodeURIComponent(q)}&status=${status}`, [q, status]);

  async function changeStatus(id: string, next: string) {
    setBusy(id); setMsg('');
    try {
      await apiPatch('/admin/activities', { activityId: id, status: next });
      setMsg(next === 'offline' ? '已下架活动' : next === 'published' ? '已重新上线' : '已取消活动');
      reload();
    } catch (e: any) {
      setMsg(e?.message || '操作失败');
    } finally {
      setBusy(null);
    }
  }

  /** 管理员强制取消活动：单方决定，系统会通知全部参与人 */
  function cancelActivity(a: AdminActivity) {
    confirmNav({
      title: `取消活动「${a.title}」`,
      desc: `将把活动标记为「已取消」，并立即通知全部 ${a.confirmed + a.waitlist} 名参与人（含候补）。\n取消无需参与人同意，且不可撤销，但之后可以改回上线。`,
      danger: true,
      confirmText: '确认取消活动',
      back: '/admin/activities',
      action: 'admin.activity.cancel',
      params: { activityId: a.id },
      onConfirm: async () => {
        await apiPatch('/admin/activities', { activityId: a.id, status: 'cancelled' });
        notice.success('活动已取消，参与人已收到通知');
        reload();
      },
    });
  }

  const items = data?.items || [];
  const totalReg = items.reduce((a, b) => a + b.confirmed, 0);
  const totalCheckin = items.reduce((a, b) => a + b.checkins, 0);

  return (
    <AdminLayout>
      <PageHead
        eyebrow="协作 · 活动"
        title="活动管理"
        sub="审核、上下架活动，查看报名与签到情况。取消活动会通知全部参与人（创建人本人也可自行取消）。"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" data-reveal-group>
        <StatCard title="活动总数" value={data?.total ?? '—'} />
        <StatCard title="本页报名" value={totalReg} />
        <StatCard title="本页签到" value={totalCheckin} />
        <StatCard
          title="上线中"
          value={data?.byStatus?.find((s) => s.status === 'published')?.c ?? 0}
          hint={`待审核 ${data?.byStatus?.find((s) => s.status === 'pending')?.c ?? 0}`}
          accent={(data?.byStatus?.find((s) => s.status === 'pending')?.c ?? 0) > 0}
        />
      </div>

      <Toolbar>
        <input
          className="input-styled input-sm min-h-11 lg:min-h-0 flex-1 min-w-[180px]"
          aria-label="搜索活动标题 / 城市 / 地点"
          placeholder="搜索活动标题 / 城市 / 地点"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {['', 'published', 'offline', 'cancelled'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={`min-h-11 lg:min-h-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              status === s ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
          >
            {s === '' ? '全部' : STATUS_MAP[s]?.label || s}
          </button>
        ))}
      </Toolbar>

      {msg ? <div role="status" className="mb-4 text-sm text-primary-700 bg-primary-50 rounded-xl px-4 py-2">{msg}</div> : null}

      {loading && !data ? (
        <TableSkeleton cols={7} />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <Empty label="暂无活动" hint="换个状态筛选，或清空搜索词再试" />
      ) : (
        <TableShell busy={loading}>
          {/* 手机视口下 7 列会被压成「一行一字」的竖排（探针 SQUEEZE 实测），改成交给壳横向滚 */}
          <table className="w-full min-w-[880px] text-sm">
            <caption className="sr-only">活动管理</caption>
            <thead className="bg-ink-50 text-ink-600">
              <tr>
                <Th>活动</Th>
                <Th>城市/地点</Th>
                <Th>开始时间</Th>
                <Th className="text-center">报名</Th>
                <Th className="text-center">签到</Th>
                <Th className="text-center">状态</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t border-ink-100 hover:bg-primary-50/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">{a.title}</div>
                    <div className="text-xs text-ink-400">{activityCategoryLabel(a.category)} · {a.organizer}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    <div>{a.city || '—'}</div>
                    <div className="text-xs text-ink-400">{a.location || ''}</div>
                  </td>
                  {/* 接口给的是带 Z 的 UTC 串，slice 出来的墙上时间比本机早 8 小时，
                      会和活动详情页（formatDateTime）对不上同一场活动 */}
                  <td className="px-4 py-3 text-ink-600 whitespace-nowrap">{formatDateTime(a.startAt) || '—'}</td>
                  <td className="num px-4 py-3 text-center">
                    <span className="font-medium text-ink-900">{a.confirmed}</span>
                    <span className="text-ink-400">/{a.capacity}</span>
                    {a.waitlist > 0 ? <span className="ml-1 text-xs text-gold-700">候补{a.waitlist}</span> : null}
                  </td>
                  <td className="num px-4 py-3 text-center text-ink-700">{a.checkins}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={STATUS_MAP[a.status]?.tone || 'gray'}>{STATUS_MAP[a.status]?.label || a.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex flex-wrap justify-end gap-1">
                      {a.status === 'cancelled' ? (
                        <button
                          disabled={busy === a.id}
                          onClick={() => changeStatus(a.id, 'published')}
                          className="btn-chip btn-chip-safe"
                        >
                          恢复上线
                        </button>
                      ) : (
                        <>
                          {a.status === 'published' ? (
                            <button
                              disabled={busy === a.id}
                              onClick={() => changeStatus(a.id, 'offline')}
                              className="btn-chip"
                            >
                              下架
                            </button>
                          ) : (
                            <button
                              disabled={busy === a.id}
                              onClick={() => changeStatus(a.id, 'published')}
                              className="btn-chip btn-chip-accent"
                            >
                              上线
                            </button>
                          )}
                          <button
                            disabled={busy === a.id}
                            onClick={() => cancelActivity(a)}
                            className="btn-chip btn-chip-danger"
                          >
                            取消活动
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </AdminLayout>
  );
}
