'use client';

import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import type { SongItem } from '@/lib/types';
import { IconMusicNote } from '@/components/icons';
import { SkeletonGrid, ErrorBlock, EmptyBlock } from './shared';

/** 我收藏的诗歌(个人中心高频 tab,从 me/page.tsx 抽出,静态引入保留首屏) */
export function MyFavorites() {
  const { data, loading, error, reload } = useApi<{ items: SongItem[] }>(`/songs/favorites`, []);
  const items = data?.items || [];
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0)
    return <EmptyBlock text="还没有收藏任何诗歌" action={{ label: '去发现诗歌', href: '/songs' }} />;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((s) => (
        <Link
          key={s.id}
          href={`/songs/${s.id}`}
          className="bg-white card-tech rounded-2xl p-4 border border-ink-100"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold-500 to-gold-400 text-white flex items-center justify-center flex-shrink-0">
              <IconMusicNote className="w-5 h-5" strokeWidth={1.6} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-ink-900 truncate">{s.title}</h3>
              <p className="text-xs text-ink-500 mt-0.5">{s.author || '佚名'} · {s.category || '诗歌'}</p>
            </div>
          </div>
          {s.tags && s.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {s.tags.slice(0, 3).map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 text-xs">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
