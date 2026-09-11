import './globals.css'
import Navbar from '../components/Navbar'
import MobileNav from '../components/MobileNav'
import Footer from '../components/Footer'
import { AuthProvider } from '@/lib/auth'
import { PlayerProvider } from '@/lib/player'
import { NoticeProvider } from '@/lib/notice'
import { I18nProvider } from '@/lib/i18n/I18nProvider'
import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/lib/i18n/config'
import ActivityTracker from '@/components/ActivityTracker'
import Guards from '@/components/Guards'

export const metadata = {
  title: '圣约社区 - 基督教内容传播与社交社区',
  description: '圣经·诗歌·见证·活动·团契·社区 - 连接信徒，传播福音，建立团契',
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
      <body className="overflow-x-hidden">
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
      </body>
    </html>
  )
}
