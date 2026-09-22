'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { ReviewTask } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useEscape } from '@/lib/a11y';
import { contentStatusLabel } from '@/lib/labels';
import {
  IconAlert,
  IconBan,
  IconCalendar,
  IconChatDots,
  IconCheck,
  IconChevronDown,
  IconDocument,
  IconGrid,
  IconInbox,
  IconLock,
  IconSearch,
  IconShield,
  IconUsers,
  IconWallet,
} from '@/components/icons';

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

/* --------------------------- 侧边导航的字号阶梯 ---------------------------

   用户原话：「左边菜单还没右边的模块文字大，其次菜单的字体还没有菜单里里边模块
   字体大，这不合常理」。倒挂有两处，一次修完：

     1. 条目文字（原本 14px）比右侧正文（表格/卡片都是 14px）还不起眼；
     2. 栏目名「内容 / 系统」（原本 16px 粗体）压在自己名下的条目（14px）头上，
        读起来像「栏目 > 入口」，而导航里真正要点的从来不是栏目名。

   所以定一条单向递减的阶梯，导航项永远是它那一行里最大的一档：

     面板标题（管理后台） 17px / bold
     条目文字（用户管理） 15px / medium，选中时 semibold   ← 全站最大的一档 nav 文字
     条目内的附属字        11px / medium（模块计数、范围说明）
     栏目名（内容 / 系统） 11px + 字距 + 弱色 + 一道发丝线   ← 明确是「眉标」不是「标题」

   栏目名缩到 11px 不是把它藏起来：它带 0.18em 字距、--ui-muted 弱色、后面跟一条
   发丝线，视觉语法上就是分类标签，和上一版的「16px 粗体小标题」不是一回事，
   不会再出现「栏目比入口大」的错觉。右侧正文 14px，条目 15px 因此稳压一头。
   ----------------------------------------------------------------------- */

/** 侧栏里唯一一档「附属小字」：条目内的计数、范围、说明一律走它，保证小于条目本身。 */
function NavMeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-[11px] font-medium leading-none text-ui-muted ${className}`}>{children}</span>
  );
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

  // 当前路径只出现在折叠条上；展开后菜单里已经有选中态，重复一行小字反而挤
  const crumb = current ? `${current.group} · ${current.label}` : '未进入具体模块';

  return (
    <aside className="relative z-30 w-full lg:w-60 xl:w-64 flex-shrink-0 lg:sticky lg:top-24 lg:self-start">
      {/* 点面板外任意处收起。必须放在 .glass 卡片之外：本主题里 .glass 带 backdrop-filter，
          它会成为 fixed 后代的包含块，遮罩塞在卡片里就只盖得住卡片自己那一块。 */}
      {open ? (
        <button
          type="button"
          aria-label="收起后台导航"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-0 bg-ink-950/40 cursor-default lg:hidden"
        />
      ) : null}
      <div className="glass rounded-2xl p-3 lg:p-3.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-h-11 w-full lg:hidden flex items-center gap-2 px-1 text-left"
        >
          <span className="font-display text-[17px] font-bold leading-none text-ink-900 shrink-0">后台导航</span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-none text-ui-muted">{crumb}</span>
          <IconChevronDown
            className={`w-5 h-5 shrink-0 text-ui-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            strokeWidth={1.7}
          />
        </button>

        <div className="hidden lg:flex lg:items-center lg:gap-2 lg:px-1.5 lg:mb-3">
          <span className="font-display text-[17px] font-bold leading-none text-ink-900">管理后台</span>
          {/* 治理范围在标题行只留一枚小点 + 计数，剩下的字数交给下面的说明块，
              免得 11px 的附属字和 15px 的条目挤在同一视觉重量上 */}
          <span className="ml-auto">
            <NavMeta>{isAdmin ? '全量' : user ? `${scopes.length} 模块` : '校验中'}</NavMeta>
          </span>
        </div>

        {user ? (
          <div className="px-1 mb-3 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <StaffBadges role={user.role} scopes={scopes} compact />
            </div>
            <NavMeta className="block leading-snug">
              {isAdmin ? '全部模块 + 系统治理' : user.role === 'moderator' ? `已分配 ${scopes.length} 个模块` : '普通成员'}
            </NavMeta>
            {!isAdmin && user.role === 'moderator' && scopes.length === 0 ? (
              <p className="text-[11px] font-medium leading-snug text-amber-700">尚未分配任何模块，请联系管理员</p>
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
              ? 'block absolute left-0 right-0 top-full mt-1.5 max-h-[62vh] overflow-y-auto scroll-slim rounded-2xl border border-ui-border bg-ui-surface p-3 shadow-pop'
              : 'hidden'
          } lg:static lg:mt-0 lg:block lg:max-h-[calc(100vh-19rem)] lg:overflow-y-auto lg:rounded-none lg:border-0 lg:p-0 lg:shadow-none lg:-mx-1 lg:px-1 lg:pb-1`}
        >
          <label className="block mb-3">
            <span className="sr-only">搜索后台功能</span>
            <span className="relative block">
              <IconSearch
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ui-muted"
                strokeWidth={1.7}
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索功能，如「审核」"
                className="input-styled input-sm input-icon min-h-11 text-sm"
              />
            </span>
          </label>

          {/* 权限没解析完之前不画菜单：adminOnly 条目先缺后补，链接会被插到列表中间，
              整列往下跳几十像素。未解析时留白，解析完一次性画出来。 */}
          {user ? (
          <nav aria-label="后台导航" className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:block lg:space-y-3.5">
            {groups.map((g) => (
              <div key={g.group}>
                {/* 栏目名 = 眉标：11px + 字距 + 弱色 + 发丝线，永远小于它名下 15px 的条目 */}
                <div className="flex items-center gap-2 px-2 mb-1.5">
                  <GroupIcon name={g.group} />
                  <span className="text-[11px] font-semibold leading-none tracking-[0.18em] text-ui-muted">
                    {g.group}
                  </span>
                  <span aria-hidden="true" className="h-px flex-1 bg-ui-border" />
                </div>
                <div className="flex flex-col gap-0.5">
                  {g.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`min-h-11 lg:min-h-[34px] flex items-center rounded-lg border-l-2 px-3 py-1.5 text-[15px] leading-tight transition-colors ${
                          active
                            ? 'border-primary-500 bg-primary-50 font-semibold text-primary-700'
                            : 'border-transparent font-medium text-ink-600 hover:bg-primary-50 hover:text-primary-700'
                        }`}
                      >
                        {/* 窄屏两列时「支出公示管理」这类长名换行而不是截断：截断会丢信息，
                            换行只发生在浮层内部（可滚动），不会推动正文 */}
                        <span className="min-w-0">{item.label}</span>
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

/** 30 条纯文字链接扫不出层次，给每个分组一个线性图标做锚点（和全站图标库同一套描边）。 */
const GROUP_ICON: Record<string, (p: { className?: string; strokeWidth?: number }) => ReactNode> = {
  概览: IconGrid,
  协作: IconChatDots,
  内容: IconDocument,
  社交: IconUsers,
  活动: IconCalendar,
  运营: IconWallet,
  系统: IconShield,
};

function GroupIcon({ name }: { name: string }) {
  const Cmp = GROUP_ICON[name];
  if (!Cmp) return null;
  return <Cmp className="w-3.5 h-3.5 flex-shrink-0 text-ui-muted" strokeWidth={1.7} />;
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

/* ----------------------------- 页面骨架 ----------------------------- */

/**
 * 每页顶部的标题块：眉标 + h1 + 一行说明 + 右侧动作。
 *
 * 原来 20 个页面各写一套 `flex items-end justify-between` + h1 + p，字号从 text-2xl
 * 到 text-xl 都有，说明行一会儿 text-xs 一会儿 text-sm，页与页之间对不齐。
 * 标题左侧那道渐变发丝和公开页 SectionHead 同一语法，公开页与后台因此是一套设计。
 * 说明行高度固定为「一行占满、超长才换行」，刷新时文案变长变短都不该推动右侧按钮。
 */
export function PageHead({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: string;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap mb-5 lg:mb-6">
      {/* 这里不能写 min-w-0：flex-1 的基准是 0，右侧 actions 又是 shrink-0，
          320px 下标题列会被压到 50px 宽，「审核队列」竖着一行一个字。给个下限让它换行。 */}
      <div className="flex-1 min-w-[160px]">
        {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
        <h1 className="font-display text-2xl font-bold text-ink-900 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-6 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary-500 to-gold-500"
          />
          <span className="min-w-0">{title}</span>
        </h1>
        {sub ? <p className="text-xs text-ink-500 mt-1.5 pl-5 leading-relaxed">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

/** 卡片/分区标题：与 PageHead 同一道渐变发丝，缩一号，条目区里最大的一档文字。 */
export function SectionTitle({
  children,
  as: Tag = 'h2',
  className = '',
}: {
  children: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}) {
  return (
    <Tag className={`font-display text-lg font-bold text-ink-900 mb-4 flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden="true"
        className="h-4 w-[3px] shrink-0 rounded-full bg-gradient-to-b from-primary-500 to-gold-500"
      />
      <span className="min-w-0">{children}</span>
    </Tag>
  );
}

/** 面板壳：后台所有区块共用的表面。桌面端 hover 不抬升（信息块乱动显得廉价）。 */
export function Panel({
  children,
  className = '',
  title,
  aside,
  as = 'h2',
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  /** 标题行右侧：计数、链接、按钮 */
  aside?: ReactNode;
  as?: 'h2' | 'h3';
}) {
  return (
    <section className={`glass rounded-2xl p-4 sm:p-5 shadow-soft hair-top ${className}`}>
      {title ? (
        <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
          <SectionTitle as={as} className="mb-0">
            {title}
          </SectionTitle>
          {aside ? <div className="shrink-0 text-xs text-ink-500">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** 筛选条：窄屏必须整块换行且不重叠，控件热区统一 ≥ 44px。 */
export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`glass rounded-2xl p-3 sm:p-4 mb-5 flex flex-wrap gap-2 sm:gap-3 items-stretch sm:items-center shadow-soft ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * 表格壳。原先每页自己写 `glass rounded-2xl overflow-hidden`，表头压死在卡片边上，
 * 窄屏里滚动条直接顶到圆角外。这里统一留一道 hair-top 收口 + 细滚动条。
 * busy=true 时刷新只压暗不抹掉，避免出现「整页空白 → 弹回来」的闪一下。
 */
export function TableShell({
  children,
  busy = false,
  className = '',
}: {
  children: ReactNode;
  busy?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`glass rounded-2xl overflow-hidden shadow-soft hair-top transition-opacity duration-300 ${
        busy ? 'opacity-60' : 'opacity-100'
      } ${className}`}
    >
      <div className="overflow-x-auto scroll-slim">{children}</div>
    </div>
  );
}

/** 表头统一档：13px + 字距 + 弱色，永远小于表格正文的 14px，读起来是「列名」不是「内容」。 */
export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`text-left px-3 lg:px-4 py-3 text-[13px] font-semibold tracking-wide text-ink-500 ${className}`}>
      {children}
    </th>
  );
}

/* --------------------------- 令牌化下拉（替代浏览器默认 select） --------------------------- */

export type SelectOption = { value: string; label: string; hint?: string };

/**
 * 后台筛选条里的下拉。
 *
 * 原来的 `<select>` 是系统绘制的：浅色主题下弹层是纯白、行高和字号跟着操作系统走，
 * 和页面这套令牌完全没有关系 —— 用户原话「这个下拉太丑了」。这里自己画：
 * 触发器走 --ui-surface / --ui-border / --ui-text，弹层走 --el-pop + 一圈 --edge 描边，
 * 选中项用 --ui-accent-soft 染色而不是整块实心，悬停用 --ui-hover。
 * 三个主题下弹层底色都来自 --ui-surface（#fff / #171b22 / #fbf4e6），
 * 文字来自 --ui-text，不会出现「白底白字」。
 *
 * 弹层是绝对定位覆盖层：展开不推动任何一行表格。
 * 键盘：触发器保留焦点，方向键/Home/End 移动活动项，Enter/Space 选中，Esc 关闭，
 * 走 aria-activedescendant，不需要在选项之间搬焦点。
 */
export function AdminSelect({
  value,
  onChange,
  options,
  label,
  className = '',
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  /** 无障碍名称，等同原来 select 的 aria-label */
  label: string;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.findIndex((o) => o.value === value);
  const shown = selected >= 0 ? options[selected] : null;

  useEscape(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) setActive(selected >= 0 ? selected : 0);
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-o-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  const commit = (i: number) => {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    setOpen(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((i) => {
        const n = i + (e.key === 'ArrowDown' ? 1 : -1);
        return n < 0 ? options.length - 1 : n >= options.length ? 0 : n;
      });
    } else if (e.key === 'Home' && open) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && open) {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (open) {
        e.preventDefault();
        commit(active);
      }
    }
  };

  return (
    <div ref={wrapRef} className={`relative shrink-0 min-w-[9.5rem] max-w-full sm:max-w-[15rem] ${className}`}>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-o-${active}` : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={`min-h-11 w-full flex items-center justify-between gap-2 rounded-lg border bg-ui-surface px-3 text-sm text-ui-text transition-colors ${
          open ? 'border-ui-accent' : 'border-ui-border hover:border-ui-accent'
        }`}
      >
        <span className="min-w-0 truncate text-left">{shown ? shown.label : label}</span>
        <IconChevronDown className="w-4 h-4 shrink-0 text-ui-muted" strokeWidth={1.8} />
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 min-w-[11rem] overflow-y-auto scroll-slim rounded-xl border border-ui-border bg-ui-surface p-1 shadow-pop"
        >
          {options.map((o, i) => {
            const isSel = o.value === value;
            return (
              <li key={o.value || '__empty'} role="presentation">
                <button
                  type="button"
                  id={`${listId}-o-${i}`}
                  role="option"
                  aria-selected={isSel}
                  tabIndex={-1}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(i)}
                  className={`min-h-11 w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                    i === active ? 'bg-ui-hover' : ''
                  } ${isSel ? 'bg-ui-accent-soft font-semibold text-ui-accent' : 'font-medium text-ui-text'}`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {o.label}
                    {o.hint ? <span className="ml-1.5 text-[11px] font-medium text-ui-muted">{o.hint}</span> : null}
                  </span>
                  {isSel ? <IconCheck className="w-4 h-4 shrink-0" strokeWidth={2} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/* ----------------------------- 分页 ----------------------------- */

/**
 * 分页：9 个列表页原本各写一套，手机上「上一页 / 下一页」只有 30px 高。
 * 这里把热区钉在 44px，并把页码文案固定成一格，翻页时按钮不左右跳。
 */
export function Pagination({
  total,
  page,
  pageSize,
  onPage,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 mt-4 text-sm text-ink-500 flex-wrap">
      <span className="num min-w-0">
        共 {total} 条 · 第 {page} / {pages} 页
      </span>
      <div className="flex items-center gap-2">
        <button
          className="btn-secondary btn-sm min-h-11 lg:min-h-0"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
        >
          上一页
        </button>
        <button
          className="btn-secondary btn-sm min-h-11 lg:min-h-0"
          disabled={page * pageSize >= total}
          onClick={() => onPage(page + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- 小组件 ----------------------------- */

/**
 * 指标卡。传 href 时整卡可点：后台看数字的人下一步就是要去处理，
 * 让他再回侧栏找入口等于白跑一趟。accent 给「有待办」的卡加一圈金色提醒。
 *
 * 文字阶梯与公开页统计格一致：眉标（11px 字距）→ 数字（等宽数位，28~30px）→ 补充说明（11px）。
 * 数字一律走 .num（tabular-nums），刷新时数字位数变化不会让卡片左右抽动。
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
  const numeric = typeof value === 'number' && Number.isFinite(value);
  const shell = `glass rounded-2xl p-4 sm:p-5 shadow-soft hair-top ${
    href ? 'group card-hover ' : ''
  }${accent ? 'ring-1 ring-gold-400' : ''}`;
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        {/* 眉标是这张卡里最小的一档，数字最大 —— 与侧栏同一套层级方向 */}
        <span className="eyebrow min-w-0 truncate">{title}</span>
        {accent ? (
          <span className="w-1.5 h-1.5 rounded-full bg-gold-500 shrink-0" aria-hidden="true" />
        ) : null}
        {href ? (
          <IconChevronRightSmall />
        ) : null}
      </div>
      <div
        data-count={numeric ? '' : undefined}
        className={`num font-display text-2xl sm:text-[1.75rem] font-bold mt-1.5 ${
          accent ? 'num-beam' : 'text-ink-900'
        }`}
      >
        {value}
      </div>
      {hint ? <div className="text-[11px] font-medium text-ink-400 mt-1">{hint}</div> : null}
    </>
  );
  if (!href) return <div className={shell}>{body}</div>;
  return (
    <Link href={href} data-spot className={`spot block ${shell}`}>
      {body}
    </Link>
  );
}

/** StatCard 右下角那枚箭头：悬停时才亮，触屏常显（没有 hover 可用）。 */
function IconChevronRightSmall() {
  return (
    <svg
      className="w-3.5 h-3.5 ml-auto shrink-0 text-ink-300 opacity-0 max-md:opacity-100 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

type BadgeTone = 'primary' | 'gold' | 'green' | 'red' | 'gray' | 'blue';

/* 每档底色都配一圈同族 15% 内描边：三主题的底色都是「淡色压白卡」或
   「半透明压暗卡」，只有底色时相邻两枚徽章的边界会糊在一起。 */
const TONE_CLASS: Record<BadgeTone, string> = {
  primary: 'bg-primary-50 text-primary-700 ring-primary-500/15',
  gold: 'bg-gold-100 text-gold-800 ring-gold-500/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-500/15',
  red: 'bg-rose-50 text-rose-700 ring-rose-500/15',
  gray: 'bg-ink-100 text-ink-600 ring-ink-400/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-500/15',
};

export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  // 表格列宽被挤窄时「普通成员」会断成两行、圆胶囊变成竖椭圆，读不出是一枚状态标签
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASS[tone]}`}
    >
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
    // 后台首页把待审内容直接喂进来，schema 里这个值叫 pending_review，漏了就印英文。
    pending_review: { tone: 'gold', label: '待审核' },
    rejected: { tone: 'red', label: '已驳回' },
    draft: { tone: 'gray', label: '草稿' },
    approved: { tone: 'green', label: '已通过' },
  };
  const m = map[status] || { tone: 'gray' as BadgeTone, label: contentStatusLabel(status) };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/**
 * 加载态：从一行「加载中…」改成有光扫过的骨架。
 * 每块高度写死（h-3 / w-9），数据回来后换成真行的位移量与原骨架一致，不推版。
 */
export function Loading({ label = '加载中…', rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" className="space-y-2.5">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="glass rounded-2xl p-3.5 sm:p-4 flex items-center gap-3 shadow-soft">
          <div className="w-9 h-9 rounded-lg bg-ink-100 skeleton-sheen shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0 space-y-2" aria-hidden="true">
            <div className="h-3 rounded bg-ink-100 skeleton-sheen" style={{ width: `${86 - (i % 3) * 9}%` }} />
            <div className="h-3 rounded bg-ink-100 skeleton-sheen w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 表格在加载中：给一张和真空表同宽同高的壳，避免「先塌一行、再弹出一张表」。 */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" className="glass rounded-2xl overflow-hidden shadow-soft hair-top">
      <div className="h-11 bg-ink-50" aria-hidden="true" />
      <div className="divide-y divide-ink-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-3 px-3 lg:px-4 py-3.5">
            {Array.from({ length: cols }).map((__, c) => (
              <div
                key={c}
                aria-hidden="true"
                className="h-3 rounded bg-ink-100 skeleton-sheen flex-1 min-w-0"
                style={{ maxWidth: c === 0 ? '34%' : undefined }}
              />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">加载中…</span>
    </div>
  );
}

export function Empty({
  label = '暂无数据',
  hint,
  href,
  hrefLabel,
  icon = 'box',
}: {
  label?: string;
  hint?: string;
  href?: string;
  hrefLabel?: string;
  /** box = 列表为空；alert = 被驳回/异常；search = 筛选后为空 */
  icon?: 'box' | 'alert' | 'search';
}) {
  const Icon = icon === 'alert' ? IconAlert : icon === 'search' ? IconSearch : IconInbox;
  return (
    <div className="py-10 px-4 sm:py-12 text-center border border-dashed border-ink-200 rounded-2xl">
      <div
        className="mx-auto w-11 h-11 rounded-xl bg-ink-100 text-ink-400 flex items-center justify-center"
        aria-hidden="true"
      >
        <Icon className="w-5 h-5" strokeWidth={1.6} />
      </div>
      <div className="text-sm font-medium text-ink-500 mt-3">{label}</div>
      {hint ? <p className="text-xs text-ink-400 mt-1.5 leading-relaxed max-w-sm mx-auto">{hint}</p> : null}
      {href ? (
        <Link href={href} className="btn-secondary btn-sm min-h-11 lg:min-h-0 inline-flex mt-4">
          {hrefLabel || '查看'}
        </Link>
      ) : null}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="py-8 px-4 sm:py-10 text-center rounded-2xl bg-rose-50 text-rose-700 border border-rose-200">
      <div className="flex items-center justify-center gap-2 font-medium">
        <IconAlert className="w-5 h-5 shrink-0" strokeWidth={1.6} />
        <span>{message || '加载失败'}</span>
      </div>
      {onRetry ? (
        <button className="btn-secondary mt-3 min-h-11 lg:min-h-0" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}

/**
 * 未登录 / 无权限 / 未分配模块三种「进不去」的态。
 *
 * checkins、feedback、reports 原来各写一块 16×16 的 emoji 方块（🔒 / 🚫），
 * emoji 在深色主题下不会跟着换色，图标和文字成了两套亮度。换成线性图标 + 令牌底。
 */
export function AccessState({
  kind = 'lock',
  title,
  desc,
  href,
  hrefLabel,
}: {
  kind?: 'lock' | 'ban';
  title: string;
  desc?: ReactNode;
  href?: string;
  hrefLabel?: string;
}) {
  const Icon = kind === 'ban' ? IconBan : IconLock;
  return (
    <div className="py-16 px-4 text-center">
      <div
        className="mx-auto w-14 h-14 rounded-2xl bg-ink-100 text-ink-400 flex items-center justify-center"
        aria-hidden="true"
      >
        <Icon className="w-7 h-7" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl sm:text-2xl font-bold text-ink-900 mt-4">{title}</h2>
      {desc ? <p className="text-ink-500 text-sm mt-2 max-w-md mx-auto leading-relaxed">{desc}</p> : null}
      {href ? (
        <Link href={href} className="btn-primary btn-sm min-h-11 lg:min-h-0 inline-flex mt-5">
          {hrefLabel || '去登录'}
        </Link>
      ) : null}
    </div>
  );
}

export type { ReviewTask };

/* 简单权限判断 */
export function isStaff(role?: string) {
  return role === 'moderator' || role === 'admin';
}
