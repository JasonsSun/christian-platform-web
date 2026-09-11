export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';

const ACCESS_KEY = 'platform_access_token';
const REFRESH_KEY = 'platform_refresh_token';

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

async function refreshOnce(): Promise<boolean> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  try {
    const r = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!r.ok) return false;
    const data = await r.json();
    if (data.accessToken) {
      tokenStore.set(data.accessToken);
      if (data.refreshToken) tokenStore.setRefresh(data.refreshToken);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function api<T = any>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

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
    throw new ApiError(res.status, data?.code || `HTTP_${res.status}`, data?.message || '请求失败');
  }
  return data as T;
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
  return fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: form })
    .then(async (res) => {
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!res.ok) throw new ApiError(res.status, data?.code || `HTTP_${res.status}`, data?.message || '请求失败');
      return data as T;
    });
};

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
};
