'use client';

import { useBackgroundPlay, mediaSessionSupported } from '@/lib/backplay';

/**
 * 「后台播放」偏好设置。
 * 开:息屏 / 切到别的应用后,诗歌、媒体、经文朗读继续出声,
 *    锁屏画面(安卓通知栏、iOS 控制中心)显示标题并可直接暂停/切歌。
 * 关:一息屏立刻停。
 * 注意:浏览器原生语音(speechSynthesis)无法息屏续读,开启后经文朗读会自动
 * 改用在线语音合成——需要联网,换来的就是能像听书一样息屏听。
 */
export default function BackplaySettingCard() {
  const { enabled, setEnabled } = useBackgroundPlay();
  const supported = mediaSessionSupported();

  return (
    <div className="mt-6 rounded-2xl border border-ink-100 bg-ui-surface p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">🌙</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-ink-900">后台播放</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full ${enabled ? 'bg-primary-50 text-primary-600' : 'bg-ink-100 text-ink-600'}`}>
              {enabled ? '息屏继续播放' : '息屏立即停止'}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-500 leading-relaxed">
            开启后息屏或切到别的应用，诗歌、视频音频与经文朗读仍会继续；
            {supported
              ? '锁屏画面上可以直接暂停、切下一首。'
              : '当前浏览器不支持锁屏控件，仍可息屏续播，回到页面即可控制。'}
          </p>
          {enabled ? (
            <p className="mt-1 text-xs text-ink-400">
              为保证息屏也能听，经文朗读会自动改用在线语音（需联网）；本机语音在息屏后会被系统挂起。
            </p>
          ) : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          data-testid="backplay-setting-switch"
          onClick={() => setEnabled(!enabled)}
          aria-label="后台播放"
          /* after: 只撑命中区不改视觉尺寸：开关本身 28px 高，手机上按不准 */
          className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 after:absolute after:-inset-y-1.5 after:-inset-x-1 after:content-[''] ${enabled ? 'bg-primary-600' : 'bg-ink-300'}`}
        >
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-6' : 'left-1'}`} />
        </button>
      </div>
    </div>
  );
}
