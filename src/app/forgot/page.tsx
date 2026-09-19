'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiPost } from '@/lib/api';

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
    <div className="auth-shell relative overflow-hidden flex items-center justify-center py-10 sm:py-14">
      <div className="absolute inset-0 bg-animated-gradient" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-gold-400/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary-300/20 rounded-full blur-3xl animate-float-slow" />
      </div>

      <div className="relative z-10 max-w-md w-full mx-4">
        <div className="glass rounded-3xl p-8 md:p-10 shadow-card-hover">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mx-auto mb-4 shadow-glow">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h1 className="font-display text-3xl font-bold text-ink-900 mb-2">找回密码</h1>
            <p className="text-ink-500">输入注册邮箱，我们会发送重置链接给你</p>
          </div>

          {sent ? (
            <div className="text-center">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-4 text-left mb-6">
                <p className="text-emerald-800 font-semibold mb-1">邮件已发送</p>
                <p className="text-emerald-700 text-sm leading-relaxed">
                  如果该邮箱已注册，你会收到一封包含重置链接的邮件，链接 30 分钟内有效。
                  请检查收件箱，也别忘了看一眼垃圾邮件。
                </p>
              </div>
              <p className="text-sm text-ink-500 mb-4">没收到？可以稍后重试一次。</p>
              <button onClick={() => { setSent(false); setEmail(''); }} className="btn-primary w-full py-3">
                换个邮箱重试
              </button>
              <Link href="/login" className="block text-center mt-4 text-sm text-primary-700 hover:underline">
                返回登录
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">邮箱</label>
                <input
                  type="email"
                  className="input-styled input-field"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

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
