'use client';

import { useState, useMemo, useId } from 'react';
import Link from 'next/link';
import { apiDelete, apiPatch, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { CONTENT_TYPE_LABEL, CONTENT_STATUS_LABEL } from '@/lib/labels';
import { useEscape, useDialogFocus } from '@/lib/a11y';
import Portal from '@/components/Portal';
import { AdminLayout, Badge, Loading, TableSkeleton, TableShell, Th, Empty, ErrorBox, PageHead, Toolbar, AdminSelect, Pagination, AccessState } from '../_components';

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
  { key: 'rejected', label: '已驳回', tone: 'red' as const },
];

const TYPE_LABEL = CONTENT_TYPE_LABEL;

const STATUS_LABEL: Record<string, string> = CONTENT_STATUS_LABEL;

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
  // 删除确认弹层：Esc 可关、焦点圈在里面。生成中的删除不许关，否则点了确认却没回执。
  useEscape(pendingDelete.length > 0 && !bulk.pending, () => setPendingDelete([]));
  const deleteDlgRef = useDialogFocus(pendingDelete.length > 0);
  const deleteTitleId = useId();

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
  if (!user)
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="内容总视图只对管理员与审核员开放，请先用管理账号登录。" href="/login" />
      </AdminLayout>
    );
  if (!canSee)
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限访问" desc="需要内容模块审核员或管理员账号，才能查看与操作全站内容。" />
      </AdminLayout>
    );

  return (
    <AdminLayout>
      <PageHead
        eyebrow="内容 · 治理"
        title="内容管理"
        sub="全站内容的总视图：搜索、按状态与类型筛选、批量上下架与删除。写操作都会记入审计日志。"
        actions={
          <Link href="/admin/reviews" className="btn-secondary btn-sm min-h-11 lg:min-h-0 text-xs">
            去审核队列
          </Link>
        }
      />

      {/* 状态页签 */}
      <div className="flex flex-wrap gap-2 mb-4 border-b border-ink-200">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); setPage(1); setSelected([]); }}
            aria-current={status === t.key ? 'page' : undefined}
            className={`min-h-11 lg:min-h-0 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
              status === t.key ? 'border-primary-500 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-700'
            }`}
          >
            {t.label}
            {t.key !== 'all' && counts[t.key] ? (
              <span className="num ml-1.5 text-xs text-ink-400">{counts[t.key]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* 筛选栏 */}
      <Toolbar>
        <form
          className="flex gap-2 flex-1 min-w-[240px]"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(kw.trim()); }}
        >
          <input
            aria-label="搜索标题 / 正文 / 标签 / 作者"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索标题 / 正文 / 标签 / 作者"
            className="input-styled input-sm min-h-11 lg:min-h-0 flex-1"
          />
          <button type="submit" className="btn-secondary btn-sm min-h-11 lg:min-h-0 text-xs flex-shrink-0">搜索</button>
          {search && (
            <button type="button" className="btn-secondary btn-sm min-h-11 lg:min-h-0 text-xs flex-shrink-0" onClick={() => { setKw(''); setSearch(''); setPage(1); }}>
              清空
            </button>
          )}
        </form>
        <AdminSelect
          value={type}
          label="按内容类型筛选"
          onChange={(v) => { setType(v); setPage(1); setSelected([]); }}
          options={[
            { value: 'all', label: '全部类型' },
            ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
      </Toolbar>

      {/* 批量操作条 */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-primary-50 border border-primary-100">
          <span className="text-sm font-semibold text-primary-700">已选 <span className="num">{selected.length}</span> 条</span>
          <button onClick={() => doBulk('published')} disabled={bulk.pending} className="btn-primary btn-sm min-h-11 lg:min-h-0 text-xs disabled:opacity-70">批量上架</button>
          <button onClick={() => doBulk('rejected')} disabled={bulk.pending} className="btn-secondary btn-sm min-h-11 lg:min-h-0 text-xs disabled:opacity-70">批量下架</button>
          <button onClick={() => doBulk('pending_review')} disabled={bulk.pending} className="btn-secondary btn-sm min-h-11 lg:min-h-0 text-xs disabled:opacity-70">退回待审</button>
          <button onClick={() => setPendingDelete(selected)} disabled={bulk.pending} className="btn-chip btn-chip-danger">删除 {selected.length} 条</button>
          <button onClick={() => setSelected([])} className="min-h-11 lg:min-h-0 text-xs text-ink-500 ml-auto">取消选择</button>
          {bulk.error && <p role="alert" className="w-full text-xs text-rose-600">{bulk.error}</p>}
        </div>
      )}

      {/* 刷新时不再整块换成「加载中…」：表格被抹成一行字再弹回来，读到的行全丢了 */}
      {loading && !data && <TableSkeleton rows={8} cols={8} />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && !loading && items.length === 0 && (
        <Empty icon="search" label="没有符合条件的内容" hint="换个状态页签，或清空搜索词再试" />
      )}

      {!!data && items.length > 0 && (
        <>
          <TableShell busy={loading}>
            {/* 窄屏下让表格横向滚动，而不是把 8 列压成 14px 宽的竖排（探针实测 390px 下
                作者列 14px、标题列 28px，一个名字换 3~6 行）。min-w 按固定列宽合计 648px
                再加标题的 180px 取的，和 /admin/users 同一套写法。 */}
            <table className="w-full min-w-[920px] text-sm">
              <caption className="sr-only">内容管理</caption>
              <thead className="bg-ink-50 text-ink-600">
                <tr className="whitespace-nowrap">
                  <th scope="col" className="w-10 px-3 py-3">
                    <label className="tap-box align-middle">
                      <input
                        aria-label="全选本页内容"
                        type="checkbox"
                        className="h-5 w-5"
                        checked={allChecked}
                        onChange={() => setSelected(allChecked ? [] : items.map((i) => i.id))}
                      />
                    </label>
                  </th>
                  <Th>标题</Th>
                  <Th className="w-24">作者</Th>
                  <Th className="w-20">类型</Th>
                  <Th className="w-24">状态</Th>
                  <Th className="w-44 text-right">数据</Th>
                  <Th className="w-24">时间</Th>
                  <Th className="w-32 text-right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-t border-ink-100 hover:bg-ink-50/60">
                    <td className="px-3 py-3">
                      <label className="tap-box align-middle">
                        <input aria-label={`选择内容「${c.title}」`} type="checkbox" className="h-5 w-5" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                      </label>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/contents/${c.id}`} className="font-medium text-ink-800 hover:text-primary-600 line-clamp-1 py-3 -my-3">
                        {c.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {c.tags.split(/[,，]/).filter(Boolean).slice(0, 3).map((t) => (
                          <span key={t} className="px-1.5 py-0.5 rounded bg-ink-100 text-ink-600 text-[11px]">{t}</span>
                        ))}
                        {c.openReports > 0 && (
                          <span className="num px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[11px] font-medium">
                            {c.openReports} 条未处理举报
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/users/${c.author.id}`} className="text-ink-600 hover:text-primary-600 py-3 -my-3">
                        {c.author.displayName}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-ink-600">{TYPE_LABEL[c.contentType] || c.contentType}</td>
                    <td className="px-3 py-3">
                      <Badge tone={c.status === 'published' ? 'green' : c.status === 'pending_review' ? 'gold' : c.status === 'rejected' ? 'red' : 'gray'}>
                        {STATUS_LABEL[c.status] || c.status}
                      </Badge>
                    </td>
                    {/* 数字前挂 emoji 在表格里既花又容易掉字（不同系统字体没有同一颗眼睛），
                        改写成「浏览 20 · 点赞 0」，读屏也不用再补 sr-only */}
                    <td className="num px-3 py-3 text-right text-xs text-ink-500 whitespace-nowrap">
                      浏览 {c.viewCount} · 点赞 {c.likeCount} · 评论 {c.commentCount}
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-400 whitespace-nowrap">{timeAgo(c.createdAt)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {c.status === 'published' ? (
                        <button onClick={() => doBulk('rejected', [c.id])} disabled={bulk.pending} className="btn-chip">下架</button>
                      ) : (
                        <button onClick={() => doBulk('published', [c.id])} disabled={bulk.pending} className="btn-chip btn-chip-accent">上架</button>
                      )}
                      <button onClick={() => setPendingDelete([c.id])} className="btn-chip btn-chip-danger ml-1.5">删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <Pagination total={total} page={page} pageSize={pageSize} onPage={setPage} />
        </>
      )}

      {/* 删除确认 */}
      {pendingDelete.length > 0 && (
        <Portal>
        <div
          ref={deleteDlgRef}
          data-guard="admin-contents-delete-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={deleteTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(17,24,39,0.45)' }}
          onClick={() => { if (!bulk.pending) setPendingDelete([]); }}
        >
          <div className="bg-white rounded-2xl shadow-card-hover max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 id={deleteTitleId} className="font-display text-lg font-bold text-ink-900 mb-2">确认删除内容</h3>
            <p className="text-sm text-ink-500 mb-4">
              将删除 <span className="font-semibold text-rose-600">{pendingDelete.length}</span> 篇内容，其下的评论、点赞与收藏会一并清除。
              此操作不可撤销，建议优先使用「下架」。
            </p>
            {bulk.error && <p role="alert" className="text-xs text-rose-600 mb-3">{bulk.error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setPendingDelete([])} disabled={bulk.pending} className="flex-1 py-2.5 rounded-xl border border-ink-200 text-ink-600 text-sm disabled:opacity-50">取消</button>
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
        </Portal>
      )}
    </AdminLayout>
  );
}
