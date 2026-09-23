'use client';

import { useState, Fragment } from 'react';
import { apiPatch, apiDelete, apiGet, apiPost } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { canEnterAdmin, AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox, PageHead, Panel, AccessState } from '../_components';

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
  const { user, loading: authLoading } = useAuth();
  const notice = useNotice();
  const confirmNav = useConfirmNav();
  // 读列表要「组织模块的审核员」或管理员：匿名原来照发这一趟，撞回来是一行红字 401，
  // 上面几张 StatCard 又按 ?? 0 渲染成「0 个组织」，看着像真没人建过组织。
  const canReview = canEnterAdmin(user, '/admin/organizations');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const { data, loading, error, reload } = useApi<{
    items: AdminOrg[]; total: number;
    byStatus: { status: string; c: number }[];
    byType: { type: string; c: number }[];
  }>(canReview ? `/admin/organizations?q=${encodeURIComponent(q)}&status=${status}` : null, [canReview, q, status]);

  // 审核员：只能审核（通过/驳回）；删除组织仅管理员可操作
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

  /* ---------- 成员管理：行内展开面板（无弹框） ---------- */
  type OrgMember = {
    userId: string; username: string; displayName: string; email: string;
    avatarColor: string; role: string; joinedAt: string;
  };
  type Candidate = { userId: string; username: string; displayName: string; email: string; avatarColor: string };

  const MEMBER_ROLES = [
    { value: 'owner', label: '负责人' },
    { value: 'admin', label: '管理员' },
    { value: 'member', label: '成员' },
  ];
  const roleLabel = (r: string) => MEMBER_ROLES.find((x) => x.value === r)?.label || r;

  const [openOrgId, setOpenOrgId] = useState<string>('');
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [candKeyword, setCandKeyword] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [memberBusy, setMemberBusy] = useState<string>('');
  const [memberMsg, setMemberMsg] = useState('');

  async function loadMembers(orgId: string) {
    setMembersLoading(true);
    setMemberMsg('');
    try {
      const d = await apiGet<{ items: OrgMember[] }>(`/admin/organizations/${orgId}/members`);
      setMembers(d.items || []);
    } catch (e: any) {
      setMemberMsg(e?.message || '成员加载失败');
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }

  function toggleMembers(o: AdminOrg) {
    if (openOrgId === o.id) {
      setOpenOrgId('');
      return;
    }
    setOpenOrgId(o.id);
    setCandidates([]);
    setCandKeyword('');
    void loadMembers(o.id);
  }

  async function searchCandidates() {
    if (!candKeyword.trim() || !openOrgId) return;
    try {
      const d = await apiGet<{ items: Candidate[] }>(
        `/admin/organizations/${openOrgId}/members?q=${encodeURIComponent(candKeyword.trim())}`
      );
      setCandidates(d.items || []);
      setMemberMsg((d.items || []).length === 0 ? '没有匹配的可添加用户' : '');
    } catch (e: any) {
      setMemberMsg(e?.message || '用户搜索失败');
    }
  }

  async function addMember(userId: string, role = 'member') {
    setMemberBusy(userId);
    setMemberMsg('');
    try {
      await apiPost(`/admin/organizations/${openOrgId}/members`, { userId, role });
      notice.success('已添加成员');
      setCandidates((prev) => prev.filter((c) => c.userId !== userId));
      await loadMembers(openOrgId);
      reload();
    } catch (e: any) {
      setMemberMsg(e?.message || '添加失败');
    } finally {
      setMemberBusy('');
    }
  }

  async function changeRole(m: OrgMember, role: string) {
    setMemberBusy(m.userId);
    setMemberMsg('');
    try {
      await apiPost(`/admin/organizations/${openOrgId}/members`, { userId: m.userId, role });
      await loadMembers(openOrgId);
    } catch (e: any) {
      setMemberMsg(e?.message || '角色更新失败');
    } finally {
      setMemberBusy('');
    }
  }

  async function removeMember(m: OrgMember) {
    setMemberBusy(m.userId);
    setMemberMsg('');
    try {
      await apiDelete(`/admin/organizations/${openOrgId}/members?userId=${encodeURIComponent(m.userId)}`);
      notice.success('已移除成员');
      await loadMembers(openOrgId);
      reload();
    } catch (e: any) {
      setMemberMsg(e?.message || '移除失败');
    } finally {
      setMemberBusy('');
    }
  }

  const items = data?.items || [];
  // byStatus 是全库口径，data.total 跟着状态筛选/搜索走。筛「待审核」时「组织总数」
  // 原来会变成待审核的条数，和旁边三张状态卡对不上账。
  const allCount = (data?.byStatus ?? []).reduce((n, s) => n + s.c, 0);

  if (authLoading) return <AdminLayout><Loading /></AdminLayout>;
  if (!user)
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="组织管理只对组织模块审核员与管理员开放，请先用管理账号登录。" href="/login?next=/admin/organizations" />
      </AdminLayout>
    );
  if (!canReview)
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限访问" desc="需要组织模块的审核员或管理员账号，才能审核机构、查看成员。" />
      </AdminLayout>
    );

  return (
    <AdminLayout>
      <PageHead eyebrow="社交 · 组织" title="组织管理" sub="教会 / 团契 / 事工 / 公益组织的审核与成员管理" />

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
            <span className="text-amber-700 font-medium"> 待审核</span>；也支持平台运营在后台代为录入。
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
        <StatCard title="组织总数" value={data ? allCount : '—'} />
        <StatCard title="待审核" value={data?.byStatus?.find((s) => s.status === 'pending')?.c ?? 0} />
        <StatCard title="已通过" value={data?.byStatus?.find((s) => s.status === 'approved')?.c ?? 0} />
        <StatCard title="已驳回" value={data?.byStatus?.find((s) => s.status === 'rejected')?.c ?? 0} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input className="input-styled input-sm flex-1 min-w-[180px]" aria-label="搜索组织名称 / 城市" placeholder="搜索组织名称 / 城市" value={q} onChange={(e) => setQ(e.target.value)} />
        {['', 'pending', 'approved', 'rejected'].map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${status === s ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
            {s === '' ? '全部' : STATUS_MAP[s]?.label}
          </button>
        ))}
      </div>

      {/* visibility 而不是条件渲染：鉴权完成前 canDelete 为 false，这段提示先出现再消失，
          会把下面的表格整体往上拽一截（实测 CLS 0.0076）。 */}
      <p className={`mb-4 text-xs text-amber-700 ${canDelete ? 'invisible' : ''}`}>
        当前为审核员视角：可通过 / 驳回组织审核；删除组织等破坏性操作仅平台管理员可执行。
      </p>

      {msg ? <div role="status" className="mb-4 text-sm text-primary-700 bg-primary-50 rounded-xl px-4 py-2">{msg}</div> : null}

      {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : items.length === 0 ? (
        <Empty label="暂无组织" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">组织管理</caption>
              <thead className="bg-ink-50 text-ink-600">
                <tr>
                  <th scope="col" className="text-left px-4 py-3 font-medium">组织</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">类型</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">城市</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">成员</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">状态</th>
                  <th scope="col" className="text-right px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <Fragment key={o.id}>
                    <tr className="border-t border-ink-100 hover:bg-primary-50/40">
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
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          {canReview ? (
                            <button onClick={() => toggleMembers(o)} className="btn-chip">
                              {openOrgId === o.id ? '收起成员' : `成员(${o.memberCount})`}
                            </button>
                          ) : null}
                          {canReview && o.status !== 'approved' ? (
                            <button disabled={busy === o.id} onClick={() => review(o.id, 'approved')} className="btn-chip btn-chip-safe">通过</button>
                          ) : null}
                          {canReview && o.status !== 'rejected' ? (
                            <button disabled={busy === o.id} onClick={() => review(o.id, 'rejected')} className="btn-chip btn-chip-danger">驳回</button>
                          ) : null}
                          {canDelete ? (
                            <button disabled={busy === o.id} onClick={() => deleteOrg(o)} className="btn-chip btn-chip-danger">删除</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {/* 成员管理面板：行内展开，不使用弹框 */}
                    {openOrgId === o.id ? (
                      <tr className="border-t border-ink-100 bg-ink-50/60">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-semibold text-ink-800">「{o.name}」成员管理</div>
                            <div className="text-xs text-ink-400">共 {members.length} 人</div>
                          </div>

                          <div className="flex flex-wrap gap-2 mb-3">
                            <input
                              className="input-styled flex-1 min-w-[200px]"
                              aria-label="按用户名 / 昵称 / 邮箱搜索待添加用户"
                              placeholder="按用户名 / 昵称 / 邮箱搜索待添加用户"
                              value={candKeyword}
                              onChange={(e) => setCandKeyword(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') searchCandidates();
                              }}
                            />
                            <button onClick={searchCandidates} className="px-4 py-2 rounded-xl text-sm bg-primary-600 text-white hover:bg-primary-700">
                              搜索
                            </button>
                          </div>

                          {candidates.length > 0 ? (
                            <div className="mb-3 space-y-1">
                              {candidates.map((c) => (
                                <div key={c.userId} className="flex items-center justify-between gap-2 rounded-xl bg-white border border-ink-100 px-3 py-2">
                                  <div className="text-sm text-ink-700">
                                    {c.displayName}
                                    <span className="text-ink-400 text-xs ml-1">@{c.username}</span>
                                  </div>
                                  <div className="flex gap-2">
                                    {MEMBER_ROLES.map((r) => (
                                      <button
                                        key={r.value}
                                        disabled={memberBusy === c.userId}
                                        onClick={() => addMember(c.userId, r.value)}
                                        className="text-xs px-2.5 py-1 rounded-lg border border-ink-200 text-ink-600 hover:border-primary-300 hover:bg-primary-50 disabled:opacity-50"
                                      >
                                        加为{r.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {memberMsg ? <div role="alert" className="mb-3 text-xs text-rose-600">{memberMsg}</div> : null}

                          {membersLoading ? (
                            <p className="text-sm text-ink-400 py-3">成员加载中…</p>
                          ) : members.length === 0 ? (
                            <p className="text-sm text-ink-400 py-3">该组织还没有成员，搜索用户后添加即可。</p>
                          ) : (
                            <div className="rounded-xl overflow-x-auto border border-ink-100 bg-white">
                              <table className="w-full min-w-[560px] text-xs">
                                <caption className="sr-only">该组织的成员列表</caption>
                                <thead className="bg-ink-50 text-ink-600">
                                  <tr>
                                    <th scope="col" className="text-left px-3 py-2 font-medium">成员</th>
                                    <th scope="col" className="text-left px-3 py-2 font-medium">邮箱</th>
                                    <th scope="col" className="text-left px-3 py-2 font-medium">角色</th>
                                    <th scope="col" className="text-right px-3 py-2 font-medium">操作</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {members.map((m) => (
                                    <tr key={m.userId} className="border-t border-ink-100">
                                      <td className="px-3 py-2 text-ink-800">
                                        {m.displayName}
                                        <span className="text-ink-400 ml-1">@{m.username}</span>
                                      </td>
                                      <td className="px-3 py-2 text-ink-500">{m.email}</td>
                                      <td className="px-3 py-2">
                                        <select
                                          value={m.role}
                                          aria-label={`设置 ${m.displayName} 的组织角色`}
                                          disabled={memberBusy === m.userId}
                                          onChange={(e) => changeRole(m, e.target.value)}
                                          className="rounded-lg border border-ink-200 px-2 py-1 text-xs bg-white"
                                        >
                                          {MEMBER_ROLES.map((r) => (
                                            <option key={r.value} value={r.value}>{r.label}</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2 text-right whitespace-nowrap">
                                        <span className="text-ink-500 mr-2">{roleLabel(m.role)}</span>
                                        <button
                                          disabled={memberBusy === m.userId}
                                          onClick={() => removeMember(m)}
                                          className="btn-chip btn-chip-danger"
                                        >
                                          移除
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
