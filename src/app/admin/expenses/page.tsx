'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiPost, apiPatch, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { formatDateTime } from '@/lib/format';
import { scrollBehavior } from '@/lib/motion';
import { AdminLayout, StatCard, Badge, Loading, TableSkeleton, TableShell, Th, Empty, ErrorBox, PageHead, Toolbar } from '../_components';
import type { AdminExpense, AdminExpenseResult } from '@/lib/types';

/**
 * 支出公示管理(仅管理员)
 * 录入/编辑/下架/删除公示页展示的支出明细。
 * 删除走「跳转式确认页」,不使用 confirm 弹框。
 */

const CATEGORY_OPTIONS = [
  { id: 'server', label: '服务器' },
  { id: 'bandwidth', label: '带宽/CDN' },
  { id: 'storage', label: '存储' },
  { id: 'ops', label: '运维' },
  { id: 'domain', label: '域名/证书' },
  { id: 'other', label: '其他' },
];

const STATUS_TABS = [
  { id: '', label: '全部' },
  { id: 'published', label: '公示中' },
  { id: 'hidden', label: '已下架' },
] as const;

function StatusTag({ status }: { status: string }) {
  if (status === 'published') return <Badge tone="green">公示中</Badge>;
  return <Badge tone="gray">已下架</Badge>;
}

export default function AdminExpensesPage() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const path = `/admin/expenses${qs({ status, category, page, pageSize })}`;
  const { data, loading, error, reload } = useApi<AdminExpenseResult>(path, [status, category, page]);

  const { run, pending } = useAction();
  const notice = useNotice();
  const confirmNav = useConfirmNav();

  // 新增表单
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fCategory, setFCategory] = useState('server');
  const [fTitle, setFTitle] = useState('');
  const [fNote, setFNote] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fPeriod, setFPeriod] = useState('');
  const [fStatus, setFStatus] = useState('published');

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  if (user === null)
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">
        请先登录以访问管理后台。 <Link className="btn-primary ml-2" href="/login">去登录</Link>
      </div>
    );
  if (user.role !== 'admin')
    return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">无权限访问（支出公示仅平台管理员可维护）。</div>;

  function resetForm() {
    setEditId(null);
    setFCategory('server');
    setFTitle('');
    setFNote('');
    setFAmount('');
    setFPeriod('');
    setFStatus('published');
  }

  function startEdit(e: AdminExpense) {
    setEditId(e.id);
    setFCategory(e.category);
    setFTitle(e.title);
    setFNote(e.note);
    setFAmount(e.amountText);
    setFPeriod(e.period);
    setFStatus(e.status);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }

  async function submitForm() {
    const body = {
      category: fCategory,
      title: fTitle,
      note: fNote,
      amount: fAmount,
      period: fPeriod || undefined,
      status: fStatus,
    };
    await run(async () => {
      if (editId) {
        await apiPatch('/admin/expenses', { id: editId, ...body });
        notice.success('支出记录已更新');
      } else {
        await apiPost('/admin/expenses', body);
        notice.success('支出记录已录入');
      }
      setShowForm(false);
      resetForm();
      reload();
    });
  }

  async function toggleStatus(e: AdminExpense) {
    const next = e.status === 'published' ? 'hidden' : 'published';
    await run(async () => {
      await apiPatch('/admin/expenses', { id: e.id, status: next });
      notice.success(next === 'published' ? '已上架公示' : '已下架（公示页不再展示）');
      reload();
    });
  }

  function removeOne(e: AdminExpense) {
    // 删除属高风险操作 —— 跳转独立确认页
    confirmNav({
      title: `删除支出记录「${e.title}」`,
      desc: '删除后该记录将从公示页与管理列表中彻底移除，且不可恢复。如只是暂时不展示，请改用「下架」。',
      danger: true,
      confirmText: '确认删除',
      cancelText: '取消',
      back: '/admin/expenses',
      action: 'admin.expense.delete',
      params: { id: e.id },
      onConfirm: async () => {
        notice.success('已删除该支出记录');
      },
    });
  }

  const stats = data?.stats;

  return (
    <AdminLayout>
      <PageHead
        eyebrow="运营 · 财务"
        title="支出公示管理"
        sub="维护公示页展示的开销明细 · 结余 = 已确认捐赠收入 − 已公示支出（仅管理员口径）"
        actions={
          <>
            <Link href="/donate/transparency" className="btn-secondary btn-sm min-h-11 lg:min-h-0" target="_blank" rel="noopener noreferrer">查看公示页</Link>
            <button
              className="btn-primary btn-sm min-h-11 lg:min-h-0"
              onClick={() => { if (!showForm) resetForm(); setShowForm(!showForm); }}
            >
              {showForm ? '收起表单' : '录入支出'}
            </button>
          </>
        }
      />

      {/* 统计 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="已公示支出" value={stats ? `¥${stats.publishedAmountText}` : '—'} hint={`${stats?.publishedCount ?? 0} 笔`} />
        <StatCard title="已确认捐赠收入" value={stats ? `¥${stats.incomeConfirmedText}` : '—'} hint="仅管理员可见口径" />
        <StatCard
          title="结余（收入 − 支出）"
          value={stats ? `¥${stats.balanceText}` : '—'}
          hint={stats && stats.balanceCents < 0 ? '支出超过已确认收入，请核对' : '用于后续开销'}
        />
        <StatCard title="记录总数" value={stats?.count ?? '—'} hint={`公示中 ${stats?.publishedCount ?? 0} · 已下架 ${stats?.hiddenCount ?? 0}`} />
      </div>

      {/* 新增/编辑表单 */}
      {showForm && (
        <div className="glass rounded-2xl p-5 mb-6 shadow-soft">
          <h2 className="font-display text-lg font-bold text-ink-900 mb-4">
            {editId ? '编辑支出记录' : '录入支出'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <label className="block">
              <span className="text-sm text-ink-600 font-medium">分类</span>
              <select className="input-styled mt-1" value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-ink-600 font-medium">
                支出事项 <span aria-hidden="true">*</span><span className="sr-only">（必填）</span>
              </span>
              <input
                className="input-styled mt-1"
                aria-required="true"
                placeholder="如：10月服务器续费"
                value={fTitle}
                maxLength={120}
                onChange={(e) => setFTitle(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm text-ink-600 font-medium">
                金额（元）<span aria-hidden="true">*</span><span className="sr-only">（必填）</span>
              </span>
              <input
                className="input-styled mt-1"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                aria-required="true"
                placeholder="如 199.00"
                value={fAmount}
                onChange={(e) => setFAmount(e.target.value)}
              />
            </label>
            {/* 归属月份落库格式固定为 YYYY-MM（POST/PUT 均按 /^\d{4}-\d{2}$/ 校验），留空即回落到本月 */}
            <label className="block">
              <span className="text-sm text-ink-600 font-medium">归属月份</span>
              <input
                className="input-styled mt-1"
                type="month"
                aria-label="归属月份，留空默认本月"
                value={fPeriod}
                onChange={(e) => setFPeriod(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm text-ink-600 font-medium">公示状态</span>
              <select className="input-styled mt-1" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="published">公示中（对外可见）</option>
                <option value="hidden">已下架（暂不展示）</option>
              </select>
            </label>
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="text-sm text-ink-600 font-medium">说明（选填）</span>
              <textarea
                className="input-styled mt-1"
                rows={2}
                maxLength={500}
                placeholder="补充说明，如服务商、配置规格、账单周期等"
                value={fNote}
                onChange={(e) => setFNote(e.target.value)}
              />
            </label>
          </div>
          <div className="flex gap-2 mt-4">
            <button className="btn-primary" disabled={pending || !fTitle.trim() || !fAmount} onClick={submitForm}>
              {pending ? '提交中…' : editId ? '保存修改' : '录入并公示'}
            </button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>
              取消
            </button>
          </div>
        </div>
      )}

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
        <div className="flex flex-wrap gap-1.5 ml-auto">
          <button
            onClick={() => { setCategory(''); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${!category ? 'bg-ink-800 text-white' : 'text-ink-500 hover:bg-ink-100'}`}
          >
            全部分类
          </button>
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c.id}
              onClick={() => { setCategory(category === c.id ? '' : c.id); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                category === c.id ? 'bg-ink-800 text-white' : 'text-ink-500 hover:bg-ink-100'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <Empty label="没有支出记录，点击右上角「录入支出」开始公示" />
      ) : (
        <>
          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">支出公示管理</caption>
                <thead className="bg-ink-50 text-ink-600">
                  <tr>
                    <th scope="col" className="text-left px-4 py-3 font-medium">归属月份</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">分类</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">支出事项</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium">金额</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">状态</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">录入时间</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((e) => (
                    <tr key={e.id} className="border-t border-ink-100 hover:bg-ink-50/50 align-top">
                      <td className="px-4 py-3 text-ink-500 whitespace-nowrap font-medium">{e.period}</td>
                      <td className="px-4 py-3 text-ink-600">
                        {CATEGORY_OPTIONS.find((c) => c.id === e.category)?.label || e.category}
                      </td>
                      <td className="px-4 py-3 max-w-[240px]">
                        <div className="text-ink-800 font-medium break-words">{e.title}</div>
                        {e.note ? <div className="text-xs text-ink-400 mt-1 break-words">{e.note}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-display font-bold text-ink-900">¥{e.amountText}</span>
                      </td>
                      <td className="px-4 py-3"><StatusTag status={e.status} /></td>
                      <td className="px-4 py-3 text-ink-400 whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          <button
                            className="btn-chip"
                            disabled={pending}
                            onClick={() => startEdit(e)}
                          >
                            编辑
                          </button>
                          <button
                            className={`btn-chip ${e.status === 'published' ? '' : 'btn-chip-accent'}`}
                            disabled={pending}
                            onClick={() => toggleStatus(e)}
                          >
                            {e.status === 'published' ? '下架' : '上架'}
                          </button>
                          <button
                            className="btn-chip btn-chip-danger"
                            disabled={pending}
                            onClick={() => removeOne(e)}
                          >
                            删除
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
