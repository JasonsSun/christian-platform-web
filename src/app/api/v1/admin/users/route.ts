import { NextRequest } from 'next/server';
import { exec, one, q } from '@/server/db';
import { ok, withApi, num, readJson, HttpError, notFound, clientIp } from '@/server/http';
import { requireRole, UserRow, hashPassword } from '@/server/auth';
import { audit, notify } from '@/server/services';
import { reassignAllOwnedGroups } from '@/server/groups';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);
  const sp = new URL(req.url).searchParams;
  const keyword = (sp.get('q') || '').trim();
  const role = sp.get('role') || '';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 100);

  const where: string[] = [];
  const args: any[] = [];
  if (keyword) { where.push('(u.username LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (role) { where.push('u.role = ?'); args.push(role); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q<any>(
    `SELECT u.id, u.username, u.email, u.display_name, u.role, u.status, u.city, u.church,
            u.avatar_color, DATE_FORMAT(u.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            (SELECT COUNT(*) FROM contents c WHERE c.author_id = u.id) AS content_count,
            (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS followers
     FROM users u ${whereSql} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM users u ${whereSql}`, args);
  return ok({
    items: rows.map((r) => ({
      id: r.id, username: r.username, email: r.email, displayName: r.display_name,
      role: r.role, status: r.status, city: r.city, church: r.church,
      avatarColor: r.avatar_color, createdAt: r.created_at,
      contentCount: Number(r.content_count), followers: Number(r.followers),
    })),
    total: Number(total?.c || 0), page, pageSize,
  });
});

/** 修改角色 / 启停账号(仅管理员) */
export const PATCH = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const body = await readJson<{ userId?: string; role?: string; status?: string; resetPassword?: boolean }>(req);
  const userId = body.userId || '';
  if (!userId) throw new HttpError(400, 'BAD_REQUEST', '缺少 userId');
  const target = await one<any>(`SELECT id, username FROM users WHERE id = ?`, [userId]);
  if (!target) throw notFound('用户不存在');
  if (userId === admin.id) throw new HttpError(400, 'BAD_REQUEST', '不能修改自己的角色');

  if (body.role) {
    if (!['member', 'moderator', 'admin'].includes(body.role)) throw new HttpError(422, 'VALIDATION_FAILED', '角色无效');
    await exec(`UPDATE users SET role = ? WHERE id = ?`, [body.role, userId]);
    await audit(admin.id, 'USER_ROLE_CHANGE', 'user', userId, `${target.username} -> ${body.role}`, clientIp(req));
  }
  if (body.status) {
    if (!['active', 'suspended'].includes(body.status)) throw new HttpError(422, 'VALIDATION_FAILED', '状态无效');
    await exec(`UPDATE users SET status = ? WHERE id = ?`, [body.status, userId]);
    if (body.status === 'suspended') {
      await exec(`UPDATE sessions SET revoked = 1 WHERE user_id = ?`, [userId]);
    }
    await audit(admin.id, 'USER_STATUS_CHANGE', 'user', userId, `${target.username} -> ${body.status}`, clientIp(req));
  }

  // 管理员重置用户密码：生成 10 位随机密码，仅本次响应返回一次
  if (body.resetPassword === true) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const newPassword = Array.from(crypto.randomBytes(10)).map((b) => chars[b % chars.length]).join('');
    await exec(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashPassword(newPassword), userId]);
    await exec(`UPDATE sessions SET revoked = 1 WHERE user_id = ?`, [userId]);
    await audit(admin.id, 'USER_PASSWORD_RESET', 'user', userId, `管理员重置了 ${target.username} 的密码`, clientIp(req));
    await notify(userId, 'password_reset', '🔐 登录密码已被重置', '管理员重置了你的登录密码，请使用新密码登录后尽快修改。', '/me');
    return ok({ id: userId, updated: true, newPassword });
  }

  return ok({ id: userId, updated: true });
});

/**
 * 删除用户（仅管理员；审核员无此权限）。
 * 高风险不可逆操作，前端须经 /confirm 二次确认。
 *
 * 级联说明：users 被删除后，其会话/内容/评论/报名/好友/消息/通知等由外键
 * ON DELETE CASCADE 一并清除（捐赠记录、直播聊天记录为 SET NULL 保留）。
 * 但其**拥有的团契**不能跟着消失 —— 删除前先逐个移交（最早入群者接任）
 * 或解散（仅他一人），避免几十人的团契被牵连删除。
 */
export const DELETE = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const body = await readJson<{ userId?: string }>(req);
  const userId = body.userId || '';
  if (!userId) throw new HttpError(400, 'BAD_REQUEST', '缺少 userId');
  if (userId === admin.id) throw new HttpError(400, 'BAD_REQUEST', '不能删除自己的账号');

  const target = await one<any>(`SELECT id, username, display_name, role FROM users WHERE id = ?`, [userId]);
  if (!target) throw notFound('用户不存在');

  // 不能删掉最后一名管理员，否则后台将无人可管
  if (target.role === 'admin') {
    const left = await one<any>(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND id <> ?`, [userId]);
    if (!Number(left?.c || 0)) throw new HttpError(409, 'CONFLICT', '至少需要保留一名管理员');
  }

  // 先处理 TA 拥有的团契，避免外键级联把整个团契删掉
  const groupResults = await reassignAllOwnedGroups(userId);
  const transferred = groupResults.filter((r) => r.action === 'transferred').length;
  const dissolved = groupResults.filter((r) => r.action === 'dissolved').length;

  await exec(`DELETE FROM users WHERE id = ?`, [userId]);
  await audit(admin.id, 'USER_DELETE', 'user', userId,
    `删除用户 ${target.username}（团契移交 ${transferred}、解散 ${dissolved}）`, clientIp(req));

  return ok({ id: userId, deleted: true, groupsTransferred: transferred, groupsDissolved: dissolved });
});
