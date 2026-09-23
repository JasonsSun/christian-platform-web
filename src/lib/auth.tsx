'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiPost, tokenStore } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string, captcha?: { captchaId: string; captchaCode: string }) => Promise<User>;
  /** 双因素第二步：票据 + 动态码换正式令牌 */
  login2fa: (ticket: string, code: string) => Promise<User>;
  register: (payload: { username: string; email: string; password: string; displayName?: string; captchaId?: string; captchaCode?: string; inviteCode?: string }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      return;
    }
    const me = async () => (await import('./api')).apiGet<User>('/auth/me');
    try {
      setUser(await me());
    } catch (e: any) {
      // 只有服务器明确拒收令牌才算登录失效。/auth/me 撞上 5xx、超时或断网时旧代码把
      // access+refresh 一起清掉：用户在 /donate/new 填了一半，刷新一下就被踢回登录页，
      // 还得重输密码（实测复验里三条路由整体「落在 /login」就是这么来的）。
      if (e?.status === 401) {
        tokenStore.clear();
        setUser(null);
        return;
      }
      await new Promise((r) => setTimeout(r, 1200));
      try {
        setUser(await me());
      } catch {
        // 还是不行：这一趟当未登录，令牌留着 —— 网络恢复后再进页面就回来了
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    loadMe().finally(() => setLoading(false));
  }, [loadMe]);

  const login = useCallback(async (identifier: string, password: string, captcha?: { captchaId: string; captchaCode: string }) => {
    const data = await apiPost<{
      user: User;
      accessToken: string;
      refreshToken: string;
      require2fa?: boolean;
      ticket?: string;
    }>('/auth/login', {
      identifier,
      password,
      ...(captcha ? { captchaId: captcha.captchaId, captchaCode: captcha.captchaCode } : {}),
    });

    // 开了双因素：不落 token，把票据抛给调用方，由它引导用户输入动态码
    if (data.require2fa && data.ticket) {
      const err: any = new Error('需要双因素验证');
      err.code = 'REQUIRE_2FA';
      err.ticket = data.ticket;
      throw err;
    }

    tokenStore.set(data.accessToken);
    tokenStore.setRefresh(data.refreshToken);
    setUser(data.user);
    return data.user;
  }, []);

  /** 双因素第二步：用票据 + 动态码（或恢复码）换正式令牌 */
  const login2fa = useCallback(async (ticket: string, code: string) => {
    const data = await apiPost<{ user: User; accessToken: string }>('/auth/2fa/verify', {
      ticket,
      code,
    });
    // refreshToken 在登录第一步已下发并写入 localStorage，这里只更新 access
    tokenStore.set(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(
    async (payload: { username: string; email: string; password: string; displayName?: string; captchaId?: string; captchaCode?: string; inviteCode?: string }) => {
      const data = await apiPost<{ user: User; accessToken: string; refreshToken: string }>('/auth/register', payload);
      tokenStore.set(data.accessToken);
      tokenStore.setRefresh(data.refreshToken);
      setUser(data.user);
      return data.user;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout', { refreshToken: tokenStore.getRefresh() });
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, login2fa, register, logout, refresh: loadMe, setUser }),
    [user, loading, login, login2fa, register, logout, loadMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
