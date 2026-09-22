'use client';

import Link from 'next/link';
import { useSpeechSession } from '@/lib/speechSession';
import BackplayToggle from '@/components/BackplayToggle';
import { IconBookOpen, IconClose, IconPause, IconPlay } from '@/components/icons';

/**
 * 全站悬浮「朗读卡」。
 * 经文/文章朗读开始后由 useSpeech 广播会话到 @/lib/speechSession,
 * 切到别的页面仍能看到「正在朗读 xx」并暂停/停止;息屏后由 Media Session 接管
 * (见 @/lib/backplay),锁屏画面直接显示同一标题。
 */
export default function SpeechMiniCard({ raised = false }: { raised?: boolean }) {
  const s = useSpeechSession();
  if (!s) return null;

  const bottom = raised
    ? 'calc(9.5rem + env(safe-area-inset-bottom))'
    : 'calc(5rem + env(safe-area-inset-bottom))';

  return (
    <div
      data-testid="speech-mini-card"
      className="fixed z-[56] right-4 md:right-6 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-ink-200 bg-ui-surface backdrop-blur-md shadow-card-hover overflow-hidden"
      style={{ bottom }}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center text-white flex-shrink-0">
          {s.state === 'loading' ? (
            <span className="animate-pulse text-xs">合成中</span>
          ) : s.state === 'playing' ? (
            <span className="inline-flex items-end gap-[2px] h-4">
              <span className="w-[3px] bg-white h-2.5 animate-pulse" />
              <span className="w-[3px] bg-white h-4 animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-[3px] bg-white h-2 animate-pulse" style={{ animationDelay: '300ms' }} />
            </span>
          ) : (
            <IconBookOpen className="w-6 h-6" strokeWidth={1.6} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink-900">{s.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="truncate text-xs text-ink-400">
              {s.state === 'loading'
                ? '语音合成中…'
                : s.state === 'playing'
                  ? '正在朗读'
                  : '已暂停'}
            </span>
            {!s.backplayable && s.state !== 'loading' ? (
              <span className="shrink-0 text-[10px] px-1 rounded bg-amber-50 text-amber-700" title="本机语音在息屏后会被系统挂起；开启后台播放后改用在线语音即可息屏续听">
                息屏暂停
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={s.toggle}
            disabled={s.state === 'loading'}
            title={s.state === 'playing' ? '暂停朗读' : '继续朗读'}
            className="w-10 h-10 rounded-full bg-primary-600 text-white shadow-card hover:bg-primary-700 flex items-center justify-center disabled:opacity-50"
          >
            {s.state === 'playing' ? <IconPause className="w-4 h-4" /> : <IconPlay className="w-4 h-4 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={s.stop}
            title="停止朗读"
            className="w-8 h-8 rounded-full text-ink-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"
          >
            <IconClose className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 pb-2.5">
        <BackplayToggle />
        <div className="flex-1" />
        {s.href ? (
          <Link href={s.href} className="text-xs text-primary-600 hover:text-primary-700">
            回到此处 →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
