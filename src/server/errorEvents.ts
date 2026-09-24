/**
 * 5xx 异常落库。
 *
 * monitor.ts 原有的「最近错误」是进程内环形缓冲，重启即清空 —— 用户报「某一页红色
 * 服务器内部错误」时，只要中间重启过一次（本地开发一天要重好几回），现场就没了，
 * 只能靠猜。这里把错误级的那部分写进 MySQL，堆栈一起存，事后查得到。
 *
 * 三条硬约束：
 *  1. 写入是 fire-and-forget，任何情况下都不往上抛 —— 记错误自己再把请求打成 500
 *     就是笑话；也绝不回调 captureException，否则一次数据库故障会递归写不停。
 *  2. 写失败就静默 60 秒。数据库挂了的时候，每个请求都再去撞一次连接池，等于在
 *     故障上再叠一层故障。
 *  3. 限流 + 保留窗口。异常风暴不该把错误表写成一张新的事实表。
 */

import { exec, newId, one, q, ts } from './db';

/** 保留窗口：行数与天数各管一头，谁先到算谁 */
const MAX_ROWS = 2000;
const KEEP_DAYS = 30;
/** 每分钟最多落库这么多条，超了直接丢（内存缓冲和结构化日志不受影响） */
const PER_MINUTE_CAP = 60;
/** 写入失败后的静默期 */
const BACKOFF_MS = 60_000;
const PRUNE_EVERY_MS = 5 * 60_000;

const MESSAGE_MAX = 500;
const PATH_MAX = 190;
const STACK_MAX = 4000;

export interface ErrorEventInput {
  level: string;
  message: string;
  stack?: string;
  scope?: string;
  method?: string;
  path?: string;
  status?: number;
  code?: string;
  userId?: string;
}

export interface ErrorEventRow {
  id: string;
  at: string;
  level: string;
  message: string;
  stack: string;
  scope: string;
  method: string;
  path: string;
  status: number | null;
  code: string;
  userId: string;
}

let ensured = false;
let disabledUntil = 0;
let windowStart = 0;
let windowCount = 0;
let prunedAt = 0;

async function ensure(): Promise<void> {
  if (ensured) return;
  // 运行时幂等建表，不写进 schema.sql：和 favoriteFolders 同一套理由 ——
  // schema 里任何一句 throw 都会让整个 bootstrap 回退到 mock 模式，
  // 而这张表纯粹是排障用的旁路，不该有本事把站打回假数据。
  // user_id 故意不建外键：注销账号不该顺手把当时的错误现场一起级联删掉。
  await exec(`CREATE TABLE IF NOT EXISTS error_events (
    id         CHAR(36)     NOT NULL PRIMARY KEY,
    level      VARCHAR(12)  NOT NULL,
    message    VARCHAR(500) NOT NULL,
    stack      TEXT         NULL,
    scope      VARCHAR(60)  NOT NULL DEFAULT '',
    method     VARCHAR(10)  NOT NULL DEFAULT '',
    path       VARCHAR(190) NOT NULL DEFAULT '',
    status     SMALLINT     NULL,
    code       VARCHAR(40)  NOT NULL DEFAULT '',
    user_id    CHAR(36)     NULL,
    created_at DATETIME     NOT NULL,
    KEY idx_ee_created (created_at),
    KEY idx_ee_path (path)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  ensured = true;
}

const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);

/** 超龄与超量的行一起收掉。两个数字都是本文件的常量，拼进 SQL 没有注入面。 */
async function prune(): Promise<void> {
  const now = Date.now();
  if (now - prunedAt < PRUNE_EVERY_MS) return;
  prunedAt = now;
  await exec(`DELETE FROM error_events WHERE created_at < ?`, [ts(now - KEEP_DAYS * 864e5)]);
  const edge = await one<{ at: string }>(
    `SELECT created_at AS at FROM error_events ORDER BY created_at DESC LIMIT 1 OFFSET ${MAX_ROWS}`
  );
  if (edge) await exec(`DELETE FROM error_events WHERE created_at <= ?`, [edge.at]);
}

async function persist(input: ErrorEventInput): Promise<void> {
  await ensure();
  await exec(
    `INSERT INTO error_events
       (id, level, message, stack, scope, method, path, status, code, user_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      newId('err'),
      clip(input.level, 12),
      clip(input.message, MESSAGE_MAX),
      clip(input.stack, STACK_MAX),
      clip(input.scope, 60),
      clip(input.method, 10),
      clip(input.path, PATH_MAX),
      typeof input.status === 'number' ? input.status : null,
      clip(input.code, 40),
      input.userId ? clip(input.userId, 36) : null,
      ts(),
    ]
  );
  await prune();
}

/** 记一条错误级事件。同步返回，不等数据库。 */
export function recordErrorEvent(input: ErrorEventInput): void {
  if (globalThis.__platformMock) return;
  // 只存 500 与无状态码的崩溃。502/503 是对外声明的状态（维护模式、上游/依赖不可用），
  // 不是崩溃现场，却会按请求量在维护窗口里把这张表刷满，把真正的堆栈挤出去。
  if (typeof input.status === 'number' && input.status >= 502) return;
  const now = Date.now();
  if (now < disabledUntil) return;
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (++windowCount > PER_MINUTE_CAP) return;
  persist(input).catch((e) => {
    // 只警告，不 captureException —— 那会递归。失败后静默一分钟，
    // 免得数据库自己挂掉时每个请求都再排一次连接池。
    disabledUntil = now + BACKOFF_MS;
    ensured = false;
    console.warn('[monitor] 错误落库失败，60 秒内不再尝试:', e?.message || e);
  });
}

/** 读落库的错误（管理后台用）。表还没建好或数据库不可用时回空数组，不打断接口。 */
export async function listErrorEvents(limit = 50): Promise<ErrorEventRow[]> {
  if (globalThis.__platformMock) return [];
  const n = Math.max(1, Math.min(Number(limit) || 50, 200));
  try {
    await ensure();
    const rows = await q<any>(
      `SELECT id, level, message, stack, scope, method, path, status, code, user_id,
              DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS at
       FROM error_events ORDER BY created_at DESC, id DESC LIMIT ${n}`,
      []
    );
    return rows.map((r) => ({
      id: String(r.id),
      at: String(r.at || ''),
      level: String(r.level || 'error'),
      message: String(r.message || ''),
      stack: String(r.stack || ''),
      scope: String(r.scope || ''),
      method: String(r.method || ''),
      path: String(r.path || ''),
      status: r.status == null ? null : Number(r.status),
      code: String(r.code || ''),
      userId: String(r.user_id || ''),
    }));
  } catch {
    return [];
  }
}
