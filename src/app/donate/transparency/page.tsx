'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { qs } from '@/lib/api';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import type { ExpenseListResult } from '@/lib/types';

/**
 * 支出公示页 —— 对所有人开放
 *
 * 透明度约定(与捐赠方向相反):
 *  - 支出明细与金额全额公开,这正是公示的意义;
 *  - 捐赠收入总额不在此展示(真实金额仅管理员可见),
 *    公示页只呈现「钱花在哪儿」的支出侧数据。
 */

const CATEGORY_COLOR: Record<string, string> = {
  server: 'bg-primary-600',
  bandwidth: 'bg-sky-500',
  storage: 'bg-emerald-500',
  ops: 'bg-gold-500',
  domain: 'bg-rose-400',
  other: 'bg-ink-400',
};

export default function TransparencyPage() {
  const [category, setCategory] = useState('');
  const [period, setPeriod] = useState('');

  const path = `/expenses${qs({ category, period })}`;
  const { data, loading, error, reload } = useApi<ExpenseListResult>(path, [category, period]);

  // 未筛选那一次的快照：总览三个数字和月份胶囊都从它取。
  // 接口里 byPeriod 是跟着筛选走的，原先直接拿当前 data —— 点中 2026-08 之后整排月份
  // 就只剩「2026-08」一个，想再看 7 月必须先点「全部」（顺手把分类也清了）；
  // 「累计公示支出」也会偷偷变成「本月支出」，标签没变、口径变了。
  const [baseline, setBaseline] = useState<ExpenseListResult | null>(null);
  useEffect(() => {
    if (data && !category && !period) setBaseline(data);
  }, [data, category, period]);
  const overview = baseline ?? data;

  const total = data?.totalCents ?? 0;
  const maxCat = Math.max(1, ...(data?.byCategory ?? []).map((c) => c.amountCents));
  const filtered = !!(category || period);

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
            全额公开 · 每一笔都可查
          </span>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-4">支出公示</h1>
          <p className="mt-3 max-w-2xl text-white/80 leading-relaxed">
            弟兄姊妹的奉献用在了哪里？本页公开平台运行的全部开销明细——
            <strong className="text-gold-300 font-semibold">每一笔支出的事项、归属月份与金额全额展示</strong>，
            不作任何脱敏。捐赠收入的具体数额因隐私保护不公开，支出明细则完全透明，接受全体监督。
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/donate" className="btn-gold inline-flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              返回捐赠专区
            </Link>
            <span className="text-xs text-white/60">支出由管理员录入并公示 · 有疑问欢迎联系核实</span>
          </div>
        </div>
      </section>

      {/* 总览统计 */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <div className="glass rounded-2xl p-5 shadow-soft">
          <div className="text-sm text-ink-500">累计公示支出</div>
          <div className="font-display text-3xl font-bold text-ink-900 mt-1">
            {overview ? `¥${overview.totalAmountText}` : '—'}
          </div>
        </div>
        <div className="glass rounded-2xl p-5 shadow-soft">
          <div className="text-sm text-ink-500">公示笔数</div>
          <div className="font-display text-3xl font-bold text-ink-900 mt-1">
            {overview ? overview.items.length : '—'}
            <span className="text-base font-medium text-ink-400 ml-1">笔</span>
          </div>
        </div>
        <div className="glass rounded-2xl p-5 shadow-soft">
          <div className="text-sm text-ink-500">覆盖月份</div>
          <div className="font-display text-3xl font-bold text-ink-900 mt-1">
            {overview ? overview.byPeriod.length : '—'}
            <span className="text-base font-medium text-ink-400 ml-1">个月</span>
          </div>
        </div>
      </section>

      {/* 筛选 */}
      <section className="glass rounded-2xl p-4 mt-6 flex flex-wrap gap-3 items-center shadow-soft">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => { setCategory(''); setPeriod(''); }}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${
              !category && !period ? 'bg-primary-600 text-white shadow-card' : 'text-ink-600 hover:bg-primary-50'
            }`}
          >
            全部
          </button>
          {(data?.categories ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => { setCategory(category === c.id ? '' : c.id); setPeriod(''); }}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${
                category === c.id ? 'bg-primary-600 text-white shadow-card' : 'text-ink-600 hover:bg-primary-50'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {(overview?.byPeriod ?? []).map((p) => (
            <button
              key={p.period}
              onClick={() => setPeriod(period === p.period ? '' : p.period)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                period === p.period ? 'bg-gold-500 text-ink-950 shadow-card' : 'text-ink-500 hover:bg-gold-50'
              }`}
            >
              {p.period}
            </button>
          ))}
        </div>
      </section>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <div className="mt-6">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="mt-6">
          <Empty
            label={filtered ? '这个筛选条件下没有公示记录' : '暂无公示的支出记录'}
            hint={filtered ? '换个月份或分类看看，也可以回到全部记录。' : '平台尚未录入开销明细，录入后这里会自动列出。'}
          >
            {filtered && (
              <button className="btn-secondary text-sm" onClick={() => { setCategory(''); setPeriod(''); }}>
                清除筛选
              </button>
            )}
          </Empty>
        </div>
      ) : (
        <>
          {/* 分类占比 */}
          <section className="mt-6">
            <h2 className="font-display text-xl font-bold text-ink-900 mb-4">钱花在哪儿</h2>
            <div className="glass rounded-2xl p-6 shadow-soft space-y-4">
              {data.byCategory.map((c) => {
                const pct = total > 0 ? Math.round((c.amountCents / total) * 100) : 0;
                return (
                  <div key={c.category}>
                    <div className="flex items-baseline justify-between text-sm mb-1.5">
                      <span className="text-ink-700 font-medium">
                        {c.label}
                        <span className="text-ink-400 ml-1.5 text-xs">{c.count} 笔</span>
                      </span>
                      <span className="text-ink-600">
                        ¥{c.amountText}
                        <span className="text-ink-400 ml-1.5 text-xs">{pct}%</span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-ink-100 overflow-hidden" aria-hidden>
                      <div
                        className={`h-full rounded-full ${CATEGORY_COLOR[c.category] || 'bg-ink-400'}`}
                        style={{ width: `${Math.max(2, (c.amountCents / maxCat) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 明细表 */}
          <section className="mt-8">
            <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-ink-900">支出明细</h2>
                <p className="text-sm text-ink-500 mt-1">按归属月份倒序 · 全额公开，无脱敏</p>
              </div>
              <button className="btn-secondary text-sm" onClick={reload}>刷新</button>
            </div>
            <div className="bg-white rounded-2xl border border-ink-100 shadow-soft overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <caption className="sr-only">支出明细</caption>
                  <thead className="bg-ink-50 text-ink-600">
                    <tr>
                      <th scope="col" className="text-left px-4 py-3 font-medium">归属月份</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium">分类</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium">支出事项</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium">说明</th>
                      <th scope="col" className="text-right px-4 py-3 font-medium">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((e) => (
                      <tr key={e.id} className="border-t border-ink-100 hover:bg-ink-50/50 align-top">
                        <td className="px-4 py-3 text-ink-500 whitespace-nowrap font-medium">{e.period}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-700">
                            <span aria-hidden className={`w-2 h-2 flex-shrink-0 rounded-full ${CATEGORY_COLOR[e.category] || 'bg-ink-400'}`} />
                            {e.categoryLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink-800 font-medium max-w-[260px] break-words">{e.title}</td>
                        <td className="px-4 py-3 text-ink-500 max-w-[280px] break-words">{e.note || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-display font-bold text-ink-900">¥{e.amountText}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 月度汇总 */}
          <section className="mt-8">
            <h2 className="font-display text-xl font-bold text-ink-900 mb-4">月度汇总</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.byPeriod.map((p) => (
                <div key={p.period} className="glass rounded-2xl p-4 shadow-soft">
                  <div className="text-sm text-ink-500 font-medium">{p.period}</div>
                  <div className="font-display text-xl font-bold text-ink-900 mt-1">¥{p.amountText}</div>
                  <div className="text-xs text-ink-400 mt-0.5">{p.count} 笔支出</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* 说明 */}
      <section className="mt-8 bg-white rounded-2xl border border-ink-100 shadow-soft p-6">
        <h2 className="font-display text-lg font-bold text-ink-900 mb-3">关于支出公示的说明</h2>
        <ul className="space-y-2.5 text-sm text-ink-600 leading-relaxed">
          {[
            '支出明细由平台管理员按实际开销录入，金额全额公开，不作脱敏。',
            '分类口径：服务器 / 带宽·CDN / 存储 / 运维 / 域名·证书 / 其他。',
            '归属月份按费用账单所属月份记录，与录入时间可能不同。',
            '若发现记录有疑问，欢迎联系平台管理员核实，核实后将及时更正并留痕。',
            '捐赠收入的具体数额因隐私保护不对公众公开（名录中一律 ****元），但支出侧完全透明，两者互为对照。',
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
