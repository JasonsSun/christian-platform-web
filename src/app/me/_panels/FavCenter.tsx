'use client';

import Link from 'next/link';

import { useApi } from '@/lib/useApi';

import type { ContentItem, SongItem } from '@/lib/types';

function FavSection({
  title,
  icon,
  count,
  empty,
  emptyHref,
  emptyLabel,
  children,
}: {
  title: string;
  icon: string;
  count: number;
  empty: string;
  emptyHref: string;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <h3 className="font-display text-lg font-bold text-ink-900">{title}</h3>
        <span className="text-xs text-ink-400">({count})</span>
      </div>
      {count === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl border border-ink-100">
          <p className="text-ink-500 mb-3">{empty}</p>
          <Link href={emptyHref} className="btn-primary">{emptyLabel}</Link>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** 统一收藏中心：聚合「收藏内容 + 收藏诗歌 + 读经书签」 */
export function MyFavCenter() {
  const { data: cf } = useApi<{ items: ContentItem[] }>(`/me/favorites`, []);
  const { data: sf } = useApi<{ items: SongItem[] }>(`/songs/favorites`, []);
  const { data: bm } = useApi<{
    items: { id: string; version: string; bookId: string; bookName: string; chapter: number; verse: number; note: string }[];
  }>(`/bible/bookmarks`, []);

  const contents = cf?.items || [];
  const songs = sf?.items || [];
  const bookmarks = bm?.items || [];

  return (
    <div className="space-y-8">
      <FavSection title="收藏的内容" icon="📚" count={contents.length} empty="还没有收藏任何内容" emptyHref="/community" emptyLabel="去发现内容">
        <div className="grid sm:grid-cols-2 gap-4">
          {contents.map((c) => (
            <Link key={c.id} href={`/contents/${c.id}`} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{c.cover?.startsWith('http') ? '📄' : c.cover || '📄'}</span>
                <h3 className="font-semibold text-ink-900 truncate">{c.title}</h3>
              </div>
              <p className="text-sm text-ink-500 line-clamp-2">{c.excerpt || c.body}</p>
            </Link>
          ))}
        </div>
      </FavSection>

      <FavSection title="收藏的诗歌" icon="🎵" count={songs.length} empty="还没有收藏任何诗歌" emptyHref="/songs" emptyLabel="去发现诗歌">
        <div className="grid sm:grid-cols-2 gap-4">
          {songs.map((s) => (
            <Link key={s.id} href={`/songs/${s.id}`} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold-500 to-gold-400 flex items-center justify-center text-xl flex-shrink-0">🎵</div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink-900 truncate">{s.title}</h3>
                  <p className="text-xs text-ink-500 mt-0.5">{s.author || '佚名'} · {s.category || '诗歌'}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </FavSection>

      <FavSection title="读经书签" icon="🔖" count={bookmarks.length} empty="还没有读经书签" emptyHref="/bible" emptyLabel="去读经">
        <div className="grid sm:grid-cols-2 gap-4">
          {bookmarks.map((b) => (
            <Link key={b.id} href={`/bible/${b.version}/${b.bookId}/${b.chapter}`} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 font-semibold flex-shrink-0">
                  {b.bookName.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink-900 truncate">
                    {b.bookName} 第 {b.chapter} 章{b.verse ? `:${b.verse}` : '（整章）'}
                  </h3>
                  {b.note && <p className="text-xs text-ink-500 mt-0.5 truncate">{b.note}</p>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </FavSection>
    </div>
  );
}
