'use client';

import Link from 'next/link';
import { apiDelete, qs } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { Glyph, IconChatDots, IconHeart } from '@/components/icons';
import { contentStatusLabel } from '@/lib/labels';
import type { ContentItem } from '@/lib/types';
import { SkeletonGrid, ErrorBlock, EmptyBlock } from './shared';

/** 我发布的内容(个人中心高频 tab,从 me/page.tsx 抽出,静态引入保留首屏) */
export function MyContents() {
  const confirmNav = useConfirmNav();
  const notice = useNotice();
  const { data, loading, error, reload } = useApi<{ items: ContentItem[] }>(
    `/contents${qs({ status: 'mine', pageSize: 30 })}`,
    []
  );
  const items = data?.items || [];
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0)
    return <EmptyBlock text="还没有发布内容" action={{ label: '去发布', href: '/community/create' }} />;

  async function remove(c: ContentItem) {
    confirmNav({
      title: '删除内容',
      desc: `确定删除《${c.title}》吗？删除后不可恢复。`,
      confirmText: '删除',
      cancelText: '取消',
      danger: true,
      back: '/me?tab=contents',
      action: 'content.delete',
      params: { id: c.id },
      onConfirm: async () => {
        await apiDelete(`/contents/${c.id}`);
        notice.success('内容已删除');
        reload();
      },
    });
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((c) => (
        <div key={c.id} className="bg-white card-tech rounded-2xl p-4 border border-ink-100 flex flex-col">
          <Link href={`/contents/${c.id}`} className="block flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl leading-none flex items-center flex-shrink-0 text-ink-500">
                <Glyph glyph={c.cover?.startsWith('http') ? '📄' : c.cover || '📄'} className="w-6 h-6" />
              </span>
              <h3 className="font-semibold text-ink-900 truncate">{c.title}</h3>
            </div>
            <p className="text-sm text-ink-500 line-clamp-2">{c.excerpt || c.body}</p>
            <div className="flex items-center gap-3 mt-3 text-xs text-ink-400">
              <span className="inline-flex items-center gap-1">
                <IconHeart className="w-[14px] h-[14px]" strokeWidth={1.6} />
                <span className="sr-only">点赞</span>
                <span className="num">{c.likeCount}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <IconChatDots className="w-[14px] h-[14px]" strokeWidth={1.6} />
                <span className="sr-only">评论</span>
                <span className="num">{c.commentCount}</span>
              </span>
              <span className="ml-auto px-2 py-0.5 rounded-full border border-ink-200 text-ink-500 whitespace-nowrap">
                {contentStatusLabel(c.status)}
              </span>
            </div>
          </Link>
          <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-ink-100">
            {/* 裸文字链在手机上只有 28px 宽，按不准；统一成后台那套 chip 词表 */}
            <Link href={`/community/create?edit=${c.id}`} className="btn-chip">
              编辑
            </Link>
            <button onClick={() => remove(c)} className="btn-chip btn-chip-danger">
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
