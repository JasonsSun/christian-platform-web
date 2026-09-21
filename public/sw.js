/* 圣约社区 Service Worker
 * 策略：
 *  - 壳缓存(SHELL)：首屏路由预缓存，离线/断网时可秒开
 *  - 读经 API(/api/v1/bible/*)：stale-while-revalidate，读过一次的章节离线也能读
 *  - 静态资源(_next/static、图片/字体/音视频)：cache-first（文件名带 hash，永不过期也不会长错）
 *  - 页面导航：network-first，断网才回退缓存
 *
 * 导航为什么不能优先用缓存：Cache API 只按 URL 匹配，不看 Cookie。而页面 HTML 是
 * 按 Cookie 服务端渲染的（简繁 variant、登录态都写在 HTML 里），缓存优先会把
 * 「上一次访问」的那份 HTML 端给这一次的用户 —— 切到繁体后被塞一份简体 HTML，
 * 客户端渲染的是繁体，React 直接报 hydration 不匹配并整页重渲染；登录态/刚发版
 * 同理会串。离线可用是唯一的收益，network-first 断网时照样回退到缓存。
 *
 * 注意：改动本文件后必须提升 CACHE 版本号，activate 时会清理旧缓存。
 */
const CACHE = 'covenant-shell-v4';
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
  // 自己这张脚本绝不能走缓存，否则新版本永远上不了线
  if (url.pathname === '/sw.js') return;

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
  // 页面导航：缓存优先 + 后台更新（跨境/弱网下首屏立刻可见）
  if (req.mode === 'navigate') {
    event.respondWith(navigateHandler(req));
    return;
  }
});

/* ===== Web Push =====
 * 每日提醒的服务端推送在这里落到系统通知上。
 * 注意：Chrome/Edge 的推送要经 Google FCM 中转，国内网络常连不上而收不到，
 * 所以它只是补充通道 —— 站内通知才是保底，两路由 reminders.ts 同时发送。
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || '圣约社区';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || 'covenant-reminder',
      renotify: true,
      data: { link: data.link || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          if (c.url.endsWith(link) || new URL(c.url).pathname === link) return c.focus();
          return c.focus().then(() => c.navigate(link));
        }
      }
      return self.clients.openWindow(link);
    })
  );
});

/** 导航请求：优先走网络（HTML 是按 Cookie 渲染的），断网才回退缓存 */
async function navigateHandler(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || (await caches.match('/')) || Response.error();
  }
}

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
