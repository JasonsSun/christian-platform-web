/**
 * Next.js 服务端启动钩子。
 *
 * 重要：nodejs 专属的初始化必须写在 `if (process.env.NEXT_RUNTIME === 'nodejs')` 分支里。
 * Next 会把 instrumentation 同时编译进 node 与 edge 两份 bundle，
 * 只有这种严格相等的字面量判断会被 webpack 的 DefinePlugin 做 dead-code 消除；
 * 写成早返回（`!== 'nodejs' return`）的话 edge 侧仍会解析后面的 import，
 * 一旦链路上有 node:path / node:os 之类内建模块，构建就直接
 * "Module not found: Can't resolve 'path'"（这里踩过一次）。
 *
 * 三个职责:
 *  1) 初始化实时总线单例(globalThis.__rt),使自定义 server.js 能接管 WS 连接;
 *  2) 服务一就绪就补齐全文索引 —— 迁移 004 从此不必人工跑,
 *     首次搜索即可直接走 MATCH...AGAINST(带相关度排序);
 *  3) 接管上一次崩溃 / 上一个副本没跑完的媒体处理任务。
 *
 * 这里刻意「不 await」索引与媒体工作:DDL / 转码可能耗时几十秒,
 * 绝不能拖住 HTTP 监听;失败也已内部兜底,不影响服务可用。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureBus } = await import('./server/realtime');
    ensureBus();

    // 全文索引:启动后异步补齐。DDL 期间搜索自动走 LIKE,补完自动切 MATCH。
    const { ensureFulltextIndex } = await import('./server/searchCap');
    void ensureFulltextIndex().catch((e) => {
      console.warn('[search] 启动期补齐全文索引失败，将继续回退 LIKE：', e?.message || e);
    });

    // 媒体流水线兜底:接管上一副本(或上一次崩溃)没跑完的处理任务,
    // 并对运行中仍卡住的任务做周期性巡逻。多副本同时抢有乐观锁,不会重复转码。
    const { rescueStuckMediaTasks } = await import('./server/mediaPipeline');
    const sweep = () => {
      void rescueStuckMediaTasks().catch((e) => {
        console.warn('[media-pipeline] 接管超时任务失败：', e?.message || e);
      });
    };
    // 启动 30s 后再扫:给迁移和连接池留时间,避免和冷启动抢资源
    const boot = setTimeout(sweep, 30_000);
    const patrol = setInterval(sweep, 15 * 60_000);
    // 都 unref:定时器不能成为「服务不退出」的理由
    boot.unref?.();
    patrol.unref?.();
  }
}
