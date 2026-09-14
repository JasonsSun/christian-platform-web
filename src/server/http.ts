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

export const fail = (status: number, code: string, message?: string) =>
  NextResponse.json({ code, message: message || code, timestamp: new Date().toISOString() }, { status });

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
    try {
      const first: any = args[0];
      const method = typeof first?.method === 'string' ? first.method.toUpperCase() : '';
      if (WRITE_METHODS.has(method)) await assertWritable(first);
      // 模块开关：命中已下线模块的接口一律 403（管理员/该模块审核员豁免）
      if (typeof first?.url === 'string') {
        const { assertModuleOpen } = await import('./modules');
        await assertModuleOpen(first);
      }
      return await fn(...args);
    } catch (e: any) {
      if (e instanceof HttpError) return fail(e.status, e.code, e.message);
      // 兼容 `throw notFound(...)` 这类直接抛出 Response 的写法
      if (e instanceof Response) return e;
      console.error('[api-error]', e);
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
