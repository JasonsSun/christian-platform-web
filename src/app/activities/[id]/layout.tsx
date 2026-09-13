/** ISR: 页面 HTML 缓存 60s,弱网下避免每次实时渲染 */
export const revalidate = 60;

import type { Metadata } from 'next';
import { one } from '@/server/db';
import { ogCardMetadata } from '@/lib/og';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const row = await one<{ title: string; description: string; city: string; when_text: string }>(
      `SELECT title, description, city, DATE_FORMAT(start_at, '%m-%d %H:%i') AS when_text
       FROM activities WHERE id = ?`,
      [params.id]
    );
    if (!row?.title) return {};
    return ogCardMetadata({
      title: row.title,
      description: (row.description || '').replace(/\s+/g, ' ').trim(),
      kind: '活动',
      meta: [row.when_text, row.city].filter(Boolean).join(' · '),
      path: `/activities/${params.id}`,
    });
  } catch {
    return {};
  }
}

export default function ActivityDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
