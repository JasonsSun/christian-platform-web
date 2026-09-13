'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { apiGet } from '@/lib/api';
import { safeNext } from '@/lib/nav';

function LoginInner() {
  const params = useSearchParams();
  const modeParam = params.get('mode');
  const nextPath = safeNext(params.get('next'));
  // 带邀请码进来时直接落到注册页，减少一步跳转流失
  const inviteCode = (params.get('invite') || '').trim().toUpperCase();
  const initialMode = modeParam === 'register' || inviteCode ? 'register' : 'login';
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const router = useRouter();
  const { login, register, user } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 图形验证码状态
  const [captchaId, setCaptchaId] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaError, setCaptchaError] = useState('');

  // 拉取一张新验证码（首次进入、切换模式、提交失败后调用）
  async function loadCaptcha() {
    try {
      const data = await apiGet<{ id: string; svg: string }>('/auth/captcha');
      setCaptchaId(data.id);
      setCaptchaSvg(data.svg);
      setCaptchaCode('');
      setCaptchaError('');
    } catch {
      /* 静默失败，下次提交或切换模式会再试 */
    }
  }

  // 首次进入与切换模式时刷新验证码
  useEffect(() => {
    loadCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (user && !loading) {
    // 已登录则跳转（带 next 时回到来源页）
    router.push(nextPath);
  }

  function validate(): string | null {
    if (mode === 'register') {
      if (!displayName.trim()) return '请填写昵称';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return '请输入有效的邮箱';
      if (password.length < 6) return '密码至少 6 位';
    } else {
      if (!identifier.trim()) return '请输入账号';
      if (!password) return '请输入密码';
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCaptchaError('');
    const v = validate();
    if (v) { setError(v); return; }
    if (!captchaCode.trim()) { setCaptchaError('请输入验证码'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(identifier.trim(), password, { captchaId, captchaCode: captchaCode.trim() });
      } else {
        await register({
          username: identifier.trim(),
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          captchaId,
          captchaCode: captchaCode.trim(),
          inviteCode: inviteCode || undefined,
        });
      }
      router.push(nextPath);
    } catch (e: any) {
      // 验证码相关错误：在验证码下方提示并刷新验证码
      if (e?.code === 'CAPTCHA_INVALID' || e?.code === 'TOO_MANY_ATTEMPTS') {
        setCaptchaError(e.message || '验证码错误或已过期');
        loadCaptcha();
      } else {
        setError(e?.message || '操作失败');
        loadCaptcha(); // 提交失败后自动刷新验证码
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center py-20">
      <div className="absolute inset-0 bg-animated-gradient" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-gold-400/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary-300/20 rounded-full blur-3xl animate-float-slow" />
      </div>

      <div className="relative z-10 max-w-md w-full mx-4">
        <div className="glass rounded-3xl p-8 md:p-10 shadow-card-hover">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mx-auto mb-4 shadow-glow">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m9-9H3" /></svg>
            </div>
            <h1 className="font-display text-3xl font-bold text-ink-900 mb-2">{mode === 'login' ? '欢迎回来' : '创建账号'}</h1>
            <p className="text-ink-500">{mode === 'login' ? '登录圣约社区，继续你的属灵之旅' : '加入圣约社区，与弟兄姐妹彼此建立'}</p>
          </div>

          {/* 模式切换 */}
          <div className="flex bg-ink-100 rounded-xl p-1 mb-6">
            <button onClick={() => { setMode('login'); setError(''); }} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === 'login' ? 'bg-white text-primary-700 shadow' : 'text-ink-500'}`}>登录</button>
            <button onClick={() => { setMode('register'); setError(''); }} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === 'register' ? 'bg-white text-primary-700 shadow' : 'text-ink-500'}`}>注册</button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {inviteCode && mode === 'register' && (
              <div className="rounded-xl bg-primary-50 border border-primary-100 px-4 py-3 text-sm text-primary-800">
                你正通过好友邀请注册（邀请码 <b className="font-mono">{inviteCode}</b>），注册后你和对方都会获得成长奖励。
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">{mode === 'register' ? '用户名' : '账号'}</label>
              <input className="input-styled" placeholder={mode === 'register' ? '登录用的用户名' : '用户名 / 邮箱'} value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">昵称</label>
                  <input className="input-styled" placeholder="显示名称" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">邮箱</label>
                  <input type="email" className="input-styled" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">密码</label>
              <div className="relative">
                <input className="input-styled" type={showPassword ? 'text' : 'password'} placeholder="请输入密码" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
                  {showPassword ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </div>
            )}

            {/* 图形验证码 */}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">验证码</label>
              <div className="flex items-stretch gap-3">
                <input
                  className="input-styled flex-1 min-w-0"
                  placeholder="请输入右侧字符"
                  value={captchaCode}
                  maxLength={4}
                  autoComplete="off"
                  onChange={(e) => setCaptchaCode(e.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  onClick={loadCaptcha}
                  title="点击刷新验证码"
                  className="shrink-0 w-[120px] p-0 rounded-xl overflow-hidden border border-ink-200 bg-ink-50 hover:border-primary-300 transition-colors"
                  dangerouslySetInnerHTML={{ __html: captchaSvg }}
                />
              </div>
              {captchaError && <p className="mt-1.5 text-sm text-rose-500">{captchaError}</p>}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 disabled:opacity-70">
              {loading ? (mode === 'login' ? '登录中…' : '注册中…') : mode === 'login' ? '登录' : '注册并登录'}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-white/70 text-sm">
          登录即表示同意 <a href="#" className="text-white/90 underline">服务条款</a> 和 <a href="#" className="text-white/90 underline">隐私政策</a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-ink-400">加载中…</div>}>
      <LoginInner />
    </Suspense>
  );
}
