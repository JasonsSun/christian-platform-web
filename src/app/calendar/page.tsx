'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { qs, apiPost, apiDelete, clearApiCache } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { activityCategoryLabel } from '@/lib/labels';
import { Skeleton } from '@/components/Skeleton';
import {
  Glyph,
  IconBell,
  IconBellOff,
  IconBookOpen,
  IconCalendar,
  IconChevronRight,
  IconDownload,
  IconFire,
  IconMapPin,
  IconSparkles,
} from '@/components/icons';

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

interface ReminderState {
  leadMinutes: number;
  notifyAt: string;
  sent: boolean;
}

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

/** 与 src/server/activityReminders.ts 的 LEAD_OPTIONS 保持一致 */
const LEAD_OPTIONS = [30, 120, 1440, 4320];
const LEAD_LABEL: Record<number, string> = {
  30: '开始前 30 分钟',
  120: '开始前 2 小时',
  1440: '开始前 1 天',
  4320: '开始前 3 天',
};

/** 本月统计卡的静态配置：抽出来是为了让骨架态和落地态渲染同一套 DOM，只有数值不同。 */
const MONTH_STATS = [
  { key: 'activities', label: '本月活动', icon: IconCalendar, tone: 'bg-primary-50 text-primary-700' },
  { key: 'activeDays', label: '有安排的天数', icon: IconSparkles, tone: 'bg-sky-50 text-sky-700' },
  { key: 'checkins', label: '我的打卡', icon: IconFire, tone: 'bg-emerald-50 text-emerald-700' },
  { key: 'planDays', label: '读经完成', icon: IconBookOpen, tone: 'bg-gold-50 text-gold-700' },
] as const;

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
  const router = useRouter();
  const today = todayStr();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, error, reload } = useApi<{
    month: string;
    days: CalDay[];
    loggedIn: boolean;
    reminders: Record<string, ReminderState>;
    summary: { activities: number; checkins: number; planDays: number; activeDays: number };
  }>(`/calendar${qs({ month })}`, [month]);

  const days = data?.days || [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cur = byDate.get(selected);
  const reminders = data?.reminders || {};

  // 月历首格偏移：周一为一周第一天
  const [yy, mm] = month.split('-').map(Number);
  const firstDow = (new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (CalDay | null)[] = [...Array.from({ length: firstDow }, () => null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const goToday = () => {
    setMonth(today.slice(0, 7));
    setSelected(today);
  };

  /** 订阅提醒。未登录先去登录 —— 提醒是按用户存的，匿名没法落地。 */
  const setReminder = async (activityId: string, leadMinutes: number) => {
    if (!data?.loggedIn) {
      router.push('/login?next=/calendar');
      return;
    }
    setBusy(activityId);
    try {
      await apiPost('/me/activity-reminders', { activityId, leadMinutes });
      setOpenFor(null);
      clearApiCache('/calendar');
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const cancelReminder = async (activityId: string) => {
    setBusy(activityId);
    try {
      await apiDelete(`/me/activity-reminders?activityId=${encodeURIComponent(activityId)}`);
      setOpenFor(null);
      clearApiCache('/calendar');
      await reload();
    } finally {
      setBusy(null);
    }
  };

  // 侧栏「我的提醒」：把本月所有已订阅的活动摊平
  const myReminders = days
    .flatMap((d) => d.activities.map((a) => ({ ...a, state: reminders[a.id] })))
    .filter((x) => x.state)
    .sort((a, b) => (a.date + a.startTime > b.date + b.startTime ? 1 : -1));

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-10 md:py-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800" />
        <div className="absolute inset-0 mesh-bg opacity-70" />
        <div className="absolute inset-0 dot-grid opacity-25" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 原先用 glass-on-dark（白 12% 磨砂片）：它把 primary-600 那条带子提亮了，
              白字压在提亮后的 rgb(64,94,255) 上只剩 4.30。换成深色底片，白字回到 7 以上。 */}
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ink-950/30 border border-white/20 text-white/90 text-xs font-medium mb-3">
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
              className="w-11 h-11 md:w-9 md:h-9 inline-flex items-center justify-center rounded-xl border border-ink-200 text-ink-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
              aria-label="上个月"
            >
              <IconChevronRight className="w-4 h-4 rotate-180" strokeWidth={1.8} />
            </button>
            <h2 className="font-display text-xl font-bold text-ink-900 min-w-[110px] text-center">
              {month.replace('-', ' 年 ')} 月
            </h2>
            <button
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              className="w-11 h-11 md:w-9 md:h-9 inline-flex items-center justify-center rounded-xl border border-ink-200 text-ink-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
              aria-label="下个月"
            >
              <IconChevronRight className="w-4 h-4" strokeWidth={1.8} />
            </button>
            <button
              onClick={goToday}
              className="px-3.5 py-1.5 min-h-[44px] md:min-h-0 rounded-xl text-sm border border-ink-200 text-ink-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
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
              {/* 订阅到系统日历：站外也能收到提醒，无需登录在线 */}
              <a
                href="/api/v1/calendar/ics"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-xl text-xs border border-ink-200 text-ink-600 hover:border-primary-400 hover:text-primary-700 transition-colors"
                title="下载 .ics 订阅到手机/电脑日历"
              >
                <IconDownload className="w-3.5 h-3.5" strokeWidth={1.8} />
                订阅日历
              </a>
            </div>
          </div>

          {/* 统计卡此前只在数据落地后挂载，把下方月历整体下推 134px（桌面 CLS 0.0386）。
              图标/文案/骨架都来自静态配置，所以加载态与落地态高度完全一致。 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {MONTH_STATS.map((s) => {
              const Icon = s.icon;
              const value = data?.summary?.[s.key];
              return (
                <div key={s.key} className="card-tech rounded-2xl p-4">
                  <div className="mb-1 flex h-7 items-center">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border border-ink-100 ${s.tone}`}
                      aria-hidden
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                  </div>
                  <div className="font-display text-2xl font-bold text-ink-900">
                    {value === undefined ? (
                      <span
                        className="skeleton-sheen inline-block h-6 w-9 rounded-md bg-ink-950/10 align-middle"
                        aria-hidden
                      />
                    ) : (
                      <b data-count className="num">
                        {value}
                      </b>
                    )}
                  </div>
                  <div className="text-xs text-ink-500">{s.label}</div>
                </div>
              );
            })}
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm mb-5">{error}</div>
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
                        const reminded = d.activities.some((a) => reminders[a.id]);
                        return (
                          <button
                            key={d.date}
                            onClick={() => setSelected(d.date)}
                            className={`relative h-16 sm:h-20 rounded-xl border p-1.5 text-left transition-all ${
                              isSel
                                ? 'border-primary-500 ring-2 ring-primary-200 bg-primary-50/60'
                                : 'border-ink-100 hover:border-primary-300'
                            } ${d.count === 0 ? 'bg-ink-50' : 'bg-white'}`}
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
                                <div className="flex items-center gap-0.5 truncate text-[10px] leading-tight px-1 py-0.5 rounded bg-primary-50 text-primary-700">
                                  {reminded && <IconBell className="w-2.5 h-2.5 shrink-0" strokeWidth={2} />}
                                  {!!d.activities[0].cover && (
                                    <Glyph glyph={d.activities[0].cover} className="w-2.5 h-2.5 shrink-0" />
                                  )}
                                  <span className="min-w-0 truncate">{d.activities[0].title}</span>
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
            <aside className="min-w-0 space-y-4">
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
                    {cur.activities.map((a) => {
                      const st = reminders[a.id];
                      const open = openFor === a.id;
                      return (
                        <div
                          key={a.id}
                          className="p-3 rounded-xl border border-ink-100 hover:border-primary-300 transition-colors"
                        >
                          <Link href={`/activities/${a.id}`} className="block">
                            <div className="flex items-center gap-2 mb-1">
                              {/* 封面是数据库里的 emoji：走 Glyph 换成同一套线性图标，
                                  映射表里没有的仍按原样回退，不会丢信息。 */}
                              <span
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"
                                aria-hidden
                              >
                                <Glyph glyph={a.cover || '📅'} className="h-3.5 w-3.5" />
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-100">
                                {activityCategoryLabel(a.category)}
                              </span>
                              <span className="ml-auto text-xs text-ink-500">{a.startTime}</span>
                            </div>
                            <div className="text-sm font-medium text-ink-900 truncate">{a.title}</div>
                            {a.location && (
                              <div className="flex items-center gap-1 text-xs text-ink-400 mt-0.5 min-w-0">
                                <IconMapPin className="w-3 h-3 shrink-0" strokeWidth={1.8} />
                                <span className="truncate">{a.location}</span>
                              </div>
                            )}
                          </Link>

                          {/* 提醒：站内通知 + Web Push，未登录引导去登录 */}
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() => setOpenFor(open ? null : a.id)}
                              disabled={busy === a.id}
                              className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 min-h-[44px] md:min-h-0 rounded-lg border transition-colors disabled:opacity-50 ${
                                st
                                  ? 'border-gold-300 bg-gold-50 text-gold-700'
                                  : 'border-ink-200 text-ink-500 hover:border-primary-300 hover:text-primary-700'
                              }`}
                            >
                              {st ? (
                                <IconBell className="w-3 h-3 shrink-0" strokeWidth={2} />
                              ) : (
                                <IconBellOff className="w-3 h-3 shrink-0" strokeWidth={2} />
                              )}
                              {st ? LEAD_LABEL[st.leadMinutes] || '已订阅' : '提醒我'}
                            </button>
                            {st && (
                              <button
                                onClick={() => cancelReminder(a.id)}
                                disabled={busy === a.id}
                                className="text-[11px] px-2 min-h-[44px] md:min-h-0 text-ink-400 hover:text-rose-600 transition-colors disabled:opacity-50"
                              >
                                取消
                              </button>
                            )}
                          </div>

                          {open && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {LEAD_OPTIONS.map((l) => (
                                <button
                                  key={l}
                                  onClick={() => setReminder(a.id, l)}
                                  disabled={busy === a.id}
                                  className={`text-[11px] px-2.5 py-1 min-h-[44px] md:min-h-0 rounded-lg border transition-colors disabled:opacity-50 ${
                                    st?.leadMinutes === l
                                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                                      : 'border-ink-200 text-ink-600 hover:border-primary-300'
                                  }`}
                                >
                                  {LEAD_LABEL[l]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {cur && cur.activities.length === 0 && (
                  <div className="py-5 text-center">
                    <span
                      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-dashed border-ink-200 text-ink-300"
                      aria-hidden
                    >
                      <IconCalendar className="h-5 w-5" strokeWidth={1.5} />
                    </span>
                    <p className="text-sm text-ink-500 mt-2.5">这一天没有安排的活动</p>
                  </div>
                )}

                {data?.loggedIn === false && (
                  <div className="mt-4 p-3 rounded-xl bg-ink-50 text-xs text-ink-600">
                    <Link href="/login" className="text-primary-600 hover:underline">
                      登录
                    </Link>
                    后可在这里看到你的读经打卡与计划进度，也能订阅活动提醒
                  </div>
                )}

                {myReminders.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-ink-100">
                    <h4 className="text-xs font-semibold text-ink-700 mb-2">本月我的提醒</h4>
                    <ul className="space-y-1.5">
                      {myReminders.slice(0, 6).map((r) => (
                        <li key={r.id} className="flex items-center gap-2 text-[11px] text-ink-500">
                          <IconBell className="w-3 h-3 shrink-0 text-gold-600" strokeWidth={1.8} />
                          <Link href={`/activities/${r.id}`} className="truncate hover:text-primary-700">
                            {r.date.slice(5)} {r.startTime} · {r.title}
                          </Link>
                          <span className="ml-auto flex-shrink-0 text-ink-400">
                            {LEAD_LABEL[r.state.leadMinutes] || ''}
                          </span>
                        </li>
                      ))}
                    </ul>
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
