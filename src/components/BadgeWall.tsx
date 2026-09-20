'use client';

/**
 * 成就徽章墙。
 *
 * - 我的（不传 userId）：调 /me/badges，显示全部徽章含未解锁进度，并提示「刚刚解锁」
 * - 他人（传 userId）：调 /users/<id>/badges，只展示已获得
 * - compact：横向滚动的紧凑条，用于个人中心顶部概览
 */

import { useMemo } from 'react';
import { useApi } from '@/lib/useApi';
import { formatDate } from '@/lib/format';
import { Glyph, IconArrowRight, IconParty } from '@/components/icons';
import { Skeleton } from '@/components/Skeleton';

export interface BadgeView {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: string;
  categoryLabel: string;
  tier: 'bronze' | 'silver' | 'gold';
  tierLabel: string;
  target: number;
  current: number;
  earned: boolean;
  earnedAt: string | null;
  percent: number;
}

/**
 * 徽章是渐变金属底 + 线性图标，图标颜色跟底色的明暗走：
 * 铜/银的底压得深，用亮字；金的底本身发亮，用深字，否则轮廓糊成一片。
 */
const TIER_STYLE: Record<string, { ring: string; chip: string; bar: string; glyph: string }> = {
  bronze: {
    ring: 'from-amber-700/70 to-amber-900/70',
    chip: 'bg-amber-100 text-amber-800',
    bar: 'from-amber-500 to-amber-700',
    glyph: 'text-amber-50',
  },
  silver: {
    ring: 'from-slate-400/70 to-slate-600/70',
    chip: 'bg-slate-200 text-slate-700',
    bar: 'from-slate-400 to-slate-600',
    glyph: 'text-white',
  },
  gold: {
    ring: 'from-yellow-400/80 to-amber-600/80',
    chip: 'bg-yellow-100 text-yellow-800',
    bar: 'from-yellow-400 to-amber-500',
    glyph: 'text-amber-900',
  },
};

export default function BadgeWall({
  userId,
  compact = false,
  onMore,
}: {
  userId?: string;
  compact?: boolean;
  onMore?: () => void;
}) {
  const mine = !userId;
  const { data, loading } = useApi<any>(mine ? '/me/badges' : `/users/${userId}/badges`, [userId || 'me']);

  const badges: BadgeView[] = useMemo(() => (Array.isArray(data?.badges) ? data.badges : []), [data]);
  const earned = useMemo(() => badges.filter((b) => b.earned), [badges]);
  const newEarned: BadgeView[] = Array.isArray(data?.newEarned) ? data.newEarned : [];

  const groups = useMemo(() => {
    const m = new Map<string, BadgeView[]>();
    for (const b of badges) {
      const key = b.categoryLabel || '其他';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(b);
    }
    return [...m.entries()];
  }, [badges]);

  if (loading && !badges.length) {
    /* 骨架按紧凑条的真实高度搭：标题行 20 + 间距 8 + 徽章 48，
       原先的 h-24 与落地态差几十像素，数据一到整块往上顶。 */
    if (compact) {
      return (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-10" />
          </div>
          <div className="flex gap-2 pb-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="w-12 h-12 shrink-0 rounded-2xl" />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!mine && earned.length === 0) return null;

  /* —— 紧凑条 —— */
  if (compact) {
    return (
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-sm font-bold text-ink-900">
            成就徽章
            <span className="ml-2 text-xs font-normal text-ink-500">
              {earned.length}/{badges.length}
            </span>
          </h3>
          {onMore && (
            <button onClick={onMore} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 min-h-[44px] md:min-h-0">
              查看全部
              <IconArrowRight className="w-3.5 h-3.5" strokeWidth={1.8} />
            </button>
          )}
        </div>
        {earned.length === 0 ? (
          <p className="text-xs text-ink-500 bg-white rounded-2xl border border-ink-100 p-4">
            还没有解锁徽章。签到、读经、发布内容、参与团契都能解锁哦。
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {earned.map((b) => (
              <div
                key={b.id}
                title={`${b.name} · ${b.desc}`}
                role="img"
                aria-label={`${b.name}：${b.desc}`}
                className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 border border-primary-200 flex items-center justify-center text-primary-700 shadow-soft"
              >
                <Glyph glyph={b.icon} className="w-6 h-6" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* —— 完整墙 —— */
  return (
    <div className="space-y-6">
      {newEarned.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-700">
          <IconParty className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.8} />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">刚刚解锁</span>
            {newEarned.map((b) => (
              <span key={b.id} className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-2 py-0.5 text-xs">
                <Glyph glyph={b.icon} className="w-3.5 h-3.5" />
                {b.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <h3 className="font-display text-lg font-bold text-ink-900">成就徽章</h3>
        <span className="text-sm text-ink-500">
          已解锁 {earned.length} / {badges.length}
        </span>
      </div>

      {groups.map(([label, list]) => (
        <div key={label}>
          <div className="text-xs font-semibold tracking-wider text-ink-500 uppercase mb-3">{label}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {list.map((b) => {
              const st = TIER_STYLE[b.tier] || TIER_STYLE.bronze;
              return (
                <div
                  key={b.id}
                  className={`relative rounded-2xl p-4 border transition-all duration-300 ${
                    b.earned
                      ? 'bg-white border-ink-100 shadow-soft hover:shadow-card-hover hover:-translate-y-0.5'
                      : 'bg-ink-50/60 border-ink-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center bg-gradient-to-br ${st.ring} ${st.glyph} ${
                        b.earned ? '' : 'grayscale opacity-50'
                      }`}
                    >
                      <Glyph glyph={b.icon} className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-semibold text-sm truncate ${b.earned ? 'text-ink-900' : 'text-ink-500'}`}
                        >
                          {b.name}
                        </span>
                        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${st.chip}`}>
                          {b.tierLabel}
                        </span>
                      </div>
                      <p className="text-xs text-ink-500 mt-0.5 line-clamp-2">{b.desc}</p>
                    </div>
                  </div>

                  {b.earned ? (
                    <div className="mt-3 text-[11px] text-primary-600">
                      {b.earnedAt ? `解锁于 ${formatDate(b.earnedAt)}` : '已解锁'}
                    </div>
                  ) : (
                    <div className="mt-3">
                      <div
                        className="h-1.5 rounded-full bg-ink-200 overflow-hidden"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(b.percent)}
                        aria-label={`${b.name} 解锁进度`}
                      >
                        <div
                          className={`h-full bg-gradient-to-r ${st.bar} transition-all duration-500`}
                          style={{ width: `${b.percent}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-ink-500">
                        {b.current} / {b.target}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
