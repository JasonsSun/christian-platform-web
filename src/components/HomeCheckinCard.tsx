'use client';

import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { apiPost } from '@/lib/api';

/**
 * 首页每日签到卡：仅登录用户可见，紧凑展示连续/累计天数 + 立即签到。
 * 点击后原地刷新（reload growth），并 toast 提示，与 /me 的签到状态保持一致。
 */
export default function HomeCheckinCard() {
  const { user } = useAuth();
  const { success, error: toastError } = useNotice();
  const { data, loading, reload } = useApi<any>('/me/growth', [user?.id]);
  const { run, pending } = useAction();

  if (!user) return null;
  if (loading) {
    return (
      <section className="relative pt-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="glass rounded-2xl p-5 shadow-soft h-20 animate-pulse" />
        </div>
      </section>
    );
  }
  if (!data) return null;

  const c = data.checkin || {};
  const checked = !!c.checked;

  async function checkin() {
    const r = await run(() => apiPost<any>('/me/checkin'));
    if (!r) { toastError('签到失败，请稍后再试'); return; }
    success(r.message || '签到成功');
    if (r.bonus) setTimeout(() => success(r.bonus), 600);
    reload();
  }

  return (
    <section className="relative pt-6">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="glass rounded-2xl p-5 shadow-soft flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-gold shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-display font-bold text-ink-900">每日签到</h3>
              <p className="text-xs text-ink-500 mt-0.5">
                连续 <b className="text-primary-600">{c.streak ?? 0}</b> 天 · 累计 {c.totalDays ?? 0} 天
                {c.longestStreak ? ` · 最长 ${c.longestStreak} 天` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={checkin}
            disabled={pending || checked}
            className="btn-primary disabled:opacity-60 shrink-0"
          >
            {checked ? '今日已签到 ✓' : pending ? '签到中…' : '立即签到'}
          </button>
        </div>
      </div>
    </section>
  );
}
