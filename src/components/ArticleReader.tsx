'use client';

import { useMemo } from 'react';
import { type SpeechItem } from '@/lib/useSpeech';
import { useHostedSpeech } from '@/lib/speechHost';

/**
 * 文章朗读（内容与经文共用同一套朗读引擎）。
 * 按段落切分逐段朗读，服务端 TTS / 浏览器直连兜底逻辑与读经页一致。
 */
export default function ArticleReader({ title, body }: { title: string; body: string }) {
  const items = useMemo<SpeechItem[]>(() => {
    const paras = (body || '')
      .split(/\n{1,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const list = paras.length ? paras : [body || ''];
    // 每段上限 400 字，避免超长段落被引擎静默掐断
    const out: SpeechItem[] = [];
    list.forEach((p, i) => {
      if (p.length <= 400) {
        out.push({ key: i + 1, text: p });
        return;
      }
      let n = 0;
      for (let s = 0; s < p.length; s += 400) {
        out.push({ key: (i + 1) * 1000 + n, text: p.slice(s, s + 400) });
        n += 1;
      }
    });
    return out;
  }, [body]);

  const speech = useHostedSpeech(items, {
    lang: 'zh-CN',
    announceKey: false,
    leadText: title || null,
    mediaTitle: title || '文章朗读',
    mediaSubtitle: '圣约社区 · 朗读',
  });

  if (!items.length || !items[0].text) return null;

  // 用户把指针/焦点移到按钮上（= 有朗读意图）时，提前把头两段送给服务端合成。
  // 文章是动态内容、很少被重复访问，缓存命中率低，所以只在有意图时才预热，
  // 避免每次打开文章都在后台打一堆 TTS 请求（机房 IP 会被风控）。
  const warmUp = () => speech.warm(1, 2);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onPointerEnter={warmUp}
        onFocus={warmUp}
        onTouchStart={warmUp}
        onClick={() => {
          if (speech.state === 'playing') speech.pause();
          else if (speech.state === 'paused') speech.resume();
          else speech.start();
        }}
        disabled={speech.ttsLoading}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
          speech.state !== 'idle'
            ? 'bg-primary-600 text-white border border-primary-600'
            : 'bg-ink-50 text-ink-600 border border-ink-200 hover:border-primary-300 hover:text-primary-600'
        } ${speech.ttsLoading ? 'opacity-60 cursor-wait' : ''}`}
        title={speech.state === 'idle' ? '朗读本文' : '停止/继续'}
      >
        {speech.ttsLoading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3a9 9 0 109 9" /></svg>
        ) : speech.state === 'playing' ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
        ) : (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" /></svg>
        )}
        {speech.ttsLoading ? '合成中…' : speech.state === 'playing' ? '暂停朗读' : speech.state === 'paused' ? '继续朗读' : '朗读本文'}
      </button>

      {speech.state !== 'idle' && (
        <button
          type="button"
          onClick={speech.stop}
          className="px-3 py-2 rounded-xl text-xs text-ink-500 border border-ink-200 hover:border-rose-200 hover:text-rose-600"
        >
          停止
        </button>
      )}

      {speech.ttsMode === 'browser' && !speech.ttsLoading && (
        <button
          type="button"
          onClick={() => speech.useServerVoice()}
          className="px-3 py-2 rounded-xl text-xs text-ink-500 border border-ink-200 hover:border-primary-300 hover:text-primary-600"
          title="本机缺少中文语音时浏览器朗读会完全无声，点此改用服务器合成"
        >
          🔊 没声音？改用在线语音
        </button>
      )}

      {speech.ttsMode === 'server' && !speech.ttsLoading && (
        <span className="px-3 py-2 rounded-xl text-xs text-ink-400">
          当前使用在线语音（服务器合成，需联网）
        </span>
      )}

      {speech.clientReady && (
        <button
          type="button"
          onClick={speech.clientPlay}
          className="px-3 py-2 rounded-xl bg-primary-600 text-white text-xs font-medium hover:bg-primary-700"
        >
          ▶ 点此播放
        </button>
      )}

      {speech.ttsError && !speech.clientReady && (
        <span className="text-xs text-rose-600">⚠ 语音合成暂不可用，请稍后重试</span>
      )}
    </div>
  );
}
