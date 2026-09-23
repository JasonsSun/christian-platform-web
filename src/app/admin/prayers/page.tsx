'use client';

import { useState } from 'react';
import { apiDelete, qs } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useConfirmNav } from '@/lib/confirm';
import { useNotice } from '@/lib/notice';
import { timeAgo } from '@/lib/format';
import { canEnterAdmin, AdminLayout, SectionTitle, StatCard, Badge, Loading, TableSkeleton, TableShell, Th, Empty, ErrorBox, PageHead, Toolbar, Pagination, AccessState } from '../_components';

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

  const isStaff = canEnterAdmin(user, '/admin/prayers');
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

  if (!user) {
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="代祷管理只对代祷模块的审核员与管理员开放，请先用管理账号登录。" href="/login?next=/admin/prayers" />
      </AdminLayout>
    );
  }

  if (!isStaff) {
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限访问" desc="需要代祷模块的审核权限，或管理员账号，才能查看与移除代祷。" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHead
        eyebrow="社交 · 代祷"
        title="代祷墙管理"
        sub="巡查并移除违规违法内容。默认按发布时间倒序，「长文」档用于优先排查广告与灌水。"
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6" data-reveal-group>
        <StatCard title="代祷总数" value={stats?.total ?? '—'} />
        <StatCard title="已蒙应允" value={stats?.answered ?? '—'} />
        <StatCard title="长文（≥300字）" value={stats?.longBody ?? '—'} accent={(stats?.longBody ?? 0) > 0} />
      </div>

      {/* 筛选 */}
      <Toolbar>
        {SCOPES.map((s) => (
          <button
            key={s.key}
            onClick={() => { setScope(s.key); setPage(1); }}
            aria-pressed={scope === s.key}
            className={`min-h-11 lg:min-h-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              scope === s.key ? 'bg-primary-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
            }`}
          >
            {s.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <input
            aria-label="搜索代祷内容 / 发布人"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setQ(kw.trim()); setPage(1); } }}
            placeholder="搜索内容 / 发布人…"
            className="input-styled input-sm min-h-11 lg:min-h-0 text-sm w-56"
          />
          <button onClick={() => { setQ(kw.trim()); setPage(1); }} className="btn-secondary btn-sm min-h-11 lg:min-h-0 text-sm px-4">
            搜索
          </button>
          {q && (
            <button
              onClick={() => { setKw(''); setQ(''); setPage(1); }}
              className="min-h-11 lg:min-h-0 text-sm text-ink-500 hover:text-ink-700"
            >
              清除
            </button>
          )}
        </div>
      </Toolbar>

      {loading && items.length === 0 ? (
        <TableSkeleton cols={6} />
      ) : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <>
          <TableShell busy={loading}>
            {items.length === 0 ? <div className="p-4"><Empty label={q ? `没有匹配「${q}」的代祷` : '暂无代祷'} /></div> : (
              <table className="w-full min-w-[820px] text-sm">
                <caption className="sr-only">代祷墙管理</caption>
                <thead className="bg-ink-50 text-ink-600">
                  <tr>
                    <Th>发布人</Th>
                    <Th>内容</Th>
                    <Th className="text-center">阿们</Th>
                    <Th className="text-center">状态</Th>
                    <Th className="whitespace-nowrap">时间</Th>
                    <Th className="text-right">操作</Th>
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
          </TableShell>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 mt-5 text-sm">
              <button
                onClick={() => setPage((n) => Math.max(1, n - 1))}
                disabled={page <= 1 || loading}
                className="btn-secondary btn-sm min-h-11 lg:min-h-0 px-4 disabled:opacity-40"
              >
                上一页
              </button>
              <span className="num text-ink-500">
                第 {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页 · 共 {total} 条
              </span>
              <button
                onClick={() => setPage((n) => n + 1)}
                disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                className="btn-secondary btn-sm min-h-11 lg:min-h-0 px-4 disabled:opacity-40"
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
