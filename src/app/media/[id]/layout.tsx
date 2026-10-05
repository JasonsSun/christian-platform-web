/** ISR: 页面 HTML 缓存 300s,弱网下避免每次实时渲染 */
export const revalidate = 300;

import type { Metadata } from 'next';
import { one } from '@/server/db';
import { ogCardMetadata } from '@/lib/og';

const KIND_LABEL: Record<string, string> = {
  image: '图片',
  audio: '音频',
  video: '视频',
  score: '谱面',
  doc: '文档',
};

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const row = await one<{ title: string; description: string; kind: string }>(
      `SELECT title, description, kind FROM media_files WHERE id = ?`,
      [params.id]
    );
    if (!row?.title) return {};
    const desc = (row.description || '').trim().slice(0, 90) || undefined;
    return ogCardMetadata({
      title: row.title,
      description: desc,
      kind: KIND_LABEL[row.kind] || '资料',
      meta: undefined,
      path: `/media/${params.id}`,
    });
  } catch {
    return {};
  }
}

export default function MediaDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
