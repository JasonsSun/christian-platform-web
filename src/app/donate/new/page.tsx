'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/useApi';
import { useGoLogin } from '@/lib/nav';
import { useNotice } from '@/lib/notice';

/**
 * 捐赠登记
 *
 * 无弹框约定:未登录 -> 跳转登录页并带回跳;校验失败/请求失败 -> 顶部内联提示条。
 * 提交成功后跳回 /donate 并展示成功提示。
 */

type DonorType = 'personal' | 'church';

const PRESET_AMOUNTS = [10, 20, 50, 100, 200, 500];

export default function DonateNewPage() {
  const { user, loading: authLoading } = useAuth();
  const goLogin = useGoLogin();
  const router = useRouter();
  const notice = useNotice();
  const { run, pending, setError } = useAction();

  const [donorType, setDonorType] = useState<DonorType>('personal');
  const [displayName, setDisplayName] = useState('');
  const [churchName, setChurchName] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);

  // 未登录：直接跳登录页（带回跳），不使用弹框
  useEffect(() => {
    if (!authLoading && !user) goLogin('/donate/new');
  }, [authLoading, user, goLogin]);

  // 登录后预填昵称
  useEffect(() => {
    if (user && !displayName) setDisplayName(user.displayName || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (donorType === 'personal' && !displayName.trim()) {
        notice.error('请填写展示名称');
        return;
      }
      if (donorType === 'church' && !churchName.trim()) {
        notice.error('请填写教会名称');
        return;
      }
      const yuan = Number(amount);
      if (!Number.isFinite(yuan) || yuan <= 0) {
        notice.error('请填写有效的捐赠金额');
        return;
      }

      const res = await run(() =>
        apiPost('/donations', {
          donorType,
          displayName: displayName.trim(),
          churchName: churchName.trim(),
          amount: yuan,
          message: message.trim(),
          anonymous,
        })
      );
      // 登记成功 -> 进入支付页选择支付方式（含线下转账），不再直接回列表
      if (res) router.push(`/donate/pay/${res.id}`);
    },
    [donorType, displayName, churchName, amount, message, anonymous, run, router, notice, setError]
  );

  if (authLoading) {
    return <div className="max-w-3xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-ink-500 mb-4">捐赠登记需要先登录账号。</p>
        <Link className="btn-primary" href="/login?next=%2Fdonate%2Fnew">去登录</Link>
      </div>
    );
  }

  const previewName =
    donorType === 'church'
      ? (churchName.trim() ? (/教会$/.test(churchName.trim()) ? churchName.trim() : `${churchName.trim()}教会`) : '某某教会')
      : anonymous
        ? '爱心弟兄姊妹'
        : displayName.trim() || '某某';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link href="/donate" className="text-sm text-primary-600 hover:text-primary-700">← 返回捐赠专区</Link>
        <h1 className="font-display text-2xl font-bold text-ink-900 mt-3">捐赠登记</h1>
        <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">
          本次捐赠完全出于自愿。提交后由管理员确认，确认通过将展示在爱心名录中；
          名录中的金额一律显示为 <span className="font-semibold text-ink-700 tracking-widest">****元</span>，
          真实金额仅管理员可见。
        </p>
      </div>

      <form onSubmit={submit} className="bg-white rounded-3xl p-5 md:p-8 shadow-soft border border-ink-100 space-y-6">
        {/* 捐赠名义 */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-2">捐赠名义</label>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { value: 'personal', title: '个人名义', desc: '展示为「某某 捐赠 ****元」' },
                { value: 'church', title: '教会名义', desc: '展示为「某某教会 捐赠 ****元」' },
              ] as const
            ).map((opt) => {
              const active = donorType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDonorType(opt.value)}
                  className={`text-left rounded-2xl border p-4 transition ${
                    active
                      ? 'border-primary-500 bg-primary-50 shadow-soft'
                      : 'border-ink-200 hover:border-primary-300 hover:bg-ink-50'
                  }`}
                >
                  <div className={`font-semibold ${active ? 'text-primary-700' : 'text-ink-800'}`}>{opt.title}</div>
                  <div className="text-xs text-ink-500 mt-1">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 展示名 / 教会名 */}
        {donorType === 'personal' ? (
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">展示名称</label>
            <input
              className="input-styled"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="名录中显示的名字，如：陈恩惠"
              maxLength={60}
            />
            <p className="text-xs text-ink-400 mt-1.5">默认使用你的昵称，可修改为希望的称呼。</p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">教会名称</label>
            <input
              className="input-styled"
              value={churchName}
              onChange={(e) => setChurchName(e.target.value)}
              placeholder="如：恩典堂（名录中将显示为「恩典堂教会」）"
              maxLength={60}
            />
            <p className="text-xs text-ink-400 mt-1.5">名称已含「教会」二字时将原样展示。</p>
          </div>
        )}

        {/* 金额 */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">捐赠金额（元）</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESET_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className={`px-3 py-1.5 rounded-xl text-sm border transition ${
                  amount === String(v)
                    ? 'border-gold-500 bg-gold-50 text-gold-800'
                    : 'border-ink-200 text-ink-600 hover:border-gold-300'
                }`}
              >
                {v} 元
              </button>
            ))}
          </div>
          <input
            type="number"
            min={1}
            step={1}
            className="input-styled"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="请输入金额，如 100"
          />
          <p className="text-xs text-ink-400 mt-1.5">
            金额仅平台管理员可见，公开名录中一律显示为 ****元。
          </p>
        </div>

        {/* 留言 */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">留言 / 祝福（选填）</label>
          <textarea
            className="input-styled min-h-[90px]"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="写下你想说的话，会展示在名录中"
            maxLength={200}
          />
          <p className="text-xs text-ink-400 mt-1.5">{message.length}/200</p>
        </div>

        {/* 匿名 */}
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 accent-primary-600"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
          />
          <span className="text-sm text-ink-700">
            匿名展示
            <span className="block text-xs text-ink-400 mt-0.5">勾选后名录中显示为「爱心弟兄姊妹 捐赠 ****元」</span>
          </span>
        </label>

        {/* 预览 */}
        <div className="rounded-2xl bg-ink-50 border border-ink-100 p-4">
          <div className="text-xs text-ink-500 mb-1.5">名录展示效果预览</div>
          <div className="font-semibold text-ink-900">
            {previewName}
            <span className="font-normal text-ink-600">捐赠</span>
            <span className="text-ink-400 tracking-widest ml-0.5">****元</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <Link href="/donate" className="btn-secondary flex-1 text-center">取消</Link>
          <button type="submit" disabled={pending} className="btn-primary flex-1 disabled:opacity-70">
            {pending ? '提交中…' : '提交捐赠登记'}
          </button>
        </div>
      </form>
    </div>
  );
}
