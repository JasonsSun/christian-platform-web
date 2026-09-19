'use client';

import { useState, useCallback, useId } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useGoLogin } from '@/lib/nav';
import { useEscape, useDialogFocus } from '@/lib/a11y';
import { READING_PLANS } from '@/lib/readingPlans';
import Portal from '@/components/Portal';

export interface GroupPlanItem {
  planId: string;
  title: string;
  subtitle: string;
  emoji: string;
  days: number;
  startDate: string;
  joinedCount: number;
  myJoined: boolean;
  myDone: number;
  myPercent: number;
  expectedDay: number;
}

interface ProgressMember {
  userId: string;
  displayName: string;
  avatarColor: string;
  done: number;
  percent: number;
  behind: number;
  joined: boolean;
}

export default function GroupPlans({
  groupId,
  isOwner,
  isMember,
}: {
  groupId: string;
  isOwner: boolean;
  isMember: boolean;
}) {
  const { user } = useAuth();
  const notice = useNotice();
  const goLogin = useGoLogin();

  const { data, loading, error, setData } = useApi<{ items: GroupPlanItem[] }>(
    `/groups/${groupId}/plans`,
    [groupId],
  );

  const addAction = useAction();
  const joinAction = useAction();
  const progressAction = useAction();

  const [adding, setAdding] = useState(false);
  const [pickPlanId, setPickPlanId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [progressOpen, setProgressOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    days: number;
    expectedDay: number;
    startDate: string;
    members: ProgressMember[];
  } | null>(null);

  const items = data?.items ?? [];

  useEscape(!!progressOpen, () => {
    if (!progressAction.pending) setProgressOpen(null);
  });
  const progressRef = useDialogFocus(!!progressOpen);
  const progressTitleId = useId();

  const refresh = useCallback(
    (next: GroupPlanItem[]) =>
      setData((prev) => (prev ? { ...prev, items: next } : { items: next })),
    [setData],
  );

  const submitAdd = useCallback(async () => {
    if (!pickPlanId) {
      notice.error('请选择一个读经计划');
      return;
    }
    const res = await addAction.run(() =>
      apiPost<{ items: GroupPlanItem[] }>(`/groups/${groupId}/plans`, {
        planId: pickPlanId,
        startDate,
      }),
    );
    if (res) {
      refresh(res.items);
      setAdding(false);
      setPickPlanId('');
      notice.success('已添加团契共读计划');
    }
  }, [pickPlanId, startDate, addAction, groupId, refresh, notice]);

  const toggleJoin = useCallback(
    async (planId: string, wantJoin: boolean) => {
      if (!user) {
        goLogin();
        return;
      }
      if (!isMember) {
        notice.error('请先加入团契再参与共读');
        return;
      }
      const res = await joinAction.run(() =>
        apiPost<{ items: GroupPlanItem[] }>(`/groups/${groupId}/plans/${planId}/join`, {
          join: wantJoin,
        }),
      );
      if (res) {
        refresh(res.items);
        notice.success(wantJoin ? '已加入共读，读经会自动打卡' : '已退出共读');
      }
    },
    [user, isMember, joinAction, groupId, refresh, goLogin, notice],
  );

  const openProgress = useCallback(
    async (planId: string) => {
      setProgressOpen(planId);
      setProgress(null);
      const res = await progressAction.run(() =>
        apiGet<{
          days: number;
          expectedDay: number;
          startDate: string;
          members: ProgressMember[];
        }>(`/groups/${groupId}/plans/${planId}/progress`),
      );
      if (res) setProgress(res);
    },
    [groupId, progressAction],
  );

  const progressPlan = items.find((it) => it.planId === progressOpen);

  return (
    <section className="py-8 border-t border-ink-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl p-5 md:p-6 shadow-soft border border-ink-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold text-ink-900">小组共读</h2>
            {isOwner && (
              <button
                onClick={() => setAdding((v) => !v)}
                className="btn-primary btn-sm px-4 text-sm"
              >
                {adding ? '取消' : '添加共读计划'}
              </button>
            )}
          </div>

          {isOwner && adding && (
            <div className="rounded-2xl bg-ink-50/60 border border-ink-100 p-4 mb-4 space-y-3">
              <select
                aria-label="选择读经计划"
                value={pickPlanId}
                onChange={(e) => setPickPlanId(e.target.value)}
                className="input-styled"
              >
                <option value="">选择读经计划…</option>
                {READING_PLANS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.emoji} {p.title}（{p.days}天）
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 flex-wrap">
                <label htmlFor="group-plan-start-date" className="text-sm text-ink-500">开始日期</label>
                <input
                  id="group-plan-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input-styled"
                />
                <button
                  onClick={submitAdd}
                  disabled={addAction.pending}
                  className="btn-gold btn-sm px-4 text-sm ml-auto"
                >
                  {addAction.pending ? '添加中…' : '确定添加'}
                </button>
              </div>
              {addAction.error && <p className="text-rose-600 text-sm">{addAction.error}</p>}
            </div>
          )}

          {loading && <p className="text-sm text-ink-400">加载中…</p>}
          {error && <p className="text-sm text-rose-600">共读计划加载失败</p>}

          {!loading && items.length === 0 && (
            <p className="text-center py-6 text-ink-400 text-sm">
              {isOwner
                ? '还没有共读计划，点右上角添加，带弟兄姊妹一起读经'
                : '团长还未发起共读计划'}
            </p>
          )}

          <div className="space-y-4">
            {items.map((it) => (
              <div key={it.planId} className="rounded-2xl border border-ink-100 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center text-2xl flex-shrink-0">
                    {it.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-ink-900">{it.title}</h3>
                      <span className="text-xs text-ink-400">{it.joinedCount} 人参与</span>
                    </div>
                    <p className="text-sm text-ink-500 mt-0.5">{it.subtitle}</p>
                    <p className="text-xs text-ink-400 mt-1">
                      开始于 {it.startDate} · 应读第 {it.expectedDay}/{it.days} 天
                    </p>

                    {isMember && it.myJoined && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-ink-500 mb-1">
                          <span>我的进度</span>
                          <span>
                            {it.myDone}/{it.days} 天（{it.myPercent}%）
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
                          <div
                            className="h-full bg-primary-500"
                            style={{ width: `${it.myPercent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  {isMember ? (
                    it.myJoined ? (
                      <>
                        <button
                          onClick={() => toggleJoin(it.planId, false)}
                          disabled={joinAction.pending}
                          className="text-sm px-3 py-1.5 rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-50"
                        >
                          退出共读
                        </button>
                        <button
                          onClick={() => openProgress(it.planId)}
                          className="text-sm px-3 rounded-xl btn-primary btn-sm"
                        >
                          查看进度榜
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => toggleJoin(it.planId, true)}
                        disabled={joinAction.pending}
                        className="text-sm px-3 rounded-xl btn-gold btn-sm"
                      >
                        加入共读
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => notice.error('请先加入团契再参与共读')}
                      className="text-sm px-3 py-1.5 rounded-xl border border-ink-200 text-ink-400"
                    >
                      加入团契后参与
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {progressOpen && (
        <Portal>
          <div
            ref={progressRef}
            data-guard="group-plan-progress-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={progressTitleId}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(17,24,39,0.45)' }}
            onClick={() => !progressAction.pending && setProgressOpen(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-card-hover max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 id={progressTitleId} className="font-display text-lg font-bold text-ink-900">
                  {progressPlan?.emoji} {progressPlan?.title} · 进度榜
                </h3>
                <button
                  onClick={() => setProgressOpen(null)}
                  className="text-ink-400 hover:text-ink-700"
                  aria-label="关闭"
                >
                  ✕
                </button>
              </div>
              {progress ? (
                <>
                  <p className="text-sm text-ink-500 mb-3">
                    开始 {progress.startDate} · 今天应读第 {progress.expectedDay}/{progress.days} 天
                  </p>
                  <div className="space-y-2">
                    {progress.members.map((m) => (
                      <div key={m.userId} className="flex items-center gap-3">
                        <span
                          className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
                          style={{
                            backgroundColor: m.avatarColor || '#3d52d9',
                            width: 32,
                            height: 32,
                            fontSize: 13,
                          }}
                        >
                          {(m.displayName || '?').slice(0, 1)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-ink-900 text-sm truncate">
                              {m.displayName}
                            </span>
                            <span
                              className={`text-xs ${m.behind > 0 ? 'text-rose-600' : 'text-emerald-600'}`}
                            >
                              {m.behind > 0
                                ? `落后 ${m.behind} 天`
                                : m.behind === 0
                                  ? '跟上节奏'
                                  : `超前 ${-m.behind} 天`}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden mt-1">
                            <div
                              className={m.behind > 0 ? 'h-full bg-rose-400' : 'h-full bg-emerald-500'}
                              style={{ width: `${m.percent}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs text-ink-400 flex-shrink-0 w-14 text-right">
                          {m.done}/{progress.days}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-400 py-6 text-center">加载中…</p>
              )}
              {progressAction.error && (
                <p className="text-rose-600 text-xs mt-2">{progressAction.error}</p>
              )}
            </div>
          </div>
        </Portal>
      )}
    </section>
  );
}
