'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { IconLink } from '@/components/icons';
import { Empty } from '@/components/ui';
import { formatDate } from '@/lib/format';

/**
 * 第三方账号绑定管理
 *
 * - 已绑定：展示第三方邮箱/昵称与绑定时间，可解绑（行内二次确认，不使用 confirm 弹框）
 * - 未绑定：弹窗走 OAuth 授权，回调通过 postMessage 回传 bound 后刷新列表
 *
 * 绑定走的是 /auth/oauth/start?bind=1：回调会把第三方身份关联到「当前登录账号」，
 * 而不是新建账号 —— 避免把身份绑错人。
 */

type Provider = { key: string; name: string };
type LinkedItem = {
  provider: string;
  provider_email: string | null;
  display_name: string | null;
  created_at: number | string | Date;
};

export default function SettingsOAuthPage() {
  const { user, loading: authLoading } = useAuth();
  const notice = useNotice();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [linked, setLinked] = useState<LinkedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string>('');
  // 行内二次确认：记录正在等待确认的 provider
  const [confirmKey, setConfirmKey] = useState<string>('');

  const load = useCallback(async () => {
    try {
      const [pRes, lRes] = await Promise.all([
        apiGet<{ providers: Provider[] }>('/auth/oauth/providers').catch(() => ({ providers: [] as Provider[] })),
        apiGet<{ linked: LinkedItem[] }>('/me/oauth').catch(() => ({ linked: [] as LinkedItem[] })),
      ]);
      setProviders(pRes.providers || []);
      setLinked(lRes.linked || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || '加载第三方账号信息失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 未登录由下面那块原地登录门接手，不再用 effect 把人 replace 去 /login
  // （门刚画出来就被拽走，量具永远量不到这一页真实版式）。
  const needsLogin = !authLoading && !user;

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  // 授权弹窗回传
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (data?.type === 'oauth_success') {
        if (data.bound) {
          notice.success(`已绑定 ${data.bound}`);
          void load();
        }
      } else if (data?.type === 'oauth_error') {
        setError(data.message || '绑定失败，请重试');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [load, notice]);

  const bind = useCallback(
    async (key: string) => {
      setBusy(key);
      setError(null);
      try {
        const d = await apiGet<{ url: string }>(
          `/auth/oauth/start?provider=${encodeURIComponent(key)}&bind=1`
        );
        window.open(d.url, 'oauth', 'width=520,height=680');
      } catch (e: any) {
        setError(e?.message || '发起绑定失败，请稍后重试');
      } finally {
        setBusy('');
      }
    },
    []
  );

  const unlink = useCallback(
    async (key: string) => {
      setBusy(key);
      setError(null);
      try {
        await apiDelete(`/auth/oauth/bind?provider=${encodeURIComponent(key)}`);
        notice.success('已解除绑定');
        setConfirmKey('');
        await load();
      } catch (e: any) {
        setError(e?.message || '解绑失败，请稍后重试');
      } finally {
        setBusy('');
      }
    },
    [load, notice]
  );

  // 登录门必须排在 loading 之前：load() 对匿名根本不发请求，loading 永远不会落地，
  // 先判 loading 会把这一页永久停在「加载中…」，下面的门成了死代码。
  if (!needsLogin && (authLoading || loading)) {
    return <div className="max-w-3xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  }

  const linkedMap = new Map(linked.map((l) => [l.provider, l]));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link href="/me" className="inline-flex items-center py-3 -my-3 text-sm text-primary-600 hover:text-primary-700">← 返回个人中心</Link>
        <h1 className="font-display text-2xl font-bold text-ink-900 mt-3">第三方账号</h1>
        <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">
          绑定后可以直接用对应账号登录本站。解绑不会影响账号本身，之后仍可用邮箱密码登录。
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {needsLogin ? (
        <Empty
          label="登录后即可管理第三方账号"
          hint="绑定需要登录，第三方授权的结果才能挂到你的账号下。"
        >
          <Link className="btn-primary" href="/login?next=%2Fsettings%2Foauth">去登录</Link>
          <Link href="/me" className="btn-secondary">返回个人中心</Link>
        </Empty>
      ) : null}

      {!needsLogin && (providers.length === 0 && linked.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 shadow-soft border border-ink-100 text-center">
          <div className="w-14 h-14 mb-3 mx-auto rounded-2xl bg-primary-50 text-primary-600 grid place-items-center"><IconLink className="w-7 h-7" strokeWidth={1.5} /></div>
          <p className="text-ink-600 font-medium">尚未启用第三方登录</p>
          <p className="text-sm text-ink-400 mt-2 leading-relaxed">
            管理员在服务端配置 <code className="px-1.5 py-0.5 rounded bg-ink-100 text-xs">OAUTH_PROVIDERS</code> 后即可开启。
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-5 md:p-8 shadow-soft border border-ink-100 space-y-4">
          {providers.map((p) => {
            const link = linkedMap.get(p.key);
            const busyNow = busy === p.key;
            const confirming = confirmKey === p.key;

            return (
              <div
                key={p.key}
                className="rounded-2xl border border-ink-200 p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink-800">{p.name}</div>
                  {link ? (
                    <div className="text-xs text-ink-500 mt-1 leading-relaxed break-all">
                      {link.display_name ? `${link.display_name}` : '已绑定'}
                      {link.provider_email ? ` · ${link.provider_email}` : ''}
                      {link.created_at ? ` · 绑定于 ${formatDate(link.created_at)}` : ''}
                    </div>
                  ) : (
                    <div className="text-xs text-ink-400 mt-1">未绑定，绑定后可一键登录</div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {link ? (
                    confirming ? (
                      <>
                        <span className="text-xs text-ink-500">确定解绑？</span>
                        <button
                          type="button"
                          disabled={busyNow}
                          onClick={() => unlink(p.key)}
                          className="px-3 py-1.5 rounded-xl text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-70"
                        >
                          {busyNow ? '处理中…' : '确认解绑'}
                        </button>
                        <button
                          type="button"
                          disabled={busyNow}
                          onClick={() => setConfirmKey('')}
                          className="px-3 py-1.5 rounded-xl text-sm text-ink-600 border border-ink-200 hover:bg-ink-50 disabled:opacity-70"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmKey(p.key)}
                        className="px-4 py-1.5 rounded-xl text-sm font-medium text-rose-600 border border-rose-200 hover:bg-rose-50"
                      >
                        解绑
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled={busyNow}
                      onClick={() => bind(p.key)}
                      className="px-4 py-1.5 rounded-xl text-sm font-medium text-primary-700 border border-primary-200 hover:bg-primary-50 disabled:opacity-70"
                    >
                      {busyNow ? '发起中…' : '绑定'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* 已绑定但当前未启用的 provider（配置变了也要能解绑） */}
          {linked
            .filter((l) => !providers.some((p) => p.key === l.provider))
            .map((l) => {
              const busyNow = busy === l.provider;
              const confirming = confirmKey === l.provider;
              return (
                <div
                  key={l.provider}
                  className="rounded-2xl border border-ink-200 bg-ink-50 p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink-800">{l.provider}</div>
                    <div className="text-xs text-ink-500 mt-1 leading-relaxed break-all">
                      {l.provider_email || '已绑定'}
                      <span className="ml-1 text-ink-400">（该登录方式当前已停用）</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {confirming ? (
                      <>
                        <button
                          type="button"
                          disabled={busyNow}
                          onClick={() => unlink(l.provider)}
                          className="px-3 py-1.5 rounded-xl text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-70"
                        >
                          {busyNow ? '处理中…' : '确认解绑'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmKey('')}
                          className="px-3 py-1.5 rounded-xl text-sm text-ink-600 border border-ink-200 hover:bg-ink-50"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmKey(l.provider)}
                        className="px-4 py-1.5 rounded-xl text-sm font-medium text-rose-600 border border-rose-200 hover:bg-rose-50"
                      >
                        解绑
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      ))}

      {!needsLogin && (
        <p className="text-xs text-ink-400 mt-6 leading-relaxed">
          安全提示：解绑后该第三方将无法再用于登录本站。若你从未设置过密码，
          可通过「忘记密码」用邮箱重置后继续登录。
        </p>
      )}
    </div>
  );
}
