'use client';

import { useState } from 'react';
import { apiPatch } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import {
  AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox,
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

  const items = data?.items || [];
  const totalReg = items.reduce((a, b) => a + b.confirmed, 0);
  const totalCheckin = items.reduce((a, b) => a + b.checkins, 0);

  return (
    <AdminLayout>
      <SectionTitle>活动管理</SectionTitle>
      <p className="-mt-3 mb-5 text-sm text-ink-500">审核、上下架活动，查看报名与签到情况</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="活动总数" value={data?.total ?? '—'} />
        <StatCard title="本页报名" value={totalReg} />
        <StatCard title="本页签到" value={totalCheckin} />
        <StatCard title="上线中" value={data?.byStatus?.find((s) => s.status === 'published')?.c ?? 0} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          className="input-styled flex-1 min-w-[180px]"
          placeholder="搜索活动标题 / 城市 / 地点"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {['', 'published', 'offline', 'cancelled'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              status === s ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
          >
            {s === '' ? '全部' : STATUS_MAP[s]?.label || s}
          </button>
        ))}
      </div>

      {msg ? <div className="mb-4 text-sm text-primary-700 bg-primary-50 rounded-xl px-4 py-2">{msg}</div> : null}

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <Empty label="暂无活动" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">活动</th>
                <th className="text-left px-4 py-3 font-medium">城市/地点</th>
                <th className="text-left px-4 py-3 font-medium">开始时间</th>
                <th className="text-center px-4 py-3 font-medium">报名</th>
                <th className="text-center px-4 py-3 font-medium">签到</th>
                <th className="text-center px-4 py-3 font-medium">状态</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t border-ink-100 hover:bg-primary-50/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">{a.title}</div>
                    <div className="text-xs text-ink-400">{a.category} · {a.organizer}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    <div>{a.city || '—'}</div>
                    <div className="text-xs text-ink-400">{a.location || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-600">{a.startAt?.slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-medium text-ink-900">{a.confirmed}</span>
                    <span className="text-ink-400">/{a.capacity}</span>
                    {a.waitlist > 0 ? <span className="ml-1 text-xs text-gold-700">候补{a.waitlist}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-center text-ink-700">{a.checkins}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={STATUS_MAP[a.status]?.tone || 'gray'}>{STATUS_MAP[a.status]?.label || a.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.status === 'published' ? (
                      <button
                        disabled={busy === a.id}
                        onClick={() => changeStatus(a.id, 'offline')}
                        className="text-rose-600 hover:underline disabled:opacity-50"
                      >
                        下架
                      </button>
                    ) : (
                      <button
                        disabled={busy === a.id}
                        onClick={() => changeStatus(a.id, 'published')}
                        className="text-emerald-600 hover:underline disabled:opacity-50"
                      >
                        上线
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
