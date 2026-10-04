import Link from 'next/link';
import { IconLock } from '@/components/icons';

/**
 * 全站统一的未登录门。替代各页面手写的多套「请先登录」卡片，
 * 视觉与回跳地址(next)保持一致；未登录态下点击「去登录」后跳回当前页。
 */
export function LoginGate({
  title = '请先登录',
  hint,
  next,
}: {
  title?: string;
  hint?: string;
  next: string;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-ink-100 text-ink-500 flex items-center justify-center mb-4">
        <IconLock className="w-7 h-7" strokeWidth={1.6} />
      </div>
      <h1 className="font-display text-2xl font-bold text-ink-900 mb-2">{title}</h1>
      {hint ? <p className="text-ink-500 mb-6">{hint}</p> : null}
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-primary">
        去登录
      </Link>
    </div>
  );
}
