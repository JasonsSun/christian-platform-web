import { NextRequest } from 'next/server';
import { exec, one, q, ts } from '@/server/db';
import { ok, withApi, readJson, HttpError, notFound, clientIp } from '@/server/http';
import { UserRow } from '@/server/auth';
import { requireModeratorModule } from '@/server/moderation';
import { audit, notify } from '@/server/services';
import { whiteSafeColor } from '@/server/mappers';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const ROLES = ['owner', 'admin', 'member'] as const;
type MemberRole = (typeof ROLES)[number];

/**
 * 组织成员管理
 *
 * GET    ?q=关键词 -> 返回「尚未加入该组织」的候选用户（用于快速添加）
 * GET    无 q     -> 返回当前成员列表
 * POST   { userId, role } -> 添加/更新成员角色
 * DELETE ?userId= -> 移除成员（至少保留一名负责人）
 */
export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  await requireModeratorModule(req, 'organizations');
  const orgId = ctx.params.id;
  const keyword = (new URL(req.url).searchParams.get('q') || '').trim();

  const org = await one<{ id: string; name: string }>(`SELECT id, name FROM organizations WHERE id=?`, [orgId]);
  if (!org) throw notFound('组织不存在');

  // 候选用户：按用户名/昵称/邮箱搜索，排除已是成员的
  if (keyword) {
    const rows = await q<any>(
      `SELECT u.id, u.username, u.display_name, u.email, u.avatar_color
         FROM users u
        WHERE (u.username LIKE ? OR u.display_name LIKE ? OR u.email LIKE ?)
          AND u.status = 'active'
          AND u.id NOT IN (SELECT user_id FROM organization_members WHERE org_id = ?)
        ORDER BY u.display_name LIMIT 20`,
      [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, orgId]
    );
    return ok({
      mode: 'candidates',
      items: rows.map((u) => ({
        userId: u.id,
        username: u.username,
        displayName: u.display_name,
        email: u.email,
        avatarColor: whiteSafeColor(u.avatar_color),
      })),
    });
  }

  const rows = await q<any>(
    `SELECT m.role, DATE_FORMAT(m.joined_at,'%Y-%m-%dT%H:%i:%sZ') AS joined_at,
            u.id AS user_id, u.username, u.display_name, u.email, u.avatar_color
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ?
      ORDER BY FIELD(m.role,'owner','admin','member'), m.joined_at`,
    [orgId]
  );

  return ok({
    mode: 'members',
    org: { id: org.id, name: org.name },
    items: rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      email: r.email,
      avatarColor: whiteSafeColor(r.avatar_color),
      role: r.role,
      joinedAt: r.joined_at,
    })),
  });
});

export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const staff = (await requireModeratorModule(req, 'organizations')) as UserRow;
  const orgId = ctx.params.id;

  const body = await readJson<{ userId?: string; role?: string }>(req);
  const userId = (body?.userId || '').trim();
  if (!userId) throw new HttpError(400, 'BAD_REQUEST', '缺少 userId');
  const role: MemberRole = ROLES.includes(body?.role as MemberRole) ? (body!.role as MemberRole) : 'member';

  const org = await one<{ id: string; name: string }>(`SELECT id, name FROM organizations WHERE id=?`, [orgId]);
  if (!org) throw notFound('组织不存在');

  const user = await one<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM users WHERE id=?`,
    [userId]
  );
  if (!user) throw notFound('用户不存在');

  // 幂等：重复添加只会更新角色
  await exec(
    `INSERT INTO organization_members (org_id, user_id, role, joined_at)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    [orgId, userId, role, ts()]
  );

  await audit(staff.id, 'ORG_MEMBER_ADD', 'organization', orgId, `${user.display_name} -> ${role}`, clientIp(req));
  await notify(
    userId,
    'org_member_added',
    '已加入组织',
    `你已被添加到组织「${org.name}」，角色：${ROLE_TEXT[role]}`,
    '/nearby'
  );

  return ok({ added: true, orgId, userId, role }, 201);
});

export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const staff = (await requireModeratorModule(req, 'organizations')) as UserRow;
  const orgId = ctx.params.id;
  const userId = (new URL(req.url).searchParams.get('userId') || '').trim();
  if (!userId) throw new HttpError(400, 'BAD_REQUEST', '缺少 userId');

  const org = await one<{ id: string; name: string }>(`SELECT id, name FROM organizations WHERE id=?`, [orgId]);
  if (!org) throw notFound('组织不存在');

  const membership = await one<{ role: string }>(
    `SELECT role FROM organization_members WHERE org_id=? AND user_id=?`,
    [orgId, userId]
  );
  if (!membership) throw notFound('该用户不是此组织成员');

  // 至少保留一名负责人，避免组织变成无人管理状态
  if (membership.role === 'owner') {
    const owners = await one<{ c: number }>(
      `SELECT COUNT(*) AS c FROM organization_members WHERE org_id=? AND role='owner'`,
      [orgId]
    );
    if (Number(owners?.c || 0) <= 1) {
      throw new HttpError(400, 'LAST_OWNER', '至少需要保留一名负责人，请先指定其他负责人');
    }
  }

  await exec(`DELETE FROM organization_members WHERE org_id=? AND user_id=?`, [orgId, userId]);

  await audit(staff.id, 'ORG_MEMBER_REMOVE', 'organization', orgId, `移除成员 ${userId}`, clientIp(req));
  await notify(userId, 'org_member_removed', '已退出组织', `你已被移出组织「${org.name}」。`, '/nearby');

  return ok({ removed: true, orgId, userId });
});

const ROLE_TEXT: Record<MemberRole, string> = {
  owner: '负责人',
  admin: '管理员',
  member: '成员',
};
