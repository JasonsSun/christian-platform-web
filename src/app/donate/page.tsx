'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { timeAgo } from '@/lib/format';
import type { DonationListResult, DonationItem } from '@/lib/types';

/**
 * 捐赠专区
 *
 * 透明度约定:
 *  - 名录对所有人开放,但金额一律显示 ****元;
 *  - 真实金额只有管理员能看到(服务端已做脱敏,前端只负责渲染);
 *  - 不按教会分区,统一呈现;以教会名义捐赠显示为「xx教会 捐赠 ****元」。
 */

function DonationRow({ item, admin }: { item: DonationItem; admin: boolean }) {
  const isChurch = item.donorType === 'church';
  return (
    <div className="flex items-start gap-4 px-4 py-4 sm:px-5 border-b border-ink-100 last:border-0 hover:bg-ink-50/40 transition-colors">
      <div
        className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white ${
          isChurch ? 'bg-gradient-to-br from-gold-400 to-gold-600' : 'bg-gradient-to-br from-primary-400 to-primary-600'
        }`}
        aria-hidden
      >
        {item.displayName.slice(0, 1)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1">
          <span className="font-semibold text-ink-900 break-all">{item.displayName}</span>
          <span className="text-ink-600">捐赠</span>
          <span className={`font-display font-bold ${item.amountVisible ? 'text-gold-700' : 'text-ink-400 tracking-widest'}`}>
            {item.amountText}元
          </span>
          {isChurch && (
            <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-gold-100 text-gold-800">教会名义</span>
          )}
          {item.mine && (
            <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-primary-50 text-primary-700">我的捐赠</span>
          )}
          {admin && item.amountVisible && (
            <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">真实金额·仅管理员可见</span>
          )}
        </div>
        {item.message ? (
          <p className="mt-1.5 text-sm text-ink-500 leading-relaxed break-words">{item.message}</p>
        ) : null}
      </div>

      <div className="text-xs text-ink-400 flex-shrink-0 pt-1">{timeAgo(item.createdAt)}</div>
    </div>
  );
}

export default function DonatePage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const notice = useNotice();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, loading, error, reload } = useApi<DonationListResult>(
    `/donations?page=${page}&pageSize=${pageSize}`,
    [page, user?.id]
  );

  useEffect(() => {
    if (params.get('ok') === '1') {
      notice.success('捐赠登记已提交，管理员确认后将展示在爱心名录中');
      router.replace('/donate');
      return;
    }
    // 支付网关回跳（支付成功/取消都会带 paid 参数）
    if (params.get('paid') === '1') {
      notice.success('支付已完成，管理员确认后将展示在爱心名录中');
      router.replace('/donate');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const admin = !!data?.viewerIsAdmin;
  const hasMore = !!data && page * pageSize < data.total;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 text-white p-8 md:p-12 shadow-card">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-gold-400/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-16 w-72 h-72 bg-primary-400/20 rounded-full blur-3xl" />
        </div>
        <div className="relative">
          <span className="inline-flex items-center gap-2 text-xs font-medium bg-white/15 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400" />
            自愿捐赠 · 用于平台平稳运行
          </span>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-4">爱心捐赠</h1>
          <p className="mt-3 max-w-2xl text-white/80 leading-relaxed">
            本平台的服务器、带宽与运维开销，来自弟兄姊妹的自愿奉献。
            所有捐赠完全出于自愿，不作任何强求；为保护个人隐私，
            <strong className="text-gold-300 font-semibold">公开名录中的捐赠金额一律以 ****元 展示</strong>，
            真实金额仅平台管理员可见，用于对账与公示监督。
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/donate/new" className="btn-gold inline-flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              我要捐赠
            </Link>
            <Link
              href="/donate/transparency"
              className="inline-flex items-center gap-2 text-sm font-medium text-white/90 border border-white/25 rounded-xl px-4 py-2 hover:bg-white/10 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              支出公示：钱花在哪儿
            </Link>
            <span className="text-xs text-white/60">以个人或教会名义均可 · 提交后由管理员确认展示</span>
          </div>
        </div>
      </section>

      {/* 统计 */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <div className="glass rounded-2xl p-5 shadow-soft">
          <div className="text-sm text-ink-500">累计爱心笔数</div>
          <div className="font-display text-3xl font-bold text-ink-900 mt-1">
            {data?.totalCount ?? '—'}
            <span className="text-base font-medium text-ink-400 ml-1">笔</span>
          </div>
        </div>
        <div className="glass rounded-2xl p-5 shadow-soft">
          <div className="text-sm text-ink-500">参与奉献的个人与团体</div>
          <div className="font-display text-3xl font-bold text-ink-900 mt-1">
            {data?.donorCount ?? '—'}
            <span className="text-base font-medium text-ink-400 ml-1">位</span>
          </div>
        </div>
        <div className="glass rounded-2xl p-5 shadow-soft">
          <div className="flex items-center gap-2 text-sm text-ink-500">
            累计捐赠金额
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-ink-100 text-ink-500">
              {admin ? '仅管理员可见' : '不对公众公开'}
            </span>
          </div>
          <div className={`font-display text-3xl font-bold mt-1 ${admin ? 'text-gold-700' : 'text-ink-400 tracking-widest'}`}>
            {data ? data.totalAmountText : '—'}
            <span className="text-base font-medium ml-1">元</span>
          </div>
        </div>
      </section>

      {/* 名录 */}
      <section className="mt-8">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-ink-900">爱心名录</h2>
            <p className="text-sm text-ink-500 mt-1">
              按时间倒序 · 金额统一脱敏为 ****元 · 不区分教会，统一呈现个人与团体捐赠
            </p>
          </div>
          <button className="btn-secondary text-sm" onClick={reload}>刷新</button>
        </div>

        {loading && !data ? (
          <div className="py-16 text-center text-ink-400">加载中…</div>
        ) : error ? (
          <div className="py-12 text-center rounded-2xl bg-rose-50 text-rose-700">
            <div>{error}</div>
            <button className="btn-secondary mt-3" onClick={reload}>重试</button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="py-16 text-center text-ink-400 border border-dashed border-ink-200 rounded-2xl">
            暂无公示的捐赠记录，欢迎成为第一位奉献者
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-ink-100 shadow-soft overflow-hidden">
            {data.items.map((item) => (
              <DonationRow key={item.id} item={item} admin={admin} />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center mt-5">
            <button className="btn-secondary" disabled={loading} onClick={() => setPage((p) => p + 1)}>
              {loading ? '加载中…' : '加载更多'}
            </button>
          </div>
        )}
      </section>

      {/* 透明说明 */}
      <section className="mt-8 bg-white rounded-2xl border border-ink-100 shadow-soft p-6">
        <h2 className="font-display text-lg font-bold text-ink-900 mb-3">关于捐赠的说明</h2>
        <ul className="space-y-2.5 text-sm text-ink-600 leading-relaxed">
          {[
            '所有捐赠均为自愿行为，金额多少不限，平台不设门槛、不作劝募压力。',
            '捐赠款项仅用于平台运行开销（服务器、带宽、存储与运维），不作商业用途。',
            '为保护隐私，公开名录中的金额一律显示为 ****元，任何非管理员都无法查询到具体数额。',
            '真实捐赠金额仅平台管理员可见，用于对账与公示监督。',
            '以个人名义捐赠展示为「某某 捐赠 ****元」；以教会名义捐赠展示为「某某教会 捐赠 ****元」。',
            '名录不按教会分区，所有奉献一视同仁地呈现。',
            '捐赠登记提交后需管理员确认，确认通过才会出现在名录中；如需更正或撤回，可联系平台管理员。',
          ].map((t, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400 mt-2 flex-shrink-0" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
