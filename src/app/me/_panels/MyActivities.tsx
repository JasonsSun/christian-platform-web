'use client';

import Link from 'next/link';
import { qs } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { formatDate } from '@/lib/format';
import type { ActivityItem } from '@/lib/types';
import { SkeletonGrid, ErrorBlock, EmptyBlock } from './shared';

/** 我报名的活动(个人中心高频 tab,从 me/page.tsx 抽出,静态引入保留首屏) */
export function MyActivities() {
  const { data, loading, error, reload } = useApi<{ items: ActivityItem[] }>(
    `/activities${qs({ scope: 'all', pageSize: 50 })}`,
    []
  );
  const items = (data?.items || []).filter((a) => a.registered);
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0)
    return <EmptyBlock text="还没有报名任何活动" action={{ label: '浏览活动', href: '/activities' }} />;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((a) => (
        <Link
          key={a.id}
          href={`/activities/${a.id}`}
          className="bg-white rounded-2xl p-4 border border-ink-100 card-hover flex gap-3"
        >
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-2xl flex-shrink-0">
            {a.cover?.startsWith('http') ? '📅' : a.cover || '📅'}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-ink-900 truncate">{a.title}</h3>
            <p className="text-xs text-ink-500 mt-1">
              {a.city} · {formatDate(a.startAt)}
            </p>
            <span
              className={`text-xs font-semibold mt-1 inline-block ${
                a.myStatus === 'waitlist' ? 'text-gold-600' : 'text-primary-600'
              }`}
            >
              {a.myStatus === 'waitlist' ? '候补中' : '已报名'}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
