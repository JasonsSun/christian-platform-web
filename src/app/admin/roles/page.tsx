'use client';

import { Fragment } from 'react';
import { useApi } from '@/lib/useApi';
import { AdminLayout, SectionTitle, Badge, Loading, ErrorBox, RoleBadge } from '../_components';

interface RoleData {
  roles: { key: string; label: string; desc: string; count: number; permissions: string[] }[];
  groups: { group: string; items: string[] }[];
  matrix: Record<string, string[]>;
}

export default function AdminRolesPage() {
  const { data, loading, error, reload } = useApi<RoleData>('/admin/roles', []);
  const roles = data?.roles || [];
  const groups = data?.groups || [];

  const has = (role: string, perm: string) => (data?.matrix?.[role] || []).includes(perm);

  return (
    <AdminLayout>
      <SectionTitle>权限中心</SectionTitle>
      <p className="-mt-3 mb-5 text-sm text-ink-500">角色定义、权限矩阵与数据范围</p>

      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            {roles.map((r) => (
              <div key={r.key} className="glass rounded-2xl p-5 shadow-soft card-hover">
                <div className="flex items-center justify-between">
                  <RoleBadge role={r.key} />
                  <span className="text-2xl font-bold font-display text-ink-900">{r.count}</span>
                </div>
                <div className="mt-3 text-sm text-ink-500">{r.desc}</div>
                <div className="mt-3 text-xs text-ink-400">共 {r.permissions.length} 项权限</div>
              </div>
            ))}
          </div>

          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="px-4 py-3 font-medium text-ink-700 border-b border-ink-100">权限矩阵</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-ink-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium sticky left-0 bg-ink-50">权限</th>
                    {roles.map((r) => (
                      <th key={r.key} className="text-center px-4 py-3 font-medium whitespace-nowrap">{r.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g.group}>
                      <tr className="bg-primary-50/50">
                        <td colSpan={roles.length + 1} className="px-4 py-2 text-xs font-semibold text-primary-700">{g.group}</td>
                      </tr>
                      {g.items.map((perm) => (
                        <tr key={perm} className="border-t border-ink-100">
                          <td className="px-4 py-2.5 font-mono text-xs text-ink-700 sticky left-0 bg-white">{perm}</td>
                          {roles.map((r) => (
                            <td key={r.key} className="text-center px-4 py-2.5">
                              {has(r.key, perm) ? (
                                <span className="text-emerald-600 font-bold">✓</span>
                              ) : (
                                <span className="text-ink-300">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 shadow-soft">
            <div className="font-medium text-ink-700 mb-2">数据范围</div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="gray">普通成员:本人数据</Badge>
              <Badge tone="primary">审核员:内容与举报全域</Badge>
              <Badge tone="gold">管理员:全平台 + 系统配置</Badge>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
