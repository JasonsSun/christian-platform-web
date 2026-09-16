import { exec, one, q, newId, ts } from '@/server/db';
import { HttpError } from '@/server/http';

/**
 * 讲道体系（sermon system）
 *
 * 与 UGC 内容（contents：文章/见证/灵修，带审核流）区分：
 *  - contents 是会员创作、需审核的公开内容；
 *  - sermons 是教会发布的教导内容，结构化为「系列 + 单篇 + 讲员 + 经文 + 音视频」。
 *
 * 表由运行时 `ensureSermonTables()` 幂等补建（schema.sql 仅首次初始化执行），
 * 老库升级无需手动跑迁移。公开只读；写操作限媒体模块审核员或管理员。
 */

export type MediaKind = 'audio' | 'video' | 'none';
export type PublishStatus = 'published' | 'draft';

export interface SermonSeries {
  id: string;
  title: string;
  description: string;
  cover: string;
  sortOrder: number;
  status: PublishStatus;
  createdAt: string;
  updatedAt: string;
  sermonCount?: number;
}

export interface Sermon {
  id: string;
  seriesId: string | null;
  seriesTitle: string | null;
  title: string;
  speaker: string;
  scripture: string;
  preachedAt: string | null; // YYYY-MM-DD
  description: string;
  notes: string;
  mediaType: MediaKind;
  mediaUrl: string;
  durationSec: number;
  cover: string;
  viewCount: number;
  likeCount: number;
  status: PublishStatus;
  createdAt: string;
  updatedAt: string;
  liked?: boolean;
}

const MAX_TITLE = 200;
const MAX_SPEAKER = 80;
const MAX_SCRIPTURE = 120;
const MAX_DESC = 1000;
const MAX_NOTES = 20000;
const MAX_SERIES_TITLE = 120;
const VALID_MEDIA: MediaKind[] = ['audio', 'video', 'none'];

let checked = false;
export async function ensureSermonTables(): Promise<void> {
  if (checked) return;
  try {
    await exec(
      `CREATE TABLE IF NOT EXISTS sermon_series (
        id CHAR(36) NOT NULL PRIMARY KEY,
        title VARCHAR(120) NOT NULL,
        description VARCHAR(500) NOT NULL DEFAULT '',
        cover VARCHAR(64) NOT NULL DEFAULT '',
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(16) NOT NULL DEFAULT 'published',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        KEY idx_ss_order (sort_order),
        KEY idx_ss_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await exec(
      `CREATE TABLE IF NOT EXISTS sermons (
        id CHAR(36) NOT NULL PRIMARY KEY,
        series_id CHAR(36) NULL,
        title VARCHAR(200) NOT NULL,
        speaker VARCHAR(80) NOT NULL DEFAULT '',
        scripture VARCHAR(120) NOT NULL DEFAULT '',
        preached_at DATE NULL,
        description VARCHAR(1000) NOT NULL DEFAULT '',
        notes MEDIUMTEXT NOT NULL,
        media_type VARCHAR(16) NOT NULL DEFAULT 'none',
        media_url VARCHAR(512) NOT NULL DEFAULT '',
        duration_sec INT NOT NULL DEFAULT 0,
        cover VARCHAR(64) NOT NULL DEFAULT '',
        view_count INT NOT NULL DEFAULT 0,
        like_count INT NOT NULL DEFAULT 0,
        status VARCHAR(16) NOT NULL DEFAULT 'published',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        KEY idx_sermons_series (series_id),
        KEY idx_sermons_status (status),
        KEY idx_sermons_preached (preached_at),
        KEY idx_sermons_speaker (speaker),
        CONSTRAINT fk_sermons_series FOREIGN KEY (series_id) REFERENCES sermon_series (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await exec(
      `CREATE TABLE IF NOT EXISTS sermon_likes (
        sermon_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (sermon_id, user_id),
        CONSTRAINT fk_sl_sermon FOREIGN KEY (sermon_id) REFERENCES sermons (id) ON DELETE CASCADE,
        CONSTRAINT fk_sl_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } catch {
    /* 并发启动竞态，忽略 */
  }
  checked = true;
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * 归一化「只到日」的日期。
 *
 * 为什么需要：MySQL DATE 列经 mysql2 读出来是 JS `Date`（按连接时区取当日零点），
 * 直接透出接口会变成 ISO 时间串（前端要的是 YYYY-MM-DD），而把它回传给
 * sanitizeSermon 时 `.trim()` 会抛 TypeError → 被 withApi 兜成 500。
 * 因此这里统一收口：Date / YYYY-MM-DD / ISO 串 都转成 YYYY-MM-DD，其余返回 null 由调用方判非法。
 */
function toDateOnly(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  if (isDateOnly(s)) return s;
  const hit = s.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
  return hit ? hit[1] : null;
}

/** 宽松取字符串：非字符串（数字/布尔/对象）一律转义，避免畸形 JSON 触发 .trim() 崩溃 */
function str(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
}

const PREACHED_AT_SQL = "DATE_FORMAT(s.preached_at,'%Y-%m-%d') AS preached_at";

function sermonMap(r: any): Sermon {
  return {
    id: r.id,
    seriesId: r.series_id || null,
    seriesTitle: r.series_title || null,
    title: r.title || '',
    speaker: r.speaker || '',
    scripture: r.scripture || '',
    preachedAt: r.preached_at || null,
    description: r.description || '',
    notes: r.notes || '',
    mediaType: (VALID_MEDIA.includes(r.media_type) ? r.media_type : 'none') as MediaKind,
    mediaUrl: r.media_url || '',
    durationSec: Number(r.duration_sec) || 0,
    cover: r.cover || '',
    viewCount: Number(r.view_count) || 0,
    likeCount: Number(r.like_count) || 0,
    status: r.status || 'published',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    liked: r.liked ? true : false,
  };
}

function seriesMap(r: any): SermonSeries {
  return {
    id: r.id,
    title: r.title || '',
    description: r.description || '',
    cover: r.cover || '',
    sortOrder: Number(r.sort_order) || 0,
    status: r.status || 'published',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sermonCount: r.sermon_count != null ? Number(r.sermon_count) : undefined,
  };
}

export interface SermonListOptions {
  seriesId?: string;
  speaker?: string;
  /** 关键词（标题/讲员/经文/描述） */
  q?: string;
  /** 是否包含草稿；仅媒体模块审核员/管理员传 true */
  includeDrafts?: boolean;
  sort?: 'new' | 'old' | 'hot';
  page?: number;
  pageSize?: number;
}

export async function listSermons(
  opts: SermonListOptions = {},
  viewerId?: string
): Promise<{ items: Sermon[]; total: number; speakers: string[] }> {
  await ensureSermonTables();
  const where: string[] = [];
  const args: any[] = [];

  if (!opts.includeDrafts) {
    where.push("s.status = 'published'");
  }
  if (opts.seriesId) {
    where.push('s.series_id = ?');
    args.push(opts.seriesId);
  }
  if (opts.speaker) {
    where.push('s.speaker = ?');
    args.push(opts.speaker);
  }
  const kw = (opts.q || '').trim();
  if (kw) {
    where.push('(s.title LIKE ? OR s.speaker LIKE ? OR s.scripture LIKE ? OR s.description LIKE ?)');
    args.push(`%${kw}%`, `%${kw}%`, `%${kw}%`, `%${kw}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy =
    opts.sort === 'old'
      ? 's.preached_at ASC, s.created_at ASC'
      : opts.sort === 'hot'
        ? 's.view_count DESC, s.like_count DESC'
        : 's.preached_at DESC, s.created_at DESC';

  const base = `
    SELECT s.*, ss.title AS series_title,
           ${PREACHED_AT_SQL},
           DATE_FORMAT(s.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
           DATE_FORMAT(s.updated_at,'%Y-%m-%dT%H:%i:%sZ') AS updated_at
    FROM sermons s LEFT JOIN sermon_series ss ON ss.id = s.series_id`;

  const rows = await q<any>(
    `${base} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...args, Math.min(Math.max(Number(opts.pageSize) || 12, 1), 50), Math.max((Number(opts.page) || 1) - 1, 0) * Math.min(Math.max(Number(opts.pageSize) || 12, 1), 50)]
  );
  const totalRow = await one<any>(`SELECT COUNT(*) AS c FROM sermons s ${whereSql}`, args);

  // 讲员下拉（仅基于已发布讲道，避免暴露草稿讲员）
  const spRows = await q<any>(
    `SELECT DISTINCT s.speaker AS speaker FROM sermons s WHERE s.status='published' AND s.speaker <> '' ORDER BY s.speaker`
  );

  return {
    items: rows.map(sermonMap),
    total: Number(totalRow?.c || 0),
    speakers: spRows.map((r: any) => r.speaker as string),
  };
}

export async function getSermon(id: string, viewerId?: string): Promise<Sermon | null> {
  await ensureSermonTables();
  const sql = `
    SELECT s.*, ss.title AS series_title,
           ${PREACHED_AT_SQL},
           DATE_FORMAT(s.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
           DATE_FORMAT(s.updated_at,'%Y-%m-%dT%H:%i:%sZ') AS updated_at,
           ${viewerId ? 'EXISTS(SELECT 1 FROM sermon_likes l WHERE l.sermon_id = s.id AND l.user_id = ?) AS liked' : '0 AS liked'}
    FROM sermons s LEFT JOIN sermon_series ss ON ss.id = s.series_id
    WHERE s.id = ?`;
  const r = viewerId
    ? await one<any>(sql, [viewerId, id])
    : await one<any>(sql, [id]);
  return r ? sermonMap(r) : null;
}

/** 浏览计数（详情页调用；简单自增，不做会话去重，符合本站计数惯例） */
export async function bumpSermonView(id: string): Promise<void> {
  await ensureSermonTables();
  await exec(`UPDATE sermons SET view_count = view_count + 1 WHERE id = ?`, [id]);
}

export interface SermonInput {
  seriesId?: string | null;
  title?: string;
  speaker?: string;
  scripture?: string;
  preachedAt?: string | null;
  description?: string;
  notes?: string;
  mediaType?: MediaKind;
  mediaUrl?: string;
  durationSec?: number;
  cover?: string;
  status?: PublishStatus;
}

function sanitizeSermon(input: SermonInput, forCreate: boolean): Required<Omit<SermonInput, 'seriesId' | 'preachedAt'>> & { seriesId: string | null; preachedAt: string | null } {
  const title = str(input.title).trim();
  if (forCreate || input.title !== undefined) {
    if (!title) throw new HttpError(422, 'VALIDATION_FAILED', '讲道标题不能为空');
  }
  if (title.length > MAX_TITLE) throw new HttpError(422, 'VALIDATION_FAILED', `标题过长（最多 ${MAX_TITLE} 字）`);

  const speaker = str(input.speaker).trim().slice(0, MAX_SPEAKER);
  const scripture = str(input.scripture).trim().slice(0, MAX_SCRIPTURE);
  const description = str(input.description).trim().slice(0, MAX_DESC);
  const notes = str(input.notes).trim();
  if (notes.length > MAX_NOTES) throw new HttpError(422, 'VALIDATION_FAILED', `讲章内容过长（最多 ${MAX_NOTES} 字）`);

  const mediaType = input.mediaType ?? 'none';
  if (!VALID_MEDIA.includes(mediaType)) throw new HttpError(422, 'VALIDATION_FAILED', '媒体类型不合法');
  const mediaUrl = str(input.mediaUrl).trim();
  if (mediaUrl && !isHttpUrl(mediaUrl)) {
    throw new HttpError(422, 'VALIDATION_FAILED', '媒体链接必须是 http(s) 地址');
  }
  if (mediaUrl.length > 512) throw new HttpError(422, 'VALIDATION_FAILED', '媒体链接过长');

  const durationSec = Math.max(0, Math.floor(Number(input.durationSec) || 0));
  const cover = str(input.cover).trim().slice(0, 64);
  const status = input.status ?? 'published';
  if (status !== 'published' && status !== 'draft') {
    throw new HttpError(422, 'VALIDATION_FAILED', '状态不合法');
  }

  // 日期收口：接受 YYYY-MM-DD / ISO / Date，统一产出 YYYY-MM-DD（空值→null）
  const rawPreached = input.preachedAt as unknown;
  const preachedAt = toDateOnly(rawPreached);
  if (preachedAt === null && rawPreached != null && str(rawPreached).trim() !== '') {
    throw new HttpError(422, 'VALIDATION_FAILED', '讲道日期格式应为 YYYY-MM-DD');
  }

  return {
    seriesId: input.seriesId == null ? null : input.seriesId,
    title,
    speaker,
    scripture,
    preachedAt,
    description,
    notes,
    mediaType,
    mediaUrl,
    durationSec,
    cover,
    status,
  };
}

export async function createSermon(input: SermonInput): Promise<Sermon> {
  await ensureSermonTables();
  const v = sanitizeSermon(input, true);
  if (v.seriesId) await assertSeriesExists(v.seriesId);
  const id = newId('srm');
  const now = ts();
  await exec(
    `INSERT INTO sermons
      (id, series_id, title, speaker, scripture, preached_at, description, notes, media_type, media_url, duration_sec, cover, view_count, like_count, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?)`,
    [id, v.seriesId, v.title, v.speaker, v.scripture, v.preachedAt, v.description, v.notes, v.mediaType, v.mediaUrl, v.durationSec, v.cover, v.status, now, now]
  );
  const created = await getSermon(id);
  if (!created) throw new HttpError(500, 'INTERNAL', '保存失败，请重试');
  return created;
}

export async function updateSermon(id: string, input: SermonInput): Promise<Sermon> {
  await ensureSermonTables();
  const cur = await getSermon(id);
  if (!cur) throw new HttpError(404, 'NOT_FOUND', '该讲道不存在');
  if (input.seriesId !== undefined && input.seriesId) await assertSeriesExists(input.seriesId);
  const v = sanitizeSermon(
    {
      seriesId: input.seriesId === undefined ? cur.seriesId : input.seriesId,
      title: input.title === undefined ? cur.title : input.title,
      speaker: input.speaker === undefined ? cur.speaker : input.speaker,
      scripture: input.scripture === undefined ? cur.scripture : input.scripture,
      preachedAt: input.preachedAt === undefined ? cur.preachedAt : input.preachedAt,
      description: input.description === undefined ? cur.description : input.description,
      notes: input.notes === undefined ? cur.notes : input.notes,
      mediaType: input.mediaType === undefined ? cur.mediaType : input.mediaType,
      mediaUrl: input.mediaUrl === undefined ? cur.mediaUrl : input.mediaUrl,
      durationSec: input.durationSec === undefined ? cur.durationSec : input.durationSec,
      cover: input.cover === undefined ? cur.cover : input.cover,
      status: input.status === undefined ? cur.status : input.status,
    },
    false
  );
  await exec(
    `UPDATE sermons SET series_id=?, title=?, speaker=?, scripture=?, preached_at=?, description=?, notes=?, media_type=?, media_url=?, duration_sec=?, cover=?, status=?, updated_at=? WHERE id=?`,
    [v.seriesId, v.title, v.speaker, v.scripture, v.preachedAt, v.description, v.notes, v.mediaType, v.mediaUrl, v.durationSec, v.cover, v.status, ts(), id]
  );
  const updated = await getSermon(id);
  if (!updated) throw new HttpError(500, 'INTERNAL', '保存失败，请重试');
  return updated;
}

export async function deleteSermon(id: string): Promise<boolean> {
  await ensureSermonTables();
  const r = await exec(`DELETE FROM sermons WHERE id=?`, [id]);
  return ((r as any).affectedRows ?? 0) > 0;
}

async function assertSeriesExists(seriesId: string): Promise<void> {
  const r = await one<any>(`SELECT id FROM sermon_series WHERE id=?`, [seriesId]);
  if (!r) throw new HttpError(422, 'VALIDATION_FAILED', '所选择的讲道系列不存在');
}

/* ----------------------------- 系列 ----------------------------- */

export async function listSeries(opts: { includeDrafts?: boolean } = {}): Promise<SermonSeries[]> {
  await ensureSermonTables();
  const where = opts.includeDrafts ? '' : "WHERE ss.status = 'published'";
  const rows = await q<any>(
    `SELECT ss.*, COUNT(s.id) AS sermon_count,
            DATE_FORMAT(ss.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(ss.updated_at,'%Y-%m-%dT%H:%i:%sZ') AS updated_at
     FROM sermon_series ss LEFT JOIN sermons s ON s.series_id = ss.id
     ${where}
     GROUP BY ss.id ORDER BY ss.sort_order DESC, ss.created_at DESC`
  );
  return rows.map(seriesMap);
}

export async function getSeries(id: string): Promise<SermonSeries | null> {
  await ensureSermonTables();
  const r = await one<any>(
    `SELECT ss.*, COUNT(s.id) AS sermon_count,
            DATE_FORMAT(ss.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(ss.updated_at,'%Y-%m-%dT%H:%i:%sZ') AS updated_at
     FROM sermon_series ss LEFT JOIN sermons s ON s.series_id = ss.id WHERE ss.id = ?
     GROUP BY ss.id`,
    [id]
  );
  return r ? seriesMap(r) : null;
}

export interface SeriesInput {
  title?: string;
  description?: string;
  cover?: string;
  sortOrder?: number;
  status?: PublishStatus;
}

export async function createSeries(input: SeriesInput): Promise<SermonSeries> {
  await ensureSermonTables();
  const title = (input.title || '').trim();
  if (!title) throw new HttpError(422, 'VALIDATION_FAILED', '系列标题不能为空');
  if (title.length > MAX_SERIES_TITLE) throw new HttpError(422, 'VALIDATION_FAILED', `标题过长（最多 ${MAX_SERIES_TITLE} 字）`);
  const id = newId('srs');
  const now = ts();
  await exec(
    `INSERT INTO sermon_series (id, title, description, cover, sort_order, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, title, (input.description || '').trim().slice(0, 500), (input.cover || '').trim().slice(0, 64), Math.max(0, Math.floor(Number(input.sortOrder) || 0)), input.status ?? 'published', now, now]
  );
  const created = await getSeries(id);
  if (!created) throw new HttpError(500, 'INTERNAL', '保存失败，请重试');
  return created;
}

export async function updateSeries(id: string, input: SeriesInput): Promise<SermonSeries> {
  await ensureSermonTables();
  const cur = await getSeries(id);
  if (!cur) throw new HttpError(404, 'NOT_FOUND', '该系列不存在');
  const title = input.title === undefined ? cur.title : (input.title || '').trim();
  if (!title) throw new HttpError(422, 'VALIDATION_FAILED', '系列标题不能为空');
  await exec(
    `UPDATE sermon_series SET title=?, description=?, cover=?, sort_order=?, status=?, updated_at=? WHERE id=?`,
    [title, (input.description ?? cur.description).trim().slice(0, 500), (input.cover ?? cur.cover).trim().slice(0, 64), input.sortOrder === undefined ? cur.sortOrder : Math.max(0, Math.floor(Number(input.sortOrder) || 0)), input.status ?? cur.status, ts(), id]
  );
  const updated = await getSeries(id);
  if (!updated) throw new HttpError(500, 'INTERNAL', '保存失败，请重试');
  return updated;
}

export async function deleteSeries(id: string): Promise<boolean> {
  await ensureSermonTables();
  // 系列下的讲道 series_id 置 NULL（FK ON DELETE SET NULL 已保证），此处仅删系列本身
  const r = await exec(`DELETE FROM sermon_series WHERE id=?`, [id]);
  return ((r as any).affectedRows ?? 0) > 0;
}

/* ----------------------------- 点赞 ----------------------------- */

export async function likeSermon(id: string, userId: string): Promise<void> {
  await ensureSermonTables();
  const s = await one<any>(`SELECT id FROM sermons WHERE id=?`, [id]);
  if (!s) throw new HttpError(404, 'NOT_FOUND', '该讲道不存在');
  await exec(
    `INSERT IGNORE INTO sermon_likes (sermon_id, user_id, created_at) VALUES (?,?,?)`,
    [id, userId, ts()]
  );
  await exec(`UPDATE sermons SET like_count = (SELECT COUNT(*) FROM sermon_likes WHERE sermon_id=?) WHERE id=?`, [id, id]);
}

export async function unlikeSermon(id: string, userId: string): Promise<void> {
  await ensureSermonTables();
  await exec(`DELETE FROM sermon_likes WHERE sermon_id=? AND user_id=?`, [id, userId]);
  await exec(`UPDATE sermons SET like_count = (SELECT COUNT(*) FROM sermon_likes WHERE sermon_id=?) WHERE id=?`, [id, id]);
}
