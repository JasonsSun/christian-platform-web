// 自定义 Node 服务器:在 Next.js 之上挂载 WebSocket(/ws)与 HTTP 压缩层。
// 用途:
//   1) 直播实时通道(聊天 / 在线人数)走真 WebSocket,替代高频轮询;
//   2) 自定义服务器绕过了 next start,Next 的 compress 不生效,这里用 compression 中间件补上;
//   3) 生产启动: node server.js --prod (需先 npm run build)
//      开发启动: node server.js         (保留 HMR)
//
// Windows 兼容:不使用 `NODE_ENV=... node server.js` 语法,改为显式参数。
if (process.argv.includes('--prod')) {
  process.env.NODE_ENV = 'production';
} else if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
// 成熟的 gzip 中间件。自定义服务器不走 next start,Next 的 compress 配置不生效。
// 不手写 res.write/end 补丁:Next 的响应管线有多种写入路径,手写极易漏掉首 chunk 导致响应损坏。
const compression = require('compression');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev });
const handle = app.getRequestHandler();
const upgradeHandler = app.getUpgradeHandler();

/** 仅对文本类响应做压缩(图片/音视频本身已压缩,再压纯属浪费 CPU) */
const COMPRESSIBLE =
  /^(text\/|application\/(javascript|json|xml|ld\+json|xhtml\+xml|manifest\+json)|image\/svg\+xml)/;

/** 已压缩/二进制资源:不要二次压缩 */
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|eot|mp3|mp4|m4a|wav|webm|ogg|zip|gz|br|pdf|7z|rar)$/i;

/**
 * 是否压缩:
 * - Content-Type 已确定时,只压文本类;
 * - Content-Type 尚未设置时(Next 的 route handler 常见),退回按 URL 判断,
 *   排除静态二进制与媒体下载路径 —— 这些数据本身已压缩,再压既浪费 CPU 也会损坏。
 */
function shouldCompress(req, res) {
  if (process.env.DISABLE_COMPRESS === '1') return false;

  const type = String(res.getHeader('Content-Type') || '');
  if (type) return COMPRESSIBLE.test(type);

  const url = String(req.url || '').split('?')[0];
  if (BINARY_EXT.test(url)) return false;
  if (/(^|\/)(media|uploads?|download|stream|file|raw)(\/|$)/i.test(url)) return false;
  return true;
}

/** gzip 压缩中间件:>1KB 才压缩;DISABLE_COMPRESS=1 可紧急关闭 */
const compress = compression({ threshold: 1024, filter: shouldCompress });

app
  .prepare()
  .then(() => {
    const server = createServer((req, res) => {
      compress(req, res, () => handle(req, res, parse(req.url, true)));
    });

    // 连接复用与超时:减少握手开销,避免僵死连接占用
    server.keepAliveTimeout = 65_000;
    server.headersTimeout = 70_000;
    server.requestTimeout = 120_000;
    server.maxRequestsPerSocket = 0; // 0 = 不限,配合 keep-alive 提升吞吐

    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      const { pathname } = parse(req.url, true);
      if (pathname === '/ws') {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      } else {
        // 其余 upgrade(如 Next dev 的 HMR)交给 Next 自身处理
        upgradeHandler(req, socket, head);
      }
    });

    wss.on('connection', (ws, req) => {
      const { query } = parse(req.url, true);
      const room = query.room ? String(query.room) : null;
      const rt = globalThis.__rt;
      if (!room || !rt || !rt.attach) {
        ws.close();
        return;
      }
      // session 用于在线人数去重;匿名观众也计为在线
      ws._sid = query.s ? String(query.s) : Math.random().toString(36).slice(2);
      rt.attach(ws, room, ws._sid);

      // 心跳保活:自动清理僵死连接
      ws._alive = true;
      ws.on('pong', () => {
        ws._alive = true;
      });

      ws.on('message', (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg && msg.type === 'heartbeat' && rt.onHeartbeat) {
          rt.onHeartbeat(ws);
        }
      });
      ws.on('close', () => {
        if (rt.detach) rt.detach(ws);
      });
      ws.on('error', () => {
        try {
          ws.close();
        } catch {}
        if (rt.detach) rt.detach(ws);
      });
    });

    // 每 30s ping 一次,剔除无响应连接
    const pingTimer = setInterval(() => {
      for (const c of wss.clients) {
        if (c._alive === false) {
          try {
            c.terminate();
          } catch {}
          continue;
        }
        c._alive = false;
        try {
          c.ping();
        } catch {}
      }
    }, 30_000);
    pingTimer.unref();

    server.listen(port, () => {
      console.log(
        `> 服务器已就绪 http://localhost:${port}  (WebSocket: /ws, 压缩: gzip)  [${dev ? '开发' : '生产'}]  node ${process.version}`
      );
    });
  })
  .catch((e) => {
    console.error('服务器启动失败:', e);
    process.exit(1);
  });
