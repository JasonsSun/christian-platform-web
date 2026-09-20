/**
 * 路由级加载态：每个没有自带 loading 的子路由切换时都会渲染它。
 * 用与正文同构的骨架（页头条 + 卡片网格）而不是转圈：转圈会让内容到达时整屏跳动，
 * 骨架则先把高度占住，观感上也和全站 card-tech / skeleton-sheen 是同一套语言。
 */
export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14 pb-28 md:pb-14">
      <div className="skeleton-sheen h-3 w-24 rounded-full bg-ink-100" />
      <div className="skeleton-sheen mt-3 h-8 w-2/5 rounded-xl bg-ink-100" />
      <div className="skeleton-sheen mt-2 h-4 w-3/5 rounded-lg bg-ink-100" />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-ui-border bg-ui-surface p-5">
            <div className="skeleton-sheen h-12 w-12 rounded-xl bg-ink-100" />
            <div className="skeleton-sheen mt-4 h-4 w-3/4 rounded-lg bg-ink-100" />
            <div className="skeleton-sheen mt-2 h-3 w-full rounded-lg bg-ink-100" />
            <div className="skeleton-sheen mt-2 h-3 w-2/3 rounded-lg bg-ink-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
