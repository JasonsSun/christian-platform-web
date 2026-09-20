'use client';

/**
 * 区块标题：左侧一道渐变标记 + 展示级标题 + 副说明，右侧「查看全部」。
 *
 * 全站列表页共用这一种节奏：读者扫一眼就知道这一块是什么、去哪里看全部，
 * 不必每页各写一套 h2 + 链接。副说明放在标题之下——这些文案都是完整的一句话，
 * 压在标题上面当 eyebrow 读起来是倒的。
 */
import Link from 'next/link';
import { IconChevronRight } from '@/components/icons';

export default function SectionHead({
  sub,
  title,
  href,
  label,
  align = 'center',
  linkClassName = '',
  as: Tag = 'h2',
}: {
  sub?: string;
  title: string;
  href?: string;
  label?: string;
  /** end：右侧链接与卡片首行对齐（网格类区块）；center：与标题中线对齐 */
  align?: 'center' | 'end';
  /** 追加在链接上的类名，例如移动端隐藏：'hidden sm:inline-flex' */
  linkClassName?: string;
  /** 页面已有 h1 时用 h2（默认），卡片内的小标题请显式传 h3 */
  as?: 'h1' | 'h2' | 'h3';
}) {
  return (
    <div className={`flex ${align === 'end' ? 'items-end' : 'items-center'} justify-between gap-4 mb-6`}>
      <div className="min-w-0">
        <Tag className="font-display text-2xl md:text-3xl font-bold text-ink-900 flex items-center gap-3">
          <span aria-hidden="true" className="h-6 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary-500 to-gold-500" />
          {title}
        </Tag>
        {sub ? <p className="text-ink-500 mt-1.5 pl-[1.125rem] text-sm">{sub}</p> : null}
      </div>
      {href && label ? (
        <Link
          href={href}
          className={`${linkClassName} group/link inline-flex items-center gap-1 text-primary-600 whitespace-nowrap py-1.5 -my-1.5 font-medium hover:underline text-sm`}
        >
          {label}
          <IconChevronRight className="w-4 h-4 transition-transform group-hover/link:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}
