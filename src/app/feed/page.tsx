'use client';

import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { Loading, Empty, ErrorBox } from '@/components/ui';
import { FeedCardSkeleton } from '@/components/Skeleton';

export default function FeedPage() {
  const { data, loading, error, reload } = useApi<{ items: any[] }>('/feed', []);
  const items = data?.items || [];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🤝</div>
          <p className="text-ink-500 mb-4">还没有关注动态，去关注一些弟兄姐妹吧</p>
          <Link href="/friends" className="btn-primary px-5 py-2.5 text-sm">发现弟兄姐妹</Link>
        </div>
      ) : null}

      <div className="space-y-4 mt-2">
        {items.map((it) =>
          it.type === 'content' ? (
            <Link key={`c-${it.data.id}`} href={`/contents/${it.data.id}`} className="block bg-white rounded-2xl p-4 border border-ink-100 card-hover">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{it.data.cover?.startsWith('http') ? '📄' : it.data.cover || '📄'}</span>
                <h3 className="font-semibold text-ink-900 truncate">{it.data.title}</h3>
              </div>
              <p className="text-sm text-ink-500 line-clamp-2">{it.data.excerpt || it.data.body}</p>
              <p className="text-xs text-ink-400 mt-2">
                {it.data.author?.displayName} · ❤️ {it.data.likeCount} · 💬 {it.data.commentCount}
              </p>
            </Link>
          ) : (
            <div key={`p-${it.data.id}`} className="bg-white rounded-2xl p-4 border border-ink-100">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0"
                  style={{ background: it.data.user?.avatarColor || '#3d52d9' }}
                >
                  {(it.data.user?.displayName || '?').slice(0, 1)}
                </span>
                <span className="text-sm font-medium text-ink-700">{it.data.user?.displayName}</span>
                <span className="text-xs text-ink-400">发起代祷</span>
              </div>
              <p className="text-sm text-ink-700 whitespace-pre-wrap">{it.data.body}</p>
              <p className="text-xs text-ink-400 mt-2">🙏 {it.data.amenCount} 阿们</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
