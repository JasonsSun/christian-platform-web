'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGoLogin } from '@/lib/nav';
import { useNotice } from '@/lib/notice';

/**
 * 捐赠支付页
 *
 * 承接 /donate/new 登记成功后的 donationId：
 * 1) 拉 /payments/gateways 拿可用通道（含总闸状态），不可用的不展示；
 * 2) 选通道 -> POST /donations/:id/pay，按返回形态分别处理：
 *    - payUrl：跳转类，当前窗口跳转；
 *    - form：表单类（支付宝电脑网站支付），新窗口自动提交，本页继续轮询；
 *    - codeUrl：扫码类（微信 Native），现场渲染二维码 + 轮询；
 *    - message：无需跳转（线下转账），展示转账指引；
 * 3) 轮询 GET /donations/:id/pay，状态变 confirmed 即跳回 /donate?paid=1。
 *
 * 无弹框约定：错误一律走顶部内联提示条，不使用 alert/confirm。
 */

type GatewayKey = 'alipay' | 'wechat' | 'stripe' | 'offline';

type GatewayItem = { key: string; label: string; configured: boolean; available: boolean };

type GatewayList = {
  onlineEnabled: boolean;
  online: GatewayItem[];
  offlineAvailable: boolean;
};

type PayResult = {
  gateway: GatewayKey;
  outTradeNo: string;
  payUrl?: string;
  form?: { method: 'GET' | 'POST'; action: string; fields: Record<string, string> };
  codeUrl?: string;
  message?: string;
};

type PayState = {
  id: string;
  status: string;
  amountCents: number;
  paymentMethod: string | null;
  outTradeNo: string | null;
};

const GATEWAY_HINT: Record<string, string> = {
  alipay: '跳转支付宝网页完成付款，支持花呗与余额',
  wechat: '使用微信 App 扫描二维码完成付款',
  stripe: '跳转 Stripe 安全收银台，支持境外银行卡',
  offline: '按下方信息线下转账，管理员确认后入账',
};

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ROUNDS = 200; // 10 分钟兜底，避免无限轮询

export default function DonatePayPage() {
  const params = useParams<{ id: string }>();
  const donationId = params?.id as string;
  const { user, loading: authLoading } = useAuth();
  const goLogin = useGoLogin();
  const router = useRouter();
  const notice = useNotice();

  const [gateways, setGateways] = useState<GatewayList | null>(null);
  const [state, setState] = useState<PayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<PayResult | null>(null);
  const [qr, setQr] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundsRef = useRef(0);

  useEffect(() => {
    if (!authLoading && !user) goLogin(`/donate/pay/${donationId}`);
  }, [authLoading, user, goLogin, donationId]);

  // 加载可用通道与当前捐赠状态
  useEffect(() => {
    if (!user || !donationId) return;
    let alive = true;
    (async () => {
      try {
        const [gs, st] = await Promise.all([
          apiGet<GatewayList>('/payments/gateways').catch(() => null),
          apiGet<PayState>(`/donations/${donationId}/pay`).catch(() => null),
        ]);
        if (!alive) return;
        setGateways(gs);
        setState(st);
        if (!st) setError('捐赠记录不存在或无权查看');
      } catch {
        if (alive) setError('加载支付信息失败，请稍后重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, donationId]);

  // 轮询支付结果：一旦 confirmed 立即跳回捐赠专区
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    roundsRef.current = 0;
    pollRef.current = setInterval(async () => {
      roundsRef.current += 1;
      if (roundsRef.current > POLL_MAX_ROUNDS) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setError('支付结果确认超时，若已完成付款请稍后查看捐赠记录');
        return;
      }
      try {
        const st = await apiGet<PayState>(`/donations/${donationId}/pay`);
        setState(st);
        if (st?.status === 'confirmed') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          notice.success('支付成功，感谢你的奉献');
          router.push('/donate?paid=1');
        }
      } catch {
        /* 轮询失败不打断用户扫码，下一轮继续 */
      }
    }, POLL_INTERVAL_MS);
  }, [donationId, router, notice]);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  // 扫码类：把 codeUrl 渲染成二维码
  useEffect(() => {
    if (!result?.codeUrl) return;
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toDataURL(result.codeUrl as string, { width: 220, margin: 1 }))
      .then((url) => {
        if (alive) setQr(url);
      })
      .catch(() => {
        if (alive) setError('二维码生成失败，请改用其它支付方式');
      });
    return () => {
      alive = false;
    };
  }, [result?.codeUrl]);

  const pay = useCallback(
    async (key: GatewayKey) => {
      if (paying) return;
      setPaying(true);
      setError(null);
      try {
        const res = await apiPost<PayResult>(`/donations/${donationId}/pay`, { gateway: key });
        setResult(res);

        if (res.form) {
          // 表单类：新窗口自动提交，本页留着轮询，支付完能自动跳回
          const form = document.createElement('form');
          form.method = res.form.method;
          form.action = res.form.action;
          form.target = '_blank';
          Object.entries(res.form.fields || {}).forEach(([k, v]) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = k;
            input.value = String(v);
            form.appendChild(input);
          });
          document.body.appendChild(form);
          form.submit();
          form.remove();
          startPolling();
        } else if (res.codeUrl) {
          startPolling();
        } else if (res.payUrl) {
          window.location.href = res.payUrl;
        } else {
          notice.success('已记录你的支付方式');
        }
      } catch (e: any) {
        setError(e?.message || '发起支付失败，请稍后重试');
      } finally {
        setPaying(false);
      }
    },
    [donationId, paying, startPolling, notice]
  );

  const amountText = useMemo(
    () => (state ? (Number(state.amountCents || 0) / 100).toFixed(2) : '0.00'),
    [state]
  );

  const channels = useMemo(() => {
    const list: { key: GatewayKey; label: string; enabled: boolean }[] = [];
    (gateways?.online || []).forEach((g) => {
      list.push({ key: g.key as GatewayKey, label: g.label, enabled: !!g.available });
    });
    if (gateways?.offlineAvailable) {
      list.push({ key: 'offline', label: '线下转账', enabled: true });
    }
    return list;
  }, [gateways]);

  if (authLoading || loading) {
    return <div className="max-w-3xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-ink-500 mb-4">支付需要先登录账号。</p>
        <Link className="btn-primary" href="/login?next=%2Fdonate%2Fnew">去登录</Link>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p role="alert" className="text-ink-500 mb-4">{error}</p>
        <Link className="btn-primary" href="/donate">返回捐赠专区</Link>
      </div>
    );
  }

  if (state?.status === 'confirmed') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <div className="text-4xl mb-3">🙏</div>
        <h1 className="font-display text-2xl font-bold text-ink-900">捐赠已确认</h1>
        <p className="text-sm text-ink-500 mt-2">感谢你的奉献，愿主纪念。</p>
        <Link className="btn-primary inline-block mt-6" href="/donate">返回捐赠专区</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link href="/donate" className="text-sm text-primary-600 hover:text-primary-700">← 返回捐赠专区</Link>
        <h1 className="font-display text-2xl font-bold text-ink-900 mt-3">完成支付</h1>
        <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">
          捐赠金额 <span className="font-semibold text-ink-800">¥{amountText}</span>
          ，选择一种支付方式完成奉献。
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {gateways && !gateways.onlineEnabled && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          线上支付通道当前已关闭，请使用线下转账完成本次奉献。
        </div>
      )}

      {/* 扫码支付：微信 Native */}
      {result?.codeUrl && (
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-soft border border-ink-100 text-center mb-6">
          <div className="font-semibold text-ink-900 mb-1">请使用微信扫描二维码支付</div>
          <div className="text-sm text-ink-500 mb-5">
            应付金额 <span className="font-semibold text-ink-800">¥{amountText}</span>
          </div>
          {qr ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={qr} alt="支付二维码" className="mx-auto w-[220px] h-[220px] rounded-2xl border border-ink-100"  decoding="async"  loading="eager" />
          ) : (
            <div className="mx-auto w-[220px] h-[220px] rounded-2xl border border-ink-100 flex items-center justify-center text-ink-400 text-sm">
              二维码生成中…
            </div>
          )}
          <p className="text-xs text-ink-400 mt-4">支付完成后本页会自动跳转，请勿关闭窗口。</p>
          <button type="button" onClick={() => pay(result.gateway)} disabled={paying} className="btn-secondary mt-4 disabled:opacity-70">
            {paying ? '刷新中…' : '重新获取二维码'}
          </button>
        </div>
      )}

      {/* 线下转账指引 */}
      {result?.message && (
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-soft border border-ink-100 mb-6">
          <div className="font-semibold text-ink-900 mb-3">线下转账</div>
          <p className="text-sm text-ink-600 whitespace-pre-wrap leading-relaxed">{result.message}</p>
          <p className="text-xs text-ink-400 mt-4">
            管理员确认到账后会更新为已确认，届时你可能收到站内通知。
          </p>
        </div>
      )}

      {/* 通道选择 */}
      {!result?.codeUrl && (
        <div className="bg-white rounded-3xl p-5 md:p-8 shadow-soft border border-ink-100">
          <label id="pay-gateway-label" className="block text-sm font-medium text-ink-700 mb-3">选择支付方式</label>
          <div className="space-y-3" role="group" aria-labelledby="pay-gateway-label">
            {channels.map((c) => {
              const disabled = !c.enabled || paying;
              return (
                <button
                  key={c.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => pay(c.key)}
                  className={`w-full text-left rounded-2xl border p-4 transition ${
                    disabled
                      ? 'border-ink-200 bg-ink-50 opacity-60 cursor-not-allowed'
                      : 'border-ink-200 hover:border-primary-300 hover:bg-primary-50/40'
                  }`}
                >
                  <div className="font-semibold text-ink-800">
                    {c.label}
                    {!c.enabled && <span className="ml-2 text-xs font-normal text-ink-400">暂不可用</span>}
                  </div>
                  <div className="text-xs text-ink-500 mt-1">{GATEWAY_HINT[c.key] || ''}</div>
                </button>
              );
            })}
          </div>

          {channels.length === 0 && (
            <p className="text-sm text-ink-500 py-4">暂无可用支付方式，请稍后再试或联系管理员。</p>
          )}

          {paying && <p className="text-sm text-ink-500 mt-4">正在发起支付…</p>}
        </div>
      )}

      <p className="text-xs text-ink-400 mt-6 leading-relaxed">
        奉献出于自愿，平台不收取任何手续费。遇到支付问题可前往
        <Link href="/feedback" className="text-primary-600 hover:text-primary-700"> 意见反馈 </Link>
        联系我们。
      </p>
    </div>
  );
}
