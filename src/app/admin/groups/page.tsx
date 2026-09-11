'use client';

import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox } from '../_components';

interface AdminGroup {
  id: string; name: string; category: string; city: string; description: string;
  createdAt: string; owner: string; memberCount: number; postCount: number;
}

export default function AdminGroupsPage() {
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useApi<{ items: AdminGroup[]; total: number }>(
    `/admin/groups?q=${encodeURIComponent(q)}`, [q]
  );
  const items = data?.items || [];
  const totalMembers = items.reduce((a, b) => a + b.memberCount, 0);
  const totalPosts = items.reduce((a, b) => a + b.postCount, 0);

  return (
    <AdminLayout>
      <SectionTitle>群组管理</SectionTitle>
      <p className="-mt-3 mb-5 text-sm text-ink-500">查看团契/群组成员、动态与负责人</p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard title="群组总数" value={data?.total ?? '—'} />
        <StatCard title="本页成员合计" value={totalMembers} />
        <StatCard title="本页动态合计" value={totalPosts} />
      </div>

      <input
        className="input-styled w-full mb-4"
        placeholder="搜索群组名称 / 城市"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <Empty label="暂无群组" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">群组</th>
                <th className="text-left px-4 py-3 font-medium">分类</th>
                <th className="text-left px-4 py-3 font-medium">城市</th>
                <th className="text-left px-4 py-3 font-medium">负责人</th>
                <th className="text-center px-4 py-3 font-medium">成员</th>
                <th className="text-center px-4 py-3 font-medium">动态</th>
                <th className="text-left px-4 py-3 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((g) => (
                <tr key={g.id} className="border-t border-ink-100 hover:bg-primary-50/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">{g.name}</div>
                    <div className="text-xs text-ink-400 line-clamp-1 max-w-[280px]">{g.description}</div>
                  </td>
                  <td className="px-4 py-3"><Badge tone="primary">{g.category}</Badge></td>
                  <td className="px-4 py-3 text-ink-600">{g.city || '—'}</td>
                  <td className="px-4 py-3 text-ink-600">{g.owner || '—'}</td>
                  <td className="px-4 py-3 text-center font-medium text-ink-900">{g.memberCount}</td>
                  <td className="px-4 py-3 text-center text-ink-700">{g.postCount}</td>
                  <td className="px-4 py-3 text-ink-500">{g.createdAt?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
