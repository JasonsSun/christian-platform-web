import type { Metadata } from 'next';
import { one } from '@/server/db';
import { ogCardMetadata } from '@/lib/og';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    // groups 是 MySQL 8.0 保留字，必须反引号包裹
    const row = await one<{ name: string; description: string; category: string; city: string }>(
      'SELECT name, description, category, city FROM `groups` WHERE id = ?',
      [params.id]
    );
    if (!row?.name) return {};
    return ogCardMetadata({
      title: row.name,
      description: (row.description || '').replace(/\s+/g, ' ').trim(),
      kind: '团契',
      meta: [row.city, row.category].filter(Boolean).join(' · '),
      path: `/groups/${params.id}`,
    });
  } catch {
    return {};
  }
}

export default function GroupDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
