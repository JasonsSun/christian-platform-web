/** ISR: 页面 HTML 缓存 300s,弱网下避免每次实时渲染 */
export const revalidate = 300;

import type { Metadata } from 'next';
import { one } from '@/server/db';
import { ogCardMetadata } from '@/lib/og';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const row = await one<{ title: string; author: string; lyrics: string; category: string }>(
      `SELECT title, author, lyrics, category FROM songs WHERE id = ?`,
      [params.id]
    );
    if (!row?.title) return {};

    const firstLines = (row.lyrics || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' / ');

    return ogCardMetadata({
      title: row.title,
      description: firstLines,
      kind: row.category || '诗歌',
      meta: row.author ? `《${row.title}》· ${row.author}` : `《${row.title}》`,
      path: `/songs/${params.id}`,
    });
  } catch {
    return {};
  }
}

export default function SongDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
