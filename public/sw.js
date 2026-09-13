/* 圣约社区 Service Worker
 * 策略：
 *  - 壳缓存(SHELL)：首屏路由预缓存，弱网/离线可秒开
 *  - 读经 API(/api/v1/bible/*)：stale-while-revalidate，读过一次的章节离线也能读
 *  - 静态资源(_next/static、图片/字体/音视频)：cache-first
 *  - 页面导航：network-first，失败回退缓存
 *
 * 注意：改动本文件后必须提升 CACHE 版本号，activate 时会清理旧缓存。
 */
const CACHE = 'covenant-shell-v2';
const SHELL = [
  '/',
  '/bible',
  '/plans',
  '/songs',
  '/search',
  '/community',
  '/live',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 逐个 add，避免 addAll 因单个路由失败而整体回滚（未登录/404 都不应阻断安装）
      await Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => undefined))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 仅处理同源

  // 音频(range 请求)交给浏览器直连，避免 SW 缓存分片响应导致播放异常
  if (req.headers.has('range')) return;

  // 读经数据：后台更新、优先缓存（读过的章节离线可读）
  if (url.pathname.startsWith('/api/v1/bible')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  // 静态资源：缓存优先
  if (
    url.pathname.startsWith('/_next/static') ||
    /\.(?:css|js|svg|png|jpe?g|webp|avif|woff2?|ttf|mp4|mp3)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // 页面导航：网络优先，回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match('/')) || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cached = await caches.match(req);
  // 注意：这里必须是 async 回调，否则 `await` 会造成整个 SW 脚本语法错误、注册失败
  const network = fetch(req)
    .then(async (res) => {
      if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}
