'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { IconChatDots } from '@/components/icons';

/**
 * 演示模式下的扫码落地页。
 * 真实环境二维码内容是微信网页授权地址,由微信带 code 回跳,不会经过本页。
 */
export default function WechatBindPage() {
  const { user } = useAuth();
  const [scene, setScene] = useState('');

  useEffect(() => {
    setScene(new URLSearchParams(window.location.search).get('scene') || '');
  }, []);

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white card-tech rounded-3xl border border-ink-100 px-6 py-9 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center mx-auto mb-4">
          <IconChatDots className="w-8 h-8" strokeWidth={1.6} />
        </div>
        <div className="eyebrow justify-center mb-1.5">账号绑定</div>
        <h1 className="font-display text-xl font-bold text-ink-900 mb-2">微信绑定</h1>
        <p className="text-ink-500 text-sm mb-6 leading-relaxed">
          {user
            ? '当前为演示模式（未配置公众号凭证）。点击下方按钮模拟扫码结果，走通与真实环境一致的绑定回调链路。'
            : '请先登录后再完成绑定。'}
        </p>

        <div className="min-h-[46px]">
          {user && scene ? (
            <a
              href={`/api/v1/wechat/callback?demo=1&scene=${encodeURIComponent(scene)}`}
              className="btn-primary inline-block"
            >
              模拟扫码完成绑定
            </a>
          ) : (
            <Link href="/login" className="btn-primary inline-block">去登录</Link>
          )}
        </div>

        <div className="mt-6">
          <Link href="/settings/notifications" className="text-sm text-ink-500 hover:text-ink-700">
            返回提醒设置
          </Link>
        </div>
      </div>
    </div>
  );
}
