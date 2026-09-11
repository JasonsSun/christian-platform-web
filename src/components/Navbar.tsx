'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useI18n } from '@/lib/i18n/I18nProvider';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import ShareModal from '@/components/ShareModal';

const navLinks = [
  { href: '/', key: 'nav.home' },
  { href: '/bible', key: 'nav.bible' },
  { href: '/songs', key: 'nav.songs' },
  { href: '/media', key: 'nav.media' },
  { href: '/live', key: 'nav.live' },
  { href: '/activities', key: 'nav.activities' },
  { href: '/community', key: 'nav.community' },
  { href: '/prayers', key: 'nav.prayers' },
  { href: '/groups', key: 'nav.groups' },
  { href: '/donate', key: 'nav.donate' },
];

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // 调试:Navbar 挂载/卸载
  useEffect(() => {
    if (typeof console !== 'undefined') console.log('[Navbar] MOUNTED');
    return () => { if (typeof console !== 'undefined') console.log('[Navbar] UNMOUNTED'); };
  }, []);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useI18n();

  const { data: notif } = useApi<{ unread: number }>(user ? '/notifications?pageSize=1' : null, [user?.id]);
  const { data: frReq } = useApi<{ total: number }>(user ? '/friends/requests?pageSize=1' : null, [user?.id]);

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

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled
          ? 'glass shadow-card'
          : 'bg-gradient-to-r from-primary-950/90 via-primary-900/85 to-primary-950/90 backdrop-blur-lg border-b border-white/10'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 md:h-20">
          <Link href="/" className="flex items-center gap-2 group">
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

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-3 py-2 rounded-lg font-medium text-sm transition-all duration-300 ${
                    isActive
                      ? isScrolled ? 'text-primary-600' : 'text-white bg-white/20'
                      : isScrolled ? 'text-ink-600 hover:text-primary-600 hover:bg-primary-50' : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {t(link.key)}
                  {isActive && (
                    <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full transition-colors ${
                      isScrolled ? 'bg-primary-500' : 'bg-gold-400'
                    }`} />
                  )}
                </Link>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <LocaleSwitcher tone="light" />
            {isStaff && (
              <Link href="/admin" className={`px-3 py-2 rounded-lg text-sm font-medium ${
                isScrolled ? 'text-ink-600 hover:text-primary-600' : 'text-white/85 hover:text-white'
              }`}>
                {t('nav.admin')}
              </Link>
            )}

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}
              title="推荐给朋友"
              className={`p-2 rounded-lg transition-colors ${
                isScrolled ? 'text-ink-600 hover:text-primary-600 hover:bg-primary-50' : 'text-white/85 hover:text-white hover:bg-white/10'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 0V16.5a2.5 2.5 0 01-5 0v-.5" />
              </svg>
            </button>

            {user ? (
              <>
                <Link href="/notifications" className={`relative p-2 rounded-lg ${
                  isScrolled ? 'text-ink-600 hover:text-primary-600' : 'text-white/85 hover:text-white'
                }`} title="通知">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {!!notif?.unread && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center">
                      {notif.unread > 99 ? '99+' : notif.unread}
                    </span>
                  )}
                </Link>

                <div className="relative" ref={boxRef}>
                  <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/10 transition-colors">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ background: user.avatarColor }}>
                      {user.displayName.slice(0, 1)}
                    </div>
                    <span className={`text-sm font-medium ${isScrolled ? 'text-ink-700' : 'text-white'}`}>
                      {user.displayName}
                    </span>
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-card border border-ink-100 py-2 overflow-hidden">
                      <Link href="/me" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50">{t('nav.profile')}</Link>
                      <Link href="/community/create" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50">发布内容</Link>
                      <Link href="/messages" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50">我的消息</Link>
                      <Link href="/friends?tab=requests" className="flex items-center justify-between px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50">
                        <span>好友申请</span>
                        {!!frReq?.total && (
                          <span className="min-w-[18px] h-4 px-1 rounded-full bg-primary-600 text-white text-[10px] flex items-center justify-center">
                            {frReq.total > 99 ? '99+' : frReq.total}
                          </span>
                        )}
                      </Link>
                      {isStaff && <Link href="/admin/reviews" className="block px-4 py-2.5 text-sm text-ink-700 hover:bg-primary-50">审核队列</Link>}
                      <div className="divider-gradient my-1" />
                      <button
                        onClick={async () => {
                          await logout();
                          router.push('/');
                        }}
                        className="block w-full text-left px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50"
                      >
                        退出登录
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link href="/login" className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300 ${
                  isScrolled ? 'text-primary-600 hover:bg-primary-50' : 'text-white/90 hover:text-white hover:bg-white/10'
                }`}>
                  登录
                </Link>
                <Link href="/login?mode=register" className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
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
            className={`md:hidden p-2 rounded-lg transition-colors ${
              isScrolled ? 'text-ink-700 hover:bg-ink-100' : 'text-white hover:bg-white/10'
            }`}
            aria-label="Toggle menu"
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

        <div className={`md:hidden overflow-hidden transition-all duration-300 ${isMobileMenuOpen ? 'max-h-[32rem] pb-4' : 'max-h-0'}`}>
          <div className="glass rounded-2xl p-4 space-y-2 shadow-card">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link key={link.href} href={link.href} className={`block px-4 py-3 rounded-xl font-medium transition-all ${
                  isActive ? 'bg-primary-100 text-primary-700' : 'text-ink-700 hover:bg-ink-100'
                }`}>
                  {t(link.key)}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShareOpen(true); setIsMobileMenuOpen(false); }}
              className="block w-full text-left px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100"
            >
              📤 分享本系统
            </button>
            <div className="divider-gradient my-2" />
            {user ? (
              <>
                <Link href="/me" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100">{t('nav.profile')}</Link>
                <Link href="/notifications" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100">{t('nav.notifications')}</Link>
                <Link href="/settings/notifications" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100">提醒设置</Link>
                <Link href="/friends?tab=requests" className="flex items-center justify-between px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100">
                  <span>好友申请</span>
                  {!!frReq?.total && (
                    <span className="min-w-[18px] h-4 px-1 rounded-full bg-primary-600 text-white text-[10px] flex items-center justify-center">
                      {frReq.total > 99 ? '99+' : frReq.total}
                    </span>
                  )}
                </Link>
                {isStaff && <Link href="/admin" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100">{t('nav.admin')}</Link>}
                <button
                  onClick={async () => {
                    await logout();
                    router.push('/');
                  }}
                  className="block w-full px-4 py-3 rounded-xl font-medium text-rose-600 text-left hover:bg-rose-50"
                >
                  退出登录
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="block px-4 py-3 rounded-xl font-medium text-ink-700 hover:bg-ink-100 text-center">登录</Link>
                <Link href="/login?mode=register" className="block px-4 py-3 rounded-xl font-semibold bg-gradient-to-r from-primary-600 to-primary-500 text-white text-center shadow-lg shadow-primary-500/25">
                  免费注册
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      <ShareModal open={shareOpen} onClose={() => { if (typeof console !== 'undefined') console.log('[Navbar] onClose -> setShareOpen(false) t=' + Math.round(performance.now())); setShareOpen(false); }} />
    </nav>
  );
}
