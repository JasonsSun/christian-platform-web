import { exec, one, q, newId, ts } from '@/server/db';
import { getPlan, planPercent } from '@/lib/readingPlans';
import { enrollPlan } from '@/server/planProgress';

/**
 * 小组共读：把「团契」和「读经计划」打通。
 *
 * 现状问题：reading_plan_progress 只按 user_id 存，团契页完全没有 plan 代码 —— 读经是孤独的。
 * 打通后：团契共读同一计划 → 成员互看进度 → 落后过多可被提醒。
 *
 * 两张表（运行时幂等建表，老库无需迁移）：
 *  - group_reading_plans：这个团契选了哪些计划一起读（团契维度）
 *  - group_plan_members ：团契里谁加入了共读（个人维度，加入时同步 enroll 到个人计划）
 */

let tablesChecked = false;

/** 运行时幂等建表：兼容升级前已存在的库（schema.sql 仅首次初始化执行） */
export async function ensureGroupPlanTables(): Promise<void> {
  if (tablesChecked) return;
  try {
    await exec(
      `CREATE TABLE IF NOT EXISTS group_reading_plans (
        group_id    CHAR(36)    NOT NULL,
        plan_id     VARCHAR(64) NOT NULL,
        start_date  DATE        NOT NULL,
        created_by  CHAR(36)    NOT NULL,
        created_at  DATETIME    NOT NULL,
        PRIMARY KEY (group_id, plan_id),
        KEY idx_grp_plan (plan_id),
        CONSTRAINT fk_grp_group FOREIGN KEY (group_id) REFERENCES \`groups\` (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await exec(
      `CREATE TABLE IF NOT EXISTS group_plan_members (
        group_id   CHAR(36)    NOT NULL,
        plan_id    VARCHAR(64) NOT NULL,
        user_id    CHAR(36)    NOT NULL,
        joined_at  DATETIME    NOT NULL,
        PRIMARY KEY (group_id, plan_id, user_id),
        KEY idx_gpm_user (user_id),
        CONSTRAINT fk_gpm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } catch {
    /* 并发启动竞态，忽略 */
  }
  tablesChecked = true;
}

/** 是否为团契成员（owner 也算成员） */
export async function isGroupMember(groupId: string, userId: string): Promise<boolean> {
  const r = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM group_members WHERE group_id=? AND user_id=?`,
    [groupId, userId]
  );
  return Number(r?.c || 0) > 0;
}

/** 是否为团长或管理员/平台管理员 */
export async function canManageGroup(
  groupId: string,
  userId: string,
  role: string
): Promise<boolean> {
  if (role === 'admin') return true;
  const g = await one<{ owner_id: string }>(`SELECT owner_id FROM \`groups\` WHERE id=?`, [groupId]);
  return !!g && g.owner_id === userId;
}

/** 某用户在某个计划上已完成的天数 */
async function doneDaysOf(userId: string, planId: string): Promise<number> {
  const r = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM reading_plan_progress WHERE user_id=? AND plan_id=?`,
    [userId, planId]
  );
  return Number(r?.c || 0);
}

export type GroupPlanItem = {
  planId: string;
  title: string;
  subtitle: string;
  emoji: string;
  days: number;
  startDate: string;
  joinedCount: number;
  myJoined: boolean;
  myDone: number;
  myPercent: number;
  /** 按开始日期算，今天「应该」读到第几天（1-based，超出总天数则封顶） */
  expectedDay: number;
};

/** 把 DATE 列统一成 YYYY-MM-DD 字符串（mysql2 可能返回 UTC 午夜的 Date 对象） */
function asDate(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
}

/** 从开始日期推算今天应读第几天 */
export function expectedDay(startDate: string, days: number): number {
  const start = new Date(`${asDate(startDate)}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(start)) return 1;
  const now = Date.now();
  const diff = Math.floor((now - start) / 86400000) + 1; // 开始当天 = 第 1 天
  return Math.max(1, Math.min(days, diff));
}

/** 团契的共读计划列表（含我的进度） */
export async function listGroupPlans(groupId: string, viewerId?: string): Promise<GroupPlanItem[]> {
  await ensureGroupPlanTables();
  const rows = await q<{ plan_id: string; start_date: unknown; joined_count?: number }>(
    `SELECT p.plan_id, p.start_date,
            (SELECT COUNT(*) FROM group_plan_members m WHERE m.group_id=p.group_id AND m.plan_id=p.plan_id) AS joined_count
       FROM group_reading_plans p
      WHERE p.group_id=?
      ORDER BY p.created_at DESC`,
    [groupId]
  );

  const out: GroupPlanItem[] = [];
  for (const r of rows) {
    const plan = getPlan(String(r.plan_id));
    if (!plan) continue; // 计划已从静态配置移除，跳过
    const start = asDate(r.start_date);
    const joinedCount = Number(r.joined_count || 0);
    let myJoined = false;
    let myDone = 0;
    if (viewerId) {
      const j = await one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM group_plan_members WHERE group_id=? AND plan_id=? AND user_id=?`,
        [groupId, plan.id, viewerId]
      );
      myJoined = Number(j?.c || 0) > 0;
      myDone = await doneDaysOf(viewerId, plan.id);
    }
    out.push({
      planId: plan.id,
      title: plan.title,
      subtitle: plan.subtitle,
      emoji: plan.emoji,
      days: plan.days,
      startDate: start,
      joinedCount,
      myJoined,
      myDone,
      myPercent: planPercent(myDone, plan.days),
      expectedDay: expectedDay(start, plan.days),
    });
  }
  return out;
}

/** 团长/管理员为团契添加共读计划 */
export async function addGroupPlan(
  groupId: string,
  planId: string,
  startDate: string,
  userId: string
): Promise<void> {
  await ensureGroupPlanTables();
  if (!getPlan(planId)) throw new Error('PLAN_NOT_FOUND');
  await exec(
    `INSERT INTO group_reading_plans (group_id, plan_id, start_date, created_by, created_at)
     VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE start_date=VALUES(start_date), created_by=VALUES(created_by)`,
    [groupId, planId, startDate, userId, ts()]
  );
}

/** 移除团契共读计划（同时清掉成员的加入记录，但不删个人读经进度） */
export async function removeGroupPlan(groupId: string, planId: string): Promise<void> {
  await ensureGroupPlanTables();
  await exec(`DELETE FROM group_plan_members WHERE group_id=? AND plan_id=?`, [groupId, planId]);
  await exec(`DELETE FROM group_reading_plans WHERE group_id=? AND plan_id=?`, [groupId, planId]);
}

/** 加入共读：写加入记录 + 自动报名个人计划（这样真实读经会自动打卡） */
export async function joinGroupPlan(groupId: string, planId: string, userId: string): Promise<void> {
  await ensureGroupPlanTables();
  if (!getPlan(planId)) throw new Error('PLAN_NOT_FOUND');
  const exists = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM group_reading_plans WHERE group_id=? AND plan_id=?`,
    [groupId, planId]
  );
  if (Number(exists?.c || 0) === 0) throw new Error('GROUP_PLAN_NOT_FOUND');
  await exec(
    `INSERT IGNORE INTO group_plan_members (group_id, plan_id, user_id, joined_at) VALUES (?,?,?,?)`,
    [groupId, planId, userId, ts()]
  );
  // 关键联动：加入共读 = 自动报名该计划，之后读对应章节会由 autoCheckinOnRead 自动打卡
  await enrollPlan(userId, planId);
}

/** 退出共读：只解除团契共读关系，个人已报名/已打卡的进度保留 */
export async function leaveGroupPlan(
  groupId: string,
  planId: string,
  userId: string
): Promise<void> {
  await ensureGroupPlanTables();
  await exec(
    `DELETE FROM group_plan_members WHERE group_id=? AND plan_id=? AND user_id=?`,
    [groupId, planId, userId]
  );
}

export type MemberProgress = {
  userId: string;
  displayName: string;
  avatarColor: string;
  done: number;
  percent: number;
  /** 落后天数（应读天数 - 已完成），负值表示超前 */
  behind: number;
  joined: boolean;
};

/** 共读进度榜：团契全体成员按完成度排序（未加入的也列出，便于邀请） */
export async function groupPlanProgress(
  groupId: string,
  planId: string
): Promise<{ days: number; expectedDay: number; startDate: string; members: MemberProgress[] } | null> {
  await ensureGroupPlanTables();
  const plan = getPlan(planId);
  if (!plan) return null;
  const g = await one<{ start_date: unknown }>(
    `SELECT start_date FROM group_reading_plans WHERE group_id=? AND plan_id=?`,
    [groupId, planId]
  );
  if (!g) return null;
  const start = asDate(g.start_date);
  const exp = expectedDay(start, plan.days);

  const rows = await q<{
    id: string;
    display_name: string;
    avatar_color: string;
    joined: number;
  }>(
    `SELECT u.id, u.display_name, u.avatar_color,
            EXISTS(SELECT 1 FROM group_plan_members m
                    WHERE m.group_id=? AND m.plan_id=? AND m.user_id=u.id) AS joined
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id=?
      ORDER BY gm.joined_at ASC`,
    [groupId, planId, groupId]
  );

  const members: MemberProgress[] = [];
  for (const r of rows) {
    const done = await doneDaysOf(r.id, planId);
    members.push({
      userId: r.id,
      displayName: r.display_name || '',
      avatarColor: r.avatar_color || '#4f6df5',
      done,
      percent: planPercent(done, plan.days),
      behind: exp - done,
      joined: !!r.joined,
    });
  }
  members.sort((a, b) => b.done - a.done || a.displayName.localeCompare(b.displayName));
  return { days: plan.days, expectedDay: exp, startDate: start, members };
}

/**
 * 掉队成员：落后的天数达到阈值且今天尚未提醒过，供每日提醒 cron 使用。
 * 返回按团契分组的 { groupName, planTitle, userId } 列表。
 */
export async function laggingMembers(thresholdDays = 3): Promise<
  { userId: string; groupId: string; groupName: string; planTitle: string; behind: number }[]
> {
  await ensureGroupPlanTables();
  const rows = await q<{ group_id: string; group_name: string; plan_id: string; user_id: string; start_date: unknown }>(
    `SELECT p.group_id, g.name AS group_name, p.plan_id, m.user_id, p.start_date
       FROM group_plan_members m
       JOIN group_reading_plans p ON p.group_id=m.group_id AND p.plan_id=m.plan_id
       JOIN \`groups\` g ON g.id = p.group_id`,
    []
  );

  const out: { userId: string; groupId: string; groupName: string; planTitle: string; behind: number }[] = [];
  for (const r of rows) {
    const plan = getPlan(String(r.plan_id));
    if (!plan) continue;
    const exp = expectedDay(asDate(r.start_date), plan.days);
    const done = await doneDaysOf(String(r.user_id), plan.id);
    const behind = exp - done;
    if (behind < thresholdDays) continue;
    out.push({
      userId: String(r.user_id),
      groupId: String(r.group_id),
      groupName: String(r.group_name || ''),
      planTitle: plan.title,
      behind,
    });
  }
  return out;
}

/** 导出用：我加入的团契共读记录 */
export async function myGroupPlanRows(userId: string) {
  await ensureGroupPlanTables();
  return q<{ group_id: string; plan_id: string; joined_at: string }>(
    `SELECT group_id, plan_id, DATE_FORMAT(joined_at,'%Y-%m-%d %H:%i:%s') AS joined_at
       FROM group_plan_members WHERE user_id=? ORDER BY joined_at DESC`,
    [userId]
  );
}
