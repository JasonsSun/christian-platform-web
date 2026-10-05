/** ISR: 页面 HTML 缓存 300s,弱网下避免每次实时渲染 */
export const revalidate = 300;

import type { Metadata } from 'next';
import { one } from '@/server/db';
import { ogCardMetadata } from '@/lib/og';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const row = await one<{ title: string; speaker: string; scripture: string; description: string }>(
      `SELECT title, speaker, scripture, description FROM sermons WHERE id = ?`,
      [params.id]
    );
    if (!row?.title) return {};
    const desc = (row.description || '').trim().slice(0, 90) || undefined;
    const meta = [row.speaker, row.scripture].filter(Boolean).join(' · ') || undefined;
    return ogCardMetadata({
      title: row.title,
      description: desc,
      kind: '讲道',
      meta,
      path: `/sermons/${params.id}`,
    });
  } catch {
    return {};
  }
}

export default function SermonDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
