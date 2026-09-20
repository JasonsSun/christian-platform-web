'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import { IconAlert, IconCheckCircle, IconLock } from '@/components/icons';

function ResetInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = (params.get('token') || '').trim();

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    let alive = true;
    apiGet<{ valid: boolean }>(`/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => { if (alive) setValid(!!r?.valid); })
      .catch(() => { if (alive) setValid(false); })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('密码至少 6 位'); return; }
    if (password !== confirm) { setError('两次输入的密码不一致'); return; }
    setLoading(true);
    try {
      await apiPost('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => router.push('/login?mode=login'), 2200);
    } catch (e: any) {
      setError(e?.message || '重置失败，请重新申请');
    } finally {
      setLoading(false);
    }
  }

  return (
    /* 同 forgot：顶部对齐，四种状态（校验中 / 链接无效 / 表单 / 成功）下面再配一块
       恒定高度的舞台区，卡片因此自始至终不高也不矮，只有背景带在动。 */
    <div className="auth-shell relative overflow-hidden flex items-start justify-center py-10 sm:py-14 lg:pt-[max(3.5rem,12vh)]">
      <div className="absolute inset-0 bg-animated-gradient" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-gold-400/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary-300/20 rounded-full blur-3xl animate-float-slow" />
      </div>

      <div className="relative z-10 max-w-md w-full mx-4">
        <div className="glass card-tech rounded-3xl p-8 md:p-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mx-auto mb-4 shadow-glow">
              <IconLock className="w-8 h-8 text-white" strokeWidth={1.6} />
            </div>
            <div className="eyebrow justify-center mb-1.5">账号安全</div>
            <h1 className="font-display text-3xl font-bold text-ink-900 mb-2">设置新密码</h1>
            <p className="text-ink-500">
              {done ? '密码已更新，正在前往登录页' : '请输入你的新密码'}
            </p>
          </div>

          <div className="min-h-[19rem]">
          {done ? (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-4 text-left">
              <p className="text-emerald-800 font-semibold mb-1 flex items-center gap-2">
                <IconCheckCircle className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.6} />
                重置成功
              </p>
              <p className="text-emerald-700 text-sm">出于安全考虑，你已登出所有设备，请用新密码重新登录。</p>
            </div>
          ) : checking ? (
            /* 骨架式的呼吸行而不是「正在校验链接…」一行字：换成真表单时这块整体涨开，
               行数对得上就只是每一行点亮，看不到整块跳。 */
            <div className="space-y-4" role="status" aria-label="正在校验链接">
              <div className="skeleton-sheen h-[66px] rounded-xl bg-ink-100" />
              <div className="skeleton-sheen h-[66px] rounded-xl bg-ink-100" />
              <div className="skeleton-sheen h-[46px] rounded-xl bg-ink-100" />
              <div className="skeleton-sheen h-[54px] rounded-xl bg-primary-100" />
            </div>
          ) : !valid ? (
            <div className="text-center">
              <div role="alert" className="rounded-2xl bg-rose-50 border border-rose-200 px-5 py-4 text-left mb-6">
                <p className="text-rose-800 font-semibold mb-1 flex items-center gap-2">
                  <IconAlert className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.6} />
                  链接无效或已过期
                </p>
                <p className="text-rose-700 text-sm">
                  重置链接仅能使用一次，且 30 分钟内有效。请重新申请一封邮件。
                </p>
              </div>
              <Link href="/forgot" className="btn-primary block w-full py-3 text-center">
                重新申请重置邮件
              </Link>
              <Link href="/login" className="block text-center mt-4 text-sm text-ink-500 hover:text-primary-700">
                返回登录
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="reset-password" className="block text-sm font-medium text-ink-700 mb-1.5">新密码</label>
                <div className="relative">
                  <input
                    id="reset-password"
                    name="new-password"
                    className="input-styled input-field input-suffix"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="至少 6 位"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    aria-pressed={showPassword}
                    className="absolute right-2.5 inset-y-1 flex items-center px-2 rounded-md text-xs font-medium text-ink-400 hover:text-ink-600"
                  >
                    {showPassword ? '隐藏' : '显示'}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="reset-confirm" className="block text-sm font-medium text-ink-700 mb-1.5">确认新密码</label>
                <input
                  id="reset-confirm"
                  name="confirm-password"
                  className="input-styled input-field"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="再输入一次"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              {/* 常显等高的错误槽：报「太短 / 不一致 / 服务端拒绝」时按钮不往下走。 */}
              <div
                role="alert"
                aria-hidden={!error || undefined}
                className={`flex items-center gap-2 min-h-[46px] px-4 py-3 rounded-xl border text-sm transition-colors duration-200 ${
                  error ? 'bg-rose-50 border-rose-200 text-rose-700' : 'border-transparent text-transparent'
                }`}
              >
                <IconAlert className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.6} />
                {error || ' '}
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 disabled:opacity-70">
                {loading ? '提交中…' : '确认重置'}
              </button>
            </form>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Suspense 占位：连背景一起给，否则水合前是一屏空白、水合后整页材料「闪」出来。
    结构逐行对齐真卡片（图标 / eyebrow / 标题 / 副标 + 同一块舞台区），水合那一下不涨不落。 */
function ResetSkeleton() {
  return (
    <div className="auth-shell relative overflow-hidden flex items-start justify-center py-10 sm:py-14 lg:pt-[max(3.5rem,12vh)]">
      <div className="absolute inset-0 bg-animated-gradient" />
      <div className="relative z-10 max-w-md w-full mx-4">
        <div className="glass card-tech rounded-3xl p-8 md:p-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-ink-100 mx-auto mb-4" />
            <div className="eyebrow justify-center mb-1.5">
              <span className="h-[18px] w-20 rounded bg-ink-100" />
            </div>
            <div className="h-9 w-44 mx-auto rounded-lg bg-ink-100" />
            <div className="h-6 w-52 mx-auto rounded bg-ink-100 mt-2" />
          </div>
          <div className="min-h-[19rem] space-y-4">
            <div className="skeleton-sheen h-[66px] rounded-xl bg-ink-100" />
            <div className="skeleton-sheen h-[66px] rounded-xl bg-ink-100" />
            <div className="skeleton-sheen h-[46px] rounded-xl bg-ink-100" />
            <div className="skeleton-sheen h-[54px] rounded-xl bg-primary-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetSkeleton />}>
      <ResetInner />
    </Suspense>
  );
}
