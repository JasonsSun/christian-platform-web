'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { apiDelete, apiPatch, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { AdminLayout, Badge, Loading, Empty, ErrorBox } from '../_components';

interface ContentRow {
  id: string;
  title: string;
  contentType: string;
  status: string;
  scope: string;
  region: string;
  tags: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  publishedAt: string | null;
  openReports: number;
  author: { id: string; username: string; displayName: string; avatarColor: string };
}

const STATUS_TABS = [
  { key: 'all', label: '全部', tone: 'gray' as const },
  { key: 'published', label: '已发布', tone: 'green' as const },
  { key: 'pending_review', label: '待审核', tone: 'gold' as const },
  { key: 'draft', label: '草稿', tone: 'gray' as const },
  { key: 'rejected', label: '已下架', tone: 'red' as const },
];

const TYPE_LABEL: Record<string, string> = {
  article: '文章',
  testimony: '见证',
  devotion: '灵修',
  media: '媒体',
  prayer: '代祷',
};

const STATUS_LABEL: Record<string, string> = {
  published: '已发布',
  pending_review: '待审核',
  draft: '草稿',
  rejected: '已下架',
};

export default function AdminContentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [kw, setKw] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const canSee = !!user && (user.role === 'admin' || user.role === 'moderator');
  const path = useMemo(
    () => (canSee ? `/admin/contents${qs({ status, type, q: search, page, pageSize })}` : null),
    [canSee, status, type, search, page]
  );
  const { data, loading, error, reload } = useApi<{
    items: ContentRow[];
    total: number;
    page: number;
    pageSize: number;
    statusCounts: Record<string, number>;
  }>(path, [path]);

  const [selected, setSelected] = useState<string[]>([]);
  const bulk = useAction();
  const [pendingDelete, setPendingDelete] = useState<string[]>([]);

  const items = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const counts = data?.statusCounts || {};

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allChecked = items.length > 0 && items.every((i) => selected.includes(i.id));

  /** ids 省略时作用于当前勾选；传了就只作用于这几条（行内操作用） */
  async function doBulk(next: string, ids?: string[]) {
    const target = ids && ids.length ? ids : selected;
    if (!target.length) return;
    const res = await bulk.run(() => apiPatch('/admin/contents', { ids: target, status: next }));
    if (res) { setSelected([]); reload(); }
  }

  async function doDelete(ids: string[]) {
    if (!ids.length) return;
    const res = await bulk.run(() => apiDelete(`/admin/contents?ids=${ids.join(',')}`));
    if (res) { setSelected([]); setPendingDelete([]); if (page > totalPages) setPage(totalPages); reload(); }
  }

  if (authLoading) return <AdminLayout><Loading /></AdminLayout>;
  if (!user) return <AdminLayout><Empty label="请先登录" /></AdminLayout>;
  if (!canSee) return <AdminLayout><Empty label="无权限访问（需要内容模块审核员或管理员）" /></AdminLayout>;

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="font-display text-2xl font-bold text-ink-900">内容管理</h1>
        <Link href="/admin/reviews" className="text-sm text-primary-600 hover:underline flex-shrink-0">
          去审核队列 →
        </Link>
      </div>
      <p className="text-ink-500 text-sm mb-5">
        全站内容的总视图：搜索、按状态与类型筛选、批量上下架与删除。写操作都会记入审计日志。
      </p>

      {/* 状态页签 */}
      <div className="flex flex-wrap gap-2 mb-4 border-b border-ink-200">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); setPage(1); setSelected([]); }}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              status === t.key ? 'border-primary-500 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-700'
            }`}
          >
            {t.label}
            {t.key !== 'all' && counts[t.key] ? (
              <span className="ml-1.5 text-xs text-ink-400">{counts[t.key]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <form
          className="flex gap-2 flex-1 min-w-[240px]"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(kw.trim()); }}
        >
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索标题 / 正文 / 标签 / 作者"
            className="input-styled flex-1"
          />
          <button type="submit" className="btn-secondary text-sm flex-shrink-0">搜索</button>
          {search && (
            <button type="button" className="btn-secondary text-sm flex-shrink-0" onClick={() => { setKw(''); setSearch(''); setPage(1); }}>
              清空
            </button>
          )}
        </form>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); setSelected([]); }}
          className="input-styled w-32"
        >
          <option value="all">全部类型</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* 批量操作条 */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-primary-50 border border-primary-100">
          <span className="text-sm font-semibold text-primary-700">已选 {selected.length} 条</span>
          <button onClick={() => doBulk('published')} disabled={bulk.pending} className="btn-primary text-xs disabled:opacity-70">批量上架</button>
          <button onClick={() => doBulk('rejected')} disabled={bulk.pending} className="btn-secondary text-xs disabled:opacity-70">批量下架</button>
          <button onClick={() => doBulk('pending_review')} disabled={bulk.pending} className="btn-secondary text-xs disabled:opacity-70">退回待审</button>
          <button onClick={() => setPendingDelete(selected)} disabled={bulk.pending} className="btn-secondary text-xs text-rose-600 border-rose-200 disabled:opacity-70">删除</button>
          <button onClick={() => setSelected([])} className="text-xs text-ink-500 ml-auto">取消选择</button>
          {bulk.error && <p className="w-full text-xs text-rose-600">{bulk.error}</p>}
        </div>
      )}

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && !error && items.length === 0 && <Empty label="没有符合条件的内容" />}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="bg-white rounded-2xl border border-ink-100 shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500 text-xs">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={() => setSelected(allChecked ? [] : items.map((i) => i.id))}
                      aria-label="全选本页"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium">标题</th>
                  <th className="text-left px-3 py-2.5 font-medium w-24">作者</th>
                  <th className="text-left px-3 py-2.5 font-medium w-20">类型</th>
                  <th className="text-left px-3 py-2.5 font-medium w-24">状态</th>
                  <th className="text-right px-3 py-2.5 font-medium w-28">数据</th>
                  <th className="text-left px-3 py-2.5 font-medium w-24">时间</th>
                  <th className="text-right px-3 py-2.5 font-medium w-32">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-t border-ink-100 hover:bg-ink-50/60">
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`选择 ${c.title}`} />
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/contents/${c.id}`} className="font-medium text-ink-800 hover:text-primary-600 line-clamp-1">
                        {c.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {c.tags.split(/[,，]/).filter(Boolean).slice(0, 3).map((t) => (
                          <span key={t} className="px-1.5 py-0.5 rounded bg-ink-100 text-ink-500 text-[11px]">{t}</span>
                        ))}
                        {c.openReports > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[11px] font-medium">
                            {c.openReports} 条未处理举报
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/users/${c.author.id}`} className="text-ink-600 hover:text-primary-600">
                        {c.author.displayName}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-ink-600">{TYPE_LABEL[c.contentType] || c.contentType}</td>
                    <td className="px-3 py-3">
                      <Badge tone={c.status === 'published' ? 'green' : c.status === 'pending_review' ? 'gold' : c.status === 'rejected' ? 'red' : 'gray'}>
                        {STATUS_LABEL[c.status] || c.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-ink-500">
                      👍{c.likeCount} 💬{c.commentCount} 👁{c.viewCount}
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-400">{timeAgo(c.createdAt)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {c.status === 'published' ? (
                        <button onClick={() => doBulk('rejected', [c.id])} disabled={bulk.pending} className="text-xs text-ink-500 hover:text-rose-600">下架</button>
                      ) : (
                        <button onClick={() => doBulk('published', [c.id])} disabled={bulk.pending} className="text-xs text-primary-600 hover:underline">上架</button>
                      )}
                      <span className="text-ink-300 mx-1.5">·</span>
                      <button onClick={() => setPendingDelete([c.id])} className="text-xs text-ink-500 hover:text-rose-600">删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-ink-500">共 {total} 条 · 第 {page}/{totalPages} 页</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="btn-secondary text-xs disabled:opacity-50">上一页</button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-secondary text-xs disabled:opacity-50">下一页</button>
            </div>
          </div>
        </>
      )}

      {/* 删除确认 */}
      {pendingDelete.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(17,24,39,0.45)' }} onClick={() => setPendingDelete([])}>
          <div className="bg-white rounded-2xl shadow-card-hover max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-ink-900 mb-2">确认删除内容</h3>
            <p className="text-sm text-ink-500 mb-4">
              将删除 <span className="font-semibold text-rose-600">{pendingDelete.length}</span> 篇内容，其下的评论、点赞与收藏会一并清除。
              此操作不可撤销，建议优先使用「下架」。
            </p>
            {bulk.error && <p className="text-xs text-rose-600 mb-3">{bulk.error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setPendingDelete([])} className="flex-1 py-2.5 rounded-xl border border-ink-200 text-ink-600 text-sm">取消</button>
              <button
                onClick={() => doDelete(pendingDelete)}
                disabled={bulk.pending}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-70"
              >
                {bulk.pending ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
