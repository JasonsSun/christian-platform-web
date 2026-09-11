import { NextRequest } from 'next/server';
import { exec, one } from '@/server/db';
import { ok, withApi, HttpError } from '@/server/http';
import { requireUser, UserRow, checkPassword } from '@/server/auth';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

/**
 * 账号注销（软删除）：
 * 1. 密码确认（防误操作/防会话劫持下注销）
 * 2. status → 'deleted'：登录、列表、搜索全部自动屏蔽（均只放行 active）
 * 3. 匿名化个人字段（昵称/简介/城市/教会），邮箱用户名改为带 deleted 前缀占位
 * 4. 吊销全部会话、撤下已发布内容
 * 5. 审计留痕（不含密码）
 */
export const DELETE = withApi(async (req: NextRequest) => {
  const user: UserRow = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const password: string = body.password || '';
  if (!password) throw new HttpError(422, 'VALIDATION_FAILED', '注销账号需要确认密码');

  const row = await one<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id=?`, [user.id]);
  if (!row) throw new HttpError(404, 'NOT_FOUND', '用户不存在');
  if (!checkPassword(password, row.password_hash)) throw new HttpError(403, 'FORBIDDEN', '密码不正确');

  const ts = Date.now().toString(36);
  await exec(
    `UPDATE users SET
       status='deleted',
       display_name=CONCAT('已注销用户_', ?),
       bio='',
       city='',
       church='',
       email=CONCAT('deleted+', ?, '@deleted.local'),
       username=CONCAT('deleted_', ?)
     WHERE id=?`,
    [ts, user.id, ts, user.id]
  );

  // 吊销全部会话
  await exec(`UPDATE sessions SET revoked=1 WHERE user_id=?`, [user.id]);
  // 撤下已发布内容（保留数据完整性，不物理删除）
  await exec(`UPDATE contents SET status='removed' WHERE author_id=? AND status='published'`, [user.id]);
  // 清空头像色（视觉匿名化）
  await exec(`UPDATE users SET avatar_color='#9ca3af' WHERE id=?`, [user.id]);

  await audit(user.id, 'ACCOUNT_DEACTIVATED', 'user', user.id, '用户注销了账号（软删除）', '');

  return ok({ deleted: true });
});
