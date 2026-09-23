'use client';

import { Fragment, useCallback, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { formatDate } from '@/lib/format';
import { GROUP_CATEGORY_LABEL } from '@/lib/labels';
import {
  AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox, PageHead, Toolbar,
} from '../_components';

interface AdminGroup {
  id: string; name: string; category: string; city: string; description: string;
  createdAt: string; owner: string; memberCount: number; postCount: number;
}

interface GroupMember {
  id: string; username: string; displayName: string; avatarColor: string;
  city: string; status: string; role: string; joinedAt: string;
}

interface GroupDetail {
  id: string; name: string; description: string; category: string; city: string;
  cover: string; createdAt: string; memberCount: number; postCount: number;
  owner: { id: string; displayName: string; username: string; avatarColor: string };
  members: GroupMember[];
}

// 前台 /groups 的筛选项就是这套词（读经 / 服务 / 兴趣…），后台原来另写了一份（查经 / 服侍），
// 同一个团契在两边显示成两个分类名。
const CATEGORY_LABEL: Record<string, string> = GROUP_CATEGORY_LABEL;
const M_ROLE_LABEL: Record<string, string> = { owner: '团长', admin: '管理', moderator: '管理', member: '成员' };

function Avatar({ name, color, size = 34, userId }: { name: string; color: string; size?: number; userId?: string }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
      data-user-id={userId}
      style={{ backgroundColor: color || '#3d52d9', width: size, height: size, fontSize: size * 0.42 }}
    >
      {(name || '?').slice(0, 1)}
    </span>
  );
}

/** 展开后的成员面板：管理端可看全部成员，管理员可移交团长 / 移出成员 */
function MemberPanel({
  groupId,
  canManage,
  onChanged,
}: {
  groupId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { data, loading, error } = useApi<GroupDetail>(`/admin/groups/${groupId}`, [groupId]);
  const confirmNav = useConfirmNav();
  const notice = useNotice();

  const removeMember = useCallback(
    (m: GroupMember) => {
      confirmNav({
        title: `将「${m.displayName || m.username}」移出团契`,
        desc: '移出后该成员将无法再在团契内发言，并会收到通知。\n其历史动态保留。',
        danger: true,
        confirmText: '确认移出',
        back: '/admin/groups',
        action: 'admin.group.removeMember',
        params: { groupId, userId: m.id },
        onConfirm: async () => { notice.success('已移出该成员'); onChanged(); },
      });
    },
    [confirmNav, groupId, notice, onChanged],
  );

  const transferOwner = useCallback(
    (m: GroupMember) => {
      confirmNav({
        title: `把团长移交给「${m.displayName || m.username}」`,
        desc: '移交后 TA 将成为团长，原团长降为普通成员。\n该操作会通知双方。',
        confirmText: '确认移交',
        back: '/admin/groups',
        action: 'admin.group.transferOwner',
        params: { groupId, userId: m.id },
        onConfirm: async () => { notice.success('团长已移交'); onChanged(); },
      });
    },
    [confirmNav, groupId, notice, onChanged],
  );

  if (loading) return <div className="px-6 py-4 text-sm text-ink-400">加载成员…</div>;
  if (error) return <div role="alert" className="px-6 py-4 text-sm text-rose-600">{error}</div>;
  if (!data) return null;

  return (
    <div className="bg-ink-50/70 border-t border-ink-100 px-4 sm:px-6 py-4">
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-ink-500">
        <span>成员 <b className="text-ink-800">{data.memberCount}</b> 人</span>
        <span>动态 <b className="text-ink-800">{data.postCount}</b> 条</span>
        <span>团长 <b className="text-ink-800">{data.owner.displayName || data.owner.username || '—'}</b></span>
        {!canManage ? <span className="text-amber-700">（仅管理员可移交团长 / 移出成员 / 解散团契）</span> : null}
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {data.members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl bg-white border border-ink-100 px-3 py-2">
            <Avatar name={m.displayName || m.username} color={m.avatarColor} userId={m.id} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-900 truncate">{m.displayName || m.username}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                  m.role === 'owner' ? 'bg-gold-100 text-gold-800' : 'bg-primary-50 text-primary-700'
                }`}>
                  {M_ROLE_LABEL[m.role] || '成员'}
                </span>
                {m.status === 'suspended' ? <span className="text-[11px] text-rose-600">已封禁</span> : null}
              </div>
              <div className="text-[11px] text-ink-400 truncate">
                {m.city || '—'} · 加入于 {formatDate(m.joinedAt)}
              </div>
            </div>
            {canManage ? (
              <div className="flex gap-1.5 flex-shrink-0">
                {m.role !== 'owner' ? (
                  <>
                    <button
                      className="btn-chip btn-chip-accent"
                      onClick={() => transferOwner(m)}
                    >
                      设为团长
                    </button>
                    <button
                      className="btn-chip btn-chip-danger"
                      onClick={() => removeMember(m)}
                    >
                      移出
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-ink-400">团长</span>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Link href={`/groups/${data.id}`} className="text-xs text-primary-700 hover:underline" target="_blank" rel="noopener noreferrer">
          在站点中查看该团契 ↗
        </Link>
      </div>
    </div>
  );
}

export default function AdminGroupsPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin';
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const confirmNav = useConfirmNav();
  const notice = useNotice();

  const { data, loading, error, reload } = useApi<{ items: AdminGroup[]; total: number }>(
    `/admin/groups?q=${encodeURIComponent(q)}`, [q],
  );
  const items = data?.items || [];
  const totalMembers = items.reduce((a, b) => a + b.memberCount, 0);
  const totalPosts = items.reduce((a, b) => a + b.postCount, 0);

  const dissolve = useCallback(
    (g: AdminGroup) => {
      confirmNav({
        title: `解散团契「${g.name}」`,
        desc: `将删除该团契及其 ${g.memberCount} 名成员关系、${g.postCount} 条动态，不可恢复。\n所有成员会收到通知。\n\n（若只是想换团长，请展开成员列表操作「设为团长」，不要解散。）`,
        danger: true,
        confirmText: '确认解散',
        back: '/admin/groups',
        action: 'admin.group.dissolve',
        params: { groupId: g.id },
        onConfirm: async () => { notice.success('团契已解散'); reload(); },
      });
    },
    [confirmNav, notice, reload],
  );

  return (
    <AdminLayout>
      <PageHead
        eyebrow="社交 · 小组"
        title="群组管理"
        sub="查看团契/群组成员、动态与负责人；对违规群组可直接解散（无需等团长操作）"
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
        {/* 这一页没有状态分面可加总，就让标题跟着筛选走：搜「团契」时这块报的是命中数，
            不是一张写着「群组总数」却只数出 3 的卡。 */}
        <StatCard title={q.trim() ? '命中群组' : '群组总数'} value={data?.total ?? '—'} />
        <StatCard title="本页成员合计" value={totalMembers} />
        <StatCard title="本页动态合计" value={totalPosts} />
      </div>

      <div className="mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            className="input-styled input-sm flex-1 min-w-[220px]"
            aria-label="搜索群组名称 / 城市"
            placeholder="搜索群组名称 / 城市"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn-secondary btn-sm" onClick={reload}>刷新</button>
        </div>
        {/* 这一行用 visibility 而不是条件渲染来开关：鉴权完成前 canManage 是 false，
            提示先出现后消失，会把「刷新」横向推 353px（实测 CLS 0.0076）。 */}
        <p className={`mt-2 text-xs text-amber-700 ${canManage ? 'invisible' : ''}`}>
          当前为审核员视角：可查看成员，解散/调整团契仅管理员可操作
        </p>
      </div>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <Empty label="暂无群组" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <caption className="sr-only">群组管理</caption>
              <thead className="bg-ink-50 text-ink-600">
                <tr>
                  <th scope="col" className="text-left px-4 py-3 font-medium">群组</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">分类</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">城市</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">负责人</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">成员</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">动态</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">创建时间</th>
                  <th scope="col" className="text-right px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((g) => {
                  const open = expanded === g.id;
                  return (
                    <Fragment key={g.id}>
                      <tr className="border-t border-ink-100 hover:bg-primary-50/40">
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink-900">{g.name}</div>
                          <div className="text-xs text-ink-400 line-clamp-1 max-w-[260px]">{g.description}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone="primary">{CATEGORY_LABEL[g.category] || g.category}</Badge>
                        </td>
                        <td className="px-4 py-3 text-ink-600">{g.city || '—'}</td>
                        <td className="px-4 py-3 text-ink-600">{g.owner || '—'}</td>
                        <td className="px-4 py-3 text-center font-medium text-ink-900">{g.memberCount}</td>
                        <td className="px-4 py-3 text-center text-ink-700">{g.postCount}</td>
                        <td className="px-4 py-3 text-ink-500">{formatDate(g.createdAt) || '—'}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex flex-wrap justify-end gap-1">
                            <button
                              className="btn-chip"
                              onClick={() => setExpanded(open ? null : g.id)}
                            >
                              {open ? '收起' : '查看成员'}
                            </button>
                            {canManage ? (
                              <button className="btn-chip btn-chip-danger" onClick={() => dissolve(g)}>解散</button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-t border-ink-100">
                          <td colSpan={8} className="p-0">
                            <MemberPanel groupId={g.id} canManage={canManage} onChanged={reload} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
