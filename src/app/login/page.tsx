'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { apiGet, tokenStore } from '@/lib/api';
import { safeNext } from '@/lib/nav';

/** 统一错误提示条（登录/注册/2FA 复用） */
function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
      <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

/** 品牌区三个特色点（左侧展示） */
const FEATURES: { title: string; desc: string; icon: JSX.Element }[] = [
  {
    title: '每日读经 · 灵修计划',
    desc: '按卷按章推进，进度与打卡一目了然',
    icon: (
      <svg className="w-4.5 h-4.5" width={18} height={18} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    title: '团契相交 · 彼此代祷',
    desc: '小组、代祷墙、私信，与弟兄姐妹同行',
    icon: (
      <svg className="w-4.5 h-4.5" width={18} height={18} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: '敬拜诗歌 · 直播聚会',
    desc: '诗歌库、讲道回放与直播，随时亲近神',
    icon: (
      <svg className="w-4.5 h-4.5" width={18} height={18} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
  },
];

/** Suspense 占位。骨架必须和真表单同结构（左品牌栏 + 右 430px 卡片）、同外边距，
    否则水合那一刻是「一行居中文字」整块换成满屏布局，看着就是白屏一闪再跳位。 */
function LoginSkeleton() {
  return (
    <div className="auth-shell w-full flex flex-col lg:flex-row bg-ink-50">
      <aside
        className="hidden lg:flex lg:w-[45%] xl:w-[48%] flex-col justify-center p-12 xl:p-16 text-white overflow-hidden"
        style={{ background: 'linear-gradient(140deg, #0f1338 0%, #1e2664 46%, #3242b0 100%)' }}
      >
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-10">
            <span className="w-12 h-12 rounded-2xl bg-white/12 border border-white/25 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m9-9H3" />
              </svg>
            </span>
            <span className="font-display text-xl xl:text-2xl font-bold">圣约社区</span>
          </div>
          <div className="h-9 w-3/4 rounded-lg bg-white/10" />
          <div className="h-9 w-1/2 rounded-lg bg-white/10 mt-3" />
          <div className="h-4 w-full rounded bg-white/[0.07] mt-7" />
          <div className="h-4 w-2/3 rounded bg-white/[0.07] mt-2.5" />
        </div>
      </aside>
      <main className="flex-1 flex flex-col items-center px-4 sm:px-8 pt-8 pb-12 sm:pt-14 lg:pt-[max(3.5rem,12vh)] lg:pb-14">
        <div className="h-[68px] lg:hidden" />
        <div className="w-full max-w-[430px]">
          <div className="bg-white rounded-3xl border border-ink-100 shadow-[0_24px_60px_-24px_rgba(19,24,66,0.3)] p-7 sm:p-9">
            <div className="mb-6 space-y-2.5">
              <div className="h-8 w-40 rounded-lg bg-ink-100" />
              <div className="h-4 w-56 rounded bg-ink-100" />
            </div>
            <div className="h-11 rounded-2xl bg-ink-100 mb-6" />
            {/* 沿用 .auth-form + 同款 mt-auto：骨架和真表单占同一块高度、
                提交按钮也停在同一行，换过去时卡片和按钮都不动 */}
            <div className="auth-form flex flex-col gap-3.5">
              <div className="h-[44px] rounded-xl bg-ink-100" />
              <div className="h-[44px] rounded-xl bg-ink-100" />
              <div className="flex gap-3">
                <div className="h-[44px] flex-1 rounded-xl bg-ink-100" />
                <div className="h-[44px] w-[120px] rounded-xl bg-ink-100" />
              </div>
              <div className="h-[44px] mt-auto rounded-xl bg-primary-100" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const modeParam = params.get('mode');
  const nextPath = safeNext(params.get('next'));
  // 带邀请码进来时直接落到注册页，减少一步跳转流失
  const inviteCode = (params.get('invite') || '').trim().toUpperCase();
  const initialMode = modeParam === 'register' || inviteCode ? 'register' : 'login';
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const router = useRouter();
  const { login, login2fa, register, user, setUser } = useAuth();
  const oauthWinRef = useRef<Window | null>(null);
  const [oauthProviders, setOauthProviders] = useState<{ key: string; name: string }[]>([]);

  // ===== 双因素第二步 =====
  const [twoFaTicket, setTwoFaTicket] = useState('');
  const [twoFaCode, setTwoFaCode] = useState('');

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

  // 拉取已配置的第三方登录方式
  useEffect(() => {
    apiGet<{ providers: { key: string; name: string }[] }>('/auth/oauth/providers')
      .then((d) => setOauthProviders(d.providers || []))
      .catch(() => {});
  }, []);

  // 第三方登录回跳窗口通过 postMessage 交还令牌
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (data?.type === 'oauth_success') {
        tokenStore.set(data.accessToken);
        tokenStore.setRefresh(data.refreshToken);
        setUser(data.user);
        router.push(nextPath);
      } else if (data?.type === 'oauth_error') {
        setError(data.message || '第三方登录失败');
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [nextPath, router, setUser]);

  async function startOAuth(provider: string) {
    try {
      const d = await apiGet<{ url: string }>(`/auth/oauth/start?provider=${encodeURIComponent(provider)}`);
      window.open(d.url, 'oauth', 'width=520,height=680');
    } catch {
      setError('发起第三方登录失败，请稍后重试');
    }
  }

  // 已登录则离开（带 next 时回到来源页）。放进 effect：渲染期直接 router.push
  // 每次重渲染都会再触发一次，和水合期的验证码/OAuth 请求抢同一帧。
  useEffect(() => {
    if (user && !loading) router.push(nextPath);
  }, [user, loading, nextPath, router]);

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

  // 双因素第二步：单独提交，不需要图形验证码（票据本身已限流）
  async function submit2fa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const code = twoFaCode.replace(/\s/g, '');
    if (!/^(\d{6}|[A-Z0-9]{10})$/i.test(code)) {
      setError('请输入 6 位动态码，或 10 位恢复码');
      return;
    }
    setLoading(true);
    try {
      await login2fa(twoFaTicket, code);
      setTwoFaTicket('');
      router.push(nextPath);
    } catch (e: any) {
      setError(e?.message || '验证失败，请重试');
    } finally {
      setLoading(false);
    }
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
        try {
          await login(identifier.trim(), password, { captchaId, captchaCode: captchaCode.trim() });
        } catch (e2: any) {
          // 开了双因素：切到动态码输入，票据只在内存里，不落 localStorage
          if (e2?.code === 'REQUIRE_2FA' && e2.ticket) {
            setTwoFaTicket(e2.ticket);
            setError('');
            setLoading(false);
            return;
          }
          throw e2;
        }
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
    <div className="auth-shell w-full flex flex-col lg:flex-row bg-ink-50">
      {/* 左：品牌展示（大屏可见） */}
      <aside
        className="relative hidden lg:flex lg:w-[45%] xl:w-[48%] flex-col justify-between p-12 xl:p-16 overflow-hidden text-white"
        style={{ background: 'linear-gradient(140deg, #0f1338 0%, #1e2664 46%, #3242b0 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div className="absolute -top-28 -right-20 w-[22rem] h-[22rem] rounded-full bg-primary-400/25 blur-3xl" />
        <div className="absolute -bottom-24 -left-20 w-[24rem] h-[24rem] rounded-full bg-gold-400/15 blur-3xl" />

        <Link href="/" className="relative z-10 inline-flex items-center gap-3 w-fit">
          <span className="w-12 h-12 rounded-2xl bg-white/12 border border-white/25 flex items-center justify-center shadow-[0_0_28px_rgba(79,109,245,0.4)]">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m9-9H3" />
            </svg>
          </span>
          <span className="leading-tight">
            <span className="block font-display text-xl xl:text-2xl font-bold">圣约社区</span>
            <span className="block text-[11px] tracking-[0.22em] text-white/50">COVENANT COMMUNITY</span>
          </span>
        </Link>

        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-3xl xl:text-[2.6rem] font-bold leading-[1.25] mb-5">
            在真理与爱中<br />彼此建立
          </h2>
          <p className="text-white/70 text-[15px] leading-relaxed mb-9">
            读经、灵修、团契、敬拜与代祷——与弟兄姐妹一同在神的话语里扎根、成长、同工。
          </p>
          <ul className="space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3.5">
                <span className="mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-gold-300">
                  {f.icon}
                </span>
                <span>
                  <span className="block font-semibold text-[15px]">{f.title}</span>
                  <span className="block text-sm text-white/55 mt-0.5">{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-sm text-white/60 border-l-2 border-gold-400/70 pl-4 max-w-sm">
          「你的话是我脚前的灯，是我路上的光。」
          <span className="block text-white/40 mt-1 text-xs">诗篇 119:105</span>
        </p>
      </aside>

      {/* 右：登录 / 注册表单。顶部对齐而非垂直居中——居中的话，验证码/第三方按钮
          异步补上、或登录↔注册切换改变卡高，都会把整张卡片往上顶，看起来就是「跳」。
          钉住上沿后内容只向下生长，标题和输入框位置不动。 */}
      <main className="flex-1 flex flex-col items-center justify-start px-4 sm:px-8 pt-8 pb-12 sm:pt-14 lg:pt-[max(3.5rem,12vh)] lg:pb-14">
        <Link href="/" className="lg:hidden mb-5 self-center inline-flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-glow">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m9-9H3" />
            </svg>
          </span>
          {/* 手机上用横排小字标：竖排那版连图带字 118px，正好把「注册」态的提交按钮顶到首屏外 */}
          <span className="leading-tight">
            <span className="block font-display text-base font-bold text-ink-900">圣约社区</span>
            <span className="block text-[9px] tracking-[0.2em] text-ink-400">COVENANT COMMUNITY</span>
          </span>
        </Link>

        <div className="w-full max-w-[430px]">
          <div className="bg-white rounded-3xl border border-ink-100 shadow-[0_24px_60px_-24px_rgba(19,24,66,0.3)] p-7 sm:p-9">
            <div className="mb-6">
              <h1 className="font-display text-2xl sm:text-[1.75rem] font-bold text-ink-900">
                {twoFaTicket ? '双因素验证' : mode === 'login' ? '欢迎回来' : '创建账号'}
              </h1>
              <p className="text-ink-500 text-sm mt-1.5">
                {twoFaTicket
                  ? '请输入验证器 App 上的 6 位动态码'
                  : mode === 'login'
                    ? '登录圣约社区，继续你的属灵之旅'
                    : '加入圣约社区，与弟兄姐妹彼此建立'}
              </p>
            </div>

            {/* 邀请提示放在切换器之上、且不随模式增减：原本它写在注册表单内部，
                于是「点注册多出一条横幅、点登录又少一条」，页面高度来回变。 */}
            {inviteCode && !twoFaTicket && (
              <div className="mb-4 rounded-xl bg-primary-50 border border-primary-100 px-4 py-2.5 text-sm text-primary-800">
                通过好友邀请进入（邀请码 <b className="font-mono">{inviteCode}</b>），注册后你和对方都会获得成长奖励。
              </div>
            )}

            {/* 模式切换（2FA 步骤换成同高的步骤条：直接隐藏会让卡片凭空短掉 44px，
                从「登录」进入这一步时整张卡上下抖一下） */}
            {twoFaTicket ? (
              <div className="seg-track flex items-center justify-between rounded-2xl px-4 py-3 mb-6">
                <span className="text-sm font-semibold text-ink-700">两步验证</span>
                <span className="text-xs text-ink-500">第 2 / 2 步</span>
              </div>
            ) : (
              <div className="seg-track flex rounded-2xl p-1 mb-6">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); }}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${mode === 'login' ? 'seg-thumb' : 'text-ink-500 hover:text-ink-700'}`}
                >
                  登录
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(''); }}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${mode === 'register' ? 'seg-thumb' : 'text-ink-500 hover:text-ink-700'}`}
                >
                  注册
                </button>
              </div>
            )}

            {/* 双因素第二步：替换掉整个主表单。沿用 .auth-form 占位，
                免得从「登录」切进这一步时卡片突然塌一块。 */}
            {twoFaTicket ? (
              <form onSubmit={submit2fa} className="auth-form flex flex-col justify-center gap-3.5">
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1">动态码 / 恢复码</label>
                  <input
                    className="input-styled input-field text-center tracking-[0.3em] font-mono"
                    placeholder="000000"
                    value={twoFaCode}
                    onChange={(e) => setTwoFaCode(e.target.value)}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={10}
                    autoFocus
                  />
                  <p className="text-xs text-ink-400 mt-1">
                    手机没电了？可以输入绑定时保存的 10 位恢复码。
                  </p>
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full py-3 disabled:opacity-70">
                  {loading ? '验证中…' : '验证并登录'}
                </button>

                {error && <ErrorBox message={error} />}

                <button
                  type="button"
                  onClick={() => { setTwoFaTicket(''); setTwoFaCode(''); setError(''); setPassword(''); loadCaptcha(); }}
                  className="block w-full text-center text-sm text-ink-500 hover:text-primary-700"
                >
                  返回重新登录
                </button>
              </form>
            ) : (
              <form onSubmit={submit} className="auth-form flex flex-col gap-3.5">
                {/* 注册时用户名与昵称并排（两者都是短字段），邮箱独占一行：注册只比
                    登录多出一行，占位区里登录态空出的余量就只剩 50px 上下，落在按钮
                    上方像正常留白，而不是卡片底部的一大块空洞。
                    380px 以下再并排会把输入框挤到 100px 出头，退回竖排。 */}
                <div className={mode === 'register' ? 'grid gap-3.5 min-[380px]:grid-cols-2' : ''}>
                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1">{mode === 'register' ? '用户名' : '账号'}</label>
                    <input
                      className="input-styled input-field"
                      placeholder={mode === 'register' ? '登录用的用户名' : '用户名 / 邮箱'}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                    />
                  </div>
                  {mode === 'register' && (
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1">昵称</label>
                      <input className="input-styled input-field" placeholder="显示名称" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                    </div>
                  )}
                </div>

                {mode === 'register' && (
                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1">邮箱</label>
                    <input type="email" className="input-styled input-field" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1">密码</label>
                  <div className="relative">
                    <input
                      className="input-styled input-field input-suffix"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="请输入密码"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 inset-y-1 flex items-center px-2 rounded-md text-xs font-medium text-ink-400 hover:text-ink-600"
                    >
                      {showPassword ? '隐藏' : '显示'}
                    </button>
                  </div>
                  {mode === 'login' && (
                    <div className="mt-1.5 text-right">
                      <Link href="/forgot" className="text-sm text-primary-600 hover:underline">
                        忘记密码？
                      </Link>
                    </div>
                  )}
                </div>

                {/* 图形验证码 */}
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1">验证码</label>
                  <div className="flex items-stretch gap-3">
                    <input
                      className="input-styled input-field flex-1 min-w-0"
                      placeholder="请输入右侧字符"
                      value={captchaCode}
                      maxLength={4}
                      autoComplete="off"
                      onChange={(e) => setCaptchaCode(e.target.value.toUpperCase())}
                    />
                    {/* 外层固定 120px（与后端产出的验证码同宽，多了会被裁掉右边）、
                        由 items-stretch 撑成输入框等高：SVG 还没返回时这里也是一块实的
                        灰色呼吸位，不会先空后涨。 */}
                    <div className="relative shrink-0 w-[120px]">
                      {!captchaSvg && (
                        <span className="absolute inset-0 rounded-xl bg-ink-100 animate-pulse" aria-hidden />
                      )}
                      <button
                        type="button"
                        onClick={loadCaptcha}
                        title="点击刷新验证码"
                        className="relative w-full h-full p-0 rounded-xl overflow-hidden border border-ink-200 bg-ink-50 hover:border-primary-300 transition-colors"
                        dangerouslySetInnerHTML={{ __html: captchaSvg }}
                      />
                    </div>
                  </div>
                </div>

                {/* 报错排在按钮之前：它要吃的正是下面 mt-auto 让出来的那 50px 预留，
                    于是弹出「验证码错误」时按钮和卡片都不跟着下移。 */}
                {error && <ErrorBox message={error} />}
                {captchaError && (
                  <p className="-mt-2 px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                    {captchaError}
                  </p>
                )}

                {/* mt-auto 把占位区的余量全推到这一行上方：登录态少一行，空出来的一段
                    就是「验证码 → 按钮」之间的留白。两种模式下按钮停在同一个位置，
                    点「注册」时页面纹丝不动。 */}
                <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-auto disabled:opacity-70">
                  {loading ? (mode === 'login' ? '登录中…' : '注册中…') : mode === 'login' ? '登录' : '注册并登录'}
                </button>

                {/* 卡片底部这块（第三方登录 / 模式互切 / 条款）紧跟在按钮下方，
                    两者之间不留余量：余量全在按钮上方，所以这块的位置也是固定的。 */}
                <div className="flex flex-col gap-2 pt-1">
                  {oauthProviders.length > 0 && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-ink-200" />
                        <span className="text-xs text-ink-400">或使用第三方账号</span>
                        <div className="h-px flex-1 bg-ink-200" />
                      </div>
                      {oauthProviders.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => startOAuth(p.key)}
                          className="w-full py-2.5 rounded-xl border border-ink-200 text-ink-700 bg-ink-50 hover:bg-ink-100 hover:border-ink-300 transition-colors text-sm font-medium"
                        >
                          {p.name} 登录
                        </button>
                      ))}
                    </>
                  )}

                  {/* 用按钮切模式而不是 <Link href="/login?mode=register">：
                      本页 mode 是 state，同一路由换 query 不会重挂载，点了不会真的切换。 */}
                  <button
                    type="button"
                    onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                    className="w-full text-center text-sm text-ink-500"
                  >
                    {mode === 'login' ? (
                      <>还没有账号？<span className="text-primary-700 font-semibold">注册一个</span></>
                    ) : (
                      <>已经有账号？<span className="text-primary-700 font-semibold">直接登录</span></>
                    )}
                  </button>

                  <p className="text-center text-[11px] text-ink-400 leading-relaxed">
                    登录即表示同意 <a href="#" className="text-primary-600 hover:underline">服务条款</a> 和{' '}
                    <a href="#" className="text-primary-600 hover:underline">隐私政策</a>
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams 要求 Suspense 边界，否则整页退化成 CSR；
  // 但兜底内容必须和真表单同尺寸，否则换成满屏布局的那一下就是用户说的「跳」。
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginInner />
    </Suspense>
  );
}
