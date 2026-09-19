'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useNotifications } from '@/lib/notifyStream';
import PreferenceMenu from '@/components/PreferenceMenu';
import ShareModal from '@/components/ShareModal';
import { moduleOfPath } from '@/lib/siteModules';
import { useDisabledModules } from '@/lib/useSiteModules';
import { COMMAND_PALETTE_EVENT } from '@/components/CommandPalette';
import { isBareRoute } from '@/lib/bareRoutes';

const topLinks = [
  { href: '/', key: 'nav.home' },
  { href: '/bible', key: 'nav.bible' },
  { href: '/community', key: 'nav.community' },
];

const navGroups = [
  {
    key: 'bibleStudy',
    labelKey: 'nav.group.bibleStudy',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    items: [
      { href: '/plans', key: 'nav.plans', descKey: 'nav.itemDesc.plans', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { href: '/sermons', key: 'nav.sermons', descKey: 'nav.itemDesc.sermons', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
    ],
  },
  {
    key: 'worship',
    labelKey: 'nav.group.worship',
    icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
    items: [
      { href: '/songs', key: 'nav.songs', descKey: 'nav.itemDesc.songs', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3' },
      { href: '/media', key: 'nav.media', descKey: 'nav.itemDesc.media', icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { href: '/live', key: 'nav.live', descKey: 'nav.itemDesc.live', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    ],
  },
  {
    key: 'community',
    labelKey: 'nav.group.community',
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    items: [
      { href: '/topics', key: 'nav.topics', descKey: 'nav.itemDesc.topics', icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
      { href: '/activities', key: 'nav.activities', descKey: 'nav.itemDesc.activities', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
      { href: '/calendar', key: 'nav.calendar', descKey: 'nav.itemDesc.calendar', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
      { href: '/prayers', key: 'nav.prayers', descKey: 'nav.itemDesc.prayers', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
      { href: '/groups', key: 'nav.groups', descKey: 'nav.itemDesc.groups', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    ],
  },
  {
    key: 'support',
    labelKey: 'nav.group.support',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    items: [
      { href: '/donate', key: 'nav.donate', descKey: 'nav.itemDesc.donate', icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7' },
    ],
  },
];

type NavItem = { href: string; key: string; descKey: string; icon: string };
type NavGroup = { key: string; labelKey: string; icon: string; items: NavItem[] };

/**
 * 桌面端分类目录 mega menu。
 * 左侧分类列表，右侧当前分类子项；点击外部 / ESC / 路由变化自动关闭。
 * 配色一律走 --ui-* 令牌（bg-ui-surface / text-ui-muted 等）：
 * 全局主题覆盖只重写 .bg-white、.text-ink-* 这类精确类名，渐变与 bg-x/70 变体不在名单内，
 * 用旧写法会在深色/护眼下留下「浅轨道 + 被改浅的文字」的同色叠加。
 * 视觉：居中浮层卡片 + 页面遮罩压暗聚焦；子项卡片带图标/描述与逐项交错浮现，分类悬停即切换。
 */
function CatalogMenu({ groups, buttonClass, isActive }: { groups: NavGroup[]; buttonClass: string; isActive: (href: string) => boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { setActiveKey(null); return; }
    setActiveKey(groups[0]?.key || null);
  }, [open, groups]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  const activeGroup = groups.find((g) => g.key === activeKey) || groups[0];

  const portal = typeof document === 'undefined' ? null : createPortal(
    <>
      {/* 遮罩：压暗并轻微模糊页面，把视线聚到目录上；导航 z-50 在其上，面板后渲染盖住遮罩。
          在 panelRef 之外，点遮罩走「外部 mousedown 关闭」逻辑。 */}
      <div className="fixed inset-0 z-40 bg-ink-950/25 backdrop-blur-[2px] animate-scrim-in" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.catalog')}
        data-guard="nav-catalog"
        className="fixed top-[92px] left-0 right-0 z-40 hidden xl:block"
      >
        {/* 居中浮层卡片而非通栏贴边：通栏在 1440px+ 会把 2 个子项拉成两张空壳大卡 */}
        <div className="mx-auto w-[min(1060px,calc(100vw-48px))]">
          <div className="animate-menu-in origin-top bg-ui-surface rounded-2xl border border-ui-border shadow-[0_28px_70px_-24px_rgba(19,22,37,0.45)] overflow-hidden">
            <div className="flex items-stretch max-h-[calc(100vh-140px)] overflow-hidden">
              {/* 左栏：选中项用「抬升卡片」而不是换底色，三种主题下都能靠明度差与投影分辨 */}
              <div className="w-[212px] shrink-0 overflow-y-auto bg-ui-rail border-r border-ui-border p-2 space-y-0.5">
                {groups.map((g) => {
                  const active = activeKey === g.key;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onMouseEnter={() => setActiveKey(g.key)}
                      onClick={() => setActiveKey(g.key)}
                      aria-current={active ? 'true' : undefined}
                      className={`group w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-xl text-sm transition-all duration-200 ${
                        active
                          ? 'bg-ui-surface text-ui-accent font-semibold shadow-[0_2px_8px_-2px_rgba(19,22,37,0.18)]'
                          : 'text-ui-muted font-medium hover:bg-ui-hover hover:text-ui-text'
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${
                        active
                          ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm shadow-primary-500/30'
                          : 'text-ui-muted group-hover:text-ui-accent'
                      }`}>
                        <svg className="w-[17px] h-[17px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d={g.icon} />
                        </svg>
                      </span>
                      <span className="flex-1 min-w-0 truncate">{t(g.labelKey as any)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 min-w-0 overflow-y-auto p-4">
                {activeGroup && (
                  <div key={activeGroup.key}>
                    <div className="flex items-baseline justify-between gap-3 mb-3 px-0.5">
                      <span className="text-sm font-semibold text-ui-text">{t(activeGroup.labelKey as any)}</span>
                      <span className="text-xs text-ui-muted">{activeGroup.items.length} 个入口</span>
                    </div>
                    {/* key 重新挂载：切换分类时子项重新播放交错入场 */}
                    <div className="menu-stagger grid grid-cols-2 gap-2.5 content-start">
                      {activeGroup.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={`group/item flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 ${
                            isActive(item.href)
                              ? 'border-ui-accent bg-ui-accent-soft'
                              : 'border-ui-border bg-ui-surface hover:bg-ui-hover'
                          }`}
                        >
                          <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${
                            isActive(item.href)
                              ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm shadow-primary-500/25'
                              : 'bg-ui-accent-soft text-ui-accent group-hover/item:bg-gradient-to-br group-hover/item:from-primary-500 group-hover/item:to-primary-700 group-hover/item:text-white'
                          }`}>
                            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                            </svg>
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-ui-text">{t(item.key as any)}</span>
                            <span className="block text-xs text-ui-muted mt-1 leading-relaxed">
                              {t(item.descKey as any)}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* 底部提示条：一键唤起 ⌘K 全站搜索 */}
            <button
              type="button"
              onClick={() => { setOpen(false); window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT)); }}
              className="group/footer w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-ui-rail border-t border-ui-border text-xs text-ui-muted hover:text-ui-accent transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>{t('nav.catalogHint')}</span>
              <kbd className="px-1.5 py-0.5 rounded-md bg-ui-surface border border-ui-border text-[10px] group-hover/footer:border-ui-accent group-hover/footer:text-ui-accent transition-colors">⌘K</kbd>
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${buttonClass} inline-flex items-center gap-0.5 ${open ? 'bg-white/15 text-white' : ''}`}
      >
        {t('nav.catalog')}
        {/* 单一箭头 + 旋转过渡，替代原先生硬的路径切换 */}
        <svg className={`w-4 h-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && portal}
    </>
  );
}

/**
 * 顶栏响应式约定（动这段前先读）：
 * 桌面版导航容器 max-w-7xl（1280px）减去左右 px-8 只剩 1216px 可用。
 * 12 个导航项平铺 + 右侧工具区一旦超过它，flex 会把每个「文字 flex item」压到 min-content，
 * 中文 min-content 就是「一个字」——于是整条导航变成一字一行竖排（历史缺陷）。
 * 修复策略：桌面 xl 以上只平铺最高频入口（Home/Bible/Community），其余按「神的话语 / 敬拜与媒体 / 社区与生活 / 支持平台」
 * 收入 CatalogMenu 分类目录；汉堡菜单仍保留全部入口的双列网格。
 */
export default function Navbar({ disabledModules = [] }: { disabledModules?: string[] }) {
  // 服务端快照 + 水合后校正的首页 ISR 旧壳
  const offModules = useDisabledModules(disabledModules);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useI18n();

  const { data: frReq } = useApi<{ total: number }>(user ? '/friends/requests?pageSize=1' : null, [user?.id]);
  const { unread: liveUnread } = useNotifications();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const isStaff = user?.role === 'admin' || user?.role === 'moderator';

  /** 该 href 所属模块是否已下线（不属于任何模块的路径恒为可见） */
  const moduleOff = (href: string) => {
    const m = moduleOfPath(href);
    return !!m && offModules.includes(m);
  };

  const visibleTopLinks = useMemo(() => topLinks.filter((l) => !moduleOff(l.href)), [offModules]);
  const visibleGroups = useMemo(
    () => navGroups.map((g) => ({ ...g, items: g.items.filter((l) => !moduleOff(l.href)) })).filter((g) => g.items.length > 0),
    [offModules]
  );
  const mobileLinks = useMemo(
    () => [...visibleTopLinks, ...visibleGroups.flatMap((g) => g.items)],
    [visibleTopLinks, visibleGroups]
  );

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  const linkCls = (active: boolean) =>
    `relative whitespace-nowrap px-2 py-2 rounded-lg font-medium text-sm transition-all duration-300 ${
      active
        ? 'text-white bg-white/20'
        : 'text-white/80 hover:text-white hover:bg-white/10'
    }`;

  const iconBtnCls = `p-2 rounded-lg transition-colors text-white/85 hover:text-white hover:bg-white/10`;

  // 登录/注册这类页面自带品牌头：再叠一条全站导航会出现两个 logo、两个返回入口，
  // 而且移动端那条 64px 的固定头把首屏顶掉半屏。所有 hook 已在上面跑完，此处才能提前返回。
  if (isBareRoute(pathname)) return null;

  return (
    <>
    {/* 不透明实色深蓝：不依赖 backdrop-filter / 透明度 / 各主题变量，
        任何页面背景（浅色 hero、纯白、暗色）与滚动态下都是深底白字，保证可读。 */}
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-shadow duration-500 bg-primary-950 bg-gradient-to-r from-primary-950 via-primary-900 to-primary-950 border-b border-white/10 nav-glow-line ${
        isScrolled ? 'shadow-[0_12px_32px_-12px_rgba(8,10,30,0.6)]' : ''
      }`}
    >
      <div className="max-w-7xl xl:max-w-[1400px] 2xl:max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16 md:h-20">
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
              isScrolled
                ? 'bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/30'
                : 'bg-white/15 backdrop-blur-sm border border-white/30 shadow-[0_0_20px_rgba(79,109,245,0.25)]'
            }`}>
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m9-9H3" />
              </svg>
            </div>
            <span className="font-display text-lg sm:text-xl font-bold text-white transition-colors whitespace-nowrap">
              <span className="hidden sm:inline">圣约社区</span>
              <span className="sm:hidden">圣约</span>
            </span>
          </Link>

          {/* mx-auto 而非 justify-center：溢出时可正常横向滚动，不会两头被裁 */}
          <div className="hidden xl:flex flex-1 min-w-0 overflow-x-auto no-scrollbar">
            <div className="mx-auto flex items-center gap-0.5 px-1">
              {visibleTopLinks.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link key={link.href} href={link.href} className={linkCls(active)}>
                    {t(link.key)}
                    {active && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-gold-400" />
                    )}
                  </Link>
                );
              })}
              {visibleGroups.length > 0 && (
                <CatalogMenu groups={visibleGroups} buttonClass={linkCls(false)} isActive={isActive} />
              )}
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-1 shrink-0">
            {/* 全局命令面板入口 */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT))}
              title="全站搜索（⌘K / Ctrl+K）"
              aria-label="全站搜索"
              className="group flex items-center gap-2 rounded-xl px-2.5 py-1.5 mr-1 border border-white/25 text-white/85 hover:text-white hover:bg-white/10 hover:border-white/40 transition-all duration-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <kbd className="hidden 2xl:inline-block text-[10px] px-1.5 py-0.5 rounded bg-white/15 text-white/80">⌘K</kbd>
            </button>
            <PreferenceMenu tone="light" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}
              title={t('nav.shareTitle')}
              aria-label={t('nav.shareTitle')}
              className={iconBtnCls}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 0V16.5a2.5 2.5 0 01-5 0v-.5" />
              </svg>
            </button>

            {user ? (
              <>
                {isStaff && (
                  <Link
                    href="/admin"
                    className="whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium text-white/85 hover:text-white hover:bg-white/10"
                  >
                    {t('nav.admin')}
                  </Link>
                )}

                <Link href="/notifications" className={`relative ${iconBtnCls}`} title={t('nav.notifications')} aria-label={t('nav.notifications')}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {!!liveUnread && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center">
                      {liveUnread > 99 ? '99+' : liveUnread}
                    </span>
                  )}
                </Link>

                <div className="relative" ref={boxRef}>
                  <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/10 transition-colors">
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatarUrl} alt={user.displayName} className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ background: user.avatarColor }}>
                        {user.displayName.slice(0, 1)}
                      </div>
                    )}
                    <span className="hidden 2xl:inline max-w-[10rem] truncate text-sm font-medium text-white">
                      {user.displayName}
                    </span>
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-card border border-ink-100 py-2 overflow-hidden">
                      <Link href="/me" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">{t('nav.profile')}</Link>
                      {!moduleOff('/community/create') && <Link href="/community/create" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">{t('nav.createContent')}</Link>}
                      {!moduleOff('/messages') && <Link href="/messages" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">{t('nav.messages')}</Link>}
                      <Link href="/friends?tab=requests" className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">
                        <span>{t('nav.friendRequests')}</span>
                        {!!frReq?.total && (
                          <span className="min-w-[18px] h-4 px-1 rounded-full bg-primary-600 text-white text-[10px] flex items-center justify-center">
                            {frReq.total > 99 ? '99+' : frReq.total}
                          </span>
                        )}
                      </Link>
                      <Link href="/feedback" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">{t('nav.feedback')}</Link>
                      {isStaff && <Link href="/admin" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">{t('nav.admin')}</Link>}
                      {isStaff && <Link href="/admin/reviews" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">{t('nav.reviewQueue')}</Link>}
                      <div className="divider-gradient my-1" />
                      <button
                        onClick={async () => {
                          await logout();
                          router.push('/');
                        }}
                        className="block w-full text-left px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 whitespace-nowrap"
                      >
                        {t('nav.logout')}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link href="/login" className="whitespace-nowrap px-4 py-2 rounded-lg font-medium text-sm text-white/90 hover:text-white hover:bg-white/10 transition-all duration-300">
                  {t('nav.login')}
                </Link>
                <Link href="/login?mode=register" className="whitespace-nowrap px-5 py-2 rounded-lg font-semibold text-sm bg-white text-primary-700 hover:bg-primary-50 hover:-translate-y-0.5 shadow-lg transition-all duration-300">
                  {t('nav.register')}
                </Link>
              </>
            )}
          </div>

          {/* 移动端：命令面板入口 + 菜单开关 */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT))}
            className="xl:hidden ml-auto p-2 rounded-lg text-white hover:bg-white/10 transition-colors"
            aria-label="全站搜索"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="xl:hidden p-2 rounded-lg text-white hover:bg-white/10 transition-colors"
            aria-label={t('nav.toggleMenu')}
            aria-expanded={isMobileMenuOpen}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        <div className={`xl:hidden overflow-hidden transition-all duration-300 ${isMobileMenuOpen ? 'max-h-[75vh] overflow-y-auto pb-4' : 'max-h-0'}`}>
          {/* 用实色卡片而非 .glass：glass 带 backdrop-filter，叠在深色导航上会被冲淡成灰紫，
              浅色文字对比度不足（暗色主题下更明显）。实色卡片在任何主题/滚动态下都可读。 */}
          <div data-nav-mobile-menu="1" className="bg-white rounded-2xl p-4 space-y-2 shadow-card border border-ink-100">
            {/* 双列而非单列长列表：导航项已有 12 个，单列在平板/窄桌面会拉出一整屏还要滚动 */}
            <div className="grid grid-cols-2 gap-2">
              {mobileLinks.map((link) => (
                <Link key={link.href} href={link.href} className={`block px-4 py-3 rounded-xl font-medium whitespace-nowrap transition-all ${
                  isActive(link.href) ? 'bg-primary-100 text-primary-700' : 'text-ink-700 hover:bg-ink-100'
                }`}>
                  {t(link.key)}
                </Link>
              ))}
            </div>

            <MenuRow onClick={() => { setShareOpen(true); setIsMobileMenuOpen(false); }}>
              📤 {t('nav.shareSystem')}
            </MenuRow>

            <div className="divider-gradient my-2" />

            <PreferenceMenu tone="dark" inline />

            <div className="divider-gradient my-2" />

            {user ? (
              <>
                <Link href="/me" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap">{t('nav.profile')}</Link>
                <Link href="/notifications" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap">{t('nav.notifications')}</Link>
                <Link href="/settings/notifications" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap">{t('nav.reminderSettings')}</Link>
                <Link href="/settings/privacy" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap">私信隐私</Link>
                <Link href="/feedback" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap">{t('nav.feedback')}</Link>
                <Link href="/friends?tab=requests" className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap">
                  <span>{t('nav.friendRequests')}</span>
                  {!!frReq?.total && (
                    <span className="min-w-[18px] h-4 px-1 rounded-full bg-primary-600 text-white text-[10px] flex items-center justify-center">
                      {frReq.total > 99 ? '99+' : frReq.total}
                    </span>
                  )}
                </Link>
                {isStaff && <Link href="/admin" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap">{t('nav.admin')}</Link>}
                <button
                  onClick={async () => {
                    await logout();
                    router.push('/');
                  }}
                  className="block w-full px-4 py-3 rounded-xl font-medium text-rose-600 text-left hover:bg-rose-50 whitespace-nowrap"
                >
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 text-center whitespace-nowrap">{t('nav.login')}</Link>
                <Link href="/login?mode=register" className="block px-4 py-3 rounded-xl font-semibold bg-gradient-to-r from-primary-600 to-primary-500 text-white text-center shadow-lg shadow-primary-500/25 whitespace-nowrap">
                  {t('nav.register')}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
    <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  );
}

function MenuRow({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap"
    >
      {children}
    </button>
  );
}
