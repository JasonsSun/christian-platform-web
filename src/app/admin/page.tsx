'use client';

import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo, formatDateTime } from '@/lib/format';
import { contentStatusLabel, auditActionLabel } from '@/lib/labels';
import { AdminLayout, StatCard, StatusBadge, Loading, Empty, ErrorBox, SectionTitle, Badge } from './_components';
import type { AdminStats } from './_components';

const STATUS_COLORS: Record<string, string> = {
  published: 'bg-emerald-500',
  pending: 'bg-gold-500',
  rejected: 'bg-rose-500',
  draft: 'bg-ink-400',
};

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { data, loading, error, reload } = useApi<AdminStats>('/admin/stats');

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  if (user === null)
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">
        请先登录以访问管理后台。 <Link className="btn-primary ml-2" href="/login">去登录</Link>
      </div>
    );
  if (user.role !== 'moderator' && user.role !== 'admin')
    return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">无权限访问（需要审核员或管理员角色）。</div>;

  if (loading) return <AdminLayout><Loading /></AdminLayout>;
  if (error) return <AdminLayout><ErrorBox message={error} onRetry={reload} /></AdminLayout>;
  if (!data) return <AdminLayout><Empty label="暂无数据" /></AdminLayout>;

  const t = data.totals;
  const growth = (data.growth || []).slice(-7);
  const maxGrowth = Math.max(1, ...growth.map((g) => g.c));
  const maxStatus = Math.max(1, ...data.byStatus.map((s) => s.c));

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-900">仪表盘</h1>
        <button className="btn-secondary" onClick={reload}>刷新</button>
      </div>

      {/* 核心指标卡 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard title="用户数" value={t.users} hint={`封禁 ${t.suspended}`} />
        <StatCard title="已发布内容" value={t.published} hint={`总计 ${t.contents}`} />
        <StatCard title="待审核" value={t.pendingTasks} />
        <StatCard title="活动数" value={t.activities} hint={`待审 ${t.pendingEvents}`} />
        <StatCard title="报名数" value={t.registrations} />
        <StatCard title="团契数" value={t.groupCount} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* 内容状态分布 */}
        <div className="glass rounded-2xl p-5 shadow-soft">
          <SectionTitle>内容状态分布</SectionTitle>
          {data.byStatus.length === 0 ? (
            <Empty label="暂无内容" />
          ) : (
            <div className="flex flex-col gap-3">
              {data.byStatus.map((s) => (
                <div key={s.status} className="flex items-center gap-3">
                  <div className="w-20 flex-shrink-0 flex items-center gap-1.5 text-sm text-ink-600">
                    <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[s.status] || 'bg-primary-500'}`} />
                    {contentStatusLabel(s.status)}
                  </div>
                  <div className="flex-1 h-3 rounded-full bg-ink-100 overflow-hidden">
                    <div
                      className={`h-full ${STATUS_COLORS[s.status] || 'bg-primary-500'}`}
                      style={{ width: `${(s.c / maxStatus) * 100}%` }}
                    />
                  </div>
                  <div className="w-12 text-right text-sm font-semibold text-ink-700">{s.c}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 近 7 天用户增长 */}
        <div className="glass rounded-2xl p-5 shadow-soft">
          <SectionTitle>近 7 天用户增长</SectionTitle>
          {growth.length === 0 ? (
            <Empty label="暂无增长数据" />
          ) : (
            <div className="flex items-end gap-2 h-40">
              {growth.map((g) => (
                <div key={g.d} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <div className="text-xs text-ink-500">{g.c}</div>
                  <div
                    className="w-full bg-primary-500 rounded-t"
                    style={{ height: `${(g.c / maxGrowth) * 100}%`, minHeight: 4 }}
                    title={`${g.d}: ${g.c}`}
                  />
                  <div className="text-[10px] text-ink-400">{String(g.d).slice(5)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 最近审计日志 */}
        <div className="glass rounded-2xl p-5 shadow-soft">
          <SectionTitle>最近审计日志</SectionTitle>
          {data.recentAudit.length === 0 ? (
            <Empty label="暂无审计日志" />
          ) : (
            <ul className="flex flex-col gap-2 max-h-96 overflow-auto">
              {data.recentAudit.map((a) => (
                <li key={a.id} className="flex items-start gap-3 text-sm border-b border-ink-100 pb-2">
                  <Badge tone="blue">{auditActionLabel(a.action)}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-ink-700 truncate">{a.detail || a.entity_type}</div>
                    <div className="text-xs text-ink-400">
                      {a.actor_name} · {timeAgo(a.created_at)} · {a.ip}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 热门内容 Top8 */}
        <div className="glass rounded-2xl p-5 shadow-soft">
          <SectionTitle>热门内容 Top8</SectionTitle>
          {data.topContent.length === 0 ? (
            <Empty label="暂无内容" />
          ) : (
            <ol className="flex flex-col gap-2">
              {data.topContent.slice(0, 8).map((c, i) => (
                <li key={c.id} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-center font-bold text-ink-400">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-ink-800 truncate">{c.title}</div>
                    <div className="text-xs text-ink-400">
                      ♥ {c.like_count} · 👁 {c.view_count} · 💬 {c.comment_count}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
