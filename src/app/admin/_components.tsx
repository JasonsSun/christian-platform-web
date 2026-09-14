'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { ReviewTask } from '@/lib/types';
import { useAuth } from '@/lib/auth';

/* ----------------------------- 类型定义 ----------------------------- */

export interface AdminStats {
  totals: {
    users: number;
    admins: number;
    moderators: number;
    suspended: number;
    contents: number;
    published: number;
    pending: number;
    rejected: number;
    pendingTasks: number;
    activities: number;
    registrations: number;
    groupCount: number;
    prayers: number;
    comments: number;
    notifications: number;
    auditLogs: number;
    events: number;
    pendingEvents: number;
  };
  byRole: { role: string; c: number }[];
  byStatus: { status: string; c: number }[];
  growth: { d: string; c: number }[];
  recentAudit: {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    detail: string;
    ip: string;
    created_at: string;
    actor_name: string;
  }[];
  topContent: {
    id: string;
    title: string;
    like_count: number;
    view_count: number;
    comment_count: number;
    status: string;
  }[];
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: 'member' | 'moderator' | 'admin';
  status: string;
  city: string;
  church: string;
  avatarColor: string;
  createdAt: string;
  contentCount: number;
  followers: number;
}

export interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: string;
  ip: string;
  created_at: string;
  actor_name: string;
  actor_username: string;
}

/* ----------------------------- 侧边导航 ----------------------------- */

/**
 * 侧边导航。
 * adminOnly = true 的条目标记「仅平台管理员」，
 * 审核员登录后不展示（避免点进去只有一行「无权限」）。
 * 审核员职责：内容/举报/组织/媒体等**审核**类页面；删除、系统治理类归管理员。
 */
const NAV_GROUPS: { group: string; items: { href: string; label: string; adminOnly?: boolean }[] }[] = [
  { group: '概览', items: [
    { href: '/admin', label: '仪表盘' },
  ] },
  { group: '内容', items: [
    { href: '/admin/reviews', label: '内容审核' },
    { href: '/admin/reports', label: '举报处理' },
    { href: '/admin/prayers', label: '代祷墙管理' },
    { href: '/admin/bible', label: '圣经管理' },
    { href: '/admin/songs', label: '赞美诗管理' },
    { href: '/admin/media', label: '媒体中心' },
    { href: '/admin/live', label: '直播管理' },
  ] },
  { group: '社交', items: [
    { href: '/admin/users', label: '用户管理' },
    { href: '/admin/quotas', label: '成长与配额' },
    { href: '/admin/groups', label: '群组管理' },
    { href: '/admin/organizations', label: '组织管理' },
  ] },
  { group: '活动', items: [
    { href: '/admin/activities', label: '活动管理' },
    { href: '/admin/checkins', label: '签到报表' },
  ] },
  { group: '运营', items: [
    { href: '/admin/donations', label: '捐赠管理', adminOnly: true },
    { href: '/admin/expenses', label: '支出公示', adminOnly: true },
    { href: '/admin/feedback', label: '平台建议' },
  ] },
  { group: '系统', items: [
    { href: '/admin/notifications', label: '通知中心' },
    { href: '/admin/events', label: '事件中心' },
    { href: '/admin/roles', label: '权限中心' },
    { href: '/admin/audit', label: '审计日志' },
    { href: '/admin/system', label: '系统诊断' },
    { href: '/admin/settings', label: '系统设置' },
  ] },
];

export function AdminNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => isAdmin || !it.adminOnly),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="w-52 flex-shrink-0">
      <div className="glass rounded-2xl p-4 sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
        <div className="font-display text-lg font-bold text-ink-900 mb-4 px-2">管理后台</div>
        {user ? (
          <div className="px-2 mb-3 text-[11px] text-ink-400">
            当前身份：<span className={isAdmin ? 'text-gold-700 font-medium' : 'text-primary-700 font-medium'}>
              {isAdmin ? '管理员（全部权限）' : user.role === 'moderator' ? '审核员（仅审核）' : '普通成员'}
            </span>
          </div>
        ) : null}
        <nav className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                {g.group}
              </div>
              <div className="flex flex-col gap-1">
                {g.items.map((item) => {
                  const active =
                    item.href === '/admin'
                      ? pathname === '/admin'
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        active
                          ? 'bg-primary-600 text-white shadow-card'
                          : 'text-ink-600 hover:bg-primary-50 hover:text-primary-700'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-6 items-start">
        <AdminNav />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

/* ----------------------------- 小组件 ----------------------------- */

export function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="glass rounded-2xl p-5 card-hover shadow-soft">
      <div className="text-sm text-ink-500">{title}</div>
      <div className="font-display text-3xl font-bold text-ink-900 mt-1">{value}</div>
      {hint ? <div className="text-xs text-ink-400 mt-1">{hint}</div> : null}
    </div>
  );
}

type BadgeTone = 'primary' | 'gold' | 'green' | 'red' | 'gray' | 'blue';

const TONE_CLASS: Record<BadgeTone, string> = {
  primary: 'bg-primary-50 text-primary-700',
  gold: 'bg-gold-100 text-gold-800',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-rose-50 text-rose-700',
  gray: 'bg-ink-100 text-ink-600',
  blue: 'bg-sky-50 text-sky-700',
};

export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}

export const ROLE_LABEL: Record<string, string> = {
  member: '普通成员',
  moderator: '审核员',
  admin: '管理员',
};

export function RoleBadge({ role }: { role: string }) {
  const tone: BadgeTone = role === 'admin' ? 'gold' : role === 'moderator' ? 'primary' : 'gray';
  return <Badge tone={tone}>{ROLE_LABEL[role] || role}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    active: { tone: 'green', label: '正常' },
    suspended: { tone: 'red', label: '已封禁' },
    published: { tone: 'green', label: '已发布' },
    pending: { tone: 'gold', label: '待审核' },
    rejected: { tone: 'red', label: '已驳回' },
    draft: { tone: 'gray', label: '草稿' },
    approved: { tone: 'green', label: '已通过' },
  };
  const m = map[status] || { tone: 'gray' as BadgeTone, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function Loading({ label = '加载中…' }: { label?: string }) {
  return <div className="py-16 text-center text-ink-400">{label}</div>;
}

export function Empty({ label = '暂无数据' }: { label?: string }) {
  return (
    <div className="py-12 text-center text-ink-400 border border-dashed border-ink-200 rounded-2xl">
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="py-10 text-center rounded-2xl bg-rose-50 text-rose-700">
      <div>{message || '加载失败'}</div>
      {onRetry ? (
        <button className="btn-secondary mt-3" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-xl font-bold text-ink-900 mb-4">{children}</h2>;
}

export type { ReviewTask };

/* 简单权限判断 */
export function isStaff(role?: string) {
  return role === 'moderator' || role === 'admin';
}
