'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApi, useAction } from '@/lib/useApi';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useGoLogin } from '@/lib/nav';
import { formatDate } from '@/lib/format';
import { audioTypeMeta, vocalListenTarget } from '@/lib/audioType';
import { usePlayer } from '@/lib/player';
import LyricsView from '@/components/LyricsView';
import dynamic from 'next/dynamic';

// 和弦谱与投稿弹窗都需交互后才出现，按需加载以缩小歌曲详情首屏
const ChordSheet = dynamic(() => import('@/components/ChordSheet'), { ssr: false }) as unknown as typeof import('@/components/ChordSheet').default;
const SubmitSongModal = dynamic(() => import('@/components/SubmitSongModal'), { ssr: false }) as unknown as typeof import('@/components/SubmitSongModal').default;
import ShareButton from '@/components/ShareButton';
import { IconMusicNote, IconPlay, IconPause, IconHeart, IconEye, IconArrowLeft, IconExternalLink, IconMicrophone, IconDocument, IconLink } from '@/components/icons';
import type { SongItem } from '@/lib/types';

type RelatedItem = { id: string; title: string; author: string };
type SongDetail = SongItem & { related: RelatedItem[] };

/** 非人声曲目:既引导社区补录音,也把听众送到已有的人声版那里(平台不转载版权音频) */
function VocalWantedCard({ song, onSubmit }: { song: SongDetail; onSubmit: () => void }) {
  const target = vocalListenTarget(song);
  return (
    <div className="mt-6 mx-auto max-w-lg rounded-2xl bg-gold-400/10 border border-gold-400/25 px-5 py-4 text-left">
      <p className="text-gold-200 text-sm font-medium mb-1 flex items-center gap-1.5">
        <IconMicrophone className="w-4 h-4" strokeWidth={2} />
        这首还没有平台收录的人声版本
      </p>
      <p className="text-white/60 text-xs leading-relaxed mb-3">
        {song.audioType === 'instrumental'
          ? '平台上这首目前只有纯伴奏音频,没有人声演唱。'
          : '平台上这首目前只有歌词,还没有任何音频。'}
        你可以先在线听别处的演唱版,也欢迎上传你自己或诗班的录音——审核通过后,大家会优先听到人声版本。
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={target.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 min-h-[2.75rem] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium transition-colors"
        >
          <IconExternalLink className="w-4 h-4 shrink-0" strokeWidth={2} />
          {target.verified ? `在线听人声版（${target.source}）` : target.label}
        </a>
        <button
          onClick={onSubmit}
          className="inline-flex items-center min-h-[2.75rem] px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-ink-950 text-sm font-medium transition-colors"
        >
          上传我演唱的版本
        </button>
      </div>
      <p className="text-white/70 text-[11px] mt-3 leading-relaxed">
        平台不转载版权录音:试听会跳转到 {target.source} 播放
        {target.verified ? '（该链接已由管理员核实是人声演唱）' : ',请自行挑选演唱版本'};
        上传的录音请确保你拥有版权或已获授权。
      </p>
    </div>
  );
}

export default function SongDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user } = useAuth();
  const player = usePlayer();
  const notice = useNotice();
  const goLogin = useGoLogin();

  const { data, loading, error, setData } = useApi<SongDetail>(`/songs/${id}`);
  const { run, pending } = useAction();

  const [favorited, setFavorited] = useState<boolean | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);

  // 进入页时判断是否已收藏
  useEffect(() => {
    if (!user) {
      setFavorited(false);
      return;
    }
    let active = true;
    apiGet<{ items: SongItem[] }>('/songs/favorites')
      .then((res) => {
        if (active) setFavorited(res.items.some((i) => i.id === id));
      })
      .catch(() => active && setFavorited(false));
    return () => {
      active = false;
    };
  }, [user, id]);

  const handlePlay = async () => {
    // 没有音频文件就不要计数，否则播放量是假的
    if (!data?.audioUrl) {
      setShowSubmit(true);
      return;
    }
    const res = await run(() => apiPost<{ id: string; playCount: number }>(`/songs/${id}`));
    if (res && data) setData({ ...data, playCount: res.playCount });
    player.playTrack({
      id: data.id,
      title: data.title,
      artist: data.author || '圣约社区',
      url: data.audioUrl,
      durationSec: data.durationSec,
    });
  };

  const handleFavorite = async () => {
    if (!user) {
      notice.info('请先登录后再收藏');
      goLogin();
      return;
    }
    const res = await run(() => apiPost<{ favorited: boolean }>(`/songs/${id}/favorite`));
    if (res) setFavorited(res.favorited);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink-900 via-ink-800 to-primary-900">
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-4 md:py-8">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/songs"
            className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center hover:bg-white/20 transition-all duration-300"
            aria-label="返回"
          >
            <IconArrowLeft className="w-5 h-5" strokeWidth={2} />
          </Link>
          <div className="text-white/80 text-sm font-medium">诗歌详情</div>
          <div className="w-11 h-11">
            <ShareButton
              title={data ? `圣诗 · ${data.title}` : '圣约社区 · 诗歌'}
              text="推荐给你一首圣诗，愿诗歌的旋律伴你灵修。"
              card={data ? {
                eyebrow: '圣诗推荐',
                text: (data.lyrics || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4).join('\n') || data.title,
                reference: `《${data.title}》${data.author ? ` · ${data.author}` : ''}`,
              } : undefined}
              className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center hover:bg-white/20 transition-all duration-300"
            />
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-400/40 rounded-2xl p-4 mb-6 text-rose-200 text-sm">
            加载失败：{error}
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            <div className="h-10 w-2/3 bg-white/10 rounded-lg skeleton-sheen" />
            <div className="h-64 bg-white/10 rounded-2xl skeleton-sheen" />
          </div>
        )}

        {!loading && data && (
          <>
            {/* 头部信息 */}
            <section className="mb-10 text-center">
              <div className="w-24 h-24 mx-auto rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-ink-950 shadow-gold mb-5 relative">
                <IconMusicNote className="w-12 h-12" strokeWidth={1.3} />
                <span className="absolute inset-0 rounded-2xl bg-gold-400/20 blur-xl -z-10" />
              </div>
              <h1 className="font-display text-3xl md:text-4xl font-bold text-white mb-2">{data.title}</h1>
              <p className="text-white/70">{data.author}</p>
              <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                <span
                  className={`text-xs px-3 py-1 rounded-full ${
                    data.audioType === 'vocal'
                      ? 'bg-emerald-400/20 text-emerald-200'
                      : data.audioType === 'instrumental'
                        ? 'bg-amber-400/20 text-amber-200'
                        : 'bg-white/10 text-white/60'
                  }`}
                  title={audioTypeMeta(data.audioType).hint}
                >
                  {audioTypeMeta(data.audioType).label}
                </span>
                {data.category && (
                  <span className="text-xs text-gold-300 bg-gold-400/15 px-3 py-1 rounded-full">{data.category}</span>
                )}
                {data.tags.map((t) => (
                  <span key={t} className="text-xs text-white/60 bg-white/10 px-3 py-1 rounded-full">#{t}</span>
                ))}
              </div>
              {data.audioCredit && (
                <p className="text-white/45 text-xs mt-2">{data.audioCredit}</p>
              )}

              {/* 操作按钮 */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handlePlay}
                  disabled={pending && !!data.audioUrl}
                  className="btn-gold px-8 py-3 text-base disabled:opacity-60"
                  title={data.audioType === 'vocal' ? '播放真人演唱版本' : '该诗歌暂无音频，点击去投稿人声版本'}
                >
                  {data.audioUrl
                    ? (player.isCurrent(data.id) && player.playing ? <IconPause className="w-5 h-5" /> : <IconPlay className="w-5 h-5" />)
                    : <IconMicrophone className="w-5 h-5" strokeWidth={1.8} />}
                  {data.audioUrl
                    ? (player.isCurrent(data.id) && player.playing ? '暂停' : '在线试听')
                    : '投稿人声版本'}
                </button>
                <button
                  onClick={handleFavorite}
                  disabled={favorited === null}
                  className={`px-6 py-3 text-base rounded-2xl border transition-all duration-300 ${
                    favorited
                      ? 'bg-gold-500/20 border-gold-400/50 text-gold-200'
                      : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                  } disabled:opacity-60`}
                >
                  <IconHeart className="w-5 h-5 inline-block mr-1 -mt-0.5" strokeWidth={2} fill={favorited ? 'currentColor' : 'none'} />
                  {favorited ? '已收藏' : '收藏'}
                </button>
                <Link
                  href={`/songs/${data.id}/present`}
                  className="px-6 py-3 text-base rounded-2xl border bg-white/10 border-white/20 text-white hover:bg-white/20 inline-flex items-center"
                  title="全屏大字投屏，适合主日崇拜投影"
                >
                  投屏
                </Link>
                <span className="num text-white/75 text-sm flex items-center gap-1">
                  <IconEye className="w-4 h-4" strokeWidth={1.8} />
                  {data.playCount} 次播放
                </span>
              </div>

              {/* 非人声版本:既给"去别处听人声版"的入口,也向社区征集录音 */}
              {data.audioType !== 'vocal' && (
                <VocalWantedCard song={data} onSubmit={() => setShowSubmit(true)} />
              )}
            </section>

            {/* 歌词 */}
            <section className="mb-12">
              <h2 className="font-display text-xl md:text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <IconDocument className="w-5 h-5 text-gold-400" strokeWidth={1.8} />
                歌词
              </h2>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 md:p-6">
                {player.current?.id === data.id ? (
                  <>
                    <p className="text-xs text-gold-300/80 mb-2 px-1 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />
                      正在播放 · 歌词跟随中（点击任意一行可跳转）
                    </p>
                    <LyricsView
                      lyrics={data.lyrics}
                      currentTime={player.currentTime}
                      duration={player.duration || 0}
                      onSeek={(s) => player.seek(s)}
                      variant="dark"
                      className="font-serif leading-loose"
                    />
                  </>
                ) : data.chords ? (
                  <ChordSheet chords={data.chords} originalKey={data.originalKey} variant="dark" />
                ) : (
                  <div className="font-serif text-lg md:text-xl leading-loose text-white/90 whitespace-pre-wrap">
                    {data.lyrics}
                  </div>
                )}
              </div>
              <p className="num text-center text-white/70 text-xs mt-4">收录于 {formatDate(data.createdAt)}</p>
            </section>

            {/* 相关推荐 */}
            {data.related.length > 0 && (
              <section className="mb-12">
                <h2 className="font-display text-xl md:text-2xl font-bold text-white mb-6 flex items-center gap-2">
                  <IconLink className="w-5 h-5 text-gold-400" strokeWidth={1.8} />
                  相关诗歌
                </h2>
                <div data-reveal-group className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                  {data.related.map((r) => (
                    <Link
                      key={r.id}
                      href={`/songs/${r.id}`}
                      data-spot
                      className="group spot flex items-center gap-4 p-3 md:p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 hover:border-white/25 transition-all duration-300"
                    >
                      <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-gold-100 to-gold-200 text-gold-700 group-hover:from-gold-400 group-hover:to-gold-500 group-hover:text-ink-950 transition-colors">
                        <IconMusicNote className="w-5 h-5 md:w-6 md:h-6" strokeWidth={1.6} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white truncate group-hover:text-gold-300 transition-colors">{r.title}</h3>
                        <p className="text-white/60 text-sm truncate mt-0.5">{r.author}</p>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 group-hover:bg-gold-500 group-hover:text-ink-950 transition-all duration-300 flex-shrink-0">
                        <IconPlay className="w-4 h-4 ml-0.5" />
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <footer className="text-center py-8 text-white/70 text-xs">
              <p>愿这首诗歌带给你心灵的慰藉与力量</p>
            </footer>
          </>
        )}
      </div>

      {showSubmit && data && (
        <SubmitSongModal
          presetTitle={data.title}
          onClose={() => setShowSubmit(false)}
          onDone={() => setShowSubmit(false)}
        />
      )}
    </div>
  );
}
