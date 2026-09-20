'use client';

import Link from 'next/link';
import { qs } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import type { GroupItem } from '@/lib/types';
import { Glyph } from '@/components/icons';
import { groupCategoryLabel } from '@/lib/labels';
import { SkeletonGrid, ErrorBlock, EmptyBlock } from './shared';

/** 我加入的团契(个人中心高频 tab,从 me/page.tsx 抽出,静态引入保留首屏) */
export function MyGroups() {
  const { data, loading, error, reload } = useApi<{ items: GroupItem[] }>(
    `/groups${qs({ scope: 'mine', pageSize: 30 })}`,
    []
  );
  const items = data?.items || [];
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0)
    return <EmptyBlock text="还没有加入任何团契" action={{ label: '发现团契', href: '/groups' }} />;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((g) => (
        <Link
          key={g.id}
          href={`/groups/${g.id}`}
          className="bg-white card-tech rounded-2xl p-4 border border-ink-100 flex gap-3"
        >
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-gold-500 to-gold-400 text-white flex items-center justify-center text-2xl flex-shrink-0">
            <Glyph glyph={g.cover?.startsWith('http') ? '👥' : g.cover || '👥'} className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-ink-900 truncate">{g.name}</h3>
            <p className="text-xs text-ink-500 mt-1">
              {g.city} · <span className="num">{g.memberCount}</span> 位成员
            </p>
            <p className="text-xs text-ink-500 truncate mt-1">{groupCategoryLabel(g.category)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
