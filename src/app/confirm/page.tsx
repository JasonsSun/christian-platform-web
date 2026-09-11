'use client';

/**
 * 通用确认 / 输入页（跳转式，替代 confirm() / prompt()）
 *
 * 进入方式：其他页面调用 useConfirmNav() → router.push('/confirm?id=xxx')
 * 离开方式：确认 → 执行回调 → 回跳来源页；取消 → 直接回跳来源页。
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNotice } from '@/lib/notice';
import { dropConfirm, getConfirmMeta, getConfirmRequest } from '@/lib/confirm';
import { runConfirmAction } from '@/lib/confirmActions';

/** 确认动作执行器：优先用来源页内存回调，缺失时回退到声明式 action */
type Runner = (value: string) => void | Promise<unknown>;

function ConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const notice = useNotice();
  const id = params?.get('id') || '';

  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [confirmText, setConfirmText] = useState('确认');
  const [cancelText, setCancelText] = useState('返回');
  const [danger, setDanger] = useState(false);
  const [inputSpec, setInputSpec] = useState<{ label: string; placeholder?: string; required?: boolean; multiline?: boolean; initial?: string } | null>(null);
  const [back, setBack] = useState('/');
  const [stale, setStale] = useState(false);
  /** 由内存回调或声明式 action 组装的执行器 */
  const [runner, setRunner] = useState<Runner | null>(null);

  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!id) {
      setStale(true);
      setReady(true);
      return;
    }
    const meta = getConfirmMeta(id);
    const req = getConfirmRequest(id);
    const memRunner: Runner | null = req && typeof req.onConfirm === 'function' ? (req.onConfirm as Runner) : null;
    // 内存回调丢失时（刷新/新标签页），只要 meta 里登记了 action 就仍可执行
    const fallbackRunner: Runner | null = meta?.action
      ? async (v: string) => {
          const r = await runConfirmAction(meta.action as string, (meta.params || {}) as Record<string, unknown>, v);
          if (r.message) notice.success(r.message);
          if (!r.ok) throw new Error(r.message || '操作失败');
        }
      : null;
    const useRunner = memRunner || fallbackRunner;
    if (!meta || !useRunner) {
      setStale(true);
      if (meta?.back) setBack(meta.back);
      setReady(true);
      return;
    }
    setTitle(meta.title || '请确认操作');
    setDesc(meta.desc || '');
    setConfirmText(meta.confirmText || '确认');
    setCancelText(meta.cancelText || '返回');
    setDanger(!!meta.danger);
    setInputSpec(meta.input || null);
    setBack(meta.back || '/');
    setValue(meta.input?.initial || '');
    setRunner(() => useRunner);
    setReady(true);
  }, [id, notice]);

  const goBack = useCallback(() => {
    if (id) dropConfirm(id);
    router.replace(back || '/');
  }, [id, router, back]);

  const submit = useCallback(async () => {
    if (!id) return;
    const run = runner || (getConfirmRequest(id)?.onConfirm as Runner | undefined) || null;
    if (!run) {
      setStale(true);
      return;
    }
    if (inputSpec?.required && !value.trim()) {
      setErr(inputSpec.label ? `请填写${inputSpec.label}` : '请填写内容');
      return;
    }
    setErr('');
    setPending(true);
    try {
      const r = await run(value.trim());
      if (id) dropConfirm(id);
      if (r === false) {
        setPending(false);
        return;
      }
      router.replace(back || '/');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '操作失败，请重试';
      setErr(msg);
      notice.error(msg);
      setPending(false);
    }
  }, [id, runner, inputSpec, value, router, back, notice]);

  if (!ready) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center text-ink-400">加载中…</div>
    );
  }

  if (stale) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20">
        <div className="bg-white rounded-3xl p-8 md:p-10 shadow-soft border border-ink-100 text-center">
          <div className="text-5xl mb-4">🔗</div>
          <h1 className="font-display text-2xl font-bold text-ink-900 mb-2">操作链接已失效</h1>
          <p className="text-ink-500 text-sm leading-relaxed mb-6">
            该确认已超时或已处理。请返回原页面重新发起该操作。
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {back && back !== '/' && (
              <button type="button" onClick={goBack} className="btn-primary">
                返回原页面
              </button>
            )}
            <Link href="/" className="btn-secondary inline-block">
              返回首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 md:py-20">
      <div className="bg-white rounded-3xl p-6 md:p-9 shadow-soft border border-ink-100">
        <div className="flex items-center gap-3 mb-5">
          <span
            className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl ${
              danger ? 'bg-rose-50 text-rose-600' : 'bg-primary-50 text-primary-600'
            }`}
          >
            {danger ? '⚠️' : '✅'}
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-ink-900">{title}</h1>
        </div>

        {desc && (
          <p className="text-ink-600 leading-relaxed whitespace-pre-wrap mb-6 text-[15px]">{desc}</p>
        )}

        {inputSpec && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              {inputSpec.label}
              {inputSpec.required && <span className="text-rose-500 ml-1">*</span>}
            </label>
            {inputSpec.multiline ? (
              <textarea
                className="input-styled min-h-[100px]"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={inputSpec.placeholder}
              />
            ) : (
              <input
                className="input-styled"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={inputSpec.placeholder}
              />
            )}
          </div>
        )}

        {err && (
          <div className="mb-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm px-4 py-3">{err}</div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <button type="button" onClick={goBack} disabled={pending} className="btn-secondary flex-1 disabled:opacity-60">
            {cancelText}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className={`flex-1 disabled:opacity-60 ${danger ? 'btn-danger' : 'btn-primary'}`}
          >
            {pending ? '处理中…' : confirmText}
          </button>
        </div>

        <p className="mt-6 text-xs text-ink-400 leading-relaxed">
          本页为操作确认页，离开后需要返回原页面重新发起。
        </p>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-24 text-center text-ink-400">加载中…</div>}>
      <ConfirmInner />
    </Suspense>
  );
}
