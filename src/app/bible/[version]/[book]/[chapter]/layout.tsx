import type { Metadata } from 'next';
import { BOOKS } from '@/server/bible';
import { one } from '@/server/db';
import { ogCardMetadata } from '@/lib/og';

const VERSION_LABEL: Record<string, string> = {
  cuv: '和合本',
  cuvs: '和合本修订版',
  kjv: 'KJV',
};

export async function generateMetadata({
  params,
}: {
  params: { version: string; book: string; chapter: string };
}): Promise<Metadata> {
  const chapter = Number(params.chapter) || 1;
  const book = BOOKS.find((b) => b.id === params.book);
  const bookName = book?.name || params.book;
  const title = `${bookName} 第 ${chapter} 章`;

  let first = '';
  try {
    const row = await one<{ text: string }>(
      `SELECT text FROM bible_verses WHERE version = ? AND book_id = ? AND chapter = ? AND verse = 1 LIMIT 1`,
      [params.version, book?.dbId || params.book, chapter]
    );
    if (row?.text) first = String(row.text).replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
  } catch {
    /* 取不到正文就只展示章节标题 */
  }

  return ogCardMetadata({
    title,
    description: first.slice(0, 110),
    kind: '圣经',
    meta: VERSION_LABEL[params.version] || params.version,
    path: `/bible/${params.version}/${params.book}/${chapter}`,
  });
}

export default function BibleChapterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
