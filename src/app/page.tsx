import { Suspense } from 'react';
import HomeClient from '@/components/HomeClient';
import HomeSkeleton from '@/components/HomeSkeleton';
import { getHomeFeed, getPublicMedia } from '@/server/homeFeed';

/**
 * 首页 ISR:HTML 结果缓存 60s。
 * 之前每次访问都要实时渲染(弱网/跨境环境下 TTFB 可达 10s+,期间整页空白),
 * 缓存命中后 TTFB 降到几十毫秒。
 * 未命中时用 Suspense 流式先发骨架屏,浏览器立刻有内容可画,不会白屏。
 */
export const revalidate = 60;

/** 预取兜底:构建期不查库(避免 build 被数据库连接挂住),运行时 4s 未返回就放弃,
 *  由客户端自行请求补齐,保证首屏永远不会被数据源拖死。 */
async function prefetch<T>(fn: () => Promise<T>): Promise<T | null> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return null;
  try {
    return await Promise.race([
      fn(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
  } catch {
    return null;
  }
}

async function HomeContent() {
  const [home, media] = await Promise.all([
    prefetch(() => getHomeFeed()),
    prefetch(() => getPublicMedia(16)),
  ]);
  return <HomeClient initialHome={home as any} initialMedia={(media as any) || null} />;
}

export default function Page() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
