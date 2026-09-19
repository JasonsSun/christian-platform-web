'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { apiGet, apiPost, apiPatch } from '@/lib/api';

type Status = { enabled: boolean; confirmed: boolean; recoveryLeft: number };

/**
 * 二维码用公开 API 渲染（不引入 qrcode 依赖）。
 * 若站点处于内网/离线，二维码加载失败也不影响使用 —— 下方提供了手动输入密钥。
 */
function qrUrl(otpauth: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;
}

export default function TwoFactorPage() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // 绑定流程
  const [secret, setSecret] = useState('');
  const [otpauth, setOtpauth] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // 关闭
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await apiGet<Status>('/auth/2fa');
      setStatus(s);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
    else if (!authLoading) setLoading(false);
  }, [user, authLoading, load]);

  async function beginSetup() {
    setBusy(true);
    setErr('');
    try {
      const r = await apiPost<{ secret: string; otpauth: string }>('/auth/2fa');
      setSecret(r.secret);
      setOtpauth(r.otpauth);
    } catch (e: any) {
      setErr(e?.message || '初始化失败');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setErr('');
    try {
      const r = await apiPatch<{ recoveryCodes: string[] }>('/auth/2fa', { action: 'confirm', code: code.trim() });
      setRecoveryCodes(r.recoveryCodes || []);
      setSecret('');
      setOtpauth('');
      setCode('');
      await load();
    } catch (e: any) {
      setErr(e?.message || '验证失败');
    } finally {
      setBusy(false);
    }
  }

  async function doDisable() {
    setBusy(true);
    setErr('');
    try {
      await apiPatch('/auth/2fa', { action: 'disable', code: disableCode.trim() });
      setShowDisable(false);
      setDisableCode('');
      await load();
    } catch (e: any) {
      setErr(e?.message || '关闭失败');
    } finally {
      setBusy(false);
    }
  }

  async function regenRecovery() {
    setBusy(true);
    setErr('');
    try {
      const r = await apiPatch<{ recoveryCodes: string[] }>('/auth/2fa', { action: 'recovery', code: code.trim() });
      setRecoveryCodes(r.recoveryCodes || []);
    } catch (e: any) {
      setErr(e?.message || '操作失败');
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-4">🔒</div>
        <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">请先登录</h2>
        <Link href="/login?next=/settings/two-factor" className="btn-primary">去登录</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">双因素认证</h1>
          <p className="text-sm text-ink-500 mt-1">
            开启后，登录除密码外还需输入验证器 App 上的 6 位动态码。
          </p>
        </div>
        <Link href="/me" className="text-sm text-primary-700 hover:underline shrink-0">返回</Link>
      </div>

      {err && (
        <div role="alert" className="mb-4 px-4 py-3 rounded-xl text-sm bg-rose-50 border border-rose-200 text-rose-700">{err}</div>
      )}

      {loading ? (
        <div className="text-center py-16 text-ink-400">加载中…</div>
      ) : recoveryCodes.length > 0 ? (
        <div className="rounded-2xl bg-white border border-ink-100 p-6">
          <h2 className="font-semibold text-ink-900 mb-2">请妥善保存恢复码</h2>
          <p className="text-sm text-ink-500 mb-4">
            每个恢复码只能使用一次。手机丢失或换机时，它们是你唯一的自救方式 —— 建议抄写下来或存入密码管理器。
          </p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {recoveryCodes.map((c) => (
              <code key={c} className="block px-3 py-2 rounded-lg bg-ink-50 text-center font-mono text-sm tracking-wider">
                {c}
              </code>
            ))}
          </div>
          <button
            onClick={() => { setRecoveryCodes([]); }}
            className="btn-primary w-full py-2.5"
          >
            我已保存，继续
          </button>
        </div>
      ) : otpauth ? (
        <div className="rounded-2xl bg-white border border-ink-100 p-6">
          <h2 className="font-semibold text-ink-900 mb-4">1. 用验证器 App 扫描二维码</h2>
          <div className="flex flex-col items-center gap-3 mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl(otpauth)} alt="2FA 二维码" width={180} height={180} className="rounded-xl border border-ink-100"  decoding="async"  loading="eager" />
            <p className="text-xs text-ink-400 text-center">
              支持 Google Authenticator、1Password、微信等任意标准 TOTP 应用
            </p>
          </div>

          <div className="mb-5">
            <p className="text-sm text-ink-600 mb-1.5">扫不了？手动输入密钥：</p>
            <code className="block px-3 py-2 rounded-lg bg-ink-50 text-center font-mono text-sm break-all">{secret}</code>
          </div>

          <h2 id="tfa-code-label" className="font-semibold text-ink-900 mb-3">2. 输入 App 上的 6 位动态码</h2>
          <div className="flex gap-3">
            <input
              id="tfa-code"
              name="code"
              aria-labelledby="tfa-code-label"
              className="input-styled flex-1 text-center text-lg tracking-[0.3em] font-mono"
              placeholder="000000"
              value={code}
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <button onClick={confirm} disabled={busy || code.length !== 6} className="btn-primary px-6 disabled:opacity-60">
              {busy ? '验证中…' : '确认开启'}
            </button>
          </div>
          <button onClick={() => { setOtpauth(''); setSecret(''); setCode(''); }} className="mt-3 text-sm text-ink-500 hover:text-ink-700">
            取消
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                status?.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-600'
              }`}
            >
              {status?.enabled ? '✓' : '!'}
            </span>
            <div>
              <p className="font-medium text-ink-900">
                {status?.enabled ? '双因素认证已开启' : '双因素认证未开启'}
              </p>
              <p className="text-xs text-ink-500">
                {status?.enabled
                  ? `剩余 ${status.recoveryLeft} 个可用恢复码`
                  : '开启后可大幅提升账号安全性'}
              </p>
            </div>
          </div>

          {status?.enabled ? (
            <div className="space-y-4">
              {status.recoveryLeft <= 2 && (
                <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  恢复码快用完了，建议尽快重新生成。
                </div>
              )}
              <div className="flex gap-3">
                <label htmlFor="tfa-regen-code" className="sr-only">当前动态码</label>
                <input
                  id="tfa-regen-code"
                  name="code"
                  className="input-styled flex-1 text-center font-mono"
                  placeholder="当前动态码"
                  value={code}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
                <button onClick={regenRecovery} disabled={busy || code.length !== 6} className="px-4 py-2 rounded-xl border border-ink-200 text-ink-700 hover:border-primary-300 disabled:opacity-60">
                  重新生成恢复码
                </button>
              </div>

              {!showDisable ? (
                <button onClick={() => setShowDisable(true)} className="text-sm text-rose-600 hover:underline">
                  关闭双因素认证
                </button>
              ) : (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p id="tfa-disable-code-label" className="text-sm text-rose-800 mb-2">输入当前动态码或恢复码以确认关闭：</p>
                  <div className="flex gap-2">
                    <input
                      id="tfa-disable-code"
                      name="disableCode"
                      aria-labelledby="tfa-disable-code-label"
                      className="input-styled flex-1"
                      placeholder="动态码或恢复码"
                      value={disableCode}
                      autoComplete="one-time-code"
                      onChange={(e) => setDisableCode(e.target.value)}
                    />
                    <button onClick={doDisable} disabled={busy || !disableCode.trim()} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm disabled:opacity-60">
                      确认关闭
                    </button>
                    <button onClick={() => { setShowDisable(false); setDisableCode(''); }} className="px-4 py-2 rounded-xl border border-ink-200 text-sm">
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button onClick={beginSetup} disabled={busy} className="btn-primary w-full py-2.5 disabled:opacity-60">
              {busy ? '准备中…' : '开始设置'}
            </button>
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-ink-400 leading-relaxed">
        动态码每 30 秒变化一次，服务端允许 ±30 秒的时钟漂移。
        若手机时间与标准时间相差过大导致无法登录，可使用恢复码。
      </p>
    </div>
  );
}
