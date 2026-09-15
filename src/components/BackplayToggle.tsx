'use client';

import { useBackgroundPlay } from '@/lib/backplay';

/**
 * 「息屏继续播放」开关。
 * 放在每个播放器上悬浮层 / 播放卡片里,让用户随时能改:
 * 开 = 息屏、切到别的应用后继续出声(锁屏画面上可暂停/切歌);
 * 关 = 一息屏就立刻停。
 */
export default function BackplayToggle({ className = '' }: { className?: string }) {
  const { enabled, setEnabled } = useBackgroundPlay();
  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      data-testid="backplay-toggle"
      data-state={enabled ? 'on' : 'off'}
      title={enabled ? '息屏后继续播放(点击关闭)' : '息屏后立即停止(点击开启后台播放)'}
      aria-label={enabled ? '后台播放已开启' : '后台播放已关闭'}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] leading-none transition-colors ${
        enabled
          ? 'bg-primary-50 text-primary-700 border border-primary-200'
          : 'text-ink-400 border border-ink-200 hover:text-ink-600'
      } ${className}`}
    >
      <span aria-hidden>{enabled ? '🌙' : '⏹'}</span>
      <span>{enabled ? '后台可播' : '息屏即停'}</span>
    </button>
  );
}
