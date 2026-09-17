'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useModuleFilter } from '@/lib/useSiteModules';

export default function Footer() {
  const { t } = useI18n();
  // 已下线模块的入口不展示
  const { isOff } = useModuleFilter();
  return (
    <footer className="relative bg-gradient-to-br from-ink-950 via-ink-900 to-primary-950 text-white overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary-400/50 to-transparent" />
      {/* 装饰背景 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-glow-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gold-500/10 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: '-1.5s' }} />
        <div className="absolute inset-0 dot-grid opacity-20" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/30 hover:shadow-glow-primary transition-shadow duration-500">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m9-9H3" />
                </svg>
              </div>
              <span className="font-display text-2xl font-bold">圣约社区</span>
            </div>
            <p className="text-ink-400 leading-relaxed mb-6">
              {t('footer.tagline')}
            </p>
            <div className="flex gap-3">
              {['微信', '微博', 'QQ', '邮箱'].map((platform) => (
                <button
                  key={platform}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-primary-500/30 flex items-center justify-center text-sm transition-all hover:scale-110 border border-white/5 hover:border-primary-400/50"
                  title={platform}
                >
                  <span className="text-xs">{platform[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 功能 */}
          <div>
            <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-primary-400 to-gold-400 rounded-full" />
              {t('footer.coreFeatures')}
            </h3>
            <ul className="space-y-3">
              {[
                { key: 'footer.features.bible', href: '/bible' },
                { key: 'footer.features.songs', href: '/songs' },
                { key: 'footer.features.activities', href: '/activities' },
                { key: 'footer.features.community', href: '/community' },
                { key: 'footer.features.donate', href: '/donate' },
              ].filter((item) => !isOff(item.href)).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-ink-400 hover:text-white transition-colors flex items-center gap-2 group py-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-600 group-hover:bg-primary-400 group-hover:scale-150 transition-all" />
                    {t(item.key)}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/donate/transparency"
                  className="text-ink-400 hover:text-white transition-colors flex items-center gap-2 group py-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-ink-600 group-hover:bg-primary-400 group-hover:scale-150 transition-all" />
                  {t('footer.features.transparency')}
                </Link>
              </li>
            </ul>
          </div>

          {/* 社区 */}
          <div>
            <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-primary-400 to-gold-400 rounded-full" />
              {t('footer.community')}
            </h3>
            <ul className="space-y-3">
              {[
                { tkey: 'footer.communityList.testimony', href: '/community' },
                { tkey: 'footer.communityList.prayer', href: '/community' },
                { tkey: 'footer.communityList.notify', href: '/notifications' },
                { tkey: 'footer.communityList.message', href: '/messages' },
              ].filter((item) => !isOff(item.href)).map((item) => (
                <li key={item.tkey}>
                  <Link
                    href={item.href}
                    className="text-ink-400 hover:text-white transition-colors flex items-center gap-2 group py-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-600 group-hover:bg-primary-400 group-hover:scale-150 transition-all" />
                    {t(item.tkey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 联系我们 */}
          <div>
            <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-primary-400 to-gold-400 rounded-full" />
              {t('footer.contact')}
            </h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-ink-400">
                <svg className="w-5 h-5 text-primary-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>support@shengyue.com</span>
              </li>
              <li className="flex items-start gap-3 text-ink-400">
                <svg className="w-5 h-5 text-primary-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>400-888-0000</span>
              </li>
              <li className="flex items-start gap-3 text-ink-400">
                <svg className="w-5 h-5 text-primary-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>周一至周日 9:00-21:00</span>
              </li>
            </ul>
          </div>
        </div>

        {/* 分隔线 */}
        <div className="mt-16 divider-gradient" />

        {/* 底部版权 */}
        <div className="mt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-ink-500 text-sm">
            {t('footer.copyright')}
          </p>
          <div className="flex gap-6 text-sm">
            <Link href="#" className="text-ink-500 hover:text-white transition-colors py-2">{t('footer.privacy')}</Link>
            <Link href="#" className="text-ink-500 hover:text-white transition-colors py-2">{t('footer.terms')}</Link>
            <Link href="#" className="text-ink-500 hover:text-white transition-colors py-2">{t('footer.help')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
