'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { moduleOfPath } from '@/lib/siteModules';
import { useDisabledModules } from '@/lib/useSiteModules';
import VariantSwitcher from '@/components/VariantSwitcher';
import AccessibilityMenu from '@/components/AccessibilityMenu';

const items = [
  {
    href: '/',
    label: '首页',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 transition-colors ${active ? 'text-primary-500' : 'text-ink-400'}`} fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/bible',
    label: '圣经',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 transition-colors ${active ? 'text-primary-500' : 'text-ink-400'}`} fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    href: '/songs',
    label: '诗歌',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 transition-colors ${active ? 'text-primary-500' : 'text-ink-400'}`} fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
  },
  {
    href: '/community',
    label: '社区',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 transition-colors ${active ? 'text-primary-500' : 'text-ink-400'}`} fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    href: '/live',
    label: '直播',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 transition-colors ${active ? 'text-primary-500' : 'text-ink-400'}`} fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: '/me',
    key: 'nav.me',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 transition-colors ${active ? 'text-primary-500' : 'text-ink-400'}`} fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

/** 前缀匹配：/bible/cuv/john/1 也高亮「圣经」；首页仅精确匹配 */
function matchPath(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function MobileNav({ disabledModules = [] }: { disabledModules?: string[] }) {
  const pathname = usePathname() || '/';
  const offModules = useDisabledModules(disabledModules);
  // 已下线模块的入口直接不显示
  const shown = items.filter((i) => {
    const m = moduleOfPath(i.href);
    return !m || !offModules.includes(m);
  });

  return (
    <>
    {/* 移动端简繁 / 无障碍入口：顶部右侧胶囊，避免挤占底部标签栏 */}
    <div className="md:hidden fixed top-14 right-2 z-[60] flex items-center gap-1 rounded-full bg-primary-900/90 px-1 py-1 shadow-lg backdrop-blur">
      <VariantSwitcher tone="light" />
      <AccessibilityMenu tone="light" />
    </div>
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-ink-200/60 shadow-[0_-4px_30px_-8px_rgba(30,38,100,0.1)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16">
        {shown.map((item) => {
          const isActive = matchPath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center flex-1 h-full transition-all active:scale-95 ${
                isActive ? 'text-primary-600' : 'text-ink-500'
              }`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                {item.icon(isActive)}
              </div>
              <span className={`mt-0.5 text-xs font-medium ${isActive ? 'text-primary-600' : ''}`}>
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-1.5 w-8 h-1 rounded-full bg-gradient-to-r from-primary-500 to-primary-600" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
    </>
  );
}
