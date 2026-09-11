import { NextRequest } from 'next/server';
import { ok, withApi } from '@/server/http';
import { requireUser } from '@/server/auth';
import { bindState, unbind } from '@/server/wechat';

export const dynamic = 'force-dynamic';

/** 绑定状态(前端据此轮询扫码结果) */
export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  return ok(await bindState(user.id));
});

/** 解除绑定 */
export const DELETE = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  await unbind(user.id);
  return ok({ bound: false });
});
