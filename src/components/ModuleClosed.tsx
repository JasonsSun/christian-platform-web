import Link from 'next/link';

/**
 * 模块已关闭时的占位页（服务端渲染，无 JS 依赖）。
 * 刻意不用 404/重定向：保留 URL 可访问性，让用户知道「曾经有过、暂停了」，
 * 也避免搜索引擎里已收录的链接突然变死链。
 */
export default function ModuleClosed({ label, desc }: { label: string; desc?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full glass rounded-2xl p-8 text-center shadow-soft">
        <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="font-display text-xl font-bold text-ink-900 mb-2">「{label}」已暂停服务</h1>
        <p className="text-sm text-ink-500 leading-relaxed">
          {desc || '该模块已由平台管理员暂时关闭，具体开放时间请留意站内公告。'}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/" className="btn-primary">返回首页</Link>
          <Link href="/community" className="px-4 py-2 rounded-xl text-sm font-medium text-ink-600 hover:text-primary-600">
            看看社区
          </Link>
        </div>
      </div>
    </div>
  );
}
