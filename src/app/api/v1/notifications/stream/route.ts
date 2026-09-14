import { NextRequest } from 'next/server';
import { currentUser, verify, findUserById } from '@/server/auth';
import { notifySubscribe, notifyUnsubscribe } from '@/server/notifyBus';
import { one } from '@/server/db';

// SSE 必须跑在 Node 运行时,且禁用缓存/缓冲
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // 鉴权优先读 cookie,其次读 ?token=(EventSource 不能带自定义头,只能走 query)
  let user = await currentUser(req);
  if (!user) {
    const token = new URL(req.url).searchParams.get('token');
    if (token) {
      try {
        const payload = verify(token);
        if (payload.typ === 'access') {
          const u = await findUserById(payload.sub);
          if (u && u.status === 'active') user = u;
        }
      } catch {
        /* 无效 token 忽略 */
      }
    }
  }
  if (!user) {
    return new Response('Unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } });
  }

  const userId = user.id;
  const encoder = new TextEncoder();
  let ping: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let ctrl: any = null;

  const stream = new ReadableStream({
    start(controller) {
      ctrl = controller;
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* 已断开 */
        }
      };

      notifySubscribe(userId, controller);

      // 首帧:把当前未读数推下去,客户端据此校准徽标(防重连重复 +1 错位)
      one<any>(`SELECT COUNT(*) c FROM notifications WHERE user_id=? AND \`read\`=0`, [userId])
        .then((r) => send({ kind: 'sync', unread: Number(r?.c || 0) }))
        .catch(() => {});

      // 心跳:避免代理/网关把空闲长连接掐断;25s 发一次注释帧
      ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          /* ignore */
        }
      }, 25_000);
      if (typeof (ping as any).unref === 'function') (ping as any).unref();
    },
    cancel() {
      closed = true;
      if (ping) clearInterval(ping);
      if (ctrl) notifyUnsubscribe(userId, ctrl);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform 让 CF/nginx 不要改写;X-Accel-Buffering 关掉 nginx 缓冲
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
