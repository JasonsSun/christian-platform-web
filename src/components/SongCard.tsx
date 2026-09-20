'use client';

import Link from 'next/link';
import { usePlayer } from '@/lib/player';
import { audioTypeMeta, VOCAL_WANTED_HINT, vocalListenTarget } from '@/lib/audioType';
import { IconMusicNote, IconPlay, IconPause, IconEye, IconMicWave, IconHeadphones } from '@/components/icons';
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
  /** 传入后，非人声曲目会显示「我来投稿」入口 */
  onRequestVocal?: (title: string) => void;
}) {
  const player = usePlayer();
  const active = player.isCurrent(s.id) && player.playing;
  const meta = audioTypeMeta(s.audioType);
  const listen = vocalListenTarget(s);
  return (
    <div className="group relative bg-white rounded-2xl p-4 shadow-soft hover:shadow-card-hover transition-all duration-300 hover:-translate-y-0.5 border border-ink-100 hover:border-gold-200 flex items-center gap-4">
      {/* 整卡可点用「铺满式链接」实现：交互元素不能嵌套在 <a> 里，试听/投稿按钮要留在链接外面（靠 z-10 盖回上层） */}
      <Link
        href={`/songs/${s.id}`}
        aria-label={`查看诗歌 ${s.title}`}
        className="absolute inset-0 rounded-2xl"
      />
      <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-gold-100 to-gold-200 flex items-center justify-center text-gold-700 group-hover:from-gold-400 group-hover:to-gold-500 group-hover:text-ink-950 transition-all flex-shrink-0">
        <IconMusicNote className="w-6 h-6" strokeWidth={1.7} />
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-gold-400/0 group-hover:bg-gold-300/70 transition-colors blur-[1px]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink-900 group-hover:text-gold-600 transition-colors truncate">{s.title}</p>
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
                className="relative z-10 hover:underline truncate py-1.5 -my-1.5"
              >
                <IconMicWave className="w-3.5 h-3.5 inline-block align-[-3px] mr-1" strokeWidth={1.8} />
                我来投稿
              </button>
            )}
            {/* 站外链接用 button 而不是 <a>：它要盖在铺满式链接之上，两套链接嵌套是非法 HTML */}
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
              className="relative z-10 hover:underline truncate py-1.5 -my-1.5"
            >
              <IconHeadphones className="w-3.5 h-3.5 inline-block align-[-3px] mr-1" strokeWidth={1.8} />
              {listen.verified ? '在线听人声版' : '找人声版'}
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
          className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition ${
            active ? 'bg-gold-500 text-ink-950' : 'bg-gold-100 text-gold-700 hover:bg-gold-400 hover:text-ink-950'
          }`}
        >
          {active ? <IconPause className="w-4 h-4" /> : <IconPlay className="w-4 h-4 ml-0.5" />}
        </button>
      ) : null}
      <div className="flex items-center gap-1.5 text-ink-400 text-sm flex-shrink-0">
        <IconEye className="w-4 h-4" />
        {s.playCount}
      </div>
    </div>
  );
}
