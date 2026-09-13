export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';

const ACCESS_KEY = 'platform_access_token';
const REFRESH_KEY = 'platform_refresh_token';

/**
 * 请求超时。此前 fetch 没有任何超时：服务端一旦卡住（慢查询、上游挂起），
 * 页面会永远停在 loading 且没有任何提示。这里统一兜住。
 */
const API_TIMEOUT_MS = 30_000;
/** 上传/表单类请求放宽 */
const FORM_TIMEOUT_MS = 120_000;
/** 刷新令牌要快进快出 */
const REFRESH_TIMEOUT_MS = 10_000;

export const tokenStore = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY)),
  set: (t: string) => typeof window !== 'undefined' && localStorage.setItem(ACCESS_KEY, t),
  getRefresh: () => (typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY)),
  setRefresh: (t: string) => typeof window !== 'undefined' && localStorage.setItem(REFRESH_KEY, t),
  clear: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** 把 fetch 抛出的异常统一翻译成人话 */
function toApiError(e: any): ApiError {
  if (e instanceof ApiError) return e;
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
    return new ApiError(0, 'TIMEOUT', '请求超时，请检查网络后重试');
  }
  return new ApiError(0, 'NETWORK_ERROR', '网络异常，请检查网络后重试');
}

function friendlyMessage(status: number, fallback?: string): string {
  if (fallback) return fallback;
  if (status >= 500) return '服务暂时不可用，请稍后重试';
  return '请求失败';
}

async function refreshOnce(): Promise<boolean> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  try {
    const r = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
      signal: controller.signal,
    });
    if (!r.ok) return false;
    const data = await r.json();
    if (data.accessToken) {
      tokenStore.set(data.accessToken);
      if (data.refreshToken) tokenStore.setRefresh(data.refreshToken);
      return true;
    }
  } catch {
    /* 刷新失败按未登录处理 */
  } finally {
    clearTimeout(timer);
  }
  return false;
}

export async function api<T = any>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      // 调用方显式传了 signal 就尊重它，否则用超时控制
      signal: init.signal ?? controller.signal,
    });

    if (res.status === 401 && retry && token) {
      const okRefresh = await refreshOnce();
      if (okRefresh) return api<T>(path, init, false);
      tokenStore.clear();
    }

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      throw new ApiError(res.status, data?.code || `HTTP_${res.status}`, friendlyMessage(res.status, data?.message));
    }
    return data as T;
  } catch (e: any) {
    throw toApiError(e);
  } finally {
    clearTimeout(timer);
  }
}

export const apiGet = <T = any>(path: string) => api<T>(path);
export const apiPost = <T = any>(path: string, body?: any) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPatch = <T = any>(path: string, body?: any) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
export const apiDelete = <T = any>(path: string, body?: any) =>
  api<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) });

/** multipart/form-data 上传（投稿带文件时用，不手动设 Content-Type） */
export const apiForm = <T = any>(path: string, form: FormData) => {
  const headers = new Headers();
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORM_TIMEOUT_MS);
  return fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: form, signal: controller.signal })
    .then(async (res) => {
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        throw new ApiError(res.status, data?.code || `HTTP_${res.status}`, friendlyMessage(res.status, data?.message));
      }
      return data as T;
    }, (e: any) => {
      throw toApiError(e);
    })
    .finally(() => clearTimeout(timer));
};

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
};
