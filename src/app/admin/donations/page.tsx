'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiPatch, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { formatDateTime } from '@/lib/format';
import { AdminLayout, StatCard, Badge, Loading, Empty, ErrorBox } from '../_components';
import type { AdminDonation, AdminDonationResult } from '@/lib/types';

/**
 * 捐赠管理(仅管理员)
 * 这是全站唯一能看到真实捐赠金额的界面。
 * 所有高风险操作(驳回)走「跳转式确认页」,不使用 confirm 弹框。
 */

const STATUS_TABS = [
  { id: '', label: '全部' },
  { id: 'pending', label: '待确认' },
  { id: 'confirmed', label: '已确认' },
  { id: 'rejected', label: '已驳回' },
] as const;

function StatusTag({ status }: { status: string }) {
  if (status === 'confirmed') return <Badge tone="green">已确认</Badge>;
  if (status === 'rejected') return <Badge tone="red">已驳回</Badge>;
  return <Badge tone="gold">待确认</Badge>;
}

export default function AdminDonationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const path = `/admin/donations${qs({ status, q, page, pageSize })}`;
  const { data, loading, error, reload } = useApi<AdminDonationResult>(path, [status, q, page]);

  const { run, pending } = useAction();
  const notice = useNotice();
  const confirmNav = useConfirmNav();

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  if (user === null)
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">
        请先登录以访问管理后台。 <Link className="btn-primary ml-2" href="/login">去登录</Link>
      </div>
    );
  if (user.role !== 'admin')
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">
        无权限访问（捐赠金额仅平台管理员可见）。
      </div>
    );

  async function confirmOne(d: AdminDonation) {
    await run(async () => {
      await apiPatch('/admin/donations', { id: d.id, action: 'confirm' });
      notice.success(`已确认 ${d.displayName} 的捐赠`);
      reload();
    });
  }

  function rejectOne(d: AdminDonation) {
    // 驳回属高风险操作 —— 跳转独立确认页，可填写原因，不使用 prompt 弹框
    confirmNav({
      title: `驳回「${d.displayName}」的捐赠记录`,
      desc: '驳回后该记录不会出现在公开名录中。可填写驳回原因（选填），仅管理员可见。',
      danger: true,
      confirmText: '确认驳回',
      cancelText: '取消',
      back: '/admin/donations',
      action: 'admin.donation.reject',
      params: { id: d.id },
      input: { label: '驳回原因（选填）', placeholder: '如：金额与到账记录不符', multiline: true },
      onConfirm: async (value) => {
        await apiPatch('/admin/donations', { id: d.id, action: 'reject', note: value || '' });
        notice.success('已驳回该捐赠记录');
      },
    });
  }

  const stats = data?.stats;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">捐赠管理</h1>
          <p className="text-sm text-ink-500 mt-1">真实金额仅本页可见，公开名录一律脱敏为 ****元</p>
        </div>
        <button className="btn-secondary" onClick={reload}>刷新</button>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="累计捐赠金额" value={stats ? `¥${stats.totalAmountText}` : '—'} hint="仅统计已确认" />
        <StatCard title="本月捐赠金额" value={stats ? `¥${stats.monthAmountText}` : '—'} hint="自然月内已确认" />
        <StatCard title="待确认" value={stats?.pendingCount ?? '—'} hint="需管理员核对到账" />
        <StatCard title="记录总数" value={stats?.count ?? '—'} hint={`已确认 ${stats?.confirmedCount ?? 0} · 已驳回 ${stats?.rejectedCount ?? 0}`} />
      </div>

      {/* 筛选 */}
      <div className="glass rounded-2xl p-4 mb-5 flex flex-wrap gap-3 items-center shadow-soft">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setStatus(t.id); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${
                status === t.id ? 'bg-primary-600 text-white shadow-card' : 'text-ink-600 hover:bg-primary-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="input-styled flex-1 min-w-[200px]"
          aria-label="搜索展示名 / 教会名 / 留言 / 用户名"
          placeholder="搜索展示名 / 教会名 / 留言 / 用户名"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
      </div>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <Empty label="没有匹配的捐赠记录" />
      ) : (
        <>
          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">捐赠管理</caption>
                <thead className="bg-ink-50 text-ink-600">
                  <tr>
                    <th scope="col" className="text-left px-4 py-3 font-medium">捐赠人（名录名）</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">名义</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium">真实金额</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">留言</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">状态</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">提交时间</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((d) => (
                    <tr key={d.id} className="border-t border-ink-100 hover:bg-ink-50/50 align-top">
                      <td className="px-4 py-3">
                        <div className="text-ink-800 font-medium">
                          {d.displayName}
                          {d.anonymous ? <span className="ml-1.5 text-[11px] text-ink-400">（匿名展示）</span> : null}
                        </div>
                        <div className="text-xs text-ink-400 mt-0.5">
                          {d.donor ? `@${d.donor.username} · ${d.donor.displayName}` : '账号已注销'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {d.donorType === 'church' ? (
                          <Badge tone="gold">教会名义</Badge>
                        ) : (
                          <Badge tone="gray">个人</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-display font-bold text-gold-700">¥{d.amountText}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="text-ink-600 break-words">{d.message || '-'}</div>
                        {d.note ? <div className="text-xs text-rose-600 mt-1">备注：{d.note}</div> : null}
                      </td>
                      <td className="px-4 py-3">
                        <StatusTag status={d.status} />
                        {d.reviewedAt ? (
                          <div className="text-xs text-ink-400 mt-1">{formatDateTime(d.reviewedAt)}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-ink-400">{formatDateTime(d.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            className="btn-primary btn-sm text-xs px-2.5"
                            disabled={pending || d.status === 'confirmed'}
                            onClick={() => confirmOne(d)}
                            title={d.status === 'confirmed' ? '已是已确认状态' : '确认并展示到公开名录'}
                          >
                            确认
                          </button>
                          <button
                            className="text-xs px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 disabled:opacity-40"
                            disabled={pending || d.status === 'rejected'}
                            onClick={() => rejectOne(d)}
                            title={d.status === 'rejected' ? '已是已驳回状态' : '驳回并不予展示'}
                          >
                            驳回
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-between mt-4 text-sm text-ink-500">
            <span>共 {data.total} 条</span>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                上一页
              </button>
              <span className="px-2 py-1">第 {page} 页</span>
              <button
                className="btn-secondary"
                disabled={page * pageSize >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
