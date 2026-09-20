'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiPost } from '@/lib/api';
import { IconAlert, IconArrowLeft, IconCheckCircle, IconKey } from '@/components/icons';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    setLoading(true);
    try {
      await apiPost<{ sent: boolean }>('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (e: any) {
      setError(e?.message || '发送失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  }

  return (
    /* 顶部对齐而不是垂直居中：这张卡没有 .auth-form 那样的占位高度，出错或发出邮件
       时高度都会变，居中的话整张卡会往上顶 —— 和登录页一样是用户说的「跳」。钉住上沿
       后内容只向下生长，标题、邮箱框的位置始终不动。 */
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
              <IconKey className="w-8 h-8 text-white" strokeWidth={1.6} />
            </div>
            <div className="eyebrow justify-center mb-1.5">账号安全</div>
            <h1 className="font-display text-3xl font-bold text-ink-900 mb-2">找回密码</h1>
            <p className="text-ink-500">输入注册邮箱，我们会发送重置链接给你</p>
          </div>

          {sent ? (
            <div className="text-center">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-4 text-left mb-6">
                <p className="text-emerald-800 font-semibold mb-1 flex items-center gap-2">
                  <IconCheckCircle className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.6} />
                  邮件已发送
                </p>
                <p className="text-emerald-700 text-sm leading-relaxed">
                  如果该邮箱已注册，你会收到一封包含重置链接的邮件，链接 30 分钟内有效。
                  请检查收件箱，也别忘了看一眼垃圾邮件。
                </p>
              </div>
              <p className="text-sm text-ink-500 mb-4">没收到？可以稍后重试一次。</p>
              <button onClick={() => { setSent(false); setEmail(''); }} className="btn-primary w-full py-3">
                换个邮箱重试
              </button>
              <Link href="/login" className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary-700 hover:text-primary-800 group/link">
                <IconArrowLeft className="w-4 h-4 transition-transform group-hover/link:-translate-x-0.5" strokeWidth={1.6} />
                返回登录
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-medium text-ink-700 mb-1.5">邮箱</label>
                <input
                  id="forgot-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  className="input-styled input-field"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-describedby={error ? 'forgot-error' : undefined}
                  required
                />
              </div>

              {/* 错误条常显占位：没出错时只是透明，行高留着（内容为 &nbsp; 保证一行高度），
                  于是报错弹出/消失都不会把下面的按钮推来推去。 */}
              <div
                id="forgot-error"
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
                {loading ? '发送中…' : '发送重置邮件'}
              </button>

              <Link href="/login" className="block text-center text-sm text-ink-500 hover:text-primary-700">
                想起密码了？返回登录
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
