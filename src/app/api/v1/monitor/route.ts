import { NextRequest } from 'next/server';
import { ok, withApi, clientIp, readJson } from '@/server/http';
import { captureMessage } from '@/server/monitor';
import { rateLimitAsync } from '@/server/ratelimit';
import { currentUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

/**
 * 浏览器错误上报入口。
 *
 * 匿名可用（未登录也要能上报），因此必须限流，否则可被用来刷日志。
 * 只做记录，不返回任何敏感信息。
 */
export const POST = withApi(async (req: NextRequest) => {
  const ip = clientIp(req);
  const rl = await rateLimitAsync(`monitor:${ip}`, 20, 60_000);
  if (!rl.ok) {
    // 超限直接丢弃，不报错（避免客户端重试风暴）
    return ok({ dropped: true });
  }

  const body = await readJson<any>(req).catch(() => ({}));
  const message = String(body?.message || '').slice(0, 2000);
  if (!message) return ok({ dropped: true });

  const user = await currentUser(req).catch(() => null);

  captureMessage(
    message,
    {
      scope: 'browser',
      userId: user?.id,
      path: String(body?.path || '').slice(0, 300),
      extra: {
        kind: String(body?.kind || ''),
        source: String(body?.source || '').slice(0, 300),
        line: Number(body?.line || 0),
        col: Number(body?.col || 0),
        stack: String(body?.stack || '').slice(0, 2000),
        ua: String(body?.ua || '').slice(0, 300),
        ip,
      },
    },
    'error'
  );

  return ok({ received: true });
});
