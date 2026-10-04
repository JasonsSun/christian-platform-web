import './globals.css'
import Navbar from '../components/Navbar'
import MobileNav from '../components/MobileNav'
import Footer from '../components/Footer'
import { AuthProvider } from '@/lib/auth'
import { PlayerProvider } from '@/lib/player'
import { SpeechHostProvider } from '@/lib/speechHost'
import { NoticeProvider } from '@/lib/notice'
import { I18nProvider } from '@/lib/i18n/I18nProvider'
import { DEFAULT_VARIANT, VARIANT_COOKIE, isVariant, type Variant } from '@/lib/i18n/config'
import { AccessibilityProvider, a11yNoFlashScript } from '@/lib/a11y'
import { ThemeProvider, themeNoFlashScript } from '@/lib/theme'
import { NotificationProvider } from '@/lib/notifyStream'
import SWRegister from '@/components/SWRegister'
import InstallPrompt from '@/components/InstallPrompt'
import ErrorReporter from '@/components/ErrorReporter'
import NetworkBanner from '@/components/NetworkBanner'
import SiteNoticeBar from '@/components/SiteNoticeBar'
import { disabledModules } from '@/server/modules'
import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/lib/i18n/config'
import ActivityTracker from '@/components/ActivityTracker'
import Guards from '@/components/Guards'
import dynamic from 'next/dynamic'

// 命令面板只在 Ctrl/Cmd+K 唤起时才需要：拆成独立 chunk，不进全站首屏 JS。
// layout 是 Server Component，故不能用 ssr:false（只允许在客户端组件里关 SSR）。
const CommandPalette = dynamic(() => import('@/components/CommandPalette')) as unknown as typeof import('@/components/CommandPalette').default
import ScrollProgress from '@/components/ScrollProgress'
import MotionLayer from '@/components/MotionLayer'
import UserQuickCard from '@/components/UserQuickCard'
import type { Metadata } from 'next'

const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://amen.dpdns.org';
const SITE_TITLE = '圣约社区 - 基督教内容传播与社交社区';
const SITE_DESC = '圣经·诗歌·见证·活动·团契·社区 - 连接信徒，传播福音，建立团契';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: '%s | 圣约社区' },
  description: SITE_DESC,
  applicationName: '圣约社区',
  keywords: ['圣经', '读经', '读经计划', '每日经文', '赞美诗', '诗歌', '见证', '代祷', '团契', '基督教', '和合本', '主内社区'],
  authors: [{ name: '圣约社区' }],
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '圣约社区' },
  alternates: { canonical: '/' },
  // 不发送 Referer：朗读的「浏览器直连兜底」会从本站请求百度 TTS，
  // 百度对携带非自身域 Referer 的请求返回 HTML 风控页（音频加载失败 code=4）；
  // 不带 Referer 才返回 audio/mpeg。全站资源均为同源，去掉 Referer 无副作用。
  referrer: 'no-referrer',
  openGraph: {
    type: 'website',
    siteName: '圣约社区',
    locale: 'zh_CN',
    url: '/',
    title: SITE_TITLE,
    description: SITE_DESC,
    images: [{ url: `${SITE_URL}/og-cover.png`, width: 1200, height: 630, alt: '圣约社区 - 连接信徒，传播福音，建立团契' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESC,
    images: [`${SITE_URL}/og-cover.png`],
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // 不写这一行，iOS 上 env(safe-area-inset-bottom) 恒为 0：底部页签、播放条、body 的
  // 那几处 safe-area 留白全部白写，Home 指示条直接压在「我的」这一格上。桌面和
  // 无刘海的安卓量不出来 —— 视口里没有安全区，只有真机能看见。
  viewportFit: 'cover',
  themeColor: '#1e2664',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const initialLocale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  const cookieVariant = cookieStore.get(VARIANT_COOKIE)?.value;
  const initialVariant: Variant = isVariant(cookieVariant) ? cookieVariant : DEFAULT_VARIANT;
  // 已下线的模块：传给导航用于隐藏入口（读失败时当作全部开放，不误伤）
  const offModules = await disabledModules().catch(() => [] as string[]);
  const initialLang = initialLocale === 'zh' ? (initialVariant === 't' ? 'zh-Hant' : 'zh-CN') : initialLocale;
  return (
    <html lang={initialLang}>
      {/* 不再预连接 Google Fonts：境内不可达，预连接反而产生无谓的挂起请求 */}
      <body className="overflow-x-hidden">
        {/* 环境光层：极淡网格 + 两团 aurora，纯装饰，压在正文之下、body 底色之上 */}
        <div className="ambient" aria-hidden="true" />
        {/* 首屏前无闪烁设置 <html data-theme>，避免暗色模式刷新白屏 */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
        {/* 首屏前无闪烁应用无障碍偏好（字体/对比/动效），避免刷新闪动 */}
        <script dangerouslySetInnerHTML={{ __html: a11yNoFlashScript }} />
        <ThemeProvider>
          <AccessibilityProvider>
          <SWRegister />
          {/* 浏览器未捕获异常上报（生产才有意义，开发期也无害） */}
          <ErrorReporter />
          <I18nProvider initialLocale={initialLocale} initialVariant={initialVariant}>
            <AuthProvider>
            <NotificationProvider>
              <PlayerProvider>
                {/* 朗读会话常驻:换页时不卸载,这样朗读不会被页面跳转掐断 */}
                <SpeechHostProvider>
                <NoticeProvider>
                  <NetworkBanner />
                  <SiteNoticeBar />
                  <Guards />
                  <ActivityTracker />
                  {/* 顶部阅读进度条 */}
                  <ScrollProgress />
                  {/* 全站动效：滚动浮现 / 数字滚动 / 卡片柔光 */}
                  <MotionLayer />
                  {/* 全局命令面板：⌘K / Ctrl+K */}
                  <CommandPalette />
                  {/* 点头像就地加好友 / 关注：接管全站带 data-user-id 的头像 */}
                  <UserQuickCard />
                  {/* 无障碍：键盘跳过导航直达主内容 */}
                  <a href="#main-content" className="skip-link">跳到主要内容</a>
                  <Navbar disabledModules={offModules} />
                  <main id="main-content" className="pt-16 md:pt-20 pb-20 md:pb-0">{children}</main>
                  <Footer />
                  <MobileNav disabledModules={offModules} />
                  <InstallPrompt />
                </NoticeProvider>
                </SpeechHostProvider>
              </PlayerProvider>
            </NotificationProvider>
          </AuthProvider>
          </I18nProvider>
          </AccessibilityProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
