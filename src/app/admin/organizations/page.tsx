'use client';

import { useState } from 'react';
import { apiPatch, apiDelete } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox } from '../_components';

interface AdminOrg {
  id: string; name: string; type: string; description: string; city: string; region: string;
  contact: string; status: string; createdAt: string; owner: string; memberCount: number;
}

const TYPE_LABEL: Record<string, string> = { church: '教会', fellowship: '团契', ministry: '事工', charity: '公益' };
const STATUS_MAP: Record<string, { tone: 'green' | 'gold' | 'red'; label: string }> = {
  approved: { tone: 'green', label: '已通过' },
  pending: { tone: 'gold', label: '待审核' },
  rejected: { tone: 'red', label: '已驳回' },
};

export default function AdminOrganizationsPage() {
  const { user } = useAuth();
  const notice = useNotice();
  const confirmNav = useConfirmNav();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const { data, loading, error, reload } = useApi<{
    items: AdminOrg[]; total: number;
    byStatus: { status: string; c: number }[];
    byType: { type: string; c: number }[];
  }>(`/admin/organizations?q=${encodeURIComponent(q)}&status=${status}`, [q, status]);

  // 审核员：只能审核（通过/驳回）；删除组织仅管理员可操作
  const canReview = !!user && (user.role === 'admin' || user.role === 'moderator');
  const canDelete = user?.role === 'admin';

  async function review(id: string, next: 'approved' | 'rejected') {
    setBusy(id); setMsg('');
    try {
      await apiPatch('/admin/organizations', { orgId: id, status: next });
      setMsg(next === 'approved' ? '已通过组织审核' : '已驳回组织申请');
      reload();
    } catch (e: any) {
      setMsg(e?.message || '操作失败');
    } finally {
      setBusy(null);
    }
  }

  function deleteOrg(o: AdminOrg) {
    confirmNav({
      title: `删除组织「${o.name}」`,
      desc: `将删除该组织及其 ${o.memberCount} 名成员关系，不可恢复。\n创建者会收到通知。`,
      danger: true,
      confirmText: '确认删除',
      back: '/admin/organizations',
      action: 'admin.org.delete',
      params: { orgId: o.id },
      onConfirm: async () => {
        await apiDelete(`/admin/organizations?id=${encodeURIComponent(o.id)}`);
        notice.success('组织已删除');
        reload();
      },
    });
  }

  const items = data?.items || [];

  return (
    <AdminLayout>
      <SectionTitle>组织管理</SectionTitle>
      <p className="-mt-3 mb-4 text-sm text-ink-500">教会 / 团契 / 事工 / 公益组织的审核与成员管理</p>

      {/* 组织是什么、从哪来 —— 管理台最容易看不懂的一块，直接讲清楚 */}
      <div className="mb-6 rounded-2xl border border-ink-100 bg-ink-50/60 px-5 py-4 text-sm text-ink-600 space-y-2">
        <p className="font-semibold text-ink-800">这些组织是怎么来的？</p>
        <ul className="list-disc pl-5 space-y-1 text-ink-500">
          <li>
            <span className="text-ink-700">机构是独立于「团契」的实体档案</span>：团契面向用户自发结社（谁都能建团、拉人聊天），
            而组织/机构面向正式登记的主体（教会、事工机构、公益团体），带联系人、城市与审核状态。
          </li>
          <li>
            <span className="text-ink-700">产生方式</span>：由「注册机构」申请提交后落到本表，初始状态为
            <span className="text-amber-600 font-medium"> 待审核</span>；也支持平台运营在后台代为录入。
          </li>
          <li>
            <span className="text-ink-700">审核员</span>负责「通过 / 驳回」；<span className="text-ink-700">管理员</span>
            额外拥有删除权。审核通过后组织才会出现在前台的机构/就近页面。
          </li>
          <li>
            <span className="text-ink-400">注：组织成员（organization_members）与团契成员是两套独立关系，互不影响。</span>
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="组织总数" value={data?.total ?? '—'} />
        <StatCard title="待审核" value={data?.byStatus?.find((s) => s.status === 'pending')?.c ?? 0} />
        <StatCard title="已通过" value={data?.byStatus?.find((s) => s.status === 'approved')?.c ?? 0} />
        <StatCard title="已驳回" value={data?.byStatus?.find((s) => s.status === 'rejected')?.c ?? 0} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input className="input-styled flex-1 min-w-[180px]" placeholder="搜索组织名称 / 城市" value={q} onChange={(e) => setQ(e.target.value)} />
        {['', 'pending', 'approved', 'rejected'].map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${status === s ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
            {s === '' ? '全部' : STATUS_MAP[s]?.label}
          </button>
        ))}
      </div>

      {!canDelete ? (
        <p className="mb-4 text-xs text-amber-600">
          当前为审核员视角：可通过 / 驳回组织审核；删除组织等破坏性操作仅平台管理员可执行。
        </p>
      ) : null}

      {msg ? <div className="mb-4 text-sm text-primary-700 bg-primary-50 rounded-xl px-4 py-2">{msg}</div> : null}

      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : items.length === 0 ? (
        <Empty label="暂无组织" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">组织</th>
                <th className="text-left px-4 py-3 font-medium">类型</th>
                <th className="text-left px-4 py-3 font-medium">城市</th>
                <th className="text-center px-4 py-3 font-medium">成员</th>
                <th className="text-center px-4 py-3 font-medium">状态</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id} className="border-t border-ink-100 hover:bg-primary-50/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">{o.name}</div>
                    <div className="text-xs text-ink-400 line-clamp-1 max-w-[300px]">{o.description}</div>
                  </td>
                  <td className="px-4 py-3"><Badge tone="primary">{TYPE_LABEL[o.type] || o.type}</Badge></td>
                  <td className="px-4 py-3 text-ink-600">{o.city || '—'}</td>
                  <td className="px-4 py-3 text-center text-ink-700">{o.memberCount}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={STATUS_MAP[o.status]?.tone || 'gray'}>{STATUS_MAP[o.status]?.label || o.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {canReview && o.status !== 'approved' ? (
                      <button disabled={busy === o.id} onClick={() => review(o.id, 'approved')} className="text-emerald-600 hover:underline disabled:opacity-50">通过</button>
                    ) : null}
                    {canReview && o.status !== 'rejected' ? (
                      <button disabled={busy === o.id} onClick={() => review(o.id, 'rejected')} className="text-rose-600 hover:underline disabled:opacity-50">驳回</button>
                    ) : null}
                    {canDelete ? (
                      <button disabled={busy === o.id} onClick={() => deleteOrg(o)} className="text-rose-700 font-medium hover:underline disabled:opacity-50">删除</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
