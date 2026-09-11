'use client';

import { useState } from 'react';
import { apiPost } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox } from '../_components';

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

  return (
    <AdminLayout>
      <SectionTitle>事件中心</SectionTitle>
      <p className="-mt-3 mb-5 text-sm text-ink-500">事务性发件箱(outbox)事件查询、消费者状态与重试</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="事件总数" value={data?.total ?? '—'} />
        <StatCard title="待处理" value={data?.byStatus?.find((s) => s.status === 'pending')?.c ?? 0} />
        <StatCard title="已处理" value={data?.byStatus?.find((s) => s.status === 'done')?.c ?? 0} />
        <StatCard title="失败" value={data?.byStatus?.find((s) => s.status === 'failed')?.c ?? 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {['', 'pending', 'done', 'failed'].map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${status === s ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
            {s === '' ? '全部' : STATUS_MAP[s]?.label}
          </button>
        ))}
        <button onClick={dispatch} disabled={busy} className="btn-primary ml-auto disabled:opacity-50">
          {busy ? '派发中…' : '手动派发'}
        </button>
      </div>

      {msg ? <div className="mb-4 text-sm text-primary-700 bg-primary-50 rounded-xl px-4 py-2">{msg}</div> : null}

      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : items.length === 0 ? (
        <Empty label="暂无事件" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">事件类型</th>
                <th className="text-left px-4 py-3 font-medium">创建时间</th>
                <th className="text-center px-4 py-3 font-medium">状态</th>
                <th className="text-right px-4 py-3 font-medium">载荷</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-t border-ink-100">
                  <td className="px-4 py-3 font-mono text-xs text-primary-700">{e.eventType}</td>
                  <td className="px-4 py-3 text-ink-500">{e.createdAt?.slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={STATUS_MAP[e.status]?.tone || 'gray'}>{STATUS_MAP[e.status]?.label || e.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setOpenId(openId === e.id ? null : e.id)} className="text-primary-600 hover:underline text-xs">
                      {openId === e.id ? '收起' : '查看'}
                    </button>
                  </td>
                </tr>
              ))}
              {openId ? (
                <tr className="bg-ink-50">
                  <td colSpan={4} className="px-4 py-3">
                    <pre className="text-xs text-ink-600 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                      {items.find((x) => x.id === openId)?.payload}
                    </pre>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
