/** ISR: 页面 HTML 缓存 15s,弱网下避免每次实时渲染 */
export const revalidate = 15;

import type { Metadata } from 'next';
import { one } from '@/server/db';
import { ogCardMetadata } from '@/lib/og';

const STATUS_LABEL: Record<string, string> = {
  created: '即将开播',
  scheduled: '已排期',
  live: '正在直播',
  ended: '直播回放',
  cancelled: '已取消',
};

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const row = await one<{ title: string; description: string; status: string; owner_name: string }>(
      `SELECT r.title, r.description, r.status, u.display_name AS owner_name
       FROM live_rooms r LEFT JOIN users u ON u.id = r.owner_id
       WHERE r.id = ?`,
      [params.id]
    );
    if (!row?.title) return {};
    return ogCardMetadata({
      title: row.title,
      description: (row.description || '').replace(/\s+/g, ' ').trim(),
      kind: STATUS_LABEL[row.status] || '直播',
      meta: row.owner_name || '',
      path: `/live/${params.id}`,
    });
  } catch {
    return {};
  }
}

export default function LiveDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
