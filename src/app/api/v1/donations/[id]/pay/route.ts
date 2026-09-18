import { NextRequest } from 'next/server';
import { one } from '@/server/db';
import { ok, withApi, readJson, HttpError, forbidden, notFound, clientIp } from '@/server/http';
import { requireUser } from '@/server/auth';
import { startDonationPayment, type GatewayKey } from '@/server/payments';

export const dynamic = 'force-dynamic';

/**
 * 查询一条捐赠的当前支付状态 —— 支付页轮询用。
 * 可见性同 POST：只能查自己的，管理员不限。
 */
export const GET = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = await requireUser(req);
  const id = ctx.params.id;

  const row = await one<{
    id: string;
    donor_id: string | null;
    status: string;
    amount_cents: number;
    payment_method: string | null;
    out_trade_no: string | null;
  }>(`SELECT id, donor_id, status, amount_cents, payment_method, out_trade_no FROM donations WHERE id = ?`, [id]);
  if (!row) throw notFound('捐赠记录不存在');
  if (row.donor_id && row.donor_id !== user.id && user.role !== 'admin') {
    throw forbidden('无权查看该捐赠');
  }

  return ok({
    id: row.id,
    status: row.status,
    amountCents: Number(row.amount_cents || 0),
    paymentMethod: row.payment_method || null,
    outTradeNo: row.out_trade_no || null,
  });
});

/**
 * 为一条已登记的捐赠发起支付。
 * 登记记录由 POST /api/v1/donations 创建(pending)，这里只挂商户订单号并调用网关。
 */
export const POST = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = await requireUser(req);
  const id = ctx.params.id;

  const row = await one<{ donor_id: string | null }>(`SELECT donor_id FROM donations WHERE id = ?`, [id]);
  if (!row) throw notFound('捐赠记录不存在');
  // 只能给自己名下的捐赠付款，管理员除外
  if (row.donor_id && row.donor_id !== user.id && user.role !== 'admin') {
    throw forbidden('不能为他人的捐赠发起支付');
  }

  const body = await readJson<{ gateway?: string; subject?: string }>(req).catch(() => ({}) as any);
  const gateway = (body?.gateway || 'offline') as GatewayKey;
  const origin = new URL(req.url).origin;

  try {
    const res = await startDonationPayment({
      donationId: id,
      gateway,
      subject: body?.subject || '自愿捐赠',
      origin,
      clientIp: clientIp(req),
    });
    return ok(res);
  } catch (e: any) {
    // 网关未接入 / 总闸关闭等，都是对用户可见的正常状态，用 400 带原因返回
    throw new HttpError(400, 'PAYMENT_UNAVAILABLE', String(e?.message || '支付通道不可用'));
  }
});
