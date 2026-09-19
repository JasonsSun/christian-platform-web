'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { apiDelete, apiPost, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import type { ContentItem } from '@/lib/types';
import { SkeletonGrid, ErrorBlock, EmptyBlock } from './shared';

/** 我的草稿(个人中心高频 tab,从 me/page.tsx 抽出,静态引入保留首屏) */
export function MyDrafts() {
  const { data, loading, error, reload } = useApi<{ items: ContentItem[]; total: number }>(
    `/contents${qs({ status: 'draft', pageSize: 30 })}`,
    []
  );
  const items = data?.items || [];
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { run } = useAction();
  const notice = useNotice();
  const confirmNav = useConfirmNav();

  const submit = useCallback(
    async (c: ContentItem) => {
      setSubmittingId(c.id);
      const res = await run(() => apiPost<{ ok: boolean }>(`/contents/${c.id}/submit`));
      setSubmittingId(null);
      if (res) {
        reload();
        notice.success('已提交，进入审核中');
      }
    },
    [run, reload, notice]
  );

  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0)
    return <EmptyBlock text="还没有草稿" action={{ label: '去创作', href: '/community/create' }} />;

  async function remove(c: ContentItem) {
    confirmNav({
      title: '删除草稿',
      desc: `确定删除草稿《${c.title || '未命名草稿'}》吗？删除后不可恢复。`,
      confirmText: '删除',
      cancelText: '取消',
      danger: true,
      back: '/me?tab=drafts',
      action: 'content.delete',
      params: { id: c.id },
      onConfirm: async () => {
        await apiDelete(`/contents/${c.id}`);
        notice.success('草稿已删除');
        reload();
      },
    });
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((c) => (
        <div key={c.id} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{c.cover?.startsWith('http') ? '📄' : c.cover || '📄'}</span>
            <h3 className="font-semibold text-ink-900 truncate">{c.title || '未命名草稿'}</h3>
          </div>
          <p className="text-sm text-ink-500 line-clamp-2">{c.excerpt || c.body || '（暂无内容）'}</p>
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={() => remove(c)}
              className="text-sm text-rose-500 hover:text-rose-600 hover:underline"
            >
              删除
            </button>
            {/* 「继续编辑」必须进编辑页；此前跳的是详情页，点进去只能看不能改 */}
            <Link href={`/community/create?edit=${c.id}`} className="btn-secondary btn-sm text-sm px-3">
              继续编辑
            </Link>
            <button
              onClick={() => submit(c)}
              disabled={submittingId === c.id}
              className="btn-primary btn-sm text-sm px-3 disabled:opacity-70"
            >
              {submittingId === c.id ? '提交中…' : '提交审核'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
