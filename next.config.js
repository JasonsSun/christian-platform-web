/** @type {import('next').NextConfig} */
const nextConfig = {
  // 允许用 NEXT_DIST_DIR 覆盖构建产物目录。
  // 用途:本机常有多条工作线并行构建,共用一个 .next 会互相清空导致构建中断;
  // 验证时用独立目录即可互不干扰。线上不设该变量,行为与原来完全一致(.next)。
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  // 生产环境不产出浏览器端 source map，避免源码被直接查看
  productionBrowserSourceMaps: false,
  // 隐藏技术栈指纹
  poweredByHeader: false,
  // 开启 gzip/br 压缩（自定义 server.js 不走 next start，这里显式保证）
  compress: true,
  // 关闭构建期的 ESLint 扫描（未配置 lint，且会拖慢构建）
  eslint: { ignoreDuringBuilds: true },
  // 关闭 output file tracing:它会额外产出数千个 .nft.json 小文件,
  // 既拖慢构建,也容易被宿主机的批量删除防护误伤(导致构建中断)。
  outputFileTracing: false,
  images: {
    // 自动产出下一代格式，显著减小图片体积
    formats: ['image/avif', 'image/webp'],
    // 图片缓存 30 天
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [
      {
        // 带 hash 的静态资源可永久缓存
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // 图片/字体等公开静态资源
        source: '/:all*(svg|jpg|jpeg|png|webp|avif|gif|ico|woff|woff2|ttf|mp3|mp4)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  experimental: {
    // 原生/Node 侧依赖不参与打包
    serverComponentsExternalPackages: ['mysql2', 'bcryptjs', 'ws'],
    // 启用服务端启动钩子(instrumentation.ts),用于初始化实时总线单例
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
