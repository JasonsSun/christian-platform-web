'use client';

import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { Loading, Empty, ErrorBox } from '@/components/ui';
import { FeedCardSkeleton } from '@/components/Skeleton';
import { Glyph, IconChatDots, IconDocument, IconHandshake, IconHeart, IconPray } from '@/components/icons';

export default function FeedPage() {
  const { data, loading, error, reload } = useApi<{ items: any[] }>('/feed', []);
  const items = data?.items || [];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* eyebrow 压在标题上，让订阅流这一屏也有栏目感而不是一句裸标题 */}
      <div className="eyebrow mb-2">MY FEED</div>
      <h1 className="font-display text-2xl font-bold text-ink-900 mb-1">关注动态</h1>
      <p className="text-sm text-ink-500 mb-6">你关注的弟兄姐妹发布的内容与代祷，按时间合并呈现。</p>

      {loading ? (
        <div className="space-y-4 mt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <FeedCardSkeleton key={i} />
          ))}
        </div>
      ) : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {!loading && !items.length ? (
        <div className="bg-white rounded-3xl border border-dashed border-ink-200 px-6 py-16 text-center">
          <span className="inline-flex w-12 h-12 rounded-2xl bg-ink-50 text-ink-400 items-center justify-center mb-3">
            <IconHandshake className="w-6 h-6" strokeWidth={1.6} />
          </span>
          <p className="text-ink-500 mb-4">还没有关注动态，去关注一些弟兄姐妹吧</p>
          <Link href="/friends" className="btn-primary px-5 py-2.5 text-sm">发现弟兄姐妹</Link>
        </div>
      ) : null}

      <div data-reveal-group className="space-y-4 mt-2">
        {items.map((it) =>
          it.type === 'content' ? (
            <Link
              key={`c-${it.data.id}`}
              href={`/contents/${it.data.id}`}
              data-spot
              className="spot card-hover card-tech block rounded-2xl p-4 border border-ink-100"
            >
              <div className="flex items-center gap-2 mb-1 min-w-0">
                <span className="text-ink-500 flex-shrink-0">
                  {it.data.cover?.startsWith('http') ? (
                    <IconDocument className="w-5 h-5" strokeWidth={1.6} />
                  ) : (
                    <Glyph glyph={it.data.cover || '📄'} className="w-5 h-5" />
                  )}
                </span>
                <h3 className="font-semibold text-ink-900 truncate">{it.data.title}</h3>
              </div>
              <p className="text-sm text-ink-500 line-clamp-2">{it.data.excerpt || it.data.body}</p>
              <p className="flex items-center gap-1.5 text-xs text-ink-400 mt-2">
                <span className="truncate">{it.data.author?.displayName}</span>
                <span aria-hidden="true">·</span>
                <IconHeart className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
                <span className="num">{it.data.likeCount}</span>
                <IconChatDots className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
                <span className="num">{it.data.commentCount}</span>
              </p>
            </Link>
          ) : (
            <div key={`p-${it.data.id}`} data-spot className="spot bg-white rounded-2xl p-4 shadow-soft border border-ink-100">
              <div className="flex items-center gap-2 mb-1 min-w-0">
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0"
                  data-user-id={it.data.user?.id}
                  style={{ background: it.data.user?.avatarColor || '#3d52d9' }}
                >
                  {(it.data.user?.displayName || '?').slice(0, 1)}
                </span>
                <span className="text-sm font-medium text-ink-700 truncate">{it.data.user?.displayName}</span>
                <span className="text-xs text-ink-400 shrink-0">发起代祷</span>
              </div>
              <p className="text-sm text-ink-700 whitespace-pre-wrap">{it.data.body}</p>
              <p className="flex items-center gap-1.5 text-xs text-ink-400 mt-2">
                <IconPray className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
                <span className="num">{it.data.amenCount}</span> 阿们
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
