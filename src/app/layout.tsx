import './globals.css'
import Navbar from '../components/Navbar'
import MobileNav from '../components/MobileNav'
import Footer from '../components/Footer'
import { AuthProvider } from '@/lib/auth'
import { PlayerProvider } from '@/lib/player'
import { NoticeProvider } from '@/lib/notice'
import { I18nProvider } from '@/lib/i18n/I18nProvider'
import { ThemeProvider, themeNoFlashScript } from '@/lib/theme'
import SWRegister from '@/components/SWRegister'
import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/lib/i18n/config'
import ActivityTracker from '@/components/ActivityTracker'
import Guards from '@/components/Guards'
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
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: '圣约社区',
    locale: 'zh_CN',
    url: '/',
    title: SITE_TITLE,
    description: SITE_DESC,
    images: [{ url: '/og-cover.png', width: 1200, height: 630, alt: '圣约社区 - 连接信徒，传播福音，建立团契' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESC,
    images: ['/og-cover.png'],
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#1e2664',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const initialLocale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  return (
    <html lang={initialLocale === 'zh' ? 'zh-CN' : initialLocale}>
      <head>
        {/* 字体预连接：提前完成 Google Fonts 的 DNS+TLS 握手，缩短首屏字体加载 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="overflow-x-hidden">
        {/* 首屏前无闪烁设置 <html data-theme>，避免暗色模式刷新白屏 */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
        <ThemeProvider>
          <SWRegister />
          <I18nProvider initialLocale={initialLocale}>
            <AuthProvider>
              <PlayerProvider>
                <NoticeProvider>
                  <Guards />
                  <ActivityTracker />
                  <Navbar />
                  <main className="pt-16 md:pt-20 pb-20 md:pb-0">{children}</main>
                  <Footer />
                  <MobileNav />
                </NoticeProvider>
              </PlayerProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
