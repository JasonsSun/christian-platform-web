'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiPost, tokenStore } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string, captcha?: { captchaId: string; captchaCode: string }) => Promise<User>;
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
    try {
      const me = await (await import('./api')).apiGet<User>('/auth/me');
      setUser(me);
    } catch {
      tokenStore.clear();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    loadMe().finally(() => setLoading(false));
  }, [loadMe]);

  const login = useCallback(async (identifier: string, password: string, captcha?: { captchaId: string; captchaCode: string }) => {
    const data = await apiPost<{ user: User; accessToken: string; refreshToken: string }>('/auth/login', {
      identifier,
      password,
      ...(captcha ? { captchaId: captcha.captchaId, captchaCode: captcha.captchaCode } : {}),
    });
    tokenStore.set(data.accessToken);
    tokenStore.setRefresh(data.refreshToken);
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
    () => ({ user, loading, login, register, logout, refresh: loadMe, setUser }),
    [user, loading, login, register, logout, loadMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
