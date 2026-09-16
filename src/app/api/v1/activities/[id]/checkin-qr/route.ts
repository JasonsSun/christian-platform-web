import { NextRequest } from 'next/server';
import { ok, withApi, forbidden, unauthorized, notFound } from '@/server/http';
import { currentUser, UserRow } from '@/server/auth';
import { one } from '@/server/db';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: { id: string } };

/**
 * 生成活动「扫码签到」二维码。
 * 仅创建人或管理员可生成。二维码内容指向 /activities/[id]?checkin=1，
 * 成员用手机扫码打开活动页后，页面会自动调用 checkin 接口完成签到（需已报名）。
 * URL 用 req.nextUrl.origin 动态拼装，部署域名变更无需改代码。
 */
export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await currentUser(req)) as UserRow | null;
  if (!user) throw unauthorized();
  const act = await one<{ organizer_id: string }>(
    `SELECT organizer_id FROM activities WHERE id=?`,
    [ctx.params.id]
  );
  if (!act) throw notFound('活动不存在');
  if (act.organizer_id !== user.id && user.role !== 'admin') {
    throw forbidden('只有创建人或管理员可生成签到码');
  }
  const origin = req.nextUrl.origin;
  const url = `${origin}/activities/${ctx.params.id}?checkin=1`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 320 });
  return ok({ qr, url });
});
