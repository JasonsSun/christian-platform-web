import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, HttpError, readJson, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit, notify } from '@/server/services';
import { setModeratorScopes, listStaffWithScopes } from '@/server/moderation';
import { MODULE_META, MODULE_ORDER, isModuleKey } from '@/lib/moderationModules';

export const dynamic = 'force-dynamic';

/**
 * 权限中心（仅管理员可见可改）。
 *
 * 权限等级：管理员(admin) > 模块审核员(moderator + scope) > 普通成员(member)
 * - 管理员：全部模块 + 系统治理（用户封禁/团契处置/财务/系统设置/权限分配）
 * - 审核员：能力严格等于分配给他的模块，一人可兼任多模块；未分配的模块无任何权限
 */
const ROLES = [
  { key: 'member', label: '普通成员', desc: '浏览、发布内容、参与活动与团契' },
  {
    key: 'moderator',
    label: '模块审核员',
    desc: '按分配的模块治理：审核 + 删除本模块违规内容；一人可兼任多模块，未分配的模块无任何权限',
  },
  {
    key: 'admin',
    label: '管理员',
    desc: '全部模块审核 + 系统治理：用户封禁、团契解散/移交、财务、系统设置、权限分配',
  },
];

const PERMISSIONS = [
  { group: '内容', items: ['content.read', 'content.create', 'content.moderate', 'content.delete'] },
  { group: '活动', items: ['activity.read', 'activity.create', 'activity.manage'] },
  { group: '组织', items: ['org.read', 'org.apply', 'org.review'] },
  { group: '用户与权限', items: ['user.read', 'user.manage', 'role.assign'] },
  { group: '系统', items: ['system.diagnose', 'settings.manage', 'audit.read', 'event.manage'] },
];

const MATRIX: Record<string, string[]> = {
  member: ['content.read', 'content.create', 'activity.read', 'activity.create', 'org.read', 'org.apply', 'user.read'],
  // 审核员的内容治理权按模块范围生效：只有被分配的模块才能 moderate / delete
  moderator: [
    'content.read', 'content.create', 'content.moderate', 'content.delete',
    'activity.read', 'activity.manage',
    'org.read', 'org.review',
    'user.read', 'audit.read',
  ],
  admin: [
    'content.read', 'content.create', 'content.moderate', 'content.delete',
    'activity.read', 'activity.create', 'activity.manage',
    'org.read', 'org.apply', 'org.review',
    'user.read', 'user.manage', 'role.assign',
    'system.diagnose', 'settings.manage', 'audit.read', 'event.manage',
  ],
};

export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin']);
  const counts = await q<any>(`SELECT role, COUNT(*) AS c FROM users GROUP BY role`);
  const map: Record<string, number> = {};
  counts.forEach((c) => { map[c.role] = Number(c.c); });
  const staff = await listStaffWithScopes();
  return ok({
    roles: ROLES.map((r) => ({ ...r, count: map[r.key] || 0, permissions: MATRIX[r.key] || [] })),
    groups: PERMISSIONS,
    matrix: MATRIX,
    modules: MODULE_ORDER.map((k) => MODULE_META[k]),
    staff,
  });
});

/**
 * 分配 / 撤销某人的模块审核范围（仅管理员）。
 * body:{ userId, modules: ModuleKey[] }
 * - 传空数组 = 撤销审核员身份（role 回落 member）
 * - 分配首个模块时 role 自动 member -> moderator
 */
export const PATCH = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const b = await readJson<{ userId?: string; modules?: string[] }>(req);
  const userId = (b.userId || '').trim();
  if (!userId) throw new HttpError(400, 'BAD_REQUEST', '缺少 userId');
  const modules = Array.isArray(b.modules) ? b.modules : [];
  const bad = modules.filter((m) => !isModuleKey(m));
  if (bad.length) throw new HttpError(422, 'VALIDATION_FAILED', `未知模块：${bad.join(', ')}`);

  const res = await setModeratorScopes(admin.id, userId, modules);
  const names = res.scopes.map((k) => MODULE_META[k].label).join('、') || '（无）';
  await audit(
    admin.id,
    'MODERATOR_SCOPE_CHANGE',
    'user',
    userId,
    `模块范围调整为：${names}（角色：${res.role}）`,
    clientIp(req)
  );
  try {
    await notify(
      userId,
      'role_changed',
      '你的审核范围已更新',
      res.scopes.length
        ? `你现在负责：${names}。后台菜单已同步调整。`
        : '你已不再担任任何模块的审核员。',
      '/admin'
    );
  } catch {
    /* 通知失败不影响范围变更 */
  }

  return ok({ ...res, staff: await listStaffWithScopes() });
});
