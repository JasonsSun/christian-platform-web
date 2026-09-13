/** 首页骨架屏:服务端流式渲染时先发这一屏,避免弱网下长时间整页空白。
 *  纯 div + Tailwind 动画,不依赖任何 JS/数据。 */
export default function HomeSkeleton() {
  return (
    <div className="min-h-screen bg-ink-50">
      <div className="relative overflow-hidden bg-hero-gradient pt-16 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <div className="h-4 w-32 bg-white/20 rounded animate-pulse" />
            <div className="h-10 w-4/5 bg-white/25 rounded animate-pulse" />
            <div className="h-10 w-3/5 bg-white/25 rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-white/15 rounded animate-pulse" />
            <div className="flex gap-3 pt-2">
              <div className="h-11 w-32 bg-white/30 rounded-xl animate-pulse" />
              <div className="h-11 w-28 bg-white/15 rounded-xl animate-pulse" />
            </div>
          </div>
          <div className="glass rounded-3xl p-8 space-y-3 max-w-md mx-auto w-full">
            <div className="h-4 w-24 bg-white/25 rounded animate-pulse" />
            <div className="h-4 bg-white/20 rounded animate-pulse" />
            <div className="h-4 bg-white/20 rounded w-5/6 animate-pulse" />
            <div className="h-4 bg-white/20 rounded w-2/3 animate-pulse" />
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white shadow-soft p-6 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-ink-100 animate-pulse" />
            <div className="h-4 w-1/2 bg-ink-100 rounded animate-pulse" />
            <div className="h-3 w-3/4 bg-ink-50 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
