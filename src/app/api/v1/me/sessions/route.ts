import { NextRequest } from 'next/server';
import { ok, withApi, HttpError } from '@/server/http';
import { requireUser, currentSessionId } from '@/server/auth';
import { listSessions, touchSession, revokeOtherSessions } from '@/server/sessions';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

/** 列出登录设备 */
export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const sid = currentSessionId(req);
  // 顺带刷新本设备活跃时间（内部已节流）
  await touchSession(sid);
  const items = await listSessions(user, sid);
  return ok({ items, currentId: sid });
});

/**
 * 登出其它所有设备。
 * 当前设备保持登录，避免用户把自己也踢下线。
 */
export const DELETE = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const sid = currentSessionId(req);
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  // 带 id = 踢单个设备
  if (id) {
    if (sid && id === sid) {
      throw new HttpError(400, 'BAD_REQUEST', '不能踢出当前设备，请使用「退出登录」');
    }
    const { revokeSession } = await import('@/server/sessions');
    const done = await revokeSession(user, id, sid);
    if (!done) throw new HttpError(404, 'NOT_FOUND', '会话不存在或已失效');
    await audit(user.id, 'SESSION_REVOKE', 'session', id, '用户踢出一个登录设备', '');
    return ok({ revoked: 1 });
  }

  const affected = await revokeOtherSessions(user, sid);
  await audit(user.id, 'SESSION_REVOKE_ALL', 'user', user.id, `登出其它设备 ${affected} 台`, '');
  return ok({ revoked: affected });
});
