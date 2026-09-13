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

/** 统一异常处理包装 */
export function withApi<T extends any[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
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

export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get('x-forwarded-for') || h.get('x-real-ip') || '127.0.0.1').split(',')[0].trim();
}
