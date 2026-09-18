/**
 * 成就徽章体系
 *
 * 设计原则：
 *  - 表结构运行时幂等建（ensureBadgeTables），不依赖 schema.sql 版本，避免 bootstrap 失败
 *    导致整库回退 mock（schema.sql 里外键名整库唯一，加表有风险）。
 *  - 徽章定义写死在代码里，ensure 时 upsert 进 badges 表（命名/文案可随时改，id 恒定）。
 *  - 判定 = 纯读聚合 + 阈值比较；授予用 INSERT IGNORE 幂等，重复调用不刷记录。
 *  - 任何异常一律软失败：徽章不可用不得影响成长页/个人主页。
 */

import { one, q, exec, ts, newId } from './db';
import { todayStr } from './growth';

export type BadgeCategory = 'growth' | 'bible' | 'devotion' | 'community' | 'fellowship' | 'giving';
export type BadgeTier = 'bronze' | 'silver' | 'gold';

export interface BadgeDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: BadgeCategory;
  tier: BadgeTier;
  /** 达成阈值 */
  target: number;
  /** 从统计里取当前值 */
  value: (s: BadgeStats) => number;
}

export interface BadgeStats {
  checkinStreak: number;
  checkinTotal: number;
  inviteCount: number;
  noteCount: number;
  planCount: number;
  devotionCount: number;
  contentCount: number;
  likeReceived: number;
  commentCount: number;
  groupCount: number;
  prayerCount: number;
  amenCount: number;
  donateCount: number;
}

export const CATEGORY_LABEL: Record<BadgeCategory, string> = {
  growth: '灵命成长',
  bible: '读经生活',
  devotion: '灵修记录',
  community: '社区参与',
  fellowship: '团契彼此',
  giving: '奉献支持',
};

export const TIER_LABEL: Record<BadgeTier, string> = {
  bronze: '铜',
  silver: '银',
  gold: '金',
};

/** 徽章总表：id 一旦发布不要再改，否则用户已获得的记录会对不上 */
export const BADGES: BadgeDef[] = [
  // —— 灵命成长 ——
  { id: 'streak_3', name: '起初', desc: '连续签到 3 天', icon: '🌱', category: 'growth', tier: 'bronze', target: 3, value: (s) => s.checkinStreak },
  { id: 'streak_7', name: '恒心', desc: '连续签到 7 天', icon: '🔥', category: 'growth', tier: 'silver', target: 7, value: (s) => s.checkinStreak },
  { id: 'streak_30', name: '不住祷告', desc: '连续签到 30 天', icon: '⛰️', category: 'growth', tier: 'gold', target: 30, value: (s) => s.checkinStreak },
  { id: 'checkin_100', name: '旷野路程', desc: '累计签到 100 天', icon: '🏜️', category: 'growth', tier: 'gold', target: 100, value: (s) => s.checkinTotal },
  { id: 'invite_3', name: '引人归主', desc: '邀请 3 位肢体加入', icon: '🤝', category: 'growth', tier: 'silver', target: 3, value: (s) => s.inviteCount },

  // —— 读经生活 ——
  { id: 'note_10', name: '勤学', desc: '收藏/标记 10 处经文', icon: '📖', category: 'bible', tier: 'bronze', target: 10, value: (s) => s.noteCount },
  { id: 'note_50', name: '饱读', desc: '收藏/标记 50 处经文', icon: '📚', category: 'bible', tier: 'silver', target: 50, value: (s) => s.noteCount },
  { id: 'plan_1', name: '立志', desc: '加入一个读经计划', icon: '🗓️', category: 'bible', tier: 'bronze', target: 1, value: (s) => s.planCount },

  // —— 灵修记录 ——
  { id: 'devotion_7', name: '静默有时', desc: '写下 7 篇灵修', icon: '🕯️', category: 'devotion', tier: 'bronze', target: 7, value: (s) => s.devotionCount },
  { id: 'devotion_30', name: '与主同行', desc: '写下 30 篇灵修', icon: '✨', category: 'devotion', tier: 'silver', target: 30, value: (s) => s.devotionCount },

  // —— 社区参与 ——
  { id: 'content_1', name: '初熟果子', desc: '发布第 1 篇内容', icon: '🍇', category: 'community', tier: 'bronze', target: 1, value: (s) => s.contentCount },
  { id: 'content_10', name: '多结果子', desc: '发布 10 篇内容', icon: '🌿', category: 'community', tier: 'silver', target: 10, value: (s) => s.contentCount },
  { id: 'content_50', name: '丰盛生命', desc: '发布 50 篇内容', icon: '🌳', category: 'community', tier: 'gold', target: 50, value: (s) => s.contentCount },
  { id: 'like_100', name: '蒙悦纳', desc: '内容累计获赞 100 次', icon: '❤️', category: 'community', tier: 'silver', target: 100, value: (s) => s.likeReceived },
  { id: 'comment_50', name: '劝勉者', desc: '发表 50 条评论', icon: '💬', category: 'community', tier: 'bronze', target: 50, value: (s) => s.commentCount },

  // —— 团契彼此 ——
  { id: 'group_1', name: '肢体相连', desc: '加入 1 个团契', icon: '⛪', category: 'fellowship', tier: 'bronze', target: 1, value: (s) => s.groupCount },
  { id: 'group_3', name: '同心合意', desc: '加入 3 个团契', icon: '🫂', category: 'fellowship', tier: 'silver', target: 3, value: (s) => s.groupCount },
  { id: 'prayer_10', name: '代求的人', desc: '发起 10 条代祷', icon: '🙏', category: 'fellowship', tier: 'bronze', target: 10, value: (s) => s.prayerCount },
  { id: 'amen_50', name: '彼此担当', desc: '为他人代祷点赞 50 次', icon: '🕊️', category: 'fellowship', tier: 'silver', target: 50, value: (s) => s.amenCount },

  // —— 奉献支持 ——
  { id: 'donate_1', name: '施比受更为有福', desc: '完成 1 次奉献', icon: '💛', category: 'giving', tier: 'gold', target: 1, value: (s) => s.donateCount },
];

const BADGE_MAP = new Map(BADGES.map((b) => [b.id, b]));

/* ---------------- 建表（运行时幂等） ---------------- */

let tablesChecked = false;

export async function ensureBadgeTables(): Promise<void> {
  if (tablesChecked) return;
  try {
    await exec(`CREATE TABLE IF NOT EXISTS badges (
      id          VARCHAR(32)  NOT NULL PRIMARY KEY,
      name        VARCHAR(64)  NOT NULL,
      description VARCHAR(255) NOT NULL DEFAULT '',
      icon        VARCHAR(16)  NOT NULL DEFAULT '',
      category    VARCHAR(24)  NOT NULL DEFAULT 'growth',
      tier        VARCHAR(12)  NOT NULL DEFAULT 'bronze',
      target      INT          NOT NULL DEFAULT 1,
      sort_order  INT          NOT NULL DEFAULT 0,
      created_at  DATETIME     NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // 外键名加 ub_ 前缀：schema.sql 的约束名在库级作用域，重名会让整段 bootstrap throw
    await exec(`CREATE TABLE IF NOT EXISTS user_badges (
      id         CHAR(36)    NOT NULL PRIMARY KEY,
      user_id    CHAR(36)    NOT NULL,
      badge_id   VARCHAR(32) NOT NULL,
      earned_at  DATETIME    NOT NULL,
      UNIQUE KEY uk_ub_user_badge (user_id, badge_id),
      KEY idx_ub_user (user_id),
      CONSTRAINT fk_ub_user  FOREIGN KEY (user_id)  REFERENCES users (id)    ON DELETE CASCADE,
      CONSTRAINT fk_ub_badge FOREIGN KEY (badge_id) REFERENCES badges (id)   ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // 定义 upsert：文案/图标改动随版本生效，id 不变则用户记录不受影响
    for (let i = 0; i < BADGES.length; i++) {
      const b = BADGES[i];
      await exec(
        `INSERT INTO badges (id, name, description, icon, category, tier, target, sort_order, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), description = VALUES(description), icon = VALUES(icon),
           category = VALUES(category), tier = VALUES(tier), target = VALUES(target),
           sort_order = VALUES(sort_order)`,
        [b.id, b.name, b.desc, b.icon, b.category, b.tier, b.target, i, ts()]
      );
    }
    tablesChecked = true;
  } catch {
    /* 建表失败不阻断：徽章是增强功能 */
  }
}

/* ---------------- 统计 ---------------- */

function n(v: unknown): number {
  return Number(v || 0);
}

/** 一次性聚合所有徽章需要的指标（读失败时该指标记 0，不影响整体） */
export async function loadBadgeStats(userId: string): Promise<BadgeStats> {
  const today = todayStr();
  const [
    checkinRow,
    inviteRow,
    noteRow,
    planRow,
    devotionRow,
    contentRow,
    likeRow,
    commentRow,
    groupRow,
    prayerRow,
    amenRow,
    donateRow,
  ] = await Promise.all([
    one<{ streak: number; total: number }>(
      // 连续天数：从今天（或昨天）往前数，与 growth.checkinView 同一口径
      `SELECT IFNULL(MAX(streak),0) AS streak, COUNT(*) AS total FROM user_daily_checkins WHERE user_id = ?`,
      [userId]
    ).catch(() => null),
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM user_invites WHERE inviter_id = ?`, [userId]).catch(() => null),
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM bible_bookmarks WHERE user_id = ?`, [userId]).catch(() => null),
    one<{ c: number }>(
      `SELECT (SELECT COUNT(*) FROM reading_plan_enrollment WHERE user_id = ?)
            + (SELECT COUNT(*) FROM reading_plan_progress   WHERE user_id = ?) AS c`,
      [userId, userId]
    ).catch(() => null),
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM devotionals WHERE user_id = ?`, [userId]).catch(() => null),
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM contents WHERE author_id = ?`, [userId]).catch(() => null),
    one<{ c: number }>(
      `SELECT IFNULL(SUM(like_count),0) AS c FROM contents WHERE author_id = ?`,
      [userId]
    ).catch(() => null),
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM comments WHERE user_id = ?`, [userId]).catch(() => null),
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM group_members WHERE user_id = ?`, [userId]).catch(() => null),
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM prayers WHERE user_id = ?`, [userId]).catch(() => null),
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM prayer_amens WHERE user_id = ?`, [userId]).catch(() => null),
    one<{ c: number }>(
      `SELECT COUNT(*) AS c FROM donations WHERE donor_id = ? AND status IN ('success','paid','succeeded')`,
      [userId]
    ).catch(() => null),
  ]);

  // 连续天数单独按日期算（表里存的 streak 可能因补签/时区与真实口径不一致）
  let streak = 0;
  try {
    const days = await q<{ d: string }>(
      `SELECT DATE_FORMAT(day,'%Y-%m-%d') AS d FROM user_daily_checkins
        WHERE user_id = ? ORDER BY day DESC LIMIT 400`,
      [userId]
    );
    const set = new Set(days.map((x) => String(x.d)));
    const offset = (base: string, delta: number) => {
      const [y, m, dd] = base.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, dd) + delta * 86400000).toISOString().slice(0, 10);
    };
    let cur = set.has(today) ? today : offset(today, -1);
    while (set.has(cur)) {
      streak += 1;
      cur = offset(cur, -1);
    }
  } catch {
    streak = n(checkinRow?.streak);
  }

  return {
    checkinStreak: streak,
    checkinTotal: n(checkinRow?.total),
    inviteCount: n(inviteRow?.c),
    noteCount: n(noteRow?.c),
    planCount: n(planRow?.c),
    devotionCount: n(devotionRow?.c),
    contentCount: n(contentRow?.c),
    likeReceived: n(likeRow?.c),
    commentCount: n(commentRow?.c),
    groupCount: n(groupRow?.c),
    prayerCount: n(prayerRow?.c),
    amenCount: n(amenRow?.c),
    donateCount: n(donateRow?.c),
  };
}

/* ---------------- 视图 ---------------- */

export interface BadgeView {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: BadgeCategory;
  categoryLabel: string;
  tier: BadgeTier;
  tierLabel: string;
  target: number;
  current: number;
  earned: boolean;
  earnedAt: string | null;
  percent: number;
}

export interface BadgeOverview {
  total: number;
  earnedCount: number;
  newEarned: BadgeView[]; // 本次调用新授予的（用于前端提示"刚刚解锁"）
  badges: BadgeView[];
  stats: BadgeStats;
}

export function toView(def: BadgeDef, current: number, earnedAt: string | null): BadgeView {
  const pct = def.target > 0 ? Math.min(100, Math.round((current / def.target) * 100)) : 100;
  return {
    id: def.id,
    name: def.name,
    desc: def.desc,
    icon: def.icon,
    category: def.category,
    categoryLabel: CATEGORY_LABEL[def.category],
    tier: def.tier,
    tierLabel: TIER_LABEL[def.tier],
    target: def.target,
    current: Math.min(current, def.target),
    earned: !!earnedAt,
    earnedAt,
    percent: earnedAt ? 100 : pct,
  };
}

/**
 * 我的徽章总览：顺带做一次达成判定并幂等授予。
 * `grant = false` 时只算不写（他人主页展示用）。
 */
export async function badgeOverview(userId: string, grant = true): Promise<BadgeOverview> {
  const empty: BadgeOverview = {
    total: BADGES.length,
    earnedCount: 0,
    newEarned: [],
    badges: [],
    stats: {
      checkinStreak: 0,
      checkinTotal: 0,
      inviteCount: 0,
      noteCount: 0,
      planCount: 0,
      devotionCount: 0,
      contentCount: 0,
      likeReceived: 0,
      commentCount: 0,
      groupCount: 0,
      prayerCount: 0,
      amenCount: 0,
      donateCount: 0,
    },
  };

  try {
    await ensureBadgeTables();
  } catch {
    return empty;
  }

  const stats = await loadBadgeStats(userId).catch(() => empty.stats);

  let rows: Array<{ badge_id: string; earned_at: string | Date | null }> = [];
  try {
    rows = await q<{ badge_id: string; earned_at: string | Date | null }>(
      `SELECT badge_id, DATE_FORMAT(earned_at,'%Y-%m-%dT%H:%i:%sZ') AS earned_at
         FROM user_badges WHERE user_id = ?`,
      [userId]
    );
  } catch {
    rows = [];
  }

  const earnedAtMap = new Map<string, string>();
  for (const r of rows) earnedAtMap.set(String(r.badge_id), r.earned_at ? String(r.earned_at) : '');

  const newly: BadgeView[] = [];
  if (grant) {
    for (const def of BADGES) {
      if (earnedAtMap.has(def.id)) continue;
      if (def.value(stats) >= def.target) {
        const at = ts();
        try {
          await exec(
            `INSERT IGNORE INTO user_badges (id, user_id, badge_id, earned_at) VALUES (?,?,?,?)`,
            [newId('ub'), userId, def.id, at]
          );
        } catch {
          continue;
        }
        // DATETIME 写入后读回会是本地 Date，这里直接返回同格式 ISO 串保持前后端一致
        const iso = at.replace(' ', 'T') + 'Z';
        earnedAtMap.set(def.id, iso);
        newly.push(toView(def, def.target, iso));
      }
    }
  }

  const badges = BADGES.map((def) => {
    const at = earnedAtMap.has(def.id) ? earnedAtMap.get(def.id)! : null;
    return toView(def, def.value(stats), at);
  });

  return {
    total: BADGES.length,
    earnedCount: badges.filter((b) => b.earned).length,
    newEarned: newly,
    badges,
    stats,
  };
}

/** 他人主页：只返回已获得的徽章 */
export async function earnedBadges(userId: string): Promise<BadgeView[]> {
  try {
    await ensureBadgeTables();
    const rows = await q<{ badge_id: string; earned_at: string | Date | null }>(
      `SELECT badge_id, DATE_FORMAT(earned_at,'%Y-%m-%dT%H:%i:%sZ') AS earned_at
         FROM user_badges WHERE user_id = ? ORDER BY earned_at DESC`,
      [userId]
    );
    const out: BadgeView[] = [];
    for (const r of rows) {
      const def = BADGE_MAP.get(String(r.badge_id));
      if (!def) continue;
      out.push(toView(def, def.target, r.earned_at ? String(r.earned_at) : ''));
    }
    return out;
  } catch (e) {
    console.warn('[badges] 用户徽章列表查询失败，返回空列表:', e);
    return [];
  }
}

/** 批量取多人的徽章数（列表页用，避免 N+1） */
export async function badgeCounts(userIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!userIds.length) return out;
  try {
    await ensureBadgeTables();
    const ph = userIds.map(() => '?').join(',');
    const rows = await q<{ user_id: string; c: number }>(
      `SELECT user_id, COUNT(*) AS c FROM user_badges WHERE user_id IN (${ph}) GROUP BY user_id`,
      userIds
    );
    for (const r of rows) out[String(r.user_id)] = Number(r.c || 0);
  } catch {
    /* ignore */
  }
  return out;
}
