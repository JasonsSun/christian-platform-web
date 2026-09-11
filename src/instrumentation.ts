/**
 * Next.js 服务端启动钩子(仅在 nodejs runtime 执行一次)。
 * 负责初始化实时总线单例(globalThis.__rt),使自定义 server.js 能接管 WS 连接。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureBus } = await import('./server/realtime');
    ensureBus();
  }
}
