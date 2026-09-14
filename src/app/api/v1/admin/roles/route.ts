import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireRole } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** 权限中心:角色定义 + 权限矩阵(静态声明式) + 各角色人数 */
const ROLES = [
  { key: 'member', label: '普通成员', desc: '浏览、发布内容、参与活动与团契' },
  { key: 'moderator', label: '审核员', desc: '内容/举报/组织/媒体审核与只读后台；不含任何删除、封禁与系统治理权限' },
  { key: 'admin', label: '管理员', desc: '全部权限：审核 + 删除（内容/用户/组织/团契）+ 用户角色与系统治理' },
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
  moderator: [
    'content.read', 'content.create', 'content.moderate', 'activity.read', 'activity.manage',
    'org.read', 'org.review', 'user.read', 'audit.read',
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
  await requireRole(req, ['admin', 'moderator']);
  const counts = await q<any>(`SELECT role, COUNT(*) AS c FROM users GROUP BY role`);
  const map: Record<string, number> = {};
  counts.forEach((c) => { map[c.role] = Number(c.c); });
  return ok({
    roles: ROLES.map((r) => ({ ...r, count: map[r.key] || 0, permissions: MATRIX[r.key] || [] })),
    groups: PERMISSIONS,
    matrix: MATRIX,
  });
});
