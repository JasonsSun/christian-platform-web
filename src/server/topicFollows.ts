import { exec, q, one, newId, ts } from '@/server/db';
import { HttpError } from '@/server/http';
import { notify } from '@/server/services';

/**
 * 话题关注。
 *
 * 平台没有独立的 tags 表，话题是 contents.tags 里的虚拟维度，所以关注关系
 * 只能按「标签名字符串」存。这一点决定了两个约束：
 *   1) 标签统一先 trim，避免「信心」与「信心 」被当成两个话题；
 *   2) 内容被作者改标签/下架后，关注关系依然存在 —— 这是符合预期的
 *      （用户关注的是一个主题，不是某一篇内容），列表接口负责展示实时内容数。
 *
 * 表走运行时幂等创建，不写 schema.sql（库级外键名唯一，改错会让 bootstrap
 * 抛错并静默回退 mock 模式）。
 */

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
export const normTag = (raw: unknown) => str(raw).trim().slice(0, 64);

export const splitTags = (raw: string) =>
  Array.from(new Set(raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean)));

let ensured = false;

export async function ensureTopicFollowTables(): Promise<void> {
  if (ensured) return;
  await exec(`CREATE TABLE IF NOT EXISTS topic_follows (
    id         CHAR(36)    NOT NULL PRIMARY KEY,
    user_id    CHAR(36)    NOT NULL,
    tag        VARCHAR(64) NOT NULL,
    created_at DATETIME    NOT NULL,
    UNIQUE KEY uk_tf_user_tag (user_id, tag),
    KEY idx_tf_tag (tag),
    CONSTRAINT fk_tf_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  ensured = true;
}

/** 关注（幂等）。已关注则原样返回，不报错。 */
export async function followTopic(userId: string, rawTag: unknown): Promise<{ tag: string; created: boolean }> {
  await ensureTopicFollowTables();
  const tag = normTag(rawTag);
  if (!tag) throw new HttpError(422, 'VALIDATION_FAILED', '话题名不能为空');
  const exist = await one<{ id: string }>(`SELECT id FROM topic_follows WHERE user_id = ? AND tag = ?`, [userId, tag]);
  if (exist) return { tag, created: false };
  await exec(
    `INSERT INTO topic_follows (id, user_id, tag, created_at) VALUES (?,?,?,?)`,
    [newId('tflw'), userId, tag, ts()]
  );
  return { tag, created: true };
}

/** 取关。本来就没关注时返回 false，不报错（幂等，前端不用区分）。 */
export async function unfollowTopic(userId: string, rawTag: unknown): Promise<boolean> {
  await ensureTopicFollowTables();
  const tag = normTag(rawTag);
  if (!tag) throw new HttpError(422, 'VALIDATION_FAILED', '话题名不能为空');
  const res = await exec(`DELETE FROM topic_follows WHERE user_id = ? AND tag = ?`, [userId, tag]);
  return Number(res?.affectedRows || 0) > 0;
}

/** 该用户关注的话题名集合（供列表接口打标记用） */
export async function followedSet(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();
  await ensureTopicFollowTables();
  const rows = await q<{ tag: string }>(`SELECT tag FROM topic_follows WHERE user_id = ?`, [userId]);
  return new Set(rows.map((r) => String(r.tag)));
}

/** 每个话题的关注人数 */
export async function followerCounts(tags: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const list = Array.from(new Set(tags.map(normTag).filter(Boolean)));
  if (!list.length) return map;
  await ensureTopicFollowTables();
  const ph = list.map(() => '?').join(',');
  const rows = await q<{ tag: string; c: number }>(
    `SELECT tag, COUNT(*) AS c FROM topic_follows WHERE tag IN (${ph}) GROUP BY tag`,
    list
  );
  for (const r of rows) map.set(String(r.tag), Number(r.c) || 0);
  return map;
}

/** 单个话题的关注人数 */
export async function followerCount(tag: string): Promise<number> {
  const m = await followerCounts([tag]);
  return m.get(normTag(tag)) || 0;
}

/** 当前登录人是否关注了某话题 */
export async function isFollowing(userId: string, tag: string): Promise<boolean> {
  if (!userId) return false;
  const t = normTag(tag);
  if (!t) return false;
  await ensureTopicFollowTables();
  const r = await one<{ id: string }>(`SELECT id FROM topic_follows WHERE user_id = ? AND tag = ?`, [userId, t]);
  return !!r;
}

export interface FollowedTopic {
  tag: string;
  createdAt: string;
  count: number;
  lastAt: string;
}

/**
 * 我关注的话题列表，并带上实时内容数/最近活跃。
 *
 * 内容数单独查一次全站已发布内容再在本地聚合 —— 话题没有实体表，
 * 只能这样；发布内容量级在千级，够快。
 */
export async function listFollowed(userId: string): Promise<FollowedTopic[]> {
  await ensureTopicFollowTables();
  const mine = await q<{ tag: string; created_at: any }>(
    `SELECT tag, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM topic_follows WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  if (!mine.length) return [];

  const rows = await q<{ tags: string; at: string }>(
    `SELECT c.tags, DATE_FORMAT(COALESCE(c.published_at, c.created_at), '%Y-%m-%dT%H:%i:%sZ') AS at
     FROM contents c WHERE c.status = 'published' AND c.tags <> ''`
  );
  const stat = new Map<string, { count: number; lastAt: string }>();
  for (const r of rows) {
    const at = String(r.at || '');
    for (const t of splitTags(String(r.tags || ''))) {
      const cur = stat.get(t) || { count: 0, lastAt: '' };
      cur.count += 1;
      if (at > cur.lastAt) cur.lastAt = at;
      stat.set(t, cur);
    }
  }

  return mine.map((r) => {
    const tag = String(r.tag);
    const s = stat.get(tag);
    return {
      tag,
      createdAt: String(r.created_at || ''),
      count: s?.count || 0,
      lastAt: s?.lastAt || '',
    };
  });
}

/**
 * 内容发布/通过审核后，通知关注了它标签的人。
 *
 * 只在上架（published）那一刻触发：审核期间就通知的话，用户点进去会 404/无权限。
 * 作者本人不通知。
 */
export async function notifyTopicFollowers(content: {
  id: string;
  title: string;
  tags?: string | null;
  authorId?: string;
  authorName?: string;
}): Promise<number> {
  const tags = splitTags(str(content?.tags)).map(normTag).filter(Boolean);
  if (!tags.length) return 0;
  await ensureTopicFollowTables();

  const ph = tags.map(() => '?').join(',');
  const rows = await q<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM topic_follows WHERE tag IN (${ph})`,
    tags
  );
  const author = str(content?.authorId);
  const targets = rows.map((r) => String(r.user_id)).filter((uid) => uid && uid !== author);
  if (!targets.length) return 0;

  const shown = tags.slice(0, 2).map((t) => `#${t}`).join('、');
  const by = str(content?.authorName) || '一位弟兄姊妹';
  for (const uid of targets) {
    await notify(
      uid,
      'topic.new_content',
      `关注的话题有新内容`,
      `${by} 在 ${shown} 发布了《${content.title}》`,
      `/contents/${content.id}`
    );
  }
  return targets.length;
}
