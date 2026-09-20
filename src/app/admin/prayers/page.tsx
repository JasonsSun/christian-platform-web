'use client';

import { useState } from 'react';
import { apiDelete, qs } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useConfirmNav } from '@/lib/confirm';
import { useNotice } from '@/lib/notice';
import { timeAgo } from '@/lib/format';
import { AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox } from '../_components';

interface PrayerRow {
  id: string;
  body: string;
  amenCount: number;
  answered: boolean;
  createdAt: string;
  user: { id: string; username: string; displayName: string; avatarColor?: string };
}

interface Resp {
  items: PrayerRow[];
  total: number;
  stats: { total: number; answered: number; longBody: number };
}

const SCOPES = [
  { key: 'all', label: '全部' },
  { key: 'unanswered', label: '待祷中' },
  { key: 'answered', label: '已蒙应允' },
  { key: 'long', label: '长文（≥300字，优先巡查）' },
] as const;

type ScopeKey = (typeof SCOPES)[number]['key'];

const PAGE_SIZE = 20;

export default function AdminPrayersPage() {
  const { user, loading: authLoading } = useAuth();
  const confirmNav = useConfirmNav();
  const notice = useNotice();
  const [kw, setKw] = useState('');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<ScopeKey>('all');
  const [page, setPage] = useState(1);

  const isStaff = !!user && (user.role === 'admin' || user.role === 'moderator');
  const isAdmin = !!user && user.role === 'admin';

  const { data, loading, error, reload, setData } = useApi<Resp>(
    isStaff ? `/admin/prayers${qs({ q, scope, page, pageSize: PAGE_SIZE })}` : null,
    [user, q, scope, page]
  );

  const items = data?.items || [];
  const total = data?.total || 0;
  const stats = data?.stats;

  /** 移除一条代祷：走跳转式确认页（本站禁止弹框），确认后记审计 */
  function remove(p: PrayerRow) {
    confirmNav({
      title: '移除违规代祷',
      desc: `确定移除「${p.user.displayName}」的这条代祷吗？\n\n${p.body.slice(0, 120)}${p.body.length > 120 ? '…' : ''}\n\n该操作会记入审计日志，删除后不可恢复。`,
      confirmText: '移除',
      danger: true,
      action: 'prayer.delete',
      params: { prayerId: p.id, byStaff: true },
      onConfirm: async () => {
        const res = await apiDelete<{ ok: boolean }>(`/prayers/${p.id}`);
        if (res?.ok) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  items: prev.items.filter((x) => x.id !== p.id),
                  total: Math.max(0, prev.total - 1),
                  stats: prev.stats ? { ...prev.stats, total: Math.max(0, prev.stats.total - 1) } : prev.stats,
                }
              : prev
          );
          notice.success('该代祷已被移除');
        }
      },
    });
  }

  if (authLoading) {
    return (
      <AdminLayout>
        <Loading />
      </AdminLayout>
    );
  }

  if (!user || !isStaff) {
    return (
      <AdminLayout>
        <ErrorBox message="需要管理员或审核员权限" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SectionTitle as="h1">代祷墙管理</SectionTitle>
      <p className="-mt-3 mb-5 text-sm text-ink-500">
        巡查并移除违规违法内容。默认按发布时间倒序，「长文」档用于优先排查广告与灌水。
      </p>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
        <StatCard title="代祷总数" value={stats?.total ?? '—'} />
        <StatCard title="已蒙应允" value={stats?.answered ?? '—'} />
        <StatCard title="长文（≥300字）" value={stats?.longBody ?? '—'} />
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            onClick={() => { setScope(s.key); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-full text-sm transition-colors ${
              scope === s.key ? 'bg-primary-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
            }`}
          >
            {s.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input
            aria-label="搜索代祷内容 / 发布人"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setQ(kw.trim()); setPage(1); } }}
            placeholder="搜索内容 / 发布人…"
            className="input-styled input-sm text-sm w-56"
          />
          <button onClick={() => { setQ(kw.trim()); setPage(1); }} className="btn-secondary btn-sm text-sm px-4">
            搜索
          </button>
          {q && (
            <button
              onClick={() => { setKw(''); setQ(''); setPage(1); }}
              className="text-sm text-ink-500 hover:text-ink-700"
            >
              清除
            </button>
          )}
        </div>
      </div>

      {loading && items.length === 0 ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <>
          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            {items.length === 0 ? <Empty label={q ? `没有匹配「${q}」的代祷` : '暂无代祷'} /> : (
              <table className="w-full text-sm">
                <caption className="sr-only">代祷墙管理</caption>
                <thead className="bg-ink-50 text-ink-600">
                  <tr>
                    <th scope="col" className="text-left px-4 py-3 font-medium">发布人</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">内容</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium">阿们</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium">状态</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium whitespace-nowrap">时间</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-t border-ink-100 hover:bg-primary-50/40 align-top">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-semibold flex-shrink-0"
                            style={{ backgroundColor: p.user.avatarColor || '#3d52d9' }}
                          >
                            {(p.user.displayName || p.user.username || '?').slice(0, 1)}
                          </span>
                          <span className="text-ink-900">{p.user.displayName || p.user.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-700 max-w-md">
                        <div className="whitespace-pre-wrap break-words">
                          {p.body.length > 200 ? `${p.body.slice(0, 200)}…` : p.body}
                        </div>
                        {p.body.length >= 300 && (
                          <span className="inline-block mt-1 text-xs text-amber-700">长文 {p.body.length} 字</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-ink-700">{p.amenCount}</td>
                      <td className="px-4 py-3 text-center">
                        {p.answered ? <Badge tone="green">已蒙应允</Badge> : <Badge tone="gray">待祷中</Badge>}
                      </td>
                      <td className="px-4 py-3 text-ink-500 whitespace-nowrap">{timeAgo(p.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {isAdmin && (
                          <button
                            onClick={() => remove(p)}
                            className="btn-chip btn-chip-danger"
                          >
                            移除
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 mt-5 text-sm">
              <button
                onClick={() => setPage((n) => Math.max(1, n - 1))}
                disabled={page <= 1 || loading}
                className="btn-secondary btn-sm px-4 disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-ink-500">
                第 {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页 · 共 {total} 条
              </span>
              <button
                onClick={() => setPage((n) => n + 1)}
                disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                className="btn-secondary btn-sm px-4 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
