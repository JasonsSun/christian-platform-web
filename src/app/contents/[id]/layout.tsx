/** ISR: 页面 HTML 缓存 120s,弱网下避免每次实时渲染 */
export const revalidate = 120;

import type { Metadata } from 'next';
import { one } from '@/server/db';
import { ogCardMetadata } from '@/lib/og';

const TYPE_LABEL: Record<string, string> = {
  article: '文章',
  devotion: '灵修',
  testimony: '见证',
};

/**
 * 只负责分享元信息（og:image 走动态卡片图），页面本身仍是原客户端组件。
 * 任何查询异常都吞掉，绝不因元信息失败而影响页面渲染。
 */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    // contents 表没有 excerpt 列，摘要取正文 body 的前若干字
    const row = await one<{ title: string; body: string; content_type: string }>(
      `SELECT title, body, content_type FROM contents WHERE id = ?`,
      [params.id]
    );
    if (!row?.title) return {};
    return ogCardMetadata({
      title: row.title,
      description: (row.body || '').replace(/\s+/g, ' ').trim(),
      kind: TYPE_LABEL[row.content_type] || '分享',
      path: `/contents/${params.id}`,
    });
  } catch {
    return {};
  }
}

export default function ContentDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
