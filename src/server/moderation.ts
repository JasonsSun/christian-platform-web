/**
 * 模块审核员体系的服务端判定层。
 *
 * 权限等级：管理员(admin) > 模块审核员(moderator + scope) > 普通成员(member)
 *
 * 约定：
 * - admin 自动拥有全部模块的能力，且独占系统治理权（用户封禁/团契解散移交/财务/系统设置/权限分配）
 * - moderator 的能力严格等于 moderator_scopes 里登记的模块，一人可多模块
 * - role 与 scopes 联动：分配首个模块时 member→moderator，撤销最后一个模块时 moderator→member
 */
import type { NextRequest } from 'next/server';
import { q, exec, one, ts } from './db';
import { HttpError, forbidden } from './http';
import { requireUser, UserRow } from './auth';
import { MODULE_META, MODULE_ORDER, isModuleKey, type ModuleKey } from '@/lib/moderationModules';

export type { ModuleKey };

/** 某人被分配的模块范围（只查库，不做角色推断） */
export async function getModeratorScopes(userId: string): Promise<ModuleKey[]> {
  try {
    const rows = await q<any>(`SELECT module FROM moderator_scopes WHERE user_id = ?`, [userId]);
    return rows.map((r: any) => r.module).filter(isModuleKey);
  } catch (e) {
    // 表尚未迁移时退化为无范围，避免整个后台 500；但要留下痕迹，否则很难排查"审核员明明分配了模块却全无权限"
    console.warn('[moderation] getModeratorScopes 查询失败，退化为无范围:', e);
    return [];
  }
}

/** 非抛出式判定：该用户能否治理某模块（admin 全通过） */
export async function isModuleModerator(user: UserRow | null, module: ModuleKey): Promise<boolean> {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'moderator') return false;
  const scopes = await getModeratorScopes(user.id);
  return scopes.includes(module);
}

/** 该用户可治理的全部模块（admin = 全部） */
export async function userModuleScopes(user: UserRow | null): Promise<ModuleKey[]> {
  if (!user) return [];
  if (user.role === 'admin') return [...MODULE_ORDER];
  if (user.role !== 'moderator') return [];
  return getModeratorScopes(user.id);
}

/**
 * 抛出式守卫：要求「该模块的审核员」或「管理员」。
 * 用于纯管理端写操作（该操作不存在"作者本人"这一放行分支时）。
 */
export async function requireModeratorModule(
  req: NextRequest | Request,
  module: ModuleKey
): Promise<UserRow> {
  const user = await requireUser(req);
  if (user.role === 'admin') return user;
  if (user.role !== 'moderator') throw forbidden('需要审核员权限');
  const scopes = await getModeratorScopes(user.id);
  if (!scopes.includes(module)) {
    const meta = MODULE_META[module];
    throw forbidden(`你不是「${meta.fullLabel}」模块的审核员，无权执行该操作`);
  }
  return user;
}

/** 仅管理员（系统治理权），语义化包装，便于全站检索 */
export async function requireAdminOnly(req: NextRequest | Request): Promise<UserRow> {
  const user = await requireUser(req);
  if (user.role !== 'admin') throw forbidden('该操作仅平台管理员可执行');
  return user;
}

/* --------------------------- 治理团队公示 --------------------------- */

export interface TeamMember {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  bio: string;
  church: string;
  city: string;
}

export interface TeamModule {
  key: ModuleKey;
  label: string;
  fullLabel: string;
  icon: string;
  color: string;
  desc: string;
  moderators: TeamMember[];
}

export interface ModerationTeam {
  admins: TeamMember[];
  modules: TeamModule[];
}

const toMember = (r: any): TeamMember => ({
  id: r.id,
  username: r.username || '',
  displayName: r.display_name || r.username || '未命名',
  avatarColor: r.avatar_color || '#4f6df5',
  bio: r.bio || '',
  church: r.church || '',
  city: r.city || '',
});

/** 公开查询：管理员 + 各模块审核员（无需登录，用于社区页治理团队公示） */
export async function listModerationTeam(): Promise<ModerationTeam> {
  let admins: TeamMember[] = [];
  let mods: any[] = [];
  try {
    const adminRows = await q<any>(
      `SELECT id, username, display_name, avatar_color, bio, church, city
         FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at ASC`
    );
    admins = adminRows.map(toMember);
    mods = await q<any>(
      `SELECT u.id, u.username, u.display_name, u.avatar_color, u.bio, u.church, u.city, s.module
         FROM moderator_scopes s JOIN users u ON u.id = s.user_id
        WHERE u.status = 'active' AND u.role <> 'admin'
        ORDER BY u.created_at ASC`
    );
  } catch {
    return { admins: [], modules: [] };
  }

  const byModule = new Map<ModuleKey, TeamMember[]>();
  for (const m of mods) {
    if (!isModuleKey(m.module)) continue;
    const arr = byModule.get(m.module) || [];
    arr.push(toMember(m));
    byModule.set(m.module, arr);
  }

  const modules: TeamModule[] = MODULE_ORDER.map((k) => {
    const meta = MODULE_META[k];
    return {
      key: k,
      label: meta.label,
      fullLabel: meta.fullLabel,
      icon: meta.icon,
      color: meta.color,
      desc: meta.desc,
      moderators: byModule.get(k) || [],
    };
  });

  return { admins, modules };
}

/* --------------------------- 范围分配（仅管理员） --------------------------- */

/** 覆盖式设置某人的模块范围；空数组即撤掉审核员身份 */
export async function setModeratorScopes(
  actorId: string,
  userId: string,
  modules: string[]
): Promise<{ userId: string; role: string; scopes: ModuleKey[] }> {
  if (userId === actorId) {
    throw new HttpError(400, 'BAD_REQUEST', '不能修改自己的审核范围');
  }
  const u = await one<any>(`SELECT id, role, status FROM users WHERE id = ?`, [userId]);
  if (!u) throw new HttpError(404, 'NOT_FOUND', '用户不存在');
  if (u.role === 'admin') {
    throw new HttpError(409, 'CONFLICT', '管理员默认拥有全部模块，无需单独分配范围');
  }
  if (u.status !== 'active') {
    throw new HttpError(409, 'CONFLICT', '该账号已被封禁，无法分配审核范围');
  }

  const mods = Array.from(new Set(modules.filter(isModuleKey))) as ModuleKey[];
  await exec(`DELETE FROM moderator_scopes WHERE user_id = ?`, [userId]);
  for (const m of mods) {
    await exec(
      `INSERT INTO moderator_scopes (user_id, module, assigned_by, assigned_at) VALUES (?,?,?,?)`,
      [userId, m, actorId, ts()]
    );
  }
  const nextRole = mods.length ? 'moderator' : 'member';
  if (u.role !== nextRole) {
    await exec(`UPDATE users SET role = ? WHERE id = ?`, [nextRole, userId]);
  }
  return { userId, role: nextRole, scopes: mods };
}

/** 带范围的用户列表（权限中心用） */
export async function listStaffWithScopes(): Promise<
  { id: string; username: string; displayName: string; role: string; status: string; scopes: ModuleKey[]; createdAt: string }[]
> {
  let rows: any[] = [];
  try {
    rows = await q<any>(
      `SELECT id, username, display_name, role, status,
              DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
         FROM users WHERE role IN ('admin','moderator') ORDER BY role, created_at ASC`
    );
  } catch (e) {
    console.warn('[moderation] listStaffWithScopes 用户列表查询失败:', e);
    return [];
  }
  let scopeRows: any[] = [];
  try {
    scopeRows = await q<any>(`SELECT user_id, module FROM moderator_scopes`);
  } catch (e) {
    console.warn('[moderation] listStaffWithScopes 范围查询失败，退化为全部无范围:', e);
    scopeRows = [];
  }
  const map = new Map<string, ModuleKey[]>();
  for (const s of scopeRows) {
    if (!isModuleKey(s.module)) continue;
    const arr = map.get(s.user_id) || [];
    arr.push(s.module);
    map.set(s.user_id, arr);
  }
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name || r.username,
    role: r.role,
    status: r.status,
    scopes: r.role === 'admin' ? [...MODULE_ORDER] : (map.get(r.id) || []),
    createdAt: r.created_at,
  }));
}
