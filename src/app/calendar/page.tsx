'use client';

import Link from 'next/link';
import { useState } from 'react';
import { qs } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Skeleton } from '@/components/Skeleton';

interface CalActivity {
  id: string;
  title: string;
  category: string;
  location: string;
  cover: string;
  date: string;
  startTime: string;
  endTime: string | null;
}

interface CalDay {
  date: string;
  activities: CalActivity[];
  checkedIn: boolean;
  plans: { planId: string; day: number }[];
  count: number;
}

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

const CATEGORY_LABEL: Record<string, string> = {
  fellowship: '团契',
  worship: '敬拜',
  study: '学习',
  service: '服事',
  prayer: '祷告',
  outreach: '外展',
  other: '其他',
};

const pad = (n: number) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export default function CalendarPage() {
  const today = todayStr();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);

  const { data, loading, error } = useApi<{
    month: string;
    days: CalDay[];
    loggedIn: boolean;
    summary: { activities: number; checkins: number; planDays: number; activeDays: number };
  }>(`/calendar${qs({ month })}`, [month]);

  const days = data?.days || [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cur = byDate.get(selected);

  // 月历首格偏移：周一为一周第一天
  const [yy, mm] = month.split('-').map(Number);
  const firstDow = (new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (CalDay | null)[] = [...Array.from({ length: firstDow }, () => null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const goToday = () => {
    setMonth(today.slice(0, 7));
    setSelected(today);
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-10 md:py-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800" />
        <div className="absolute inset-0 mesh-bg opacity-70" />
        <div className="absolute inset-0 dot-grid opacity-25" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-tech text-white/90 text-xs font-medium mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />
            活动 · 打卡 · 读经
          </span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white mb-2 text-glow">聚会日历</h1>
          <p className="text-white/85 text-sm font-serif italic">
            “凡事都有定期，天下万务都有定时。” —— 传道书 3:1
          </p>
        </div>
      </section>

      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 月份切换 */}
          <div className="card-tech rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              className="w-9 h-9 rounded-xl border border-ink-200 text-ink-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
              aria-label="上个月"
            >
              ‹
            </button>
            <h2 className="font-display text-xl font-bold text-ink-900 min-w-[110px] text-center">
              {month.replace('-', ' 年 ')} 月
            </h2>
            <button
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              className="w-9 h-9 rounded-xl border border-ink-200 text-ink-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
              aria-label="下个月"
            >
              ›
            </button>
            <button
              onClick={goToday}
              className="px-3.5 py-1.5 rounded-xl text-sm border border-ink-200 text-ink-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
            >
              回到今天
            </button>

            <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-ink-500">
              <span className="flex items-center gap-1">
                <i className="w-2 h-2 rounded-full bg-primary-500 inline-block" />活动
              </span>
              <span className="flex items-center gap-1">
                <i className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />打卡
              </span>
              <span className="flex items-center gap-1">
                <i className="w-2 h-2 rounded-full bg-gold-500 inline-block" />读经
              </span>
            </div>
          </div>

          {data && data.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { label: '本月活动', value: data.summary.activities, icon: '📅' },
                { label: '有安排的天数', value: data.summary.activeDays, icon: '✨' },
                { label: '我的打卡', value: data.summary.checkins, icon: '🔥' },
                { label: '读经完成', value: data.summary.planDays, icon: '📖' },
              ].map((s) => (
                <div key={s.label} className="card-tech rounded-2xl p-4">
                  <div className="text-xl mb-1">{s.icon}</div>
                  <div className="font-display text-2xl font-bold text-ink-900">{s.value}</div>
                  <div className="text-xs text-ink-500">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl p-4 text-sm mb-5">{error}</div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            {/* 月历 */}
            <div className="lg:col-span-2 min-w-0">
              <div className="card-tech rounded-2xl p-3 sm:p-4">
                {loading ? (
                  <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: 35 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 sm:h-20 rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
                      {WEEK.map((w) => (
                        <div key={w} className="text-center text-xs font-medium text-ink-400 py-1">
                          {w}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 sm:gap-2">
                      {cells.map((d, i) => {
                        if (!d) return <div key={`e${i}`} />;
                        const isToday = d.date === today;
                        const isSel = d.date === selected;
                        const hasAct = d.activities.length > 0;
                        return (
                          <button
                            key={d.date}
                            onClick={() => setSelected(d.date)}
                            className={`relative h-16 sm:h-20 rounded-xl border p-1.5 text-left transition-all ${
                              isSel
                                ? 'border-primary-500 ring-2 ring-primary-200 bg-primary-50/60'
                                : 'border-ink-100 hover:border-primary-300'
                            } ${d.count === 0 ? 'bg-white/40' : 'bg-white'}`}
                          >
                            <span
                              className={`text-xs font-semibold ${
                                isToday ? 'text-primary-700' : 'text-ink-600'
                              }`}
                            >
                              {Number(d.date.slice(8))}
                            </span>
                            <div className="mt-1 space-y-0.5">
                              {hasAct && (
                                <div className="truncate text-[10px] leading-tight px-1 py-0.5 rounded bg-primary-50 text-primary-700">
                                  {d.activities[0].cover ? `${d.activities[0].cover} ` : ''}
                                  {d.activities[0].title}
                                </div>
                              )}
                              {d.activities.length > 1 && (
                                <div className="text-[10px] text-ink-400 px-1">+{d.activities.length - 1} 场</div>
                              )}
                            </div>
                            <div className="absolute bottom-1.5 right-1.5 flex gap-0.5">
                              {d.checkedIn && <i className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                              {d.plans.length > 0 && <i className="w-1.5 h-1.5 rounded-full bg-gold-500" />}
                              {hasAct && <i className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 当天详情 */}
            <aside className="min-w-0">
              <div className="card-tech rounded-2xl p-5 sticky top-24">
                <h3 className="font-display font-bold text-ink-900 mb-1">
                  {selected.slice(5).replace('-', ' 月 ')} 日
                </h3>
                <p className="text-xs text-ink-400 mb-4">
                  {selected === today ? '今天' : ''}
                  {cur?.checkedIn ? ' · 已打卡' : ''}
                  {cur?.plans?.length ? ` · 完成 ${cur.plans.length} 项读经` : ''}
                </p>

                {cur && cur.activities.length > 0 && (
                  <div className="space-y-2.5 mb-4">
                    {cur.activities.map((a) => (
                      <Link
                        key={a.id}
                        href={`/activities/${a.id}`}
                        className="block p-3 rounded-xl border border-ink-100 hover:border-primary-300 hover:bg-primary-50/40 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{a.cover || '📅'}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-100">
                            {CATEGORY_LABEL[a.category] || a.category}
                          </span>
                          <span className="ml-auto text-xs text-ink-500">{a.startTime}</span>
                        </div>
                        <div className="text-sm font-medium text-ink-900 truncate">{a.title}</div>
                        {a.location && <div className="text-xs text-ink-400 mt-0.5 truncate">📍 {a.location}</div>}
                      </Link>
                    ))}
                  </div>
                )}

                {cur && cur.activities.length === 0 && (
                  <p className="text-sm text-ink-400 py-4">这一天没有安排的活动</p>
                )}

                {data?.loggedIn === false && (
                  <div className="mt-4 p-3 rounded-xl bg-ink-50 text-xs text-ink-500">
                    <Link href="/login" className="text-primary-600 hover:underline">
                      登录
                    </Link>
                    后可在这里看到你的读经打卡与计划进度
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <Link href="/activities" className="btn-primary text-sm flex-1 text-center">
                    全部活动
                  </Link>
                  <Link href="/plans" className="px-4 py-2 rounded-xl border border-ink-200 text-sm text-ink-600 hover:border-primary-300 text-center">
                    读经计划
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
