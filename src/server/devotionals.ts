import { exec, one, q, newId, ts } from '@/server/db';
import { HttpError } from '@/server/http';

/**
 * 灵修日记（个人与神独处的默想记录）
 *
 * 与公开的「代祷墙」(prayers) 区分：
 *  - prayers 是彼此代祷、公开可见、可点「阿们」；
 *  - devotionals 是私密灵修记录，只属于本人，用于回看神在生命中的带领。
 *
 * 表由运行时 `ensureDevotionalsTable()` 幂等补建（schema.sql 仅首次初始化执行），
 * 因此老库升级后无需手动跑迁移。
 */

export const DEVOTIONAL_MOODS = ['感恩', '认罪', '祈求', '赞美', '安静', '争战'] as const;
export type DevotionalMood = (typeof DEVOTIONAL_MOODS)[number];

export interface Devotional {
  id: string;
  title: string;
  body: string;
  /** 关联经文，如「诗篇 23:1-6」 */
  ref: string;
  mood: string;
  createdAt: string;
  updatedAt: string;
}

const MAX_BODY = 5000;
const MAX_TITLE = 120;
const MAX_REF = 120;

let checked = false;
export async function ensureDevotionalsTable(): Promise<void> {
  if (checked) return;
  try {
    await exec(
      `CREATE TABLE IF NOT EXISTS devotionals (
        id         CHAR(36)      NOT NULL PRIMARY KEY,
        user_id    CHAR(36)      NOT NULL,
        title      VARCHAR(120)  NOT NULL DEFAULT '',
        body       TEXT          NOT NULL,
        ref        VARCHAR(120)  NOT NULL DEFAULT '',
        mood       VARCHAR(16)   NOT NULL DEFAULT '',
        created_at DATETIME      NOT NULL,
        updated_at DATETIME      NOT NULL,
        KEY idx_dev_user_created (user_id, created_at),
        CONSTRAINT fk_dev_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } catch {
    /* 并发启动竞态，忽略 */
  }
  checked = true;
}

function map(r: any): Devotional {
  return {
    id: r.id,
    title: r.title || '',
    body: r.body || '',
    ref: r.ref || '',
    mood: r.mood || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface ListOptions {
  /** 关键词（标题/正文/经文） */
  q?: string;
  /** 按月筛选，格式 YYYY-MM */
  month?: string;
  limit?: number;
  offset?: number;
}

export async function listDevotionals(
  userId: string,
  opts: ListOptions = {}
): Promise<{ items: Devotional[]; total: number; months: { month: string; count: number }[] }> {
  await ensureDevotionalsTable();
  const where = ['user_id = ?'];
  const args: any[] = [userId];
  const kw = (opts.q || '').trim();
  if (kw) {
    where.push('(title LIKE ? OR body LIKE ? OR ref LIKE ?)');
    args.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
  }
  const month = (opts.month || '').trim();
  if (/^\d{4}-\d{2}$/.test(month)) {
    where.push("DATE_FORMAT(created_at, '%Y-%m') = ?");
    args.push(month);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const offset = Math.max(Number(opts.offset) || 0, 0);

  const rows = await q<any>(
    `SELECT id, title, body, ref, mood,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(updated_at,'%Y-%m-%dT%H:%i:%sZ') AS updated_at
     FROM devotionals ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...args, limit, offset]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM devotionals ${whereSql}`, args);
  // 按月归档计数（不受关键词/月份筛选影响，便于侧栏展示"哪几个月写过"）
  const months = await q<any>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS c
     FROM devotionals WHERE user_id = ? GROUP BY month ORDER BY month DESC`,
    [userId]
  );
  return {
    items: rows.map(map),
    total: Number(total?.c || 0),
    months: months.map((m) => ({ month: m.month, count: Number(m.c) })),
  };
}

export async function getDevotional(userId: string, id: string): Promise<Devotional | null> {
  await ensureDevotionalsTable();
  const r = await one<any>(
    `SELECT id, title, body, ref, mood,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(updated_at,'%Y-%m-%dT%H:%i:%sZ') AS updated_at
     FROM devotionals WHERE id = ? AND user_id = ?`,
    [id, userId]
  );
  return r ? map(r) : null;
}

export interface DevotionalInput {
  title?: string;
  body?: string;
  ref?: string;
  mood?: string;
}

function sanitize(input: DevotionalInput, forCreate: boolean) {
  const body = (input.body || '').trim();
  if (forCreate || input.body !== undefined) {
    if (!body) throw new HttpError(422, 'VALIDATION_FAILED', '灵修日记内容不能为空');
  }
  if (body.length > MAX_BODY) {
    throw new HttpError(422, 'VALIDATION_FAILED', `内容过长（最多 ${MAX_BODY} 字）`);
  }
  const mood = (input.mood || '').trim();
  if (mood && !(DEVOTIONAL_MOODS as readonly string[]).includes(mood)) {
    throw new HttpError(422, 'VALIDATION_FAILED', '心情标签不在允许范围内');
  }
  return {
    title: (input.title || '').trim().slice(0, MAX_TITLE),
    body: body.slice(0, MAX_BODY),
    ref: (input.ref || '').trim().slice(0, MAX_REF),
    mood,
  };
}

export async function createDevotional(userId: string, input: DevotionalInput): Promise<Devotional> {
  await ensureDevotionalsTable();
  const v = sanitize(input, true);
  const id = newId('dev');
  const now = ts();
  await exec(
    `INSERT INTO devotionals (id, user_id, title, body, ref, mood, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, userId, v.title, v.body, v.ref, v.mood, now, now]
  );
  const created = await getDevotional(userId, id);
  if (!created) throw new HttpError(500, 'INTERNAL', '保存失败，请重试');
  return created;
}

export async function updateDevotional(
  userId: string,
  id: string,
  input: DevotionalInput
): Promise<Devotional> {
  const cur = await getDevotional(userId, id);
  if (!cur) throw new HttpError(404, 'NOT_FOUND', '这条灵修日记不存在');
  const v = sanitize(
    {
      title: input.title === undefined ? cur.title : input.title,
      body: input.body === undefined ? cur.body : input.body,
      ref: input.ref === undefined ? cur.ref : input.ref,
      mood: input.mood === undefined ? cur.mood : input.mood,
    },
    false
  );
  await exec(
    `UPDATE devotionals SET title=?, body=?, ref=?, mood=?, updated_at=? WHERE id=? AND user_id=?`,
    [v.title, v.body, v.ref, v.mood, ts(), id, userId]
  );
  const updated = await getDevotional(userId, id);
  if (!updated) throw new HttpError(500, 'INTERNAL', '保存失败，请重试');
  return updated;
}

export async function deleteDevotional(userId: string, id: string): Promise<boolean> {
  await ensureDevotionalsTable();
  const r = await exec(`DELETE FROM devotionals WHERE id=? AND user_id=?`, [id, userId]);
  return ((r as any).affectedRows ?? 0) > 0;
}

/** 灵修统计（供个人中心概览）：累计篇数 / 本月篇数 / 首篇日期 */
export async function devotionalStats(userId: string): Promise<{
  total: number;
  thisMonth: number;
  firstAt: string | null;
  streakDays: number;
}> {
  await ensureDevotionalsTable();
  const total = await one<any>(`SELECT COUNT(*) AS c FROM devotionals WHERE user_id = ?`, [userId]);
  const month = await one<any>(
    `SELECT COUNT(*) AS c FROM devotionals
     WHERE user_id = ? AND DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')`,
    [userId]
  );
  const first = await one<any>(
    `SELECT DATE_FORMAT(MIN(created_at),'%Y-%m-%dT%H:%i:%sZ') AS d FROM devotionals WHERE user_id = ?`,
    [userId]
  );
  const days = await q<any>(
    `SELECT DISTINCT DATE_FORMAT(created_at, '%Y-%m-%d') AS d
     FROM devotionals WHERE user_id = ? ORDER BY d DESC LIMIT 400`,
    [userId]
  );
  // 连续写日记天数（从今天或昨天起算，中间断一天即止）
  const set = new Set<string>(days.map((r) => String(r.d)));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 400; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (set.has(key)) streak++;
    else if (i === 0) continue; // 今天还没写不算断
    else break;
  }
  return {
    total: Number(total?.c || 0),
    thisMonth: Number(month?.c || 0),
    firstAt: first?.d || null,
    streakDays: streak,
  };
}
