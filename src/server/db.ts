import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { BIBLE_VERSES } from './bible-data';

/** 数据库配置(可用 .env.local 覆盖) */
export const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'christian_platform',
};

declare global {
  // eslint-disable-next-line no-var
  var __platformReady: Promise<Pool> | undefined;
  // eslint-disable-next-line no-var
  var __platformMock: boolean | undefined;
}

/** MySQL DATETIME 字面量(UTC) */
export function ts(d: Date | string | number = new Date()): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

async function createPool(): Promise<Pool> {
  // 1) 建库
  const bootstrap = await mysql.createConnection({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
    multipleStatements: true,
    connectTimeout: 2000,
  });
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  await bootstrap.end();

  // 2) 建表
  const pool = mysql.createPool({
    ...DB_CONFIG,
    waitForConnections: true,
    connectionLimit: 50,
    queueLimit: 0,
    charset: 'utf8mb4',
    multipleStatements: true,
  });
  const schemaPath = path.join(process.cwd(), 'src', 'server', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schema);

  // 3) 首次运行灌入种子数据
  const { seedIfEmpty } = await import('./seed');
  await seedIfEmpty(pool);
  await ensureIndexes(pool);
  await ensureColumns(pool);

  return pool;
}

// ============ Mock 数据层（MySQL 不可用时回退） ============

const NOW = new Date().toISOString();

const MOCK_USERS = [
  { id: 'u_admin', username: 'admin', email: 'admin@shengyue.com', display_name: '平台管理员', role: 'admin', status: 'active', avatar_color: '#4f6df5', bio: '愿神祝福这个平台', city: '北京', church: '北京基督教会', created_at: '2024-01-01 00:00:00' },
  { id: 'u_001', username: 'zhangwei', email: 'zhangwei@example.com', display_name: '张伟', role: 'member', status: 'active', avatar_color: '#f59e0b', bio: '主内肢体', city: '上海', church: '上海沐恩堂', created_at: '2024-03-15 10:00:00' },
  { id: 'u_002', username: 'lina', email: 'lina@example.com', display_name: '李娜', role: 'member', status: 'active', avatar_color: '#10b981', bio: '基督徒，乐于分享', city: '广州', church: '广州东山堂', created_at: '2024-04-20 14:00:00' },
  { id: 'u_003', username: 'wangfang', email: 'wangfang@example.com', display_name: '王芳', role: 'moderator', status: 'active', avatar_color: '#8b5cf6', bio: '服侍教会', city: '成都', church: '成都上翔堂', created_at: '2024-02-10 09:00:00' },
];

const MOCK_CONTENTS = [
  { id: 'c_001', author_id: 'u_001', title: '我的受洗见证', body: '去年复活节，我受洗归主。那一刻，我感受到了从未有过的平安和喜乐...', excerpt: '去年复活节，我受洗归主...', content_type: 'testimony', status: 'published', scope: 'global', region: '', tags: '受洗,见证', cover: '', like_count: 42, comment_count: 8, view_count: 320, created_at: '2024-06-01 10:00:00', published_at: '2024-06-01 10:00:00' },
  { id: 'c_002', author_id: 'u_002', title: '读经心得：诗篇23篇', body: '耶和华是我的牧者，我必不至缺乏。这篇诗篇是大卫在患难中写下的...', excerpt: '耶和华是我的牧者...', content_type: 'devotion', status: 'published', scope: 'global', region: '', tags: '诗篇,灵修', cover: '', like_count: 88, comment_count: 15, view_count: 560, created_at: '2024-06-05 08:30:00', published_at: '2024-06-05 08:30:00' },
  { id: 'c_003', author_id: 'u_003', title: '青年团契聚会回顾', body: '上周五晚，我们青年团契举行了主题为"信心的旅程"的聚会...', excerpt: '上周五晚，我们青年团契...', content_type: 'article', status: 'published', scope: 'global', region: '', tags: '团契,青年', cover: '', like_count: 35, comment_count: 5, view_count: 198, created_at: '2024-06-08 20:00:00', published_at: '2024-06-08 20:00:00' },
];

const MOCK_ACTIVITIES = [
  { id: 'a_001', title: '主日崇拜', description: '每周日上午10点，欢迎各位弟兄姊妹参加主日崇拜', category: 'worship', location: '北京基督教会海淀堂', city: '北京', start_at: '2024-06-16 10:00:00', end_at: '2024-06-16 12:00:00', capacity: 500, cover: '', confirmed_count: 120, waitlist_count: 0, organizer_id: 'u_admin' },
  { id: 'a_002', title: '青年团契聚会', description: '主题：信心的旅程 - 一起查经、祷告、分享', category: 'fellowship', location: '上海沐恩堂青年团契活动室', city: '上海', start_at: '2024-06-14 19:00:00', end_at: '2024-06-14 21:00:00', capacity: 40, cover: '', confirmed_count: 28, waitlist_count: 5, organizer_id: 'u_003' },
  { id: 'a_003', title: '夏季退修会', description: '为期两天的属灵退修会，主题：在基督里生根建造', category: 'retreat', location: '杭州西湖灵修中心', city: '杭州', start_at: '2024-07-20 09:00:00', end_at: '2024-07-21 17:00:00', capacity: 60, cover: '', confirmed_count: 45, waitlist_count: 12, organizer_id: 'u_admin' },
];

const MOCK_GROUPS = [
  { id: 'g_001', name: '北京青年基督徒团契', description: '在北京的青年基督徒团契，每周聚会，一起灵修成长', category: 'youth', city: '北京', cover: '', created_at: '2024-01-15 00:00:00', member_count: 86, owner_id: 'u_003' },
  { id: 'g_002', name: '上海读经分享群', description: '每日读经打卡，分享心得，彼此鼓励', category: 'bible', city: '上海', cover: '', created_at: '2024-02-01 00:00:00', member_count: 134, owner_id: 'u_001' },
  { id: 'g_003', name: '祷告守望团契', description: '为教会、国家、世界守望祷告', category: 'prayer', city: '广州', cover: '', created_at: '2024-03-10 00:00:00', member_count: 67, owner_id: 'u_002' },
];

const MOCK_PRAYERS = [
  { id: 'p_001', body: '为我患病的母亲祷告，求主医治她的身体，赐她平安。', amen_count: 23, answered: 0, created_at: '2024-06-10 12:00:00', user_id: 'u_001' },
  { id: 'p_002', body: '求主带领我今年的工作方向，赐下智慧和分辨的灵。', amen_count: 45, answered: 0, created_at: '2024-06-09 09:00:00', user_id: 'u_002' },
  { id: 'p_003', body: '为教会的复兴祷告，求主复兴祂的教会。', amen_count: 67, answered: 0, created_at: '2024-06-08 20:00:00', user_id: 'u_003' },
];

const MOCK_NOTIFICATIONS = [
  { id: 'n_001', type: 'like', title: '张伟 赞了你的内容', body: '《我的受洗见证》获得了新的点赞', link: '/contents/c_001', read: 0, created_at: '2024-06-10 14:00:00', user_id: 'u_001' },
  { id: 'n_002', type: 'comment', title: '李娜 评论了你的内容', body: '感谢分享，很受感动！', link: '/contents/c_001', read: 0, created_at: '2024-06-10 13:00:00', user_id: 'u_001' },
  { id: 'n_003', type: 'activity', title: '活动提醒', body: '《主日崇拜》将于明天上午10点开始', link: '/activities/a_001', read: 1, created_at: '2024-06-09 18:00:00', user_id: 'u_001' },
];

const MOCK_BIBLE_VERSES = BIBLE_VERSES;

const MOCK_SONGS = [
  { id: 's_001', title: '奇异恩典', author: '约翰·牛顿', category: '赞美', tags: '恩典,经典', lyrics: '奇异恩典 何等甘甜\n我罪已得赦免\n前我失丧 今被寻回\n瞎眼今得看见', audio_url: null, duration_sec: 263, play_count: 1250, created_at: '2024-01-01 00:00:00' },
  { id: 's_002', title: '耶稣爱你', author: '赞美之泉', category: '敬拜', tags: '爱,安慰', lyrics: '耶稣爱你 我也爱你\n在基督里 我们是一家人', audio_url: null, duration_sec: 245, play_count: 980, created_at: '2024-02-01 00:00:00' },
];

const MOCK_MESSAGES = [
  { id: 'm_001', body: '你好，最近灵修怎么样？', read: 0, created_at: '2024-06-10 10:00:00', from_id: 'u_002', to_id: 'u_001' },
  { id: 'm_002', body: '感谢主，最近在读诗篇，很有得着。', read: 1, created_at: '2024-06-10 10:05:00', from_id: 'u_001', to_id: 'u_002' },
];

const MOCK_FRIENDS = [
  { id: 'f_001', user_id: 'u_001', friend_id: 'u_002', status: 'friends', created_at: '2024-05-01 00:00:00' },
  { id: 'f_002', user_id: 'u_001', friend_id: 'u_003', status: 'friends', created_at: '2024-05-15 00:00:00' },
];

const MOCK_FRIEND_REQUESTS = [
  { id: 'fr_001', requester_id: 'u_003', addressee_id: 'u_001', message: '你好，我是成都的王芳，想加你为好友', status: 'pending', created_at: '2024-06-09 15:00:00' },
];

const MOCK_FOLLOWS = [
  { id: 'fl_001', follower_id: 'u_002', following_id: 'u_001', created_at: '2024-05-10 00:00:00' },
];

const MOCK_BOOKMARKS = [
  { id: 'bm_001', user_id: 'u_001', version: 'cuv', book_id: 'john', chapter: 3, verse: 16, note: '', created_at: '2024-06-01 00:00:00' },
];

const MOCK_COMMENTS = [
  { id: 'cm_001', content_id: 'c_001', user_id: 'u_002', body: '感谢分享，很受感动！', created_at: '2024-06-02 10:00:00' },
  { id: 'cm_002', content_id: 'c_001', user_id: 'u_003', body: '主内平安，愿主祝福你。', created_at: '2024-06-02 11:00:00' },
];

const MOCK_GROUP_POSTS = [
  { id: 'gp_001', group_id: 'g_001', author_id: 'u_003', body: '本周五晚7点青年团契聚会，主题：信心的旅程。欢迎大家参加！', created_at: '2024-06-08 20:00:00' },
];

const MOCK_LIKES = [
  { id: 'l_001', content_id: 'c_001', user_id: 'u_002', created_at: '2024-06-02 09:00:00' },
];

const MOCK_MEDIA = [
  { id: 'md_001', user_id: 'u_001', type: 'image', url: '', filename: 'baptism.jpg', size: 1024000, status: 'published', created_at: '2024-06-01 10:00:00' },
];

const MOCK_REVIEWS = [
  { id: 'r_001', content_id: 'c_001', status: 'approved', reason: '', created_at: '2024-06-01 09:00:00', decided_at: '2024-06-01 09:30:00' },
];

const MOCK_QUOTAS = [
  { user_id: 'u_001', storage_used: 52428800, storage_limit: 1073741824, contents_used: 12, contents_limit: 50, songs_used: 30, songs_limit: 200 },
];

const MOCK_CHECKINS = [
  { id: 'ci_001', activity_id: 'a_001', user_id: 'u_001', checked_in: 1, created_at: '2024-06-16 10:05:00' },
];

const MOCK_REGISTRATIONS = [
  { id: 'reg_001', activity_id: 'a_001', user_id: 'u_001', status: 'confirmed', created_at: '2024-06-10 10:00:00' },
];

const MOCK_AUDIT = [
  { id: 'au_001', user_id: 'u_admin', action: 'LOGIN', target_type: '', target_id: '', detail: '管理员登录', ip: '127.0.0.1', created_at: NOW },
];

const MOCK_SESSIONS = [
  { id: 'sess_001', user_id: 'u_001', refresh_hash: 'mock_hash', user_agent: 'Mozilla/5.0', ip: '127.0.0.1', expires_at: '2024-12-31 23:59:59', revoked: 0, rotated_from: null, created_at: NOW },
];

const MOCK_ORGANIZATIONS = [
  { id: 'org_001', name: '北京基督教会', description: '北京地区基督教会联合体', city: '北京', created_at: '2024-01-01 00:00:00' },
];

const MOCK_SETTINGS = [
  { id: 'set_001', key: 'site_name', value: '圣约社区', category: 'site', updated_at: NOW },
];

const MOCK_ROLES = [
  { id: 'rl_001', name: 'member', description: '普通会员', permissions: 'content:read,content:create', created_at: NOW },
  { id: 'rl_002', name: 'moderator', description: '版主', permissions: 'content:read,content:create,content:moderate', created_at: NOW },
  { id: 'rl_003', name: 'admin', description: '管理员', permissions: '*', created_at: NOW },
];

const MOCK_EVENTS = [
  { id: 'ev_001', type: 'content_published', target_type: 'content', target_id: 'c_001', created_at: NOW },
];

const MOCK_EXPENSES = [
  { id: 'exp_001', category: 'server', title: '云服务器(2C4G)', note: '平台主站与数据库', amount_cents: 12800, period: '2026-08', status: 'published', created_at: NOW },
  { id: 'exp_002', category: 'bandwidth', title: 'CDN 流量包', note: '媒体与圣经静态资源分发', amount_cents: 4500, period: '2026-08', status: 'published', created_at: NOW },
  { id: 'exp_003', category: 'domain', title: '域名续费', note: 'shengyue.com 一年', amount_cents: 8000, period: '2026-08', status: 'published', created_at: NOW },
];

// 表格映射
const TABLES: Record<string, any[]> = {
  users: MOCK_USERS,
  contents: MOCK_CONTENTS,
  activities: MOCK_ACTIVITIES,
  groups: MOCK_GROUPS,
  prayers: MOCK_PRAYERS,
  notifications: MOCK_NOTIFICATIONS,
  bible_verses: MOCK_BIBLE_VERSES,
  songs: MOCK_SONGS,
  messages: MOCK_MESSAGES,
  friends: MOCK_FRIENDS,
  friend_requests: MOCK_FRIEND_REQUESTS,
  follows: MOCK_FOLLOWS,
  bookmarks: MOCK_BOOKMARKS,
  comments: MOCK_COMMENTS,
  group_posts: MOCK_GROUP_POSTS,
  likes: MOCK_LIKES,
  media: MOCK_MEDIA,
  review_tasks: MOCK_REVIEWS,
  user_quotas: MOCK_QUOTAS,
  checkins: MOCK_CHECKINS,
  registrations: MOCK_REGISTRATIONS,
  audit_logs: MOCK_AUDIT,
  sessions: MOCK_SESSIONS,
  organizations: MOCK_ORGANIZATIONS,
  settings: MOCK_SETTINGS,
  roles: MOCK_ROLES,
  events: MOCK_EVENTS,
  expenses: MOCK_EXPENSES,
};

/** 从 SQL 中提取表名 */
function extractTable(sql: string): string {
  // FROM table / JOIN table / INTO table / UPDATE table
  const patterns = [
    /\bFROM\s+`?(\w+)`?/i,
    /\bJOIN\s+`?(\w+)`?/i,
    /\bINTO\s+`?(\w+)`?/i,
    /\bUPDATE\s+`?(\w+)`?/i,
    /\bDELETE\s+FROM\s+`?(\w+)`?/i,
  ];
  for (const p of patterns) {
    const m = sql.match(p);
    if (m) return m[1].toLowerCase();
  }
  return '';
}

/** 模拟 query：根据 SQL 返回 mock 数据 */
function mockQuery(sql: string, params: any[] = []): [any, any] {
  const table = extractTable(sql);
  const rows = TABLES[table] || [];

  // GROUP BY 聚合查询（如 bible 路由的可用章节统计）
  if (/GROUP BY/i.test(sql)) {
    if (table === 'bible_verses') {
      // 返回所有 (version, book_id, chapter) 组合，供 /api/v1/bible 统计每卷已收录章节
      const seen = new Set<string>();
      const result: any[] = [];
      for (const r of rows) {
        const key = `${r.version}_${r.book_id}_${r.chapter}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ version: r.version, book_id: r.book_id, chapter: r.chapter });
      }
      // 按章节升序
      result.sort((a: any, b: any) => a.chapter - b.chapter);
      return [result, { affectedRows: result.length }];
    }
    return [[], { affectedRows: 0 }];
  }

  // SELECT DISTINCT
  if (/SELECT DISTINCT/i.test(sql)) {
    const cols = [...new Set(rows.map((r: any) => JSON.stringify(Object.fromEntries(
      Object.entries(r).filter(([k]) => sql.toLowerCase().includes(k.toLowerCase()))
    ))))].map((s: string) => JSON.parse(s));
    return [cols.length ? cols : rows, { affectedRows: cols.length }];
  }

  // 简单 SELECT
  if (/^SELECT/i.test(sql)) {
    // 应用 WHERE 条件（简单的参数匹配）
    let filtered = [...rows];
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER BY|LIMIT|GROUP|$)/i);
    if (whereMatch && params.length > 0) {
      // 简单过滤：假设第一个参数匹配第一个条件字段
      const whereClause = whereMatch[1];
      const conditions = whereClause.split(/\s+AND\s+/i);
      conditions.forEach((cond, i) => {
        const fieldMatch = cond.match(/(\w+)\s*=\s*\?/);
        if (fieldMatch && params[i] !== undefined) {
          const field = fieldMatch[1].toLowerCase();
          const val = params[i];
          filtered = filtered.filter((r: any) => {
            const rv = r[field];
            return rv !== undefined && String(rv) === String(val);
          });
        }
      });
    }

    // ORDER BY
    const orderMatch = sql.match(/ORDER BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const field = orderMatch[1].toLowerCase();
      const dir = orderMatch[2]?.toUpperCase() === 'DESC' ? -1 : 1;
      filtered.sort((a: any, b: any) => {
        if (a[field] < b[field]) return -1 * dir;
        if (a[field] > b[field]) return 1 * dir;
        return 0;
      });
    }

    // LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      filtered = filtered.slice(0, parseInt(limitMatch[1]));
    }

    return [filtered, { affectedRows: filtered.length }];
  }

  // INSERT
  if (/^INSERT/i.test(sql)) {
    const insertId = newId(table === 'users' ? 'u' : table === 'contents' ? 'c' : table.slice(0, 1));
    return [{ insertId, affectedRows: 1 }, { insertId, affectedRows: 1 }];
  }

  // UPDATE
  if (/^UPDATE/i.test(sql)) {
    return [{ affectedRows: 1, changedRows: 1 }, { affectedRows: 1, changedRows: 1 }];
  }

  // DELETE
  if (/^DELETE/i.test(sql)) {
    return [{ affectedRows: 1 }, { affectedRows: 1 }];
  }

  return [[], { affectedRows: 0 }];
}

/** 创建 mock pool */
function createMockPool(): Pool {
  const mockConn = {
    query: (sql: string, params?: any[]) => Promise.resolve(mockQuery(sql, params || [])),
    execute: (sql: string, params?: any[]) => Promise.resolve(mockQuery(sql, params || [])),
    beginTransaction: () => Promise.resolve(),
    commit: () => Promise.resolve(),
    rollback: () => Promise.resolve(),
    release: () => {},
  } as unknown as PoolConnection;

  return {
    query: (sql: string, params?: any[]) => Promise.resolve(mockQuery(sql, params || [])),
    execute: (sql: string, params?: any[]) => Promise.resolve(mockQuery(sql, params || [])),
    getConnection: () => Promise.resolve(mockConn),
    end: () => Promise.resolve(),
  } as unknown as Pool;
}

export async function getPool(): Promise<Pool> {
  if (globalThis.__platformMock) {
    return createMockPool();
  }
  if (!globalThis.__platformReady) {
    globalThis.__platformReady = createPool().catch((e) => {
      globalThis.__platformReady = undefined;
      // MySQL 不可用，切换到 mock 模式
      console.warn('[db] MySQL unavailable, falling back to mock data:', e?.message || e);
      globalThis.__platformMock = true;
      return createMockPool();
    });
  }
  return globalThis.__platformReady;
}

export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const pool = await getPool();
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows as T[];
}

export async function one<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows.length ? rows[0] : null;
}

export async function exec(sql: string, params: any[] = []): Promise<ResultSetHeader> {
  const pool = await getPool();
  const [res] = await pool.query<ResultSetHeader>(sql, params);
  return res;
}

/** 事务:活动报名等并发不变量场景使用 */
export async function tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback().catch(() => undefined);
    throw e;
  } finally {
    conn.release();
  }
}

/* DATETIME -> ISO8601 */
export const T = (col: string, alias?: string) =>
  `DATE_FORMAT(${col}, '%Y-%m-%dT%H:%i:%sZ') AS ${alias || col.split('.').pop()}`;

/**
 * 幂等确保关键索引存在。仅在 createPool 时执行一次(全局单例),
 * 避免缺失索引导致高频查询(在线人数、聊天列表、关注流等)全表扫描。
 * 通过 information_schema 判断,已存在则跳过;ALTER 失败仅告警不阻断启动。
 */
async function ensureIndexes(pool: Pool): Promise<void> {
  const needed: Array<[string, string, string]> = [
    ['live_viewers', 'idx_lv_room_seen', 'room_id, last_seen'],
    ['live_messages', 'idx_lm_room_created', 'room_id, created_at'],
    ['contents', 'idx_c_author_status', 'author_id, status'],
    ['contents', 'idx_c_status_created', 'status, created_at'],
    ['follows', 'idx_f_follower', 'follower_id'],
    ['follows', 'idx_f_followee', 'followee_id'],
    ['notifications', 'idx_n_user_read', 'user_id, `read`'],
    ['messages', 'idx_m_conv', 'from_id, to_id'],
    ['prayers', 'idx_p_user', 'user_id'],
    ['comments', 'idx_cm_content', 'content_id'],
    // 圣经:9.3 万行,章节查询与每日经文池都依赖该索引
    ['bible_verses', 'idx_bv_lookup', 'version, book_id, chapter'],
    // 内容列表排序 / 类型筛选
    ['contents', 'idx_c_type', 'content_type'],
    ['contents', 'idx_c_like', 'like_count'],
    // 活动报名与列表
    ['activity_registrations', 'idx_ar_activity_status', 'activity_id, status'],
    ['activity_registrations', 'idx_ar_user', 'user_id'],
    // 媒体与通知
    ['media_files', 'idx_mf_owner', 'owner_id'],
    ['notifications', 'idx_n_user_created', 'user_id, created_at'],
    // 团契成员 / 私信时间线
    ['group_members', 'idx_gm_group', 'group_id'],
    ['group_members', 'idx_gm_user', 'user_id'],
    ['messages', 'idx_m_created', 'created_at'],
  ];
  for (const [table, idx, cols] of needed) {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [DB_CONFIG.database, table, idx]
      );
      if (!rows.length) {
        await pool.query(`ALTER TABLE \`${table}\` ADD INDEX \`${idx}\` (${cols})`);
        console.log(`[db] ensureIndexes: added ${table}.${idx}`);
      }
    } catch (e: any) {
      console.warn(`[db] ensureIndexes skip ${table}.${idx}:`, e?.message);
    }
  }
}

/**
 * 补列:CREATE TABLE IF NOT EXISTS 不会给已存在的表加新列,
 * 因此后续新增字段统一登记在这里,启动时幂等补齐。
 */
async function ensureColumns(pool: Pool): Promise<void> {
  const needed: Array<[string, string, string]> = [
    // 微信身份(服务号 openid / 开放平台 unionid),用于消息推送
    // 用 NULL 而非空串:唯一索引允许多个 NULL,但不允许多个 ''
    ['users', 'wechat_openid', 'VARCHAR(64) NULL DEFAULT NULL'],
    ['users', 'wechat_unionid', 'VARCHAR(64) NOT NULL DEFAULT \'\''],
    ['users', 'wechat_nickname', 'VARCHAR(120) NOT NULL DEFAULT \'\''],
    ['users', 'wechat_bound_at', 'DATETIME NULL'],
    // 手机号(短信通道)
    ['users', 'phone', 'VARCHAR(32) NOT NULL DEFAULT \'\''],
    ['users', 'phone_verified', 'TINYINT(1) NOT NULL DEFAULT 0'],
    // 头像图片地址(为空则用 avatar_color 生成的字母头像)
    ['users', 'avatar_url', 'VARCHAR(512) NOT NULL DEFAULT \'\''],
    // 隐私设置：谁可以给我发私信
    ['users', 'allow_dm', "VARCHAR(16) NOT NULL DEFAULT 'everyone'"],
    // 群公告
    ['groups', 'announcement', "VARCHAR(1000) NOT NULL DEFAULT ''"],
    ['groups', 'announced_at', 'DATETIME NULL'],
    // 活动地点坐标(WGS-84)
    ['activities', 'lat', 'DECIMAL(10,8) NULL'],
    ['activities', 'lng', 'DECIMAL(11,8) NULL'],
    // 诗歌和弦谱与原调
    ['songs', 'chords', 'TEXT NOT NULL'],
    ['songs', 'original_key', "VARCHAR(8) NOT NULL DEFAULT ''"],
  ];
  for (const [table, col, ddl] of needed) {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
        [DB_CONFIG.database, table, col]
      );
      if (!rows.length) {
        await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${ddl}`);
        console.log(`[db] ensureColumns: added ${table}.${col}`);
      }
    } catch (e: any) {
      console.warn(`[db] ensureColumns skip ${table}.${col}:`, e?.message);
    }
  }
  // openid 全局唯一:同一微信不能绑两个账号
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT 1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND INDEX_NAME = 'uk_users_wechat_openid' LIMIT 1`,
      [DB_CONFIG.database]
    );
    if (!rows.length) {
      await pool.query(`ALTER TABLE \`users\` ADD UNIQUE KEY \`uk_users_wechat_openid\` (\`wechat_openid\`)`);
      console.log('[db] ensureColumns: added users.uk_users_wechat_openid');
    }
  } catch (e: any) {
    console.warn('[db] ensureColumns skip users.uk_users_wechat_openid:', e?.message);
  }
}
