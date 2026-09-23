'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiDelete, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { canEnterAdmin, AdminLayout, Loading, Empty, ErrorBox, Badge, PageHead, Pagination, Toolbar, AccessState } from '../_components';
import { IconChatDots } from '@/components/icons';

interface CommentRow {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; username: string; displayName: string; avatarColor: string };
  content: { id: string; title: string; status: string };
}

export default function AdminCommentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [kw, setKw] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const canSee = canEnterAdmin(user, '/admin/comments');
  const { data, loading, error, reload } = useApi<{ items: CommentRow[]; total: number }>(
    canSee ? `/admin/comments${qs({ q: search, page, pageSize })}` : null,
    [canSee, search, page]
  );

  const [selected, setSelected] = useState<string[]>([]);
  const [confirmIds, setConfirmIds] = useState<string[]>([]);
  const del = useAction();

  const items = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allChecked = items.length > 0 && items.every((i) => selected.includes(i.id));

  async function doDelete(ids: string[]) {
    if (!ids.length) return;
    const res = await del.run(() => apiDelete(`/admin/comments?ids=${ids.join(',')}`));
    if (res) {
      setSelected([]);
      setConfirmIds([]);
      if (page > totalPages) setPage(totalPages);
      reload();
    }
  }

  if (authLoading) return <AdminLayout><Loading /></AdminLayout>;
  if (!user)
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="评论审核只对内容模块审核员与管理员开放，请先用管理账号登录。" href="/login?next=/admin/comments" />
      </AdminLayout>
    );
  if (!canSee)
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限访问" desc="需要内容模块的审核员或管理员账号，才能删除与批量处置评论。" />
      </AdminLayout>
    );

  return (
    <AdminLayout>
      <PageHead
        eyebrow="内容 · 治理"
        title="评论管理"
        sub="全站评论总视图。删除后会回写所属内容的评论数，计数不会漂移。"
        actions={<button className="btn-secondary btn-sm min-h-11 lg:min-h-0" onClick={reload}>刷新</button>}
      />

      <Toolbar className="max-w-xl">
        <form
          className="flex flex-1 min-w-0 gap-2 items-stretch sm:items-center"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(kw.trim()); }}
        >
          <input
            aria-label="搜索评论内容 / 评论人 / 所属内容标题"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索评论内容 / 评论人 / 所属内容标题"
            className="input-styled input-sm min-h-11 lg:min-h-0 flex-1 min-w-0"
          />
          <button type="submit" className="btn-secondary text-sm min-h-11 lg:min-h-0 shrink-0">搜索</button>
          {search && (
            <button type="button" className="btn-secondary text-sm min-h-11 lg:min-h-0 shrink-0" onClick={() => { setKw(''); setSearch(''); setPage(1); }}>
              清空
            </button>
          )}
        </form>
      </Toolbar>

      {selected.length > 0 && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-primary-50 border border-primary-100">
          <span className="num text-sm font-semibold text-primary-700">已选 {selected.length} 条</span>
          <button onClick={() => setConfirmIds(selected)} className="btn-secondary btn-sm min-h-11 lg:min-h-0 text-xs text-rose-600 border-rose-200">批量删除</button>
          <button onClick={() => setSelected([])} className="min-h-11 lg:min-h-0 px-2 text-xs text-ink-500 ml-auto">取消选择</button>
        </div>
      )}

      {/* 搜索/翻页时 useApi 会留着上一页数据，整块列表不该消失 */}
      {loading && items.length === 0 && <Loading rows={4} />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && !error && items.length === 0 && (
        <Empty icon="search" label="没有符合条件的评论" hint="换个关键词，或清空筛选看全站最新评论" />
      )}

      {items.length > 0 && (
        <>
          <div
            data-reveal-group
            className={`space-y-3 transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}
          >
            <label className="flex items-center gap-2 text-xs text-ink-500 px-1 min-h-11">
              <input
                type="checkbox"
                className="h-5 w-5 cursor-pointer"
                checked={allChecked}
                onChange={() => setSelected(allChecked ? [] : items.map((i) => i.id))}
              />
              全选本页
            </label>
            {items.map((c) => (
              <div key={c.id} className="hair-top bg-white rounded-2xl p-4 border border-ink-100 shadow-soft">
                <div className="flex items-start gap-3">
                  {/* .tap-box 的负 margin 是不带 !important 的层外规则，站里的 mt-1 顶不过它，
                      所以这 4px 微调直接去掉：方框改为与首行文字顶对齐，实测更好看。 */}
                  <label className="tap-box">
                    <input
                      aria-label={`选择 ${c.author.displayName} 的评论`}
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={() => setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                      className="h-5 w-5"
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500 mb-1.5">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <IconChatDots className="w-3.5 h-3.5 shrink-0 text-ink-400" strokeWidth={1.6} />
                        <Link href={`/users/${c.author.id}`} className="font-medium text-ink-700 hover:text-primary-600 py-2.5 -my-2.5">
                          {c.author.displayName}
                        </Link>
                      </span>
                      <span>@{c.author.username}</span>
                      <span>·</span>
                      <span>{timeAgo(c.createdAt)}</span>
                      <span>·</span>
                      <span>
                        评论于{' '}
                        <Link href={`/contents/${c.content.id}`} className="text-primary-600 hover:underline py-2.5 -my-2.5">
                          {c.content.title}
                        </Link>
                      </span>
                      {c.content.status !== 'published' && (
                        <Badge tone="gray">{c.content.status === 'rejected' ? '内容已下架' : '内容未发布'}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-ink-700 whitespace-pre-wrap break-words">{c.body}</p>
                  </div>
                  <button
                    onClick={() => setConfirmIds([c.id])}
                    className="btn-chip btn-chip-danger flex-shrink-0"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>

          <Pagination total={total} page={page} pageSize={pageSize} onPage={setPage} />
        </>
      )}

      {confirmIds.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(17,24,39,0.45)' }} onClick={() => setConfirmIds([])}>
          <div className="bg-white rounded-2xl shadow-card-hover max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-ink-900 mb-2">确认删除评论</h3>
            <p className="text-sm text-ink-500 mb-4">
              将删除 <span className="font-semibold text-rose-600">{confirmIds.length}</span> 条评论，不可撤销。
            </p>
            {del.error && <p className="text-xs text-rose-600 mb-3">{del.error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setConfirmIds([])} className="flex-1 py-2.5 rounded-xl border border-ink-200 text-ink-600 text-sm">取消</button>
              <button
                onClick={() => doDelete(confirmIds)}
                disabled={del.pending}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-70"
              >
                {del.pending ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
