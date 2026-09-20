'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApi, useAction } from '@/lib/useApi';
import { apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGoLogin } from '@/lib/nav';
import { Glyph, IconCalendar, IconCheck } from '@/components/icons';

type PlanListItem = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  accent: string;
  days: number;
  doneDays: number;
  percent: number;
  enrolled: boolean;
};
type PlanListResp = { signedIn: boolean; plans: PlanListItem[] };

type PlanDay = { day: number; reading: string; link: string; done: boolean };
type PlanDetailResp = {
  signedIn: boolean;
  enrolled: boolean;
  currentDay: number;
  plan: { id: string; title: string; subtitle: string; emoji: string; accent: string; days: number };
  doneDays: number;
  days: PlanDay[];
};

export default function PlansPage() {
  const { user } = useAuth();
  const goLogin = useGoLogin();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: list, reload: reloadList, loading } = useApi<PlanListResp>('/plans');
  const { data: detail, reload: reloadDetail } = useApi<PlanDetailResp>(
    activeId ? `/plans/${activeId}` : null,
    [activeId]
  );
  const checkin = useAction();
  const enroll = useAction();

  const enrollPlan = async (planId: string) => {
    if (!user) { goLogin(); return; }
    const res = await enroll.run(() => apiPost<{ ok: boolean; enrolled: boolean }>(`/plans/${planId}/enroll`));
    if (res?.ok) {
      reloadDetail();
      reloadList();
    }
  };

  const toggleDay = async (day: number, done: boolean) => {
    if (!user) { goLogin(); return; }
    if (!activeId) return;
    const res = await checkin.run(() =>
      apiPost<{ done: boolean; doneDays: number }>(`/plans/${activeId}/checkin`, { day })
    );
    if (res) {
      reloadDetail();
      reloadList();
    }
  };

  const pct = detail ? Math.round((detail.doneDays / detail.plan.days) * 100) : 0;

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* 头部 */}
        <div className="mb-6">
          {activeId ? (
            <button
              onClick={() => setActiveId(null)}
              className="inline-flex items-center gap-1 text-ink-500 hover:text-primary-600 text-sm mb-3"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              全部计划
            </button>
          ) : null}
          <h1 className="font-display text-2xl md:text-3xl font-bold text-ink-900 flex items-center gap-2">
            <IconCalendar className="w-6 h-6 md:w-7 md:h-7 text-primary-500" strokeWidth={1.6} />
            读经计划
          </h1>
          <p className="text-ink-500 mt-1 text-sm">选一个计划，每天读一点，坚持打卡，把神的话藏在心里。</p>
        </div>

        {/* 计划列表 */}
        {!activeId && (
          <>
            {loading ? (
              <div className="grid sm:grid-cols-2 gap-5">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 rounded-2xl bg-white animate-pulse" />)}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-5">
                {(list?.plans || []).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveId(p.id)}
                    className="text-left bg-white rounded-2xl p-5 shadow-soft card-hover border border-ink-100"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${p.accent} text-white flex items-center justify-center shrink-0`}>
                        <Glyph glyph={p.emoji} className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-ink-900">{p.title}</h2>
                        <p className="text-xs text-ink-400 line-clamp-2 mt-0.5">{p.subtitle}</p>
                      </div>
                    </div>
                    <div
                      className="h-2 rounded-full bg-ink-100 overflow-hidden mb-2"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(p.percent)}
                      aria-label="计划完成进度"
                    >
                      <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-600" style={{ width: `${p.percent}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-ink-400">
                      <span>已读 {p.doneDays}/{p.days} 天</span>
                      {p.enrolled
                        ? <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">已加入<IconCheck className="w-3.5 h-3.5" strokeWidth={2.2} /></span>
                        : <span className="text-primary-600 font-medium">{p.percent}%</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!user && (
              <p className="text-center text-sm text-ink-400 mt-6">
                <Link href="/login" className="text-primary-600 hover:underline">登录</Link> 后可打卡记录进度
              </p>
            )}
          </>
        )}

        {/* 计划详情 */}
        {activeId && detail && (
          <>
            <div className="bg-white rounded-2xl p-5 md:p-6 shadow-soft border border-ink-100 mb-6">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Glyph glyph={detail.plan.emoji} className="w-6 h-6 text-primary-600 shrink-0" />
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-bold text-ink-900 truncate">{detail.plan.title}</h2>
                    <p className="text-xs text-ink-400">{detail.plan.subtitle}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-2xl font-bold text-gradient">{pct}%</div>
                  <div className="text-xs text-ink-400">{detail.doneDays}/{detail.plan.days} 天</div>
                </div>
              </div>
              <div
                className="h-2.5 rounded-full bg-ink-100 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
                aria-label="计划完成进度"
              >
                <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all" style={{ width: `${pct}%` }} />
              </div>
              {user && !detail.enrolled && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => enrollPlan(detail.plan.id)}
                    disabled={enroll.pending}
                    className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-60"
                  >
                    {enroll.pending ? '加入中…' : '开始这个计划'}
                  </button>
                  <span className="text-xs text-ink-400">加入后，读完分配的章节会自动打卡</span>
                </div>
              )}
              {user && detail.enrolled && (
                <div className="mt-3 text-xs text-emerald-600">已加入 · 正在读第 {detail.currentDay} 天</div>
              )}
            </div>

            <div className="space-y-2">
              {detail.days.map((d) => (
                <div
                  key={d.day}
                  className={`flex items-center gap-3 bg-white rounded-xl px-4 py-3 border transition-colors ${
                    d.done ? 'border-emerald-200 bg-emerald-50/50' : 'border-ink-100'
                  }`}
                >
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                    d.done ? 'bg-emerald-700 text-white' : 'bg-ink-50 text-ink-600'
                  }`}>
                    {d.done ? <IconCheck className="w-5 h-5" strokeWidth={2.2} /> : d.day}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink-800">第 {d.day} 天</div>
                    <div className="text-xs text-ink-500 truncate">{d.reading}</div>
                  </div>
                  <Link
                    href={`${d.link}?plan=${activeId}&day=${d.day}`}
                    className="text-xs px-3 py-1.5 rounded-lg bg-ink-50 text-ink-600 hover:bg-primary-50 hover:text-primary-700 border border-ink-200 transition-colors shrink-0"
                  >
                    去读经
                  </Link>
                  <button
                    onClick={() => toggleDay(d.day, d.done)}
                    disabled={checkin.pending}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors shrink-0 disabled:opacity-60 ${
                      d.done
                        ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                        : 'border-primary-300 text-primary-700 hover:bg-primary-50'
                    }`}
                  >
                    {d.done ? '撤销' : '打卡'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {activeId && !detail && (
          <div className="space-y-2 animate-pulse">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-16 rounded-xl bg-white" />)}
          </div>
        )}
      </div>
    </div>
  );
}
