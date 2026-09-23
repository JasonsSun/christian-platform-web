'use client';

import { useId, useState } from 'react';
import { apiGet, apiPatch, apiDelete, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { useEscape, useDialogFocus } from '@/lib/a11y';
import Portal from '@/components/Portal';
import { formatDate } from '@/lib/format';
import { canEnterAdmin,
  AdminLayout,
  AdminSelect,
  Empty,
  ErrorBox,
  Loading,
  PageHead,
  Pagination,
  RoleBadge,
  StatusBadge,
  TableShell,
  TableSkeleton,
  Th,
  Toolbar,
  AccessState,
} from '../_components';
import type { AdminUser } from '../_components';

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // /admin/users 的 GET / PATCH / DELETE 全是 requireRole(['admin'])，接口里写得很明白：
  // 「用户管理属于系统治理权，审核员不参与」。原来页面按 staff 放行，审核员进来是一趟 403
  // 加一句红色错误框，八个操作按钮全禁用；匿名更是一趟必然 401。
  const canSee = canEnterAdmin(user, '/admin/users');
  const path = canSee ? `/admin/users${qs({ q, role, page, pageSize })}` : null;
  const { data, loading, error, reload } = useApi<{ items: AdminUser[]; total: number }>(path, [canSee, q, role, page]);

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

  // 弹层 Esc / 焦点管理同样要放在早返回之前；生成新密码期间不许关，
  // 否则密码只显示一次却没人看到，只能再重置一次。
  useEscape(!!resetPwdFor, () => {
    if (!resetAction.pending) setResetPwdFor(null);
  });
  const resetPwdRef = useDialogFocus(!!resetPwdFor);
  const resetPwdTitleId = useId();

  if (authLoading) return <AdminLayout><Loading /></AdminLayout>;
  if (!user)
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="用户管理只对平台管理员开放，请先用管理员账号登录。" href="/login?next=/admin/users" />
      </AdminLayout>
    );
  if (!canSee)
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限访问" desc="调整角色、封禁账号与重置密码属于系统治理权，仅平台管理员可操作。" />
      </AdminLayout>
    );

  // 手里已经有一页数据时不再整页换成「加载中…」：刷新会把表格抹成一行字再弹回来
  const refreshing = loading && data != null;

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
      <PageHead
        eyebrow="社交 · 账号治理"
        title="用户管理"
        /* flex-1 + min-w-0：说明文字在「正在刷新…」和整句统计之间长短差几十到几百像素，
           不占满剩余宽度的话右侧按钮会跟着左右跳。按钮文案也保持固定。 */
        sub={
          refreshing ? (
            '正在刷新…'
          ) : (
            <span className="num">共 {data?.total ?? 0} 位用户，可按用户名 / 邮箱 / 昵称检索</span>
          )
        }
        actions={<button className="btn-secondary btn-sm min-h-11 lg:min-h-0" onClick={reload} disabled={loading}>刷新</button>}
      />

      {/* 筛选栏 */}
      <Toolbar>
        <input
          className="input-styled input-sm min-h-11 lg:min-h-0 flex-1 basis-[13rem] sm:basis-auto"
          aria-label="搜索用户名 / 邮箱 / 昵称"
          placeholder="搜索用户名 / 邮箱 / 昵称"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
        />
        <AdminSelect
          label="按角色筛选"
          value={role}
          onChange={onRoleFilter}
          options={[
            { value: '', label: '全部角色' },
            { value: 'member', label: '普通成员' },
            { value: 'moderator', label: '审核员' },
            { value: 'admin', label: '管理员' },
          ]}
        />
      </Toolbar>

      {loading && !data ? (
        <TableSkeleton rows={6} cols={5} />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <Empty
          icon="search"
          label="没有匹配的用户"
          hint="换个关键词，或把角色筛选改回「全部角色」再试"
        />
      ) : (
        <>
          <TableShell busy={refreshing}>
              {/* 1600 屏下正文列实测约 1216px（1560 容器 - 侧栏 256 - 间距 24 - 内边距 64）。
                  九个格子的内边距收到 px-3、六个操作按钮统一成 .btn-chip 后自然宽度约 1190，
                  最右边的「删除」不再被裁半截；min-w 只作窄屏兜底，触发横向滚动而不是压字。 */}
              <table className="w-full min-w-[1120px] text-sm">
                <caption className="sr-only">用户管理</caption>
                <thead className="bg-ink-50 text-ink-600">
                  <tr className="whitespace-nowrap">
                    <Th>用户名</Th>
                    <Th>邮箱</Th>
                    <Th>昵称</Th>
                    <Th>角色</Th>
                    <Th>状态</Th>
                    <Th>城市</Th>
                    <Th>内容数</Th>
                    <Th>注册时间</Th>
                    <Th>操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => {
                    const self = isSelf(u);
                    const disabled = self || pending;
                    return (
                      <tr key={u.id} className="border-t border-ink-100 hover:bg-ink-50/50">
                        <td className="px-3 py-3 text-ink-800 whitespace-nowrap">{u.username}{self ? <span className="text-xs text-ink-400">（我）</span> : ''}</td>
                        <td className="px-3 py-3 text-ink-600">{u.email}</td>
                        <td className="px-3 py-3 text-ink-600 whitespace-nowrap">{u.displayName}</td>
                        <td className="px-3 py-3"><RoleBadge role={u.role} /></td>
                        <td className="px-3 py-3"><StatusBadge status={u.status} /></td>
                        <td className="px-3 py-3 text-ink-600 whitespace-nowrap">{u.city || '-'}</td>
                        <td className="num px-3 py-3 text-ink-600">{u.contentCount}</td>
                        <td className="num px-3 py-3 text-ink-400 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            <button
                              className="btn-chip"
                              disabled={disabled || u.role === 'moderator'}
                              onClick={() => changeRole(u, 'moderator')}
                              title={self ? '不能修改自己' : undefined}
                            >
                              升审核员
                            </button>
                            <button
                              className="btn-chip btn-chip-accent"
                              disabled={disabled || u.role === 'admin'}
                              onClick={() => changeRole(u, 'admin')}
                              title={self ? '不能修改自己' : undefined}
                            >
                              升管理员
                            </button>
                            <button
                              className="btn-chip"
                              disabled={disabled || u.role === 'member'}
                              onClick={() => changeRole(u, 'member')}
                              title={self ? '不能修改自己' : undefined}
                            >
                              降成员
                            </button>
                            <button
                              className={`btn-chip ${u.status === 'suspended' ? 'btn-chip-safe' : 'btn-chip-danger'}`}
                              disabled={disabled}
                              onClick={() => toggleBan(u)}
                              title={self ? '不能修改自己' : undefined}
                            >
                              {u.status === 'suspended' ? '解封' : '封禁'}
                            </button>
                            <button
                              className="btn-chip"
                              disabled={disabled}
                              onClick={() => resetPassword(u)}
                              title={self ? '不能重置自己' : '生成随机新密码，仅显示一次'}
                            >
                              重置密码
                            </button>
                            <button
                              className="btn-chip btn-chip-danger"
                              disabled={disabled}
                              onClick={() => deleteUser(u)}
                              title={self ? '不能删除自己' : '删除账号及其全部内容（不可恢复）'}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          </TableShell>

          {/* 分页 */}
          <Pagination total={data.total} page={page} pageSize={pageSize} onPage={setPage} />
        </>
      )}

      {/* 重置密码结果弹层 */}
      {resetPwdFor && (
        <Portal>
        <div ref={resetPwdRef} data-guard="reset-pwd-modal" role="dialog" aria-modal="true" aria-labelledby={resetPwdTitleId} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(17,24,39,0.45)' }}>
          <div className="bg-white rounded-2xl shadow-card-hover max-w-md w-full p-6">
            <h3 id={resetPwdTitleId} className="font-display text-xl font-bold text-ink-900 mb-1">重置密码</h3>
            {resetPwdResult ? (
              <>
                <p className="text-sm text-ink-500 mb-3">
                  已为用户「{resetPwdFor.displayName || resetPwdFor.username}」生成新密码，其全部会话已吊销。
                  <span className="text-rose-600 font-medium">此密码仅显示一次</span>，请立即线下转达并提醒其登录后修改：
                </p>
                <div className="my-4 px-3 py-3 rounded-xl bg-ink-50 border border-ink-200 font-mono text-lg tracking-wider select-all text-center">
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
