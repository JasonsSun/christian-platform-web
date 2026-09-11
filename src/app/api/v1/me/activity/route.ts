import { NextRequest } from 'next/server';
import { ok, withApi, readJson, num } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { recordActivity } from '@/server/quota';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 活跃心跳:上报在线时长与操作次数,作为成长画像的「使用时长 / 使用次数」来源 */
export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const body = await readJson<any>(req);
  const seconds = num(body?.seconds, 0);
  const actions = num(body?.actions, 0);
  const visits = num(body?.visits, 0);
  await recordActivity(user.id, seconds, visits, actions);
  return ok({ recorded: true, seconds: Math.min(300, Math.max(0, seconds)) });
});
