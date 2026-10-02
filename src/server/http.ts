import { NextResponse } from 'next/server';

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });

/**
 * fail() 造出来的响应上的记账标记。抛 Response 的守卫（`throw forbidden()` 那一类）
 * 到 catch 时只剩一个不透明 Response，读 body 又会把它消费掉，所以在造的那一刻就把
 * status/code/message 挂在对象上。
 */
const BIZ = Symbol.for('platform.bizFail');

export const fail = (status: number, code: string, message?: string) => {
  const res = NextResponse.json(
    { code, message: message || code, timestamp: new Date().toISOString() },
    { status },
  );
  (res as any)[BIZ] = { status, code, message: message || code };
  return res;
};

export const badRequest = (m = '参数错误') => fail(400, 'BAD_REQUEST', m);
export const unauthorized = (m = '未登录或令牌无效') => fail(401, 'UNAUTHORIZED', m);
export const forbidden = (m = '没有权限执行该操作') => fail(403, 'FORBIDDEN', m);
export const notFound = (m = '资源不存在') => fail(404, 'NOT_FOUND', m);
export const conflict = (m = '资源冲突') => fail(409, 'CONFLICT', m);

/** 会改变数据的请求方法（维护模式下需要拦截） */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 维护模式守卫：拦截写操作，管理员豁免，GET 一律放行。
 * 动态 import 避免 http.ts ↔ auth.ts 的顶层循环依赖；
 * 配置读取失败（表不存在 / DB 不可用）时不阻断业务。
 */
async function assertWritable(req: any) {
  // 认证入口(登录/注册/刷新令牌等)与内部定时任务在维护期都必须可用:前者否则所有人都登
  // 不进去(连管理员也进不了后台关维护);后者是系统级作业,不该被面向用户的开关停掉。
  const rawUrl = typeof req?.url === 'string' ? req.url : '';
  if (/\/api\/v1\/(auth|cron)\//.test(rawUrl)) return;
  let maintenance = false;
  try {
    const { getBool, getSetting } = await import('./settings');
    maintenance = await getBool('maintenance_mode', false);
    if (!maintenance) return;
    const notice = await getSetting('maintenance_notice', '平台正在维护中，请稍后再试');
    const { currentUser } = await import('./auth');
    const u = await currentUser(req).catch(() => null);
    if (u?.role === 'admin') return; // 管理员在维护期仍要能操作后台
    throw new HttpError(503, 'MAINTENANCE', notice);
  } catch (e) {
    if (e instanceof HttpError) throw e;
  }
}

/** 统一异常处理包装 */
export function withApi<T extends any[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    // 提到 try 外：catch 里也要用它拼错误上下文
    const first: any = args[0];
    try {
      const method = typeof first?.method === 'string' ? first.method.toUpperCase() : '';
      if (WRITE_METHODS.has(method)) await assertWritable(first);
      // 模块开关：命中已下线模块的接口一律 403（管理员/该模块审核员豁免）
      if (typeof first?.url === 'string') {
        const { assertModuleOpen } = await import('./modules');
        await assertModuleOpen(first);
      }
      return await fn(...args);
    } catch (e: any) {
      if (e instanceof HttpError) {
        // 业务异常也进监控，但 4xx 会降级为 warning，不触发告警噪音
        const { captureException } = await import('./monitor');
        captureException(e, {
          scope: 'api',
          method: typeof first?.method === 'string' ? first.method : '',
          path: typeof first?.url === 'string' ? safePath(first.url) : '',
          status: e.status,
          code: e.code,
        });
        return fail(e.status, e.code, e.message);
      }
      // 兼容 `throw notFound(...)` 这类直接抛出 Response 的写法。
      // 以前这一支只 return、不记账，于是全站 139 处 `throw forbidden()/notFound()/...`
      // 的失败在「最近错误」里根本不存在，同一个「没有权限」写成 HttpError 看得见、
      // 写成 Response 就看不见。补上记账；401 单独排除 —— 它是令牌刷新流程的常规信号
      // （#59 就是为了消 401 噪音才让未登录访客不再打 /me/*），让它灌进只有 100 格的
      // 环形缓冲，真 500 会被挤出去。
      if (e instanceof Response) {
        const biz = (e as any)[BIZ];
        if (biz && biz.status !== 401) {
          const { captureException } = await import('./monitor');
          captureException(new Error(biz.message), {
            scope: 'api',
            method: typeof first?.method === 'string' ? first.method : '',
            path: typeof first?.url === 'string' ? safePath(first.url) : '',
            status: biz.status,
            code: biz.code,
          });
        }
        return e;
      }
      // 未捕获异常 = 真正的 500，必须进监控
      const { captureException } = await import('./monitor');
      captureException(e, {
        scope: 'api',
        method: typeof first?.method === 'string' ? first.method : '',
        path: typeof first?.url === 'string' ? safePath(first.url) : '',
        status: 500,
        code: 'INTERNAL_ERROR',
      });
      // 生产环境不回传内部异常信息（避免泄漏 SQL/路径等细节给客户端）
      const detail =
        process.env.NODE_ENV === 'production'
          ? '服务器内部错误，请稍后重试'
          : e?.message || '服务器内部错误';
      return fail(500, 'INTERNAL_ERROR', detail);
    }
  };
}

export async function readJson<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', '请求体不是合法 JSON');
  }
}

/** 读取纯文本请求体(微信事件回调是 XML) */
export async function readText(req: Request): Promise<string> {
  try {
    return await req.text();
  } catch {
    return '';
  }
}

export function num(v: any, def: number): number {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * 只取 URL 的 path 部分（去掉 query 与 hash）。
 * 用于日志/监控：query 里可能带 token、验证码等敏感参数，不能原样落盘。
 */
export function safePath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return String(url || '').split('?')[0].slice(0, 200);
  }
}

/**
 * 客户端真实 IP。
 * 接入 CDN（Cloudflare）后 REMOTE_ADDR 全是 CDN 节点,若不处理,
 * IP 限流(注册/登录 5 次/10 分钟)会把所有访客当成同一个 IP 互相连坐。
 * 两种取法:
 *  1) nginx 用 real_ip 模块(set_real_ip_from CF 段 + real_ip_header CF-Connecting-IP)
 *     把 X-Real-IP 改写成真实 IP —— 推荐,无需额外开关;
 *  2) 直接信任 CDN 头,需显式开 TRUST_CDN_HEADER=1(默认关闭,
 *     否则任何人都能伪造 CF-Connecting-IP 绕过限流)。
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  if (process.env.TRUST_CDN_HEADER === '1') {
    const cdn = h.get('cf-connecting-ip') || h.get('true-client-ip');
    if (cdn) return cdn.trim();
  }
  return (h.get('x-real-ip') || h.get('x-forwarded-for') || '127.0.0.1').split(',')[0].trim();
}
