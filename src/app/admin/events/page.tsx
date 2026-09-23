'use client';

import { useState } from 'react';
import { apiPost } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { eventTypeLabel } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import { AdminLayout, StatCard, Badge, TableSkeleton, TableShell, Th, Empty, ErrorBox, PageHead, Toolbar } from '../_components';

interface OutboxEvent {
  id: string; eventType: string; payload: string; status: string;
  createdAt: string; processedAt: string | null;
}

const STATUS_MAP: Record<string, { tone: 'green' | 'gold' | 'red'; label: string }> = {
  done: { tone: 'green', label: '已处理' },
  pending: { tone: 'gold', label: '待处理' },
  failed: { tone: 'red', label: '失败' },
};

export default function AdminEventsPage() {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, loading, error, reload } = useApi<{
    items: OutboxEvent[]; total: number;
    byStatus: { status: string; c: number }[];
    byType: { type: string; c: number }[];
  }>(`/admin/events?status=${status}`, [status]);

  async function dispatch() {
    setBusy(true); setMsg('');
    try {
      const r = await apiPost<{ pending: number }>('/admin/events', {});
      setMsg(`已触发消费者派发，剩余待处理 ${r.pending} 条`);
      reload();
    } catch (e: any) {
      setMsg(e?.message || '派发失败');
    } finally {
      setBusy(false);
    }
  }

  const items = data?.items || [];
  // byStatus 不带筛选，data.total 跟着状态筛选走：筛「失败」时「事件总数」原来会变成
  // 失败的条数，和旁边三张状态卡对不上账。四张卡统一按全库口径。
  const allCount = (data?.byStatus ?? []).reduce((n, s) => n + s.c, 0);

  return (
    <AdminLayout>
      <PageHead
        eyebrow="系统 · 运维"
        title="事件中心"
        sub="事务性发件箱（outbox）事件查询、消费者状态与重试"
        actions={
          <button onClick={dispatch} disabled={busy} className="btn-primary btn-sm min-h-11 lg:min-h-0 disabled:opacity-50">
            {busy ? '派发中…' : '手动派发'}
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" data-reveal-group>
        <StatCard title="事件总数" value={data ? allCount : '—'} />
        <StatCard
          title="待处理"
          value={data?.byStatus?.find((s) => s.status === 'pending')?.c ?? 0}
          accent={(data?.byStatus?.find((s) => s.status === 'pending')?.c ?? 0) > 0}
        />
        <StatCard title="已处理" value={data?.byStatus?.find((s) => s.status === 'done')?.c ?? 0} />
        <StatCard
          title="失败"
          value={data?.byStatus?.find((s) => s.status === 'failed')?.c ?? 0}
          accent={(data?.byStatus?.find((s) => s.status === 'failed')?.c ?? 0) > 0}
        />
      </div>

      <Toolbar>
        {['', 'pending', 'done', 'failed'].map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)} aria-pressed={status === s}
            className={`min-h-11 lg:min-h-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${status === s ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
            {s === '' ? '全部' : STATUS_MAP[s]?.label}
          </button>
        ))}
      </Toolbar>

      {msg ? <div role="status" className="mb-4 text-sm text-primary-700 bg-primary-50 rounded-xl px-4 py-2">{msg}</div> : null}

      {loading && !data ? (
        <TableSkeleton rows={8} cols={4} />
      ) : error ? <ErrorBox message={error} onRetry={reload} /> : items.length === 0 ? (
        <Empty label="暂无事件" hint="换个状态筛选看看，或稍后再来刷新" />
      ) : (
        <TableShell busy={loading}>
          {/* 窄屏下横向滚动，而不是把 620px 的列宽压成竖排（探针实测） */}
          <table className="w-full min-w-[620px] text-sm">
            <caption className="sr-only">事件中心</caption>
            <thead className="bg-ink-50 text-ink-600">
              <tr className="whitespace-nowrap">
                <Th>事件类型</Th>
                <Th>创建时间</Th>
                <Th className="text-center">状态</Th>
                <Th className="text-right">载荷</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-t border-ink-100">
                  <td className="px-4 py-3">
                    {/* 中文给人读，英文码留给排障：只有码时整列都是 content.approved 这种串 */}
                    <div className="text-ink-700">{eventTypeLabel(e.eventType)}</div>
                    <div className="font-mono text-[11px] text-ink-400">{e.eventType}</div>
                  </td>
                  <td className="num px-4 py-3 text-ink-500 whitespace-nowrap">{formatDateTime(e.createdAt) || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={STATUS_MAP[e.status]?.tone || 'gray'}>{STATUS_MAP[e.status]?.label || e.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setOpenId(openId === e.id ? null : e.id)} aria-expanded={openId === e.id} className="btn-chip">
                      {openId === e.id ? '收起' : '查看'}
                    </button>
                  </td>
                </tr>
              ))}
              {openId ? (
                <tr className="bg-ink-50">
                  <td colSpan={4} className="px-4 py-3">
                    <pre className="text-xs text-ink-600 whitespace-pre-wrap break-all max-h-40 overflow-auto scroll-slim">
                      {items.find((x) => x.id === openId)?.payload}
                    </pre>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TableShell>
      )}
    </AdminLayout>
  );
}
