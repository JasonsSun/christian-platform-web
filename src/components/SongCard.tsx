'use client';

import Link from 'next/link';
import { usePlayer } from '@/lib/player';
import { audioTypeMeta, VOCAL_WANTED_HINT, vocalListenTarget } from '@/lib/audioType';
import { IconMusicNote, IconPlay, IconPause, IconEye } from '@/components/icons';
import type { SongItem } from '@/lib/types';

/**
 * 诗歌列表卡片（列表页 / 主题歌单页共用）。
 * 抽出来是为了让歌单详情页复用完全一致的卡片交互，避免两份实现漂移。
 */
export default function SongCard({
  s,
  onRequestVocal,
}: {
  s: SongItem;
  /** 传入后，非人声曲目会显示「🎤 我来投稿」入口 */
  onRequestVocal?: (title: string) => void;
}) {
  const player = usePlayer();
  const active = player.isCurrent(s.id) && player.playing;
  const meta = audioTypeMeta(s.audioType);
  const listen = vocalListenTarget(s);
  return (
    <Link
      key={s.id}
      href={`/songs/${s.id}`}
      className="group bg-white rounded-2xl p-4 shadow-soft hover:shadow-card-hover transition-all duration-300 hover:-translate-y-0.5 border border-ink-100 hover:border-gold-200 flex items-center gap-4"
    >
      <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-gold-100 to-gold-200 flex items-center justify-center text-gold-700 group-hover:from-gold-400 group-hover:to-gold-500 group-hover:text-white transition-all flex-shrink-0">
        <IconMusicNote className="w-6 h-6" strokeWidth={1.7} />
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-gold-400/0 group-hover:bg-gold-300/70 transition-colors blur-[1px]" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-ink-900 group-hover:text-gold-600 transition-colors truncate">{s.title}</h3>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-ink-500 truncate">{s.author}</span>
          {s.category && (
            <>
              <span className="w-1 h-1 rounded-full bg-ink-300" />
              <span className="text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{s.category}</span>
            </>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${meta.tone}`}
            title={s.audioCredit ? `${meta.hint} · ${s.audioCredit}` : meta.hint}
          >
            {meta.label}
          </span>
        </div>
        {s.audioType !== 'vocal' && (
          <span className="flex items-center gap-2 mt-1 text-xs text-gold-700 min-w-0">
            {onRequestVocal && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRequestVocal(s.title);
                }}
                title={VOCAL_WANTED_HINT}
                className="hover:underline truncate py-1.5 -my-1.5"
              >
                🎤 我来投稿
              </button>
            )}
            {/* 不能用 <a>:外层已经是 <Link> 渲染的 <a>,嵌套 a 会造成非法 HTML */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(listen.url, '_blank', 'noopener,noreferrer');
              }}
              title={
                listen.verified
                  ? `管理员已核实是人声演唱（${listen.source}）`
                  : `去${listen.source}找这首的人声版`
              }
              className="hover:underline truncate py-1.5 -my-1.5"
            >
              🎧 {listen.verified ? '在线听人声版' : '找人声版'}
            </button>
          </span>
        )}
      </div>
      {s.audioUrl ? (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            player.playTrack({
              id: s.id, title: s.title, artist: s.author || '圣约社区',
              url: s.audioUrl, durationSec: s.durationSec,
            });
          }}
          title={active ? '暂停' : '在线试听'}
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition ${
            active ? 'bg-gold-500 text-white' : 'bg-gold-100 text-gold-700 hover:bg-gold-400 hover:text-white'
          }`}
        >
          {active ? <IconPause className="w-4 h-4" /> : <IconPlay className="w-4 h-4 ml-0.5" />}
        </button>
      ) : null}
      <div className="flex items-center gap-1.5 text-ink-400 text-sm flex-shrink-0">
        <IconEye className="w-4 h-4" />
        {s.playCount}
      </div>
    </Link>
  );
}
