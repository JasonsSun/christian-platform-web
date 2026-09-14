'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPatch, apiDelete, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import Portal from '@/components/Portal';
import { formatDate } from '@/lib/format';
import {
  AdminLayout,
  RoleBadge,
  StatusBadge,
  Loading,
  Empty,
  ErrorBox,
  SectionTitle,
} from '../_components';
import type { AdminUser } from '../_components';

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const path = `/admin/users${qs({ q, role, page, pageSize })}`;
  const { data, loading, error, reload } = useApi<{ items: AdminUser[]; total: number }>(path, [q, role, page]);

  const { run, pending } = useAction();
  const notice = useNotice();
  const confirmNav = useConfirmNav();

  /**
   * 重置密码 / 删除用户相关状态。
   * 必须和上面的 hooks 同级、且放在任何条件 return 之前 ——
   * 否则「未登录/无权限」的早返回会让本轮 hook 数量变少，
   * 权限解析完成后又变多，触发 React #310（Rendered more hooks than during the previous render）。
   */
  const [resetPwdFor, setResetPwdFor] = useState<AdminUser | null>(null);
  const [resetPwdResult, setResetPwdResult] = useState('');
  const resetAction = useAction();

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  if (user === null)
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">
        请先登录以访问管理后台。 <Link className="btn-primary ml-2" href="/login">去登录</Link>
      </div>
    );
  if (user.role !== 'moderator' && user.role !== 'admin')
    return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">无权限访问（需要审核员或管理员角色）。</div>;

  const canManage = user.role === 'admin';

  function onSearch(v: string) {
    setQ(v);
    setPage(1);
  }
  function onRoleFilter(v: string) {
    setRole(v);
    setPage(1);
  }

  async function changeRole(u: AdminUser, target: 'member' | 'moderator' | 'admin') {
    if (u.id === user!.id) return;
    await run(async () => {
      await apiPatch('/admin/users', { userId: u.id, role: target });
      reload();
    });
  }

  async function toggleBan(u: AdminUser) {
    if (u.id === user!.id) return;
    const next = u.status === 'suspended' ? 'active' : 'suspended';
    if (next === 'suspended') {
      // 封禁属高风险操作 —— 跳转独立确认页，不使用 confirm 弹框
      confirmNav({
        title: `封禁用户「${u.displayName || u.username}」`,
        desc: '封禁将立即吊销该用户的全部会话，其将无法登录平台，已发布内容保留。\n解封后可恢复正常。',
        danger: true,
        confirmText: '确认封禁',
        cancelText: '取消',
        back: '/admin/users',
        action: 'admin.user.suspend',
        params: { userId: u.id },
        onConfirm: async () => {
          await apiPatch('/admin/users', { userId: u.id, status: 'suspended' });
          notice.success('已封禁该用户');
        },
      });
      return;
    }
    await run(async () => {
      await apiPatch('/admin/users', { userId: u.id, status: 'active' });
      notice.success('已解封该用户');
      reload();
    });
  }

  // 重置密码：生成随机密码，弹层展示一次供管理员线下转达（状态声明已上提到 hooks 区）
  async function resetPassword(u: AdminUser) {
    setResetPwdFor(u);
    setResetPwdResult('');
    const res = await resetAction.run(() =>
      apiPatch<{ newPassword: string }>('/admin/users', { userId: u.id, resetPassword: true })
    );
    if (res?.newPassword) setResetPwdResult(res.newPassword);
  }

  const isSelf = (u: AdminUser) => u.id === user!.id;

  // 删除用户：不可逆高风险操作 —— 走独立确认页，不使用 confirm 弹框
  function deleteUser(u: AdminUser) {
    if (u.id === user!.id) return;
    confirmNav({
      title: `删除用户「${u.displayName || u.username}」`,
      desc:
        '此操作不可恢复：该账号及其发布的全部内容、评论、好友关系、消息通知等都会被一并删除。\n' +
        '其名下的团契不会被删除 —— 有其他成员时团长自动移交给最早入群者，仅剩自己时团契解散。\n' +
        `该用户当前有 ${u.contentCount} 条内容。`,
      danger: true,
      confirmText: '确认删除',
      cancelText: '取消',
      back: '/admin/users',
      action: 'admin.user.delete',
      params: { userId: u.id },
      onConfirm: async () => {
        await apiDelete('/admin/users', { userId: u.id });
        notice.success('用户已删除');
        reload();
      },
    });
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-900">用户管理</h1>
        <button className="btn-secondary" onClick={reload}>刷新</button>
      </div>

      {/* 筛选栏 */}
      <div className="glass rounded-2xl p-4 mb-5 flex flex-wrap gap-3 items-center shadow-soft">
        <input
          className="input-styled flex-1 min-w-[200px]"
          placeholder="搜索用户名 / 邮箱 / 昵称"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
        />
        <select className="input-styled w-40" value={role} onChange={(e) => onRoleFilter(e.target.value)}>
          <option value="">全部角色</option>
          <option value="member">普通成员</option>
          <option value="moderator">审核员</option>
          <option value="admin">管理员</option>
        </select>
        {!canManage ? (
          <span className="text-xs text-ink-400">（仅管理员可调整角色与封禁）</span>
        ) : null}
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <Empty label="没有匹配的用户" />
      ) : (
        <>
          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="bg-ink-50 text-ink-500">
                  <tr className="whitespace-nowrap">
                    <th className="text-left px-4 py-3 font-medium">用户名</th>
                    <th className="text-left px-4 py-3 font-medium">邮箱</th>
                    <th className="text-left px-4 py-3 font-medium">昵称</th>
                    <th className="text-left px-4 py-3 font-medium">角色</th>
                    <th className="text-left px-4 py-3 font-medium">状态</th>
                    <th className="text-left px-4 py-3 font-medium">城市</th>
                    <th className="text-left px-4 py-3 font-medium">内容数</th>
                    <th className="text-left px-4 py-3 font-medium">注册时间</th>
                    <th className="text-left px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => {
                    const self = isSelf(u);
                    const disabled = !canManage || self || pending;
                    return (
                      <tr key={u.id} className="border-t border-ink-100 hover:bg-ink-50/50">
                        <td className="px-4 py-3 text-ink-800">{u.username}{self ? <span className="text-xs text-ink-400">（我）</span> : ''}</td>
                        <td className="px-4 py-3 text-ink-600">{u.email}</td>
                        <td className="px-4 py-3 text-ink-600">{u.displayName}</td>
                        <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                        <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                        <td className="px-4 py-3 text-ink-600">{u.city || '-'}</td>
                        <td className="px-4 py-3 text-ink-600">{u.contentCount}</td>
                        <td className="px-4 py-3 text-ink-400">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              className="btn-secondary text-xs px-2 py-1"
                              disabled={disabled || u.role === 'moderator'}
                              onClick={() => changeRole(u, 'moderator')}
                              title={self ? '不能修改自己' : canManage ? '' : '仅管理员可操作'}
                            >
                              升审核员
                            </button>
                            <button
                              className="btn-gold text-xs px-2 py-1"
                              disabled={disabled || u.role === 'admin'}
                              onClick={() => changeRole(u, 'admin')}
                              title={self ? '不能修改自己' : canManage ? '' : '仅管理员可操作'}
                            >
                              升管理员
                            </button>
                            <button
                              className="text-xs px-2 py-1 rounded-lg border border-ink-200 text-ink-600 disabled:opacity-40"
                              disabled={disabled || u.role === 'member'}
                              onClick={() => changeRole(u, 'member')}
                              title={self ? '不能修改自己' : canManage ? '' : '仅管理员可操作'}
                            >
                              降成员
                            </button>
                            <button
                              className={`text-xs px-2 py-1 rounded-lg disabled:opacity-40 ${
                                u.status === 'suspended' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}
                              disabled={disabled}
                              onClick={() => toggleBan(u)}
                              title={self ? '不能修改自己' : canManage ? '' : '仅管理员可操作'}
                            >
                              {u.status === 'suspended' ? '解封' : '封禁'}
                            </button>
                            <button
                              className="text-xs px-2 py-1 rounded-lg border border-ink-200 text-ink-600 disabled:opacity-40"
                              disabled={disabled}
                              onClick={() => resetPassword(u)}
                              title={self ? '不能重置自己' : canManage ? '生成随机新密码，仅显示一次' : '仅管理员可操作'}
                            >
                              重置密码
                            </button>
                            {canManage ? (
                              <button
                                className="text-xs px-2 py-1 rounded-lg bg-rose-50 text-rose-700 disabled:opacity-40"
                                disabled={disabled}
                                onClick={() => deleteUser(u)}
                                title={self ? '不能删除自己' : '删除账号及其全部内容（不可恢复）'}
                              >
                                删除
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

      {/* 重置密码结果弹层 */}
      {resetPwdFor && (
        <Portal>
        <div data-guard="reset-pwd-modal" role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(17,24,39,0.45)' }}>
          <div className="bg-white rounded-2xl shadow-card-hover max-w-md w-full p-6">
            <h3 className="font-display text-xl font-bold text-ink-900 mb-1">重置密码</h3>
            {resetPwdResult ? (
              <>
                <p className="text-sm text-ink-500 mb-3">
                  已为用户「{resetPwdFor.displayName || resetPwdFor.username}」生成新密码，其全部会话已吊销。
                  <span className="text-rose-600 font-medium">此密码仅显示一次</span>，请立即线下转达并提醒其登录后修改：
                </p>
                <div className="my-4 px-4 py-3 rounded-xl bg-ink-50 border border-ink-200 font-mono text-lg tracking-wider select-all text-center">
                  {resetPwdResult}
                </div>
                <button className="btn-primary w-full" onClick={() => { setResetPwdFor(null); reload(); }}>
                  我已转达，关闭
                </button>
              </>
            ) : (
              <div className="py-8 text-center text-ink-400">正在生成新密码…</div>
            )}
          </div>
        </div>
        </Portal>
      )}
    </AdminLayout>
  );
}
