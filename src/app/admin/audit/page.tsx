'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiGet, qs } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatIp } from '@/lib/format';
import { auditActionLabel, entityTypeLabel } from '@/lib/labels';
import { AdminLayout, AdminSelect, Badge, Empty, ErrorBox, PageHead, Pagination, TableShell, TableSkeleton, Th, Toolbar } from '../_components';
import type { AuditLog } from '../_components';

const ACTIONS: { value: string; label: string }[] = [
  { value: 'LOGIN_SUCCESS', label: '登录成功' },
  { value: 'LOGIN_FAILURE', label: '登录失败' },
  { value: 'USER_REGISTER', label: '注册账号' },
  { value: 'CONTENT_CREATE', label: '创建内容' },
  { value: 'CONTENT_APPROVE', label: '内容通过' },
  { value: 'CONTENT_REJECT', label: '内容驳回' },
  { value: 'ACTIVITY_REGISTER', label: '活动报名' },
  { value: 'USER_ROLE_CHANGE', label: '变更用户角色' },
  { value: 'USER_STATUS_CHANGE', label: '变更用户状态' },
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
        请先登录以访问管理后台。 <Link className="btn-primary ml-2" href="/login?next=/admin/audit">去登录</Link>
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
      <PageHead
        eyebrow="系统 · 留痕"
        title="审计日志"
        sub="管理员与审核员的每一次处置都会留痕在这里"
        actions={<button className="btn-secondary btn-sm min-h-11 lg:min-h-0" onClick={reload}>刷新</button>}
      />

      <Toolbar>
        <span className="self-center text-[13px] font-medium text-ink-500">操作类型</span>
        <AdminSelect
          id="audit-action"
          label="按操作类型筛选"
          value={action}
          onChange={onAction}
          options={[{ value: '', label: '全部动作' }, ...ACTIONS]}
        />
      </Toolbar>

      {loading && !data ? (
        <TableSkeleton rows={8} cols={5} />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <Empty label="暂无审计日志" hint="换个动作类型，或稍后再来 —— 有处置动作时这里才会有记录" />
      ) : (
        <>
          <TableShell busy={loading}>
              <table className="w-full min-w-[980px] text-sm">
                <caption className="sr-only">审计日志</caption>
                <thead className="bg-ink-50 text-ink-600">
                  <tr>
                    <Th>时间</Th>
                    <Th>操作人</Th>
                    <Th>动作</Th>
                    <Th>对象类型</Th>
                    <Th>对象 ID</Th>
                    <Th>详情</Th>
                    <Th>IP</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.id} className="border-t border-ink-100 hover:bg-ink-50/50 align-top">
                      <td className="num px-3 lg:px-4 py-3 text-ink-400 whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                      <td className="px-3 lg:px-4 py-3 text-ink-700 whitespace-nowrap">
                        {a.actor_name || '-'}
                        {a.actor_username ? <div className="text-xs text-ink-400">{a.actor_username}</div> : null}
                      </td>
                      <td className="px-3 lg:px-4 py-3"><Badge tone="blue">{auditActionLabel(a.action)}</Badge></td>
                      <td className="px-3 lg:px-4 py-3 text-ink-600">{entityTypeLabel(a.entity_type)}</td>
                      <td className="px-3 lg:px-4 py-3 text-ink-600 font-mono text-xs">{a.entity_id || '-'}</td>
                      <td className="px-3 lg:px-4 py-3 text-ink-600 max-w-xs break-words">{a.detail || '-'}</td>
                      <td className="num px-3 lg:px-4 py-3 text-ink-400 whitespace-nowrap">{formatIp(a.ip)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </TableShell>

          <Pagination total={data.total} page={page} pageSize={pageSize} onPage={setPage} />
        </>
      )}
    </AdminLayout>
  );
}
