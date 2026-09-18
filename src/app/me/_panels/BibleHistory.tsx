'use client';

import Link from 'next/link';

import { useApi } from '@/lib/useApi';

import { formatDate } from '@/lib/format';

interface BibleHistoryItem {
  version: string;
  bookId: string;
  bookName: string;
  chapter: number;
  readDate: string;
  readAt: string;
}

export function MyBibleHistory() {
  const { data, loading, error } = useApi<{ items: BibleHistoryItem[] }>('/bible/history');
  const items = data?.items || [];

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-ink-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-rose-600 text-sm">加载失败：{error}</p>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-3">📖</div>
        <h3 className="font-display text-lg font-bold text-ink-900 mb-1">还没有读经记录</h3>
        <p className="text-ink-500 text-sm mb-4">开始你的第一段读经旅程吧</p>
        <Link href="/bible" className="btn-primary px-5 py-2.5 text-sm">去读经</Link>
      </div>
    );
  }

  // 按日期分组
  const grouped: Record<string, BibleHistoryItem[]> = {};
  for (const it of items) {
    if (!grouped[it.readDate]) grouped[it.readDate] = [];
    grouped[it.readDate].push(it);
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, list]) => (
        <div key={date}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-primary-600">{date}</span>
            <span className="text-xs text-ink-400">读了 {list.length} 章</span>
          </div>
          <div className="space-y-2">
            {list.map((it, i) => (
              <Link
                key={`${it.bookId}-${it.chapter}-${i}`}
                href={`/bible/${it.version}/${it.bookId}/${it.chapter}`}
                className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-ink-100 hover:border-primary-300 hover:shadow-soft transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 font-semibold flex-shrink-0">
                  {it.bookName.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink-900 group-hover:text-primary-600 transition-colors">
                    {it.bookName} 第 {it.chapter} 章
                  </p>
                  <p className="text-xs text-ink-400">译本：{it.version.toUpperCase()} · {formatDate(it.readAt)}</p>
                </div>
                <svg className="w-4 h-4 text-ink-300 group-hover:text-primary-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
