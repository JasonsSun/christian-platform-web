/**
 * 用户增长与留存：每日签到 / 邀请好友 / 新手引导
 *
 * 设计原则：
 *  - 全部幂等：重复签到、重复注册邀请码都返回同一结果，不报错、不刷分。
 *  - 不引入新的打分口径：奖励统一落到既有的「活跃天数」(user_activity_daily)，
 *    由 quota.ts 的 scoreOf 自然换算成信任分与等级，避免出现两套成长体系。
 *  - 任何一步失败都软失败：签到/邀请不影响主流程（注册、登录）。
 */

import { one, q, exec, ts } from './db';
import { HttpError } from './http';
import { getQuota, recomputeProfile, recordActivity } from './quota';

/** 签到日以北京时间(UTC+8)为准：容器通常是 UTC，直接用 CURDATE() 会让"今天"在早上 8 点才翻篇 */
export function todayStr(d: Date = new Date()): string {
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

function dayOffset(base: string, deltaDays: number): string {
  const [y, m, dd] = base.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd) + deltaDays * 86400000);
  return t.toISOString().slice(0, 10);
}

/* ---------------- 每日签到 ---------------- */

export interface CheckinView {
  today: string;
  checked: boolean;        // 今天是否已签到
  streak: number;          // 连续天数（今天没签时显示"昨天为止"的连续数）
  totalDays: number;       // 累计签到天数
  monthDays: string[];     // 本月已签到的日期，用于日历高亮
  month: string;           // YYYY-MM
  longestStreak: number;
}

async function loadDays(userId: string): Promise<string[]> {
  const rows = await q<{ d: string }>(
    `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS d FROM user_daily_checkins
      WHERE user_id = ? ORDER BY day DESC LIMIT 400`,
    [userId]
  );
  return rows.map((r) => String(r.d));
}

function calcStreak(days: Set<string>, today: string): number {
  let start = days.has(today) ? today : dayOffset(today, -1);
  if (!days.has(start)) return 0;
  let streak = 0;
  let cur = start;
  while (days.has(cur)) {
    streak += 1;
    cur = dayOffset(cur, -1);
  }
  return streak;
}

function longestStreak(sortedAsc: string[]): number {
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const d of sortedAsc) {
    cur = prev && dayOffset(prev, 1) === d ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

export async function checkinView(userId: string): Promise<CheckinView> {
  const today = todayStr();
  const month = today.slice(0, 7);
  const days = await loadDays(userId);
  const set = new Set(days);
  return {
    today,
    checked: set.has(today),
    streak: calcStreak(set, today),
    totalDays: days.length,
    monthDays: days.filter((d) => d.startsWith(month)),
    month,
    longestStreak: longestStreak([...days].sort()),
  };
}

/**
 * 签到（幂等）。返回最新的签到视图 + 是否已重复签到。
 * 奖励：连续 7/30/100 天额外记录一次活跃，等级提升由 quota 统一换算。
 */
export async function dailyCheckin(userId: string): Promise<{ view: CheckinView; already: boolean; bonus: string | null }> {
  const today = todayStr();
  const exist = await one<{ day: string }>(
    `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day FROM user_daily_checkins WHERE user_id = ? AND day = ?`,
    [userId, today]
  );

  let already = false;
  if (exist) {
    already = true;
  } else {
    // 今天没签时 checkinView 的 streak 就是"截至昨天"的连续数，直接 +1 即今天签到的结果
    const v0 = await checkinView(userId);
    const streak = v0.streak > 0 ? v0.streak + 1 : 1;
    await exec(
      `INSERT INTO user_daily_checkins (user_id, day, streak, created_at) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE streak = VALUES(streak)`,
      [userId, today, streak, ts()]
    );
    // 签到当天计一次活跃（scoreOf 中每活跃天 2 分）
    await recordActivity(userId, 0, 0, 1);
    await recomputeProfile(userId).catch(() => {});
  }

  const view = await checkinView(userId);
  let bonus: string | null = null;
  if (!already && [7, 30, 100, 365].includes(view.streak)) {
    // 里程碑额外奖励一次活跃
    await recordActivity(userId, 0, 0, 5);
    await recomputeProfile(userId).catch(() => {});
    bonus = `连续签到 ${view.streak} 天，额外成长奖励已发放`;
  }
  return { view, already, bonus };
}

async function hasDay(userId: string, day: string): Promise<boolean> {
  const r = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM user_daily_checkins WHERE user_id = ? AND day = ?`,
    [userId, day]
  );
  return Number(r?.c || 0) > 0;
}

/* ---------------- 成长总览（/me 的 growth 页签） ---------------- */

export interface GrowthOverview {
  level: number;
  levelName: string;
  trustScore: number;
  next?: { level: number; name: string; minScore: number; gap: number; gains: string };
  checkin: CheckinView;
  tips: string[];
}

export async function growthOverview(userId: string): Promise<GrowthOverview> {
  const [quota, checkin] = await Promise.all([getQuota(userId), checkinView(userId)]);
  const tips: string[] = [];
  if (!checkin.checked) tips.push('今日尚未签到，签到可累积连续天数并提升成长等级');
  if (checkin.streak >= 3) tips.push(`已连续签到 ${checkin.streak} 天，坚持 7 天有额外奖励`);
  if (quota.next) tips.push(`再得 ${quota.next.gap} 信任分升级「${quota.next.name}」：${quota.next.gains}`);
  else tips.push('已达最高等级，感谢你的长期陪伴');
  return { level: quota.level, levelName: quota.levelName, trustScore: quota.trustScore, next: quota.next, checkin, tips };
}

/* ---------------- 邀请好友 ---------------- */

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 0/O/1/I/L

function randomCode(len = 6): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

let inviteColChecked = false;

/** 幂等加列：MySQL 不支持 ADD COLUMN IF NOT EXISTS，先查 information_schema */
export async function ensureInviteColumn(): Promise<void> {
  if (inviteColChecked) return;
  const has = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'invite_code'`
  );
  if (Number(has?.c || 0) === 0) {
    try {
      await exec(`ALTER TABLE users ADD COLUMN invite_code VARCHAR(12) NULL`);
    } catch {
      /* 并发启动时的竞态，忽略 */
    }
  }
  inviteColChecked = true;
}

/** 取（或生成）我的邀请码 */
export async function inviteCodeOf(userId: string): Promise<string> {
  await ensureInviteColumn();
  const cur = await one<{ invite_code: string | null }>(`SELECT invite_code FROM users WHERE id = ?`, [userId]);
  if (cur?.invite_code) return String(cur.invite_code);
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    const dup = await one<{ id: string }>(`SELECT id FROM users WHERE invite_code = ?`, [code]);
    if (dup) continue;
    const r = await exec(`UPDATE users SET invite_code = ? WHERE id = ? AND (invite_code IS NULL OR invite_code = '')`, [code, userId]);
    if (r && (r as any).affectedRows > 0) return code;
    const again = await one<{ invite_code: string | null }>(`SELECT invite_code FROM users WHERE id = ?`, [userId]);
    if (again?.invite_code) return String(again.invite_code);
  }
  throw new HttpError(500, 'INVITE_CODE_FAILED', '邀请码生成失败，请稍后重试');
}

export interface InviteSummary {
  code: string;
  url: string;
  invitedCount: number;
  rewarded: number;
}

export async function inviteSummary(userId: string, siteUrl?: string): Promise<InviteSummary> {
  const code = await inviteCodeOf(userId);
  const agg = await one<{ c: number; r: number }>(
    `SELECT COUNT(*) AS c, IFNULL(SUM(rewarded),0) AS r FROM user_invites WHERE inviter_id = ?`,
    [userId]
  );
  const base = (siteUrl || process.env.SITE_URL || '').replace(/\/+$/, '');
  return {
    code,
    url: base ? `${base}/login?invite=${code}` : `/login?invite=${code}`,
    invitedCount: Number(agg?.c || 0),
    rewarded: Number(agg?.r || 0),
  };
}

/**
 * 建立邀请关系（注册时调用）。
 * 失败一律软处理：绝不因为邀请码无效而阻断注册。
 */
export async function redeemInvite(rawCode: string | undefined | null, inviteeId: string): Promise<{ ok: boolean; inviterId?: string }> {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { ok: false };
  try {
    await ensureInviteColumn();
    const inviter = await one<{ id: string }>(`SELECT id FROM users WHERE invite_code = ?`, [code]);
    if (!inviter || inviter.id === inviteeId) return { ok: false };

    await exec(
      `INSERT IGNORE INTO user_invites (inviter_id, invitee_id, created_at, rewarded) VALUES (?,?,?,1)`,
      [inviter.id, inviteeId, ts()]
    );
    // 双方各记一次活跃（成长值由 quota 统一换算）
    await recordActivity(String(inviter.id), 0, 0, 3);
    await recordActivity(inviteeId, 0, 0, 1);
    await recomputeProfile(String(inviter.id)).catch(() => {});
    await recomputeProfile(inviteeId).catch(() => {});
    return { ok: true, inviterId: String(inviter.id) };
  } catch {
    return { ok: false };
  }
}

/* ---------------- 新手引导 ---------------- */

export type OnboardingKey = 'profile' | 'plan' | 'follow' | 'content';

export interface OnboardingStep {
  key: OnboardingKey;
  title: string;
  desc: string;
  href: string;
  done: boolean;
}

const STEP_META: Record<OnboardingKey, Omit<OnboardingStep, 'done'>> = {
  profile: { key: 'profile', title: '完善个人资料', desc: '填写简介或所在教会，让弟兄姊妹认识你', href: '/me' },
  plan: { key: 'plan', title: '加入一个读经计划', desc: '每天读一点，系统会帮你记录进度', href: '/plans' },
  follow: { key: 'follow', title: '关注一位作者', desc: '关注后 TA 的更新会出现在你的动态里', href: '/community' },
  content: { key: 'content', title: '发布第一篇内容', desc: '分享一段见证、一首诗歌或一篇心得', href: '/upload' },
};

export interface OnboardingView {
  steps: OnboardingStep[];
  doneCount: number;
  total: number;
  dismissed: boolean;
  allDone: boolean;
}

/** 步骤完成情况按真实数据判定，而不是只信本地缓存：换设备也不会错乱 */
export async function onboardingView(userId: string): Promise<OnboardingView> {
  // 报名表可能在升级前的老库中不存在 —— 运行时幂等建表后再查询
  const { ensureEnrollmentTable } = await import('@/server/planProgress');
  await ensureEnrollmentTable();

  const [u, plan, follow, content, row] = await Promise.all([
    one<{ bio: string; church: string; city: string }>(`SELECT bio, church, city FROM users WHERE id = ?`, [userId]),
    // 「已选读经计划」= 显式报名 ∪ 已有进度（兼容升级前只有 progress 的用户）
    one<{ c: number }>(
      `SELECT (SELECT COUNT(*) FROM reading_plan_enrollment WHERE user_id = ?)
            + (SELECT COUNT(*) FROM reading_plan_progress   WHERE user_id = ?) AS c`,
      [userId, userId]
    ),
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM follows WHERE follower_id = ?`, [userId]),
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM contents WHERE author_id = ?`, [userId]),
    one<{ done: string | null; dismissed: number }>(`SELECT done, dismissed FROM user_onboarding WHERE user_id = ?`, [userId]),
  ]);

  const realDone: Record<OnboardingKey, boolean> = {
    profile: !!(u && (String(u.bio || '').trim() || String(u.church || '').trim() || String(u.city || '').trim())),
    plan: Number(plan?.c || 0) > 0,
    follow: Number(follow?.c || 0) > 0,
    content: Number(content?.c || 0) > 0,
  };

  let stored: string[] = [];
  try {
    stored = row?.done ? JSON.parse(String(row.done)) : [];
  } catch {
    stored = [];
  }
  for (const k of Object.keys(realDone) as OnboardingKey[]) {
    if (realDone[k]) stored.push(k);
  }
  const doneSet = new Set(stored.filter((k) => k in STEP_META));

  const steps: OnboardingStep[] = (Object.keys(STEP_META) as OnboardingKey[]).map((k) => ({
    ...STEP_META[k],
    done: realDone[k] || doneSet.has(k),
  }));

  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps,
    doneCount,
    total: steps.length,
    dismissed: Number(row?.dismissed || 0) === 1,
    allDone: doneCount === steps.length,
  };
}

export async function setOnboardingDone(userId: string, key: string): Promise<OnboardingView> {
  const cur = await onboardingView(userId);
  const done = new Set(cur.steps.filter((s) => s.done).map((s) => s.key));
  if (key in STEP_META) done.add(key as OnboardingKey);
  await saveOnboarding(userId, [...done], false);
  return onboardingView(userId);
}

export async function dismissOnboarding(userId: string): Promise<void> {
  const cur = await onboardingView(userId);
  await saveOnboarding(userId, cur.steps.filter((s) => s.done).map((s) => s.key), true);
}

async function saveOnboarding(userId: string, done: string[], dismissed: boolean): Promise<void> {
  await exec(
    `INSERT INTO user_onboarding (user_id, done, dismissed, updated_at) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE done = VALUES(done), dismissed = VALUES(dismissed), updated_at = VALUES(updated_at)`,
    [userId, JSON.stringify(done), dismissed ? 1 : 0, ts()]
  );
}

/* ---------------- 读经打卡热力图 + 成就 ---------------- */

export interface HeatDay {
  date: string;
  active: boolean;
}

export interface HeatmapView {
  days: HeatDay[]; // 过去 365 天（含今天），升序
  yearDays: HeatDay[]; // 本年
  streak: number; // 当前连续天数
  longestStreak: number; // 历史最长连续
  totalDays: number; // 累计打卡天数
  yearActive: number; // 本年打卡天数
  noteCount: number; // 经文笔记 / 高亮条数
}

/** 过去 365 天每日活跃热力图 + 读经成就统计（纯读取，无副作用） */
export async function heatmapView(userId: string): Promise<HeatmapView> {
  const today = todayStr();
  const days = await loadDays(userId);
  const set = new Set(days);
  const past: HeatDay[] = [];
  for (let i = 364; i >= 0; i--) {
    const d = dayOffset(today, -i);
    past.push({ date: d, active: set.has(d) });
  }
  const year = today.slice(0, 4);
  const yearDays = past.filter((x) => x.date.startsWith(year));
  const noteRow = await one<{ c: number }>(`SELECT COUNT(*) AS c FROM bible_bookmarks WHERE user_id = ?`, [userId]);
  return {
    days: past,
    yearDays,
    streak: calcStreak(set, today),
    longestStreak: longestStreak([...days].sort()),
    totalDays: days.length,
    yearActive: yearDays.filter((d) => d.active).length,
    noteCount: Number(noteRow?.c || 0),
  };
}
