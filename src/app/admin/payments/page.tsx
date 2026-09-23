'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiPatch } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { canEnterAdmin, AdminLayout, Loading, ErrorBox, Badge, PageHead, Panel, AccessState } from '../_components';

/**
 * 支付配置(仅管理员)
 * 商户密钥加密存库，读写都走 /admin/payments，明文永不出服务端。
 * 线上支付总闸仍在「系统设置」里控制。
 */

interface PayField {
  key: string; label: string; group: string; secret: boolean; hint: string; set: boolean; value: string;
}

const GROUP_META: Record<string, { title: string; desc: string; warn?: string }> = {
  alipay: {
    title: '支付宝',
    desc: '电脑网站支付（RSA2 签名，下单即跳转）。商户平台异步回调地址填：/api/v1/payments/notify/alipay',
  },
  wechat: {
    title: '微信支付',
    desc: 'Native 扫码支付。表单可先填，待适配器补齐 v3 签名与回调解密后即生效。',
    warn: '微信支付适配器仍为占位实现，保存密钥暂不会真正发起支付。',
  },
  stripe: {
    title: 'Stripe',
    desc: 'Checkout Session + Webhook 验签（需境外主体）。表单可先填，适配器补齐后生效。',
    warn: 'Stripe 适配器仍为占位实现，保存密钥暂不会真正发起支付。',
  },
};

const ORDER = ['alipay', 'wechat', 'stripe'];
const KEEP = '****';
const CLEAR = '__CLEAR__';

export default function AdminPaymentsPage() {
  const { user, loading: authLoading } = useAuth();
  // 文件注释写着「仅管理员」，读写接口也确实只认 admin —— 但页面自己没拦：
  // 匿名打开换回一行红色 401，审核员打开则是一整页填得动、保存必失败的密钥输入框。
  const canSee = canEnterAdmin(user, '/admin/payments');
  const { data, loading, error, reload } = useApi<{ fields: PayField[]; onlineEnabled: boolean }>(
    canSee ? '/admin/payments' : null,
    [canSee]
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (data?.fields) {
      const d: Record<string, string> = {};
      data.fields.forEach((f) => { d[f.key] = f.value; });
      setDraft(d);
    }
  }, [data]);

  const fields = data?.fields || [];
  const groups = ORDER.filter((g) => fields.some((f) => f.group === g));
  const dirty = fields.some((f) => draft[f.key] !== f.value);

  function setVal(key: string, v: string) {
    setDraft((prev) => ({ ...prev, [key]: v }));
  }

  async function save() {
    setBusy(true); setMsg('');
    try {
      const changed: Record<string, string> = {};
      let n = 0;
      fields.forEach((f) => {
        const v = draft[f.key];
        if (v === undefined || v === f.value) return;
        changed[f.key] = v;
        n++;
      });
      if (!n) { setMsg('没有需要保存的更改'); setBusy(false); return; }
      await apiPatch('/admin/payments', { fields: changed });
      setMsg(`已保存 ${n} 项配置`);
      reload();
    } catch (e: any) {
      setMsg(e?.message || '保存失败');
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) return <AdminLayout><Loading /></AdminLayout>;
  if (!user)
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="支付配置只对管理员开放，请先用管理员账号登录。" href="/login?next=/admin/payments" />
      </AdminLayout>
    );
  if (!canSee)
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限访问" desc="商户密钥的读取与保存仅限平台管理员，审核员无法操作。" />
      </AdminLayout>
    );

  return (
    <AdminLayout>
      <PageHead
        eyebrow="运营 · 支付"
        title="支付配置"
        sub={<>商户密钥加密存储于数据库，<span className="text-ink-700">优先于 .env</span>；保存后即时生效，无需重启服务。</>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2 glass rounded-2xl px-4 py-3 text-sm shadow-soft hair-top">
        <span className="text-ink-600">线上支付总闸：</span>
        {data?.onlineEnabled ? <Badge tone="green">已开启</Badge> : <Badge tone="gray">已关闭（仅线下转账）</Badge>}
        <Link href="/admin/settings" className="btn-secondary btn-sm min-h-11 lg:min-h-0 ml-auto">
          去系统设置调整总闸
        </Link>
      </div>

      {loading && !data ? <Loading rows={3} /> : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="space-y-6" data-reveal-group>
          {groups.map((g) => {
            const meta = GROUP_META[g];
            return (
              <Panel
                key={g}
                title={meta?.title || g}
                aside={<Badge tone="primary">{fields.filter((f) => f.group === g).length} 项</Badge>}
              >
                {meta?.desc ? <p className="-mt-1 mb-3 text-xs text-ink-500 leading-relaxed">{meta.desc}</p> : null}
                {meta?.warn ? (
                  <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{meta.warn}</p>
                ) : null}

                <div className="space-y-4">
                  {fields.filter((f) => f.group === g).map((f) => {
                    const val = draft[f.key] ?? '';
                    const willClear = val === CLEAR;
                    // 配置项 key 唯一，用作控件 id / name：密钥框有真实标签且密码管理器可识别
                    const fieldId = `pay-${f.key}`;
                    return (
                      <div key={f.key}>
                        <div className="mb-1 flex items-center gap-2 flex-wrap">
                          <label htmlFor={fieldId} className="text-sm text-ink-700">{f.label}</label>
                          {f.set ? <Badge tone="green">已配置</Badge> : <Badge tone="gray">未配置</Badge>}
                          {willClear ? <Badge tone="red">将清空</Badge> : null}
                          {f.secret && f.set && !willClear && val === '' ? (
                            <span className="text-[11px] text-ink-400">留空保持不变</span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            id={fieldId}
                            name={f.key}
                            className="input-styled min-h-11 lg:min-h-0 flex-1 min-w-0 font-mono text-sm"
                            type={f.secret && !reveal[f.key] ? 'password' : 'text'}
                            value={willClear ? '' : val}
                            placeholder={f.secret ? (f.set ? '已配置（留空保持不变）' : '未配置') : '未配置'}
                            onChange={(e) => setVal(f.key, e.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                          />
                          {f.secret ? (
                            <>
                              <button
                                type="button"
                                className="btn-chip shrink-0"
                                aria-pressed={!!reveal[f.key]}
                                aria-label={reveal[f.key] ? `隐藏 ${f.label}` : `显示 ${f.label}`}
                                onClick={() => setReveal((p) => ({ ...p, [f.key]: !p[f.key] }))}
                              >
                                {reveal[f.key] ? '隐藏' : '显示'}
                              </button>
                              {f.set ? (
                                <button
                                  type="button"
                                  className="btn-chip btn-chip-danger shrink-0"
                                  onClick={() => setVal(f.key, CLEAR)}
                                >
                                  清空
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        {f.hint ? <div className="mt-1 text-[11px] text-ink-400">{f.hint}</div> : null}
                      </div>
                    );
                  })}
                </div>
              </Panel>
            );
          })}

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={save} disabled={busy || !dirty} className="btn-primary min-h-11 lg:min-h-0 disabled:opacity-50">
              {busy ? '保存中…' : '保存更改'}
            </button>
            {dirty ? <span className="text-sm text-gold-700">有未保存的更改</span> : null}
            {msg ? <span role="status" className="text-sm text-primary-700">{msg}</span> : null}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
