'use client';

import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { apiPost } from '@/lib/api';
import { IconCalendar, IconCheck } from '@/components/icons';

/**
 * 首页每日签到卡：仅登录用户可见，紧凑展示连续/累计天数 + 立即签到。
 * 点击后原地刷新（reload growth），并 toast 提示，与 /me 的签到状态保持一致。
 */
export default function HomeCheckinCard() {
  const { user } = useAuth();
  const { success, error: toastError } = useNotice();
  // 路径为 null 时 useApi 不发请求：登录态是异步水合的，写死路径会让未登录访客
  // 每次开首页都白发一个必须鉴权的请求（控制台两条 401）
  const { data, loading, reload } = useApi<any>(user ? '/me/growth' : null, [user?.id]);
  const { run, pending } = useAction();

  if (!user) return null;
  if (loading) {
    return (
      <section className="relative pt-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="skeleton-sheen card-tech rounded-2xl p-5 h-[76px]" />
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
        <div data-spot className="spot card-tech rounded-2xl p-5 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-gold shrink-0">
              <IconCalendar className="w-6 h-6 text-white" strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-ink-900">每日签到</h3>
              <p className="text-xs text-ink-500 mt-0.5">
                连续 <b className="num text-primary-600">{c.streak ?? 0}</b> 天 · 累计 <span className="num">{c.totalDays ?? 0}</span> 天
                {c.longestStreak ? <span> · 最长 <span className="num">{c.longestStreak}</span> 天</span> : null}
              </p>
            </div>
          </div>
          {/* 标签从「立即签到」换成「今日已签到」会改变宽度：给一个够宽的下限，避免点完按钮把整行挤动 */}
          <button
            onClick={checkin}
            disabled={pending || checked}
            className="btn-primary min-w-[9.5rem] justify-center disabled:opacity-60 shrink-0"
          >
            {checked ? <IconCheck className="w-4 h-4" strokeWidth={2.4} /> : null}
            {checked ? '今日已签到' : pending ? '签到中…' : '立即签到'}
          </button>
        </div>
      </div>
    </section>
  );
}
