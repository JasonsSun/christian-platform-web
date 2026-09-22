'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { countdown, formatDateTime } from '@/lib/format';
import type { ActivityItem } from '@/lib/types';
import { Glyph, IconCalendar } from '@/components/icons';
import { activityCategoryLabel, ACTIVITY_CATEGORY_LABEL } from '@/lib/labels';

const CITIES = ['上海', '北京', '杭州', '广州', '深圳', '成都', '南京'];

// 分类名只认 lib/labels 那一份，这里决定的是筛选开放哪几类、按什么顺序排
const CATEGORIES = [
  { value: '', label: '全部' },
  ...(['worship', 'fellowship', 'retreat', 'training', 'service'] as const).map((v) => ({
    value: v,
    label: ACTIVITY_CATEGORY_LABEL[v],
  })),
];

const SORT_TABS = [
  { key: 'upcoming', label: '即将开始' },
  { key: 'latest', label: '最新发布' },
];

function Avatar({ name, color, size = 36, userId }: { name: string; color: string; size?: number; userId?: string }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      data-user-id={userId}
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

function getActivityStatus(a: ActivityItem): { label: string; cls: string } {
  const ended = a.endAt ? new Date(a.endAt).getTime() < Date.now() : new Date(a.startAt).getTime() < Date.now();
  if (ended) return { label: '已结束', cls: 'bg-ink-100 text-ink-600' };
  if (a.registered) {
    if (a.myStatus === 'waitlist') return { label: '候补中', cls: 'bg-gold-100 text-gold-700' };
    return { label: '已报名', cls: 'bg-emerald-100 text-emerald-700' };
  }
  const full = a.capacity > 0 && a.confirmedCount >= a.capacity;
  if (full) return { label: '满员候补', cls: 'bg-rose-100 text-rose-700' };
  return { label: '可报名', cls: 'bg-primary-100 text-primary-700' };
}

export default function ActivitiesPage() {
  const { user } = useAuth();
  const [sort, setSort] = useState('upcoming');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');

  // 即将开始: scope=upcoming, sort=upcoming; 最新: scope=all, sort=latest
  const scope = sort === 'upcoming' ? 'upcoming' : 'all';
  const sortParam = sort === 'upcoming' ? 'upcoming' : 'latest';

  const path = `/activities${qs({ scope, city, category, q, sort: sortParam, pageSize: 24 })}`;
  const { data, loading, error, reload } = useApi<{ items: ActivityItem[]; total: number }>(path, [
    sort,
    city,
    category,
    q,
  ]);

  const items = data?.items || [];

  return (
    <div className="min-h-screen">
      <section className="relative py-12 md:py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-950 via-primary-900 to-primary-700" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-10 right-10 w-72 h-72 bg-primary-300/20 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-10 w-72 h-72 bg-gold-400/15 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3">教会活动</h1>
              <p className="text-base sm:text-lg text-white/85 max-w-xl">发现附近教会活动，在线报名，一起参与团契生活</p>
            </div>
            <PublishButton canPublish={!!user} />
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 筛选栏 */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-soft border border-ink-100 mb-6 space-y-4">
          {/* 排序 Tab */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 bg-ink-50 rounded-xl p-1">
              {SORT_TABS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    sort === s.key
                      ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/25'
                      : 'text-ink-600 hover:text-primary-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <svg className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                aria-label="搜索活动"
                className="input-styled input-icon"
                placeholder="搜索活动名称或介绍"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select aria-label="活动城市筛选" className="input-styled" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">全部城市</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select aria-label="活动分类筛选" className="input-styled" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && items.length === 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-3xl h-72 animate-pulse border border-ink-100" />
            ))}
          </div>
        )}

        {error && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-rose-600">{error}</p>
            <button onClick={reload} className="btn-secondary">
              重试
            </button>
          </div>
        )}

        {/* 换城市/分类/关键词时 useApi 留着旧 data，整块门在 !loading 上就是
            「整页换成骨架 → 弹回来」（与 /media /sermons 同一处缺陷）。
            列表留着、压暗；失败也要在还有结果时说。 */}
        {error && items.length > 0 && (
          <p role="alert" className="mb-4 text-sm text-rose-600">
            {error} <button onClick={reload} className="underline ml-1">重试</button>
          </p>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center"><IconCalendar className="w-7 h-7" strokeWidth={1.5} /></div>
            <p className="text-ink-500">暂无符合条件的活动</p>
            <button onClick={() => { setSort('upcoming'); setCity(''); setCategory(''); setQ(''); }} className="btn-secondary">
              查看全部活动
            </button>
          </div>
        )}

        {items.length > 0 && (
          <>
            <p className="text-sm text-ink-500 mb-4">共 {data?.total ?? items.length} 个活动</p>
            <div className={`grid md:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}>
              {items.map((a) => (
                <ActivityCard key={a.id} a={a} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ActivityCard({ a }: { a: ActivityItem }) {
  const percent = a.capacity > 0 ? Math.min(100, Math.round((a.confirmedCount / a.capacity) * 100)) : 0;
  const ended = a.endAt ? new Date(a.endAt).getTime() < Date.now() : new Date(a.startAt).getTime() < Date.now();
  const status = getActivityStatus(a);
  const catLabel = activityCategoryLabel(a.category);

  return (
    <Link href={`/activities/${a.id}`} className="group bg-white rounded-3xl overflow-hidden shadow-soft card-hover border border-ink-100 flex flex-col">
      <div className="h-40 relative overflow-hidden bg-gradient-to-br from-primary-500 to-primary-700">
        {a.cover && !a.cover.startsWith('http') && a.cover.length <= 4 && (
          <div className="absolute inset-0 flex items-center justify-center"><Glyph glyph={a.cover} className="w-16 h-16 text-white/85" strokeWidth={1.2} /></div>
        )}
        {a.cover && a.cover.startsWith('http') && (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" src={a.cover} alt={a.title} className="absolute inset-0 w-full h-full object-cover"  decoding="async" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        <div className="absolute top-4 left-4 flex gap-2">
          <span className="px-3 py-1 rounded-full chip-frost backdrop-blur-sm text-xs font-semibold shadow-lg">
            {catLabel}
          </span>
        </div>
        <div className="absolute top-4 right-4">
          {/* 状态角标是 12px 半粗体,白字压 500 档只有 2.2~4.3:1。按色调深一档,
              金色反过来用「墨字压金」——gold 系再深就成了棕色,不如换前景色。 */}
          <span className={`px-3 py-1 rounded-full text-xs font-semibold shadow-lg ${
            status.label === '已报名' ? 'bg-emerald-700 text-white' :
            status.label === '候补中' ? 'bg-gold-500 text-ink-950' :
            status.label === '满员候补' ? 'bg-rose-600 text-white' :
            status.label === '已结束' ? 'bg-ink-600 text-white' :
            'bg-primary-600 text-white'
          }`}>
            {status.label}
          </span>
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <h2 className="font-display text-xl font-bold text-white drop-shadow-lg line-clamp-2">{a.title}</h2>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-center gap-2 text-sm text-ink-600 mb-2">
          <svg className="w-4 h-4 text-primary-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="truncate">{formatDateTime(a.startAt)}</span>
          {!ended && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 font-semibold flex-shrink-0">
              {countdown(a.startAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-600 mb-4">
          <svg className="w-4 h-4 text-primary-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          </svg>
          <span className="truncate">{a.city} · {a.location}</span>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-ink-500">报名进度</span>
            <span className="font-semibold text-primary-600">{a.confirmedCount}/{a.capacity} 人</span>
          </div>
          <div
            className="h-2 rounded-full bg-ink-100 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-label="报名进度"
          >
            <div
              className={`h-full rounded-full transition-all ${
                percent >= 100 ? 'bg-gradient-to-r from-rose-400 to-rose-500' : 'bg-gradient-to-r from-primary-500 to-primary-400'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          {a.waitlistCount > 0 && <p className="text-xs text-gold-600 mt-1.5">另有 {a.waitlistCount} 人候补</p>}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-2 border-t border-ink-100">
          <Avatar name={a.organizer.displayName} color={a.organizer.avatarColor} size={28} userId={a.organizer.id} />
          <span className="text-xs text-ink-500 truncate">{a.organizer.displayName} 主办</span>
          <span className="ml-auto text-xs text-primary-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            查看详情 →
          </span>
        </div>
      </div>
    </Link>
  );
}

function PublishButton({ canPublish }: { canPublish: boolean; onPublished?: () => void }) {
  const router = useRouter();
  const notice = useNotice();

  function openForm() {
    if (!canPublish) {
      notice.info('请先登录后再发布活动');
      router.push('/login?next=' + encodeURIComponent('/activities/new'));
      return;
    }
    // 不使用弹框：发布表单为独立页面
    router.push('/activities/new');
  }

  return (
    <button onClick={openForm} className="btn-gold whitespace-nowrap">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      发布活动
    </button>
  );
}
