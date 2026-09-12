/* 圣约社区 Service Worker
 * 策略：
 *  - 壳缓存(SHELL)：首屏路由预缓存，弱网/离线可秒开
 *  - 读经 API(/api/v1/bible/*)：stale-while-revalidate，弱网也能读已缓存章节
 *  - 静态资源(_next/static、图片/字体)：cache-first
 *  - 页面导航：network-first，失败回退缓存壳
 */
const CACHE = 'covenant-shell-v1';
const SHELL = ['/', '/bible', '/songs', '/community', '/live', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
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

  // 读经数据：后台更新、优先缓存（弱网可读）
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
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}
