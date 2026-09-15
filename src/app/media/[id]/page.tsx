'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/useApi';
import { apiPost } from '@/lib/api';
import { formatDate, formatSize } from '@/lib/format';
import { usePlayer, formatTime, type Track } from '@/lib/player';
import { getProgress, resumableAt, saveProgress, clearProgress, touchRecent } from '@/lib/watchHistory';
import { useBackgroundPlay, useMediaBackplay } from '@/lib/backplay';
import type { MediaDetail } from '@/lib/types';

const KIND_ICON: Record<string, string> = { image: '🖼️', audio: '🎵', video: '🎬', score: '🎼', doc: '📄' };

export default function MediaDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, loading, error, reload, setData } = useApi<MediaDetail>(`/media/${id}`);
  const player = usePlayer();
  const reported = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 后台播放:息屏后仍可由 Media Session 接管,锁屏画面带标题与控制按钮
  const bg = useBackgroundPlay();
  const detailRef = useRef<MediaDetail | null>(null);
  useEffect(() => { detailRef.current = data ?? null; }, [data]);
  useMediaBackplay({
    getEl: () => videoRef.current,
    meta: () => ({
      title: detailRef.current?.title || '媒体播放',
      artist: '圣约社区 · 媒体中心',
      artwork: detailRef.current?.posterUrl ? [detailRef.current.posterUrl] : [],
    }),
    handlers: () => ({
      play: () => { void videoRef.current?.play().catch(() => {}); },
      pause: () => videoRef.current?.pause(),
      seekBy: (d: number) => {
        const v = videoRef.current;
        if (v) v.currentTime = Math.max(0, Math.min(v.currentTime + d, v.duration || Infinity));
      },
    }),
    enabled: bg.enabled,
  });

  // 上次观看位置提示（视频）
  const [resumeSec, setResumeSec] = useState<number | null>(null);
  useEffect(() => {
    if (!data || data.kind !== 'video') return;
    setResumeSec(resumableAt(data.id));
  }, [data?.id, data?.kind]);

  async function reportPlay() {
    if (reported.current) return;
    reported.current = true;
    try {
      const r = await apiPost<{ playCount: number }>(`/media/${id}`, {});
      if (data) setData({ ...data, playCount: r.playCount });
    } catch {
      /* 未登录等情况下忽略 */
    }
  }

  function playThis() {
    if (!data) return;
    void reportPlay();
    const track: Track = {
      id: data.id,
      title: data.title,
      artist: data.owner || '圣约社区',
      url: data.url,
      poster: data.posterUrl || (data.kind === 'image' ? data.url : undefined),
      durationSec: data.durationSec,
    };
    const list: Track[] = [track, ...(data.related || [])
      .filter((r) => r.kind === 'audio')
      .map((r) => ({
        id: r.id, title: r.title, artist: '圣约社区', url: r.url,
        poster: r.posterUrl, durationSec: r.durationSec,
      }))];
    player.playTracks(list, 0);
  }

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  }
  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <div className="text-rose-600 mb-3">{error || '未找到该文件'}</div>
        <Link href="/media" className="btn-secondary">返回媒体库</Link>
      </div>
    );
  }

  const d = data;
  const audioActive = player.isCurrent(d.id);

  /** 视频：每 5 秒记录一次进度，看完则清除 */
  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    const sec = v.currentTime;
    const dur = v.duration || 0;
    // 节流：约每 5 秒写一次
    const last = getProgress(d.id);
    if (last && Math.abs(sec - last.sec) < 5) return;
    if (dur > 0 && sec > dur - 15) {
      clearProgress(d.id);
      return;
    }
    saveProgress({ id: d.id, sec, dur, at: Date.now() });
    touchRecent({
      id: d.id, sec, dur, at: Date.now(),
      title: d.title, artist: d.owner || '圣约社区',
      poster: d.posterUrl || undefined, kind: 'video',
    });
  }

  function jumpTo(sec: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = sec;
    setResumeSec(null);
    void v.play().catch(() => undefined);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/media" className="text-sm text-ink-500 hover:text-primary-600">← 返回媒体库</Link>

      {/* 上次观看位置提示 */}
      {d.kind === 'video' && resumeSec != null && (
        <div className="mt-4 flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl bg-primary-50 border border-primary-200 text-sm">
          <span className="text-primary-800">
            上次观看到 <b className="tabular-nums">{formatTime(resumeSec)}</b>
            {d.durationSec ? ` / ${formatTime(d.durationSec)}` : ''}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => jumpTo(resumeSec)} className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700">
              继续观看
            </button>
            <button
              onClick={() => { clearProgress(d.id); setResumeSec(null); }}
              className="px-3 py-1.5 rounded-lg border border-ink-200 text-ink-500 text-xs hover:text-ink-700"
            >
              从头开始
            </button>
          </div>
        </div>
      )}

      {/* 播放器主体 */}
      <div className="mt-4 rounded-3xl overflow-hidden bg-black shadow-card">
        {d.kind === 'video' ? (
          <video
            ref={videoRef}
            src={d.url}
            poster={d.posterUrl || undefined}
            controls
            preload="metadata"
            playsInline
            className="w-full aspect-video bg-black"
            onPlay={reportPlay}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => clearProgress(d.id)}
          />
        ) : d.kind === 'audio' ? (
          <div className="relative aspect-[21/9] md:aspect-[21/7] bg-gradient-to-br from-ink-900 via-primary-900 to-ink-800 flex items-center justify-center">
            {d.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={d.posterUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-35" />
            ) : null}
            <div className="relative z-10 flex flex-col items-center gap-4 px-4">
              <button
                onClick={playThis}
                className="w-20 h-20 rounded-full bg-white/95 hover:bg-white text-primary-700 shadow-card-hover flex items-center justify-center text-3xl transition"
                title={audioActive && player.playing ? '暂停' : '播放'}
              >
                {audioActive && player.playing ? '❚❚' : '▶'}
              </button>
              <div className="text-white text-center">
                <div className="font-display text-xl md:text-2xl font-bold">{d.title}</div>
                <div className="text-white/70 text-sm mt-1">
                  {d.owner || '圣约社区'}
                  {d.durationSec ? ` · ${formatTime(d.durationSec)}` : ''}
                </div>
              </div>
            </div>
          </div>
        ) : d.kind === 'image' ? (
          <div className="bg-ink-100 flex items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" decoding="async" src={d.url} alt={d.title} className="max-h-[70vh] w-auto object-contain rounded-2xl" />
          </div>
        ) : d.extension === 'pdf' ? (
          <iframe src={d.url} className="w-full aspect-[3/4] md:aspect-[16/10] bg-white" title={d.title} />
        ) : (
          <div className="aspect-[21/9] flex flex-col items-center justify-center gap-3 text-white/80">
            <div className="text-6xl">{KIND_ICON[d.kind] || '📁'}</div>
            <div className="text-sm">该格式不支持在线预览，请下载后查看</div>
          </div>
        )}
      </div>

      {/* 信息区 */}
      <div className="mt-6 grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-medium">
              {d.kindLabel}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
              已审核通过
            </span>
            {d.durationSec ? (
              <span className="px-2.5 py-1 rounded-full bg-ink-100 text-ink-600 text-xs">
                {formatTime(d.durationSec)}
              </span>
            ) : null}
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-ink-900">{d.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-500">
            <span>{formatSize(d.sizeBytes)}</span>
            <span>{d.playCount || 0} 次播放</span>
            <span>{d.owner || '匿名'}</span>
            <span>{formatDate(d.createdAt)}</span>
          </div>

          {d.description ? <p className="mt-4 text-ink-700 leading-relaxed">{d.description}</p> : null}

          <div className="mt-5 flex flex-wrap gap-3">
            {d.kind === 'audio' ? (
              <button onClick={playThis} className="btn-primary">
                {audioActive && player.playing ? '暂停' : '▶ 在线播放'}
              </button>
            ) : null}
            <a href={d.url} download={d.fileName} className="btn-secondary">⬇ 下载文件</a>
            {d.references.length ? (
              <Link href={`/contents/${d.references[0].contentId}`} className="btn-secondary">
                查看关联内容
              </Link>
            ) : null}
          </div>

          {/* 处理任务 */}
          {d.tasks.length ? (
            <div className="mt-8">
              <h2 className="font-display text-lg font-bold text-ink-900 mb-3">处理记录</h2>
              <div className="space-y-2">
                {d.tasks.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 text-sm bg-white border border-ink-100 rounded-xl px-4 py-2.5">
                    <span className={
                      t.status === 'done' ? 'text-emerald-600' :
                      t.status === 'failed' ? 'text-rose-600' :
                      t.status === 'running' ? 'text-primary-600' : 'text-ink-400'
                    }>
                      {t.status === 'done' ? '✓' : t.status === 'failed' ? '✕' : t.status === 'running' ? '⟳' : '–'}
                    </span>
                    <span className="font-medium text-ink-700 w-24 flex-shrink-0">
                      {{ scan: '安全扫描', transcode: '转码', poster: '封面', thumbnail: '缩略图', audio_normalize: '音频标准化', process: '处理' }[t.taskType] || t.taskType}
                    </span>
                    <span className="text-ink-500 flex-1">{t.output || t.error || t.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* 相关推荐 */}
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900 mb-3">同类推荐</h2>
          {d.related.length === 0 ? (
            <div className="text-sm text-ink-400 border border-dashed border-ink-200 rounded-xl p-4">暂无同类文件</div>
          ) : (
            <div className="space-y-3">
              {d.related.map((r) => (
                <div key={r.id} className="bg-white border border-ink-100 rounded-xl p-3 card-hover">
                  <Link href={`/media/${r.id}`} className="flex gap-3">
                    <div className="w-16 h-16 rounded-lg bg-ink-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {r.kind === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" src={r.url} alt="" className="w-full h-full object-cover" />
                      ) : r.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" src={r.posterUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">{KIND_ICON[r.kind] || '📁'}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink-800 line-clamp-2">{r.title}</div>
                      <div className="text-xs text-ink-400 mt-1">
                        {r.durationSec ? formatTime(r.durationSec) : formatSize(r.sizeBytes)}
                        {r.playCount ? ` · ${r.playCount} 次播放` : ''}
                      </div>
                    </div>
                  </Link>
                  {r.kind === 'audio' ? (
                    <button
                      onClick={() => player.playTrack({
                        id: r.id, title: r.title, artist: '圣约社区', url: r.url,
                        poster: r.posterUrl, durationSec: r.durationSec,
                      })}
                      className="mt-2 w-full text-xs text-primary-600 hover:bg-primary-50 rounded-lg py-1.5"
                    >
                      ▶ 播放
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
