import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center max-w-lg">
        <div className="relative mb-8">
          <div className="text-[120px] md:text-[180px] font-display font-bold leading-none bg-gradient-to-br from-primary-600 via-primary-400 to-gold-400 bg-clip-text text-transparent">
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 md:w-48 md:h-48 rounded-full bg-primary-200/30 blur-3xl" />
          </div>
        </div>

        <h1 className="font-display text-2xl md:text-3xl font-bold text-ink-900 mb-3">
          迷路了？这里没有你要找的页面
        </h1>
        <p className="text-ink-500 mb-8 leading-relaxed">
          你访问的页面可能已被移动、删除，或从未存在过。
          <br />
          愿主指引你回到正确的道路上。
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className="btn-primary px-6 py-3">
            返回首页
          </Link>
          <Link href="/bible" className="btn-secondary px-6 py-3">
            开始读经
          </Link>
        </div>

        <div className="mt-12 pt-8 border-t border-ink-100">
          <p className="text-sm text-ink-400 mb-4">或者试试这些热门页面：</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { href: '/songs', label: '赞美诗歌' },
              { href: '/activities', label: '教会活动' },
              { href: '/community', label: '团契社区' },
              { href: '/groups', label: '寻找团契' },
              { href: '/prayers', label: '代祷墙' },
              { href: '/search', label: '全局搜索' },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="px-4 py-2 rounded-full bg-ink-50 text-ink-600 text-sm hover:bg-primary-50 hover:text-primary-600 transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
