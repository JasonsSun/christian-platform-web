import { NextRequest } from 'next/server';
import { resolveGateway, confirmPaid } from '@/server/payments';

export const dynamic = 'force-dynamic';

/**
 * 支付网关异步回调。
 *
 * 刻意不包 withApi：这是机器到机器的接口，
 * 不需要登录态，也不该被维护模式的写操作拦截（资金入账不能因为站点维护就丢）。
 * 安全性完全依赖「网关自己的签名」，验签失败一律拒绝。
 */
async function handle(req: NextRequest, gatewayKey: string): Promise<Response> {
  let gw;
  try {
    gw = resolveGateway(gatewayKey);
  } catch {
    return new Response('unknown gateway', { status: 404 });
  }
  try {
    const n = await gw.parseNotify(req);
    const r = await confirmPaid({ ...n, gateway: gw.key });
    if (r.ok) return gw.successReply();
    return gw.failureReply('reason' in r ? r.reason : 'notify failed');
  } catch (e: any) {
    return gw.failureReply(String(e?.message || 'notify failed'));
  }
}

export const POST = async (req: NextRequest, ctx: { params: { gateway: string } }) =>
  handle(req, ctx.params.gateway);

// 部分网关会用 GET 做可达性探测，给个明确响应避免被判定为回调失败
export const GET = async (req: NextRequest, ctx: { params: { gateway: string } }) =>
  new Response('notify endpoint', { status: 200 });
