import { NextRequest } from 'next/server';
import { exec, one } from '@/server/db';
import { ok, withApi, HttpError } from '@/server/http';
import { requireUser, UserRow, hashPassword, checkPassword } from '@/server/auth';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

/**
 * 修改密码：验证旧密码 → 更新哈希 → 吊销全部会话（含当前端）→ 前端引导重新登录。
 * 全吊销是最安全的做法：token 存在前端 localStorage，无法从服务端精确识别"当前会话"。
 */
export const PATCH = withApi(async (req: NextRequest) => {
  const user: UserRow = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const oldPassword: string = body.oldPassword || '';
  const newPassword: string = body.newPassword || '';

  if (!oldPassword || !newPassword) throw new HttpError(422, 'VALIDATION_FAILED', '请提供旧密码与新密码');
  if (newPassword.length < 6) throw new HttpError(400, 'BAD_REQUEST', '新密码至少 6 位');
  if (oldPassword === newPassword) throw new HttpError(400, 'BAD_REQUEST', '新密码不能与旧密码相同');

  const row = await one<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id=?`, [user.id]);
  if (!row) throw new HttpError(404, 'NOT_FOUND', '用户不存在');
  if (!checkPassword(oldPassword, row.password_hash)) throw new HttpError(403, 'FORBIDDEN', '旧密码不正确');

  await exec(`UPDATE users SET password_hash=? WHERE id=?`, [hashPassword(newPassword), user.id]);
  await exec(`UPDATE sessions SET revoked=1 WHERE user_id=?`, [user.id]);

  await audit(user.id, 'PASSWORD_CHANGE', 'user', user.id, '用户修改了登录密码', '');

  return ok({ updated: true, reloginRequired: true });
});
