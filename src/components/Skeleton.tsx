'use client';

/** 基础占位块（跟随主题的 animate-pulse） */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-ink-100 ${className}`} aria-hidden />;
}

/** 诗歌卡片骨架（匹配 SongCard 布局） */
export function SongCardSkeleton() {
  return (
    <div className="group bg-white rounded-2xl p-4 shadow-soft flex items-center gap-4">
      <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-10" />
        </div>
      </div>
    </div>
  );
}

/** 社区/内容流卡片骨架（匹配 ContentItem 卡片） */
export function ContentCardSkeleton() {
  return (
    <article className="card-hover bg-white rounded-2xl p-5 border border-ink-100 shadow-soft">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-2/3 mb-2" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6 mt-1" />
      <div className="flex gap-3 mt-4">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
      </div>
    </article>
  );
}

/** 信息流（feed）卡片骨架：内容型 / 代祷型通用 */
export function FeedCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-4 border border-ink-100 card-hover">
      <div className="flex items-center gap-3 mb-2">
        <Skeleton className="w-9 h-9 rounded-full" />
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5 mt-1" />
    </div>
  );
}

/** 搜索结果分区骨架（标题 + 若干行卡片） */
export function SearchSectionSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-24" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 bg-white rounded-2xl p-4 shadow-soft border border-ink-100">
          <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
