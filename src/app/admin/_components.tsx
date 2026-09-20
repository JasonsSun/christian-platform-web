'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { ReviewTask } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useEscape } from '@/lib/a11y';

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

import type { ModuleKey } from '@/lib/moderationModules';
import { StaffBadges } from '@/components/ModeratorBadge';

/**
 * 侧边导航（按模块范围过滤）。
 *
 * 每个条目声明它属于哪个治理模块：
 *  - module     : 该模块的审核员可见（管理员全部可见）
 *  - adminOnly  : 系统治理权，仅管理员（用户封禁/团契处置/财务/设置/权限分配）
 *  - 两者都不填 : 全体管理成员可见（仪表盘、管理消息）
 *
 * 于是「每个审核员看到的后台菜单不一样」是数据驱动的：
 * 管理员分配/撤销模块后，该审核员刷新即可看到菜单变化。
 */
const NAV_GROUPS: {
  group: string;
  items: { href: string; label: string; adminOnly?: boolean; module?: ModuleKey }[];
}[] = [
  { group: '概览', items: [
    { href: '/admin', label: '仪表盘' },
  ] },
  { group: '协作', items: [
    { href: '/admin/messages', label: '管理消息' },
  ] },
  { group: '内容', items: [
    { href: '/admin/contents', label: '内容管理', module: 'contents' },
    { href: '/admin/reviews', label: '内容审核', module: 'contents' },
    { href: '/admin/comments', label: '评论管理', module: 'contents' },
    { href: '/admin/tags', label: '标签管理', module: 'contents' },
    { href: '/admin/reports', label: '举报处理', module: 'reports' },
    { href: '/admin/prayers', label: '代祷墙管理', module: 'prayers' },
    { href: '/admin/bible', label: '圣经管理', adminOnly: true },
    { href: '/admin/songs', label: '赞美诗管理', module: 'songs' },
    { href: '/admin/media', label: '媒体中心', module: 'media' },
    { href: '/admin/sermons', label: '讲道管理', module: 'media' },
    { href: '/admin/live', label: '直播管理', module: 'live' },
  ] },
  { group: '社交', items: [
    { href: '/admin/users', label: '用户管理', adminOnly: true },
    { href: '/admin/quotas', label: '成长与配额', adminOnly: true },
    { href: '/admin/groups', label: '群组管理', module: 'groups' },
    { href: '/admin/organizations', label: '组织管理', module: 'organizations' },
  ] },
  { group: '活动', items: [
    { href: '/admin/activities', label: '活动管理', module: 'activities' },
    { href: '/admin/checkins', label: '签到报表', module: 'activities' },
  ] },
  { group: '运营', items: [
    { href: '/admin/donations', label: '捐赠管理', adminOnly: true },
    { href: '/admin/expenses', label: '支出公示管理', adminOnly: true },
    { href: '/admin/feedback', label: '平台建议', module: 'feedback' },
  ] },
  { group: '系统', items: [
    { href: '/admin/notifications', label: '通知中心', adminOnly: true },
    { href: '/admin/events', label: '事件中心', adminOnly: true },
    { href: '/admin/roles', label: '权限中心', adminOnly: true },
    { href: '/admin/audit', label: '审计日志', adminOnly: true },
    { href: '/admin/system', label: '系统诊断', adminOnly: true },
    { href: '/admin/settings', label: '系统设置', adminOnly: true },
    { href: '/admin/payments', label: '支付配置', adminOnly: true },
    { href: '/admin/backups', label: '备份管理', adminOnly: true },
  ] },
];

export function AdminNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const scopes = user?.moderatorScopes || [];
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  // 窄屏导航是折叠条：换页后收起，否则点进某项后面板仍摊在正文上方
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEscape(open, () => setOpen(false));

  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));
  const flat = NAV_GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, group: g.group })));
  const current = flat.filter((it) => isActive(it.href)).sort((a, b) => b.href.length - a.href.length)[0];

  const canSee = (it: { adminOnly?: boolean; module?: ModuleKey }) => {
    if (it.adminOnly) return isAdmin;
    if (!it.module) return true;
    return isAdmin || scopes.includes(it.module);
  };

  const kw = query.trim();
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items
      .filter(canSee)
      .filter((it) => !kw || it.label.includes(kw) || it.href.includes(kw) || g.group.includes(kw)),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="relative z-30 w-full lg:w-56 xl:w-64 flex-shrink-0 lg:sticky lg:top-24 lg:self-start">
      {/* 点面板外任意处收起。必须放在 .glass 卡片之外：本主题里 .glass 带 backdrop-filter，
          它会成为 fixed 后代的包含块，遮罩塞在卡片里就只盖得住卡片自己那一块。 */}
      {open ? (
        <button
          type="button"
          aria-label="收起后台导航"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-0 bg-ink-950/30 cursor-default lg:hidden"
        />
      ) : null}
      <div className="glass rounded-2xl p-3 lg:p-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full lg:hidden flex items-center gap-2 px-1 py-2.5 text-left"
        >
          <span className="font-display text-lg font-bold text-ink-900 shrink-0">后台导航</span>
          {current ? (
            <span className="text-sm text-ink-500 truncate">{current.group} · {current.label}</span>
          ) : null}
          <svg
            className={`w-5 h-5 ml-auto shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <div className="hidden lg:block font-display text-lg font-bold text-ink-900 mb-3 px-1">管理后台</div>

        {user ? (
          <div className="px-1 mb-3 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <StaffBadges role={user.role} scopes={scopes} compact />
              <span className="text-xs text-ink-500">
                {isAdmin ? '全部模块 + 系统治理' : user.role === 'moderator' ? `${scopes.length} 个模块` : '普通成员'}
              </span>
            </div>
            {!isAdmin && user.role === 'moderator' && scopes.length === 0 ? (
              <p className="text-xs text-amber-700">尚未分配任何模块，请联系管理员</p>
            ) : null}
          </div>
        ) : (
          // 身份块要占位：不预留高度时它一出现就把下面的菜单整体往下推 38px（后台首屏 CLS 的主因）
          <div className="px-1 mb-3 min-h-[26px]" aria-hidden="true" />
        )}

        {/* 窄屏展开时面板浮在正文之上而不是插在正文前面：30 条链接摊开有一千多像素高，
            点一下导航整页被推下去，正文从视野里消失——收起/展开不该动页面几何。
            浮层必须是不透明的 bg-ui-surface：沿用外层 .glass 的 72% 透明度时，
            仪表盘的大号数字会从菜单底下透上来，两列文字叠着读。桌面端仍走常规流。 */}
        <div
          className={`${
            open
              ? 'block absolute left-0 right-0 top-full mt-1.5 max-h-[62vh] overflow-y-auto scroll-slim rounded-2xl border border-ui-border bg-ui-surface p-3 shadow-card-hover'
              : 'hidden'
          } lg:static lg:mt-0 lg:block lg:max-h-[calc(100vh-19rem)] lg:overflow-y-auto lg:rounded-none lg:border-0 lg:p-0 lg:shadow-none lg:-mx-1 lg:px-1 lg:pb-1`}
        >
          <label className="block mb-3">
            <span className="sr-only">搜索后台功能</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索功能，如「审核」"
              className="input-styled input-sm text-sm"
            />
          </label>

          {/* 权限没解析完之前不画菜单：adminOnly 条目先缺后补，链接会被插到列表中间，
              整列往下跳几十像素。未解析时留白，解析完一次性画出来。 */}
          {user ? (
          <nav aria-label="后台导航" className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:block lg:space-y-4">
            {groups.map((g) => (
              <div key={g.group}>
                {/* 分组标题必须比它自己的条目大：原来是 text-xs(12) 压着 text-sm(14) 的条目，
                    层级倒挂，扫一眼分不清哪行是栏目、哪行是入口。阶梯 18 / 16 / 14。 */}
                <div className="flex items-center gap-2 px-2 mb-1.5 text-base font-bold text-ink-900">
                  <GroupIcon name={g.group} />
                  {g.group}
                </div>
                <div className="flex flex-col gap-1">
                  {g.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`whitespace-nowrap shrink-0 lg:shrink rounded-xl px-3 py-2 text-sm font-medium transition ${
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
          ) : null}
          {user && !groups.length ? (
            <p className="px-2 py-4 text-xs text-ink-500">没有匹配「{kw}」的功能</p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

/** 30 条纯文字链接扫不出层次，给每个分组一个线性图标做锚点 */
const GROUP_ICON: Record<string, string> = {
  概览: 'M4 13h6V4H4v9zm10 7h6v-9h-6v9zM4 20h6v-4H4v4zM14 8h6V4h-6v4z',
  协作: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  内容: 'M22 12h-6l-2 3h-4l-2-3H2m3.45-6.89L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z',
  社交: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  活动: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  运营: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  系统: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
};

function GroupIcon({ name }: { name: string }) {
  const d = GROUP_ICON[name];
  if (!d) return null;
  return (
    <svg
      className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-7xl 2xl:max-w-[1560px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
        <AdminNav />
        <div className="admin-scope flex-1 w-full min-w-0">{children}</div>
      </div>
    </div>
  );
}

/* ----------------------------- 小组件 ----------------------------- */

/**
 * 指标卡。传 href 时整卡可点：后台看数字的人下一步就是要去处理，
 * 让他再回侧栏找入口等于白跑一趟。accent 给「有待办」的卡加一圈金色提醒。
 */
export function StatCard({
  title,
  value,
  hint,
  href,
  accent = false,
}: {
  title: string;
  value: number | string;
  hint?: string;
  href?: string;
  accent?: boolean;
}) {
  const shell = `glass rounded-2xl p-4 sm:p-5 card-hover shadow-soft group ${
    accent ? 'ring-1 ring-gold-400' : ''
  }`;
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-xs sm:text-sm text-ink-500 leading-snug">{title}</span>
        {accent ? <span className="w-1.5 h-1.5 rounded-full bg-gold-500" aria-hidden="true" /> : null}
        {href ? (
          <svg
            className="w-3.5 h-3.5 ml-auto text-ink-300 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition max-md:opacity-100"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        ) : null}
      </div>
      <div className="font-display text-2xl sm:text-3xl font-bold text-ink-900 mt-1">{value}</div>
      {hint ? <div className="text-xs text-ink-400 mt-1">{hint}</div> : null}
    </>
  );
  if (!href) return <div className={shell}>{body}</div>;
  return (
    <Link href={href} className={`${shell} block`}>
      {body}
    </Link>
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
  // 表格列宽被挤窄时「普通成员」会断成两行、圆胶囊变成竖椭圆，读不出是一枚状态标签
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
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

export function Empty({
  label = '暂无数据',
  hint,
  href,
  hrefLabel,
}: {
  label?: string;
  hint?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="py-10 px-4 text-center border border-dashed border-ink-200 rounded-2xl">
      <div className="text-sm text-ink-500">{label}</div>
      {hint ? <p className="text-xs text-ink-400 mt-1.5 leading-relaxed">{hint}</p> : null}
      {href ? (
        <Link href={href} className="btn-secondary btn-sm inline-block mt-3">
          {hrefLabel || '查看'}
        </Link>
      ) : null}
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

// 页面自己的标题要传 as="h1"（后台每页的第一个标题就是页面标题，读屏靠它定位），
// 页面内的分区标题保持默认 h2，否则一份文档里会出现多个 h1。
export function SectionTitle({
  children,
  as: Tag = 'h2',
}: {
  children: ReactNode;
  as?: 'h1' | 'h2';
}) {
  return <Tag className="font-display text-xl font-bold text-ink-900 mb-4">{children}</Tag>;
}

export type { ReviewTask };

/* 简单权限判断 */
export function isStaff(role?: string) {
  return role === 'moderator' || role === 'admin';
}
