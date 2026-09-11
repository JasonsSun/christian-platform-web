'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiGet, qs } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { AdminLayout, Badge, Loading, Empty, ErrorBox, SectionTitle } from '../_components';
import type { AuditLog } from '../_components';

const ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'USER_REGISTER',
  'CONTENT_CREATE',
  'CONTENT_APPROVE',
  'CONTENT_REJECT',
  'ACTIVITY_REGISTER',
  'USER_ROLE_CHANGE',
  'USER_STATUS_CHANGE',
];

export default function AdminAuditPage() {
  const { user, loading: authLoading } = useAuth();
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const path = `/admin/audit${qs({ action, page, pageSize })}`;
  const { data, loading, error, reload } = useApi<{ items: AuditLog[]; total: number }>(path, [action, page]);

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  if (user === null)
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">
        请先登录以访问管理后台。 <Link className="btn-primary ml-2" href="/login">去登录</Link>
      </div>
    );
  if (user.role !== 'moderator' && user.role !== 'admin')
    return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">无权限访问（需要审核员或管理员角色）。</div>;

  function onAction(v: string) {
    setAction(v);
    setPage(1);
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-900">审计日志</h1>
        <button className="btn-secondary" onClick={reload}>刷新</button>
      </div>

      <div className="glass rounded-2xl p-4 mb-5 flex items-center gap-3 shadow-soft">
        <label className="text-sm text-ink-500">操作类型</label>
        <select className="input-styled w-56" value={action} onChange={(e) => onAction(e.target.value)}>
          <option value="">全部动作</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <Empty label="暂无审计日志" />
      ) : (
        <>
          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-ink-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">时间</th>
                    <th className="text-left px-4 py-3 font-medium">操作人</th>
                    <th className="text-left px-4 py-3 font-medium">动作</th>
                    <th className="text-left px-4 py-3 font-medium">对象类型</th>
                    <th className="text-left px-4 py-3 font-medium">对象 ID</th>
                    <th className="text-left px-4 py-3 font-medium">详情</th>
                    <th className="text-left px-4 py-3 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.id} className="border-t border-ink-100 hover:bg-ink-50/50 align-top">
                      <td className="px-4 py-3 text-ink-400 whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                      <td className="px-4 py-3 text-ink-700 whitespace-nowrap">
                        {a.actor_name || '-'}
                        {a.actor_username ? <div className="text-xs text-ink-400">{a.actor_username}</div> : null}
                      </td>
                      <td className="px-4 py-3"><Badge tone="blue">{a.action}</Badge></td>
                      <td className="px-4 py-3 text-ink-600">{a.entity_type || '-'}</td>
                      <td className="px-4 py-3 text-ink-600 font-mono text-xs">{a.entity_id || '-'}</td>
                      <td className="px-4 py-3 text-ink-600 max-w-xs break-words">{a.detail || '-'}</td>
                      <td className="px-4 py-3 text-ink-400 whitespace-nowrap">{a.ip || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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
