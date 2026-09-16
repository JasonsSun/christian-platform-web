'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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

const navLinks = [
  { href: '/', key: 'nav.home' },
  { href: '/bible', key: 'nav.bible' },
  { href: '/plans', key: 'nav.plans' },
  { href: '/songs', key: 'nav.songs' },
  { href: '/sermons', key: 'nav.sermons' },
  { href: '/media', key: 'nav.media' },
  { href: '/live', key: 'nav.live' },
  { href: '/activities', key: 'nav.activities' },
  { href: '/community', key: 'nav.community' },
  { href: '/prayers', key: 'nav.prayers' },
  { href: '/groups', key: 'nav.groups' },
  { href: '/donate', key: 'nav.donate' },
];

/**
 * 顶栏响应式约定（动这段前先读）：
 * 桌面版导航容器 max-w-7xl（1280px）减去左右 px-8 只剩 1216px 可用。
 * 12 个中文字链接 + 右侧工具区一旦超过它，flex 会把每个「文字 flex item」压到 min-content，
 * 中文 min-content 就是「一个字」——于是整条导航变成一字一行竖排（历史缺陷）。
 * 因此：① 所有文字项一律 whitespace-nowrap；② 桌面版从 xl(1280) 起才出现，
 * 以下退回汉堡菜单（内容完整）；③ 语言/简繁/无障碍/主题收进一个 PreferenceMenu。
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
  const links = navLinks.filter((l) => !moduleOff(l.href));

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  const linkCls = (active: boolean) =>
    `relative whitespace-nowrap px-2.5 py-2 rounded-lg font-medium text-sm transition-all duration-300 ${
      active
        ? isScrolled
          ? 'text-primary-600'
          : 'text-white bg-white/20'
        : isScrolled
          ? 'text-ink-600 hover:text-primary-600 hover:bg-primary-50'
          : 'text-white/80 hover:text-white hover:bg-white/10'
    }`;

  const iconBtnCls = `p-2 rounded-lg transition-colors ${
    isScrolled ? 'text-ink-600 hover:text-primary-600 hover:bg-primary-50' : 'text-white/85 hover:text-white hover:bg-white/10'
  }`;

  return (
    <>
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled
          ? 'glass shadow-card'
          : 'bg-gradient-to-r from-primary-950/90 via-primary-900/85 to-primary-950/90 backdrop-blur-lg border-b border-white/10'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16 md:h-20">
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
              isScrolled
                ? 'bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/30'
                : 'bg-white/20 backdrop-blur-sm border border-white/30'
            }`}>
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m9-9H3" />
              </svg>
            </div>
            <span className={`font-display text-lg sm:text-xl font-bold transition-colors whitespace-nowrap ${
              isScrolled ? 'text-primary-900' : 'text-white'
            }`}>
              <span className="hidden sm:inline">圣约社区</span>
              <span className="sm:hidden">圣约</span>
            </span>
          </Link>

          {/* mx-auto 而非 justify-center：溢出时可正常横向滚动，不会两头被裁 */}
          <div className="hidden xl:flex flex-1 min-w-0 overflow-x-auto no-scrollbar">
            <div className="mx-auto flex items-center gap-1 px-1">
              {links.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link key={link.href} href={link.href} className={linkCls(active)}>
                    {t(link.key)}
                    {active && (
                      <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full transition-colors ${
                        isScrolled ? 'bg-primary-500' : 'bg-gold-400'
                      }`} />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-1 shrink-0">
            <PreferenceMenu tone="light" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}
              title="推荐给朋友"
              aria-label="推荐给朋友"
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
                    className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium ${
                      isScrolled ? 'text-ink-600 hover:text-primary-600 hover:bg-primary-50' : 'text-white/85 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {t('nav.admin')}
                  </Link>
                )}

                <Link href="/notifications" className={`relative ${iconBtnCls}`} title="通知" aria-label="通知">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {!!liveUnread && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center">
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
                    <span className={`hidden 2xl:inline max-w-[10rem] truncate text-sm font-medium ${isScrolled ? 'text-ink-700' : 'text-white'}`}>
                      {user.displayName}
                    </span>
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-card border border-ink-100 py-2 overflow-hidden">
                      <Link href="/me" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">{t('nav.profile')}</Link>
                      {!moduleOff('/community/create') && <Link href="/community/create" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">发布内容</Link>}
                      {!moduleOff('/messages') && <Link href="/messages" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">我的消息</Link>}
                      <Link href="/friends?tab=requests" className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">
                        <span>好友申请</span>
                        {!!frReq?.total && (
                          <span className="min-w-[18px] h-4 px-1 rounded-full bg-primary-600 text-white text-[10px] flex items-center justify-center">
                            {frReq.total > 99 ? '99+' : frReq.total}
                          </span>
                        )}
                      </Link>
                      <Link href="/feedback" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">💡 给平台提建议</Link>
                      {isStaff && <Link href="/admin" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">{t('nav.admin')}</Link>}
                      {isStaff && <Link href="/admin/reviews" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50 whitespace-nowrap">审核队列</Link>}
                      <div className="divider-gradient my-1" />
                      <button
                        onClick={async () => {
                          await logout();
                          router.push('/');
                        }}
                        className="block w-full text-left px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 whitespace-nowrap"
                      >
                        退出登录
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link href="/login" className={`whitespace-nowrap px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300 ${
                  isScrolled ? 'text-primary-600 hover:bg-primary-50' : 'text-white/90 hover:text-white hover:bg-white/10'
                }`}>
                  登录
                </Link>
                <Link href="/login?mode=register" className={`whitespace-nowrap px-5 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                  isScrolled
                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/40 hover:-translate-y-0.5'
                    : 'bg-white text-primary-700 hover:bg-primary-50 hover:-translate-y-0.5 shadow-lg'
                }`}>
                  免费注册
                </Link>
              </>
            )}
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`xl:hidden ml-auto p-2 rounded-lg transition-colors ${
              isScrolled ? 'text-ink-700 hover:bg-ink-100' : 'text-white hover:bg-white/10'
            }`}
            aria-label="Toggle menu"
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
              {links.map((link) => (
                <Link key={link.href} href={link.href} className={`block px-4 py-3 rounded-xl font-medium whitespace-nowrap transition-all ${
                  isActive(link.href) ? 'bg-primary-100 text-primary-700' : 'text-ink-700 hover:bg-ink-100'
                }`}>
                  {t(link.key)}
                </Link>
              ))}
            </div>

            <MenuRow onClick={() => { setShareOpen(true); setIsMobileMenuOpen(false); }}>
              📤 分享本系统
            </MenuRow>

            <div className="divider-gradient my-2" />

            <PreferenceMenu tone="dark" inline />

            <div className="divider-gradient my-2" />

            {user ? (
              <>
                <Link href="/me" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap">{t('nav.profile')}</Link>
                <Link href="/notifications" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap">{t('nav.notifications')}</Link>
                <Link href="/settings/notifications" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap">提醒设置</Link>
                <Link href="/feedback" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap">💡 给平台提建议</Link>
                <Link href="/friends?tab=requests" className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 whitespace-nowrap">
                  <span>好友申请</span>
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
                  退出登录
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 text-center whitespace-nowrap">登录</Link>
                <Link href="/login?mode=register" className="block px-4 py-3 rounded-xl font-semibold bg-gradient-to-r from-primary-600 to-primary-500 text-white text-center shadow-lg shadow-primary-500/25 whitespace-nowrap">
                  免费注册
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
