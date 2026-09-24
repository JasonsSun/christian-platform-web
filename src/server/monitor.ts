/**
 * 错误监控抽象层。
 *
 * 目标：线上出 500 时不再只能靠翻日志猜。
 *
 * 设计：
 * - 默认实现 = 结构化日志（单行 JSON，便于 docker logs / 文件采集 / 后续接 ELK）。
 * - 设了 SENTRY_DSN 则额外上报到 Sentry（走 HTTPS webhook，不需要装 SDK，
 *   保持零依赖；装了 @sentry/nextjs 的项目可直接替换 send 实现）。
 * - 4xx 业务错误只记 debug 不打错误级噪音；5xx 与未捕获异常才是错误级。
 * - 错误级的那部分同时写进 MySQL 表 error_events（见 ./errorEvents）：进程内那份
 *   环形缓冲重启就没了，本地边看边报的问题全靠它取证。
 * - 采样可配，避免异常风暴把监控配额打满。
 */

import { recordErrorEvent } from './errorEvents';

export type Severity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export interface ErrorContext {
  /** 出错位置，如 api:/api/v1/xxx 或 page:/bible */
  scope?: string;
  /** 当前用户 id（已登录时） */
  userId?: string;
  /** 请求方法与路径 */
  method?: string;
  path?: string;
  /** HTTP 状态码 */
  status?: number;
  /** 业务错误码 */
  code?: string;
  /** 额外上下文 */
  extra?: Record<string, unknown>;
}

const DSN = process.env.SENTRY_DSN || '';
const SAMPLE_RATE = Number(process.env.MONITOR_SAMPLE_RATE || 1);
const ENV = process.env.NODE_ENV || 'development';
const RELEASE = process.env.APP_VERSION || process.env.npm_package_version || 'unknown';

/** 最近若干条错误，供 /api/v1/admin/errors 快速回看（不想接外部服务也能看到） */
const RECENT_MAX = 100;
const recent: Array<{ at: string; level: Severity; message: string; ctx: ErrorContext }> = [];

function sampleOk(): boolean {
  if (SAMPLE_RATE >= 1) return true;
  if (SAMPLE_RATE <= 0) return false;
  return Math.random() < SAMPLE_RATE;
}

function pushRecent(level: Severity, message: string, ctx: ErrorContext) {
  recent.unshift({ at: new Date().toISOString(), level, message, ctx });
  if (recent.length > RECENT_MAX) recent.length = RECENT_MAX;
}

/** 取最近错误（管理后台用） */
export function recentErrors(limit = 50) {
  return recent.slice(0, Math.max(1, Math.min(limit, RECENT_MAX)));
}

function logLine(level: Severity, message: string, ctx: ErrorContext) {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    env: ENV,
    release: RELEASE,
    msg: message,
    ...(ctx.scope ? { scope: ctx.scope } : {}),
    ...(ctx.userId ? { userId: ctx.userId } : {}),
    ...(ctx.method ? { method: ctx.method } : {}),
    ...(ctx.path ? { path: ctx.path } : {}),
    ...(ctx.status != null ? { status: ctx.status } : {}),
    ...(ctx.code ? { code: ctx.code } : {}),
  });
  if (level === 'error' || level === 'fatal') console.error(line);
  else if (level === 'warning') console.warn(line);
  else console.log(line);
}

/**
 * 解析 Sentry DSN。
 * 形如 https://<publicKey>@<host>/<projectId>
 */
function parseDsn(dsn: string): { endpoint: string; publicKey: string } | null {
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    if (!publicKey) return null;
    const projectId = u.pathname.replace(/^\/+/, '');
    if (!projectId) return null;
    const endpoint = `${u.protocol}//${u.host}/api/${projectId}/store/`;
    return { endpoint, publicKey };
  } catch {
    return null;
  }
}

/** 上报到 Sentry（fire-and-forget，失败不影响主流程） */
function reportToSentry(level: Severity, err: unknown, ctx: ErrorContext) {
  if (!DSN) return;
  const parsed = parseDsn(DSN);
  if (!parsed) return;

  const e = err as any;
  const payload = {
    event_id: (globalThis.crypto?.randomUUID?.() || String(Date.now())).replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    level,
    environment: ENV,
    release: RELEASE,
    platform: 'node',
    logger: ctx.scope || 'server',
    ...(ctx.userId ? { user: { id: ctx.userId } } : {}),
    ...(ctx.path ? { transaction: `${ctx.method || ''} ${ctx.path}`.trim() } : {}),
    exception: [
      {
        type: e?.name || 'Error',
        value: String(e?.message || err).slice(0, 2000),
        stacktrace: e?.stack
          ? {
              frames: String(e.stack)
                .split('\n')
                .slice(1, 30)
                .map((l) => ({ filename: l.trim() }))
                .reverse(),
            }
          : undefined,
      },
    ],
    extra: ctx.extra || {},
    tags: { ...(ctx.code ? { code: ctx.code } : {}), ...(ctx.status ? { status: ctx.status } : {}) },
  };

  void fetch(parsed.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=custom/1.0`,
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    /* 上报失败不能影响业务 */
  });
}

/** 记录一个已知异常 */
export function captureException(err: unknown, ctx: ErrorContext = {}, level: Severity = 'error') {
  const message = (err as any)?.message || String(err);
  // 5xx 与未分类异常走错误级；4xx 业务异常降级，避免告警噪音
  const effective: Severity =
    level === 'error' && typeof ctx.status === 'number' && ctx.status < 500 ? 'warning' : level;

  pushRecent(effective, message, ctx);
  logLine(effective, message, ctx);
  if (effective === 'error' || effective === 'fatal') {
    // 内存环形缓冲重启即清空，错误级的那部分同时落库，事后才查得到堆栈
    recordErrorEvent({
      level: effective,
      message,
      stack: (err as any)?.stack,
      scope: ctx.scope,
      method: ctx.method,
      path: ctx.path,
      status: ctx.status,
      code: ctx.code,
      userId: ctx.userId,
    });
    if (sampleOk()) reportToSentry(effective, err, ctx);
  }
}

/** 记录一条消息（非异常） */
export function captureMessage(message: string, ctx: ErrorContext = {}, level: Severity = 'info') {
  pushRecent(level, message, ctx);
  logLine(level, message, ctx);
  if ((level === 'error' || level === 'fatal') && sampleOk()) {
    reportToSentry(level, new Error(message), ctx);
  }
}

/** 是否已接入外部监控（后台可显示状态） */
export function monitorEnabled(): { sentry: boolean; sampleRate: number } {
  return { sentry: !!DSN, sampleRate: SAMPLE_RATE };
}
