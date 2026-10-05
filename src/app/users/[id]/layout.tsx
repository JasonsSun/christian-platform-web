/** ISR: 页面 HTML 缓存 300s,弱网下避免每次实时渲染 */
export const revalidate = 300;

import type { Metadata } from 'next';
import { one } from '@/server/db';
import { ogCardMetadata } from '@/lib/og';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const row = await one<{ display_name: string; username: string; bio: string }>(
      `SELECT display_name, username, bio FROM users WHERE id = ?`,
      [params.id]
    );
    const name = row?.display_name || row?.username;
    if (!name) return {};
    const bio = (row?.bio || '').trim().slice(0, 90) || undefined;
    return ogCardMetadata({
      title: `${name} 的主页`,
      description: bio,
      kind: '成员',
      meta: undefined,
      path: `/users/${params.id}`,
    });
  } catch {
    return {};
  }
}

export default function UserProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
