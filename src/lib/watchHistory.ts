'use client';

/**
 * 观看 / 收听进度本地记录（localStorage）。
 * 视频走 <video> 的时间轴，音频走全局播放器的进度。
 * 用于「继续观看 / 继续收听」与最近播放列表。
 */

const KEY_PROGRESS = 'media:progress:v1';
const KEY_RECENT = 'media:recent:v1';

export type ProgressItem = {
  /** 资源 id */
  id: string;
  /** 已播放秒数 */
  sec: number;
  /** 总时长秒数（可能未知） */
  dur: number;
  /** 更新时间戳 */
  at: number;
};

export type RecentItem = ProgressItem & {
  title: string;
  artist?: string;
  poster?: string;
  kind?: 'video' | 'audio';
};

function readMap<T>(key: string): Record<string, T> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function writeMap<T>(key: string, map: Record<string, T>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* 隐私模式 / 配额超限时静默失败 */
  }
}

export function getProgress(id: string): ProgressItem | null {
  return readMap<ProgressItem>(KEY_PROGRESS)[id] || null;
}

/** 是否值得提示「继续播放」：看过 >5s 且未接近结尾 */
export function resumableAt(id: string): number | null {
  const p = getProgress(id);
  if (!p || p.sec < 5) return null;
  if (p.dur > 0 && p.sec > p.dur - 15) return null; // 看完了
  return p.sec;
}

export function saveProgress(item: ProgressItem) {
  const map = readMap<ProgressItem>(KEY_PROGRESS);
  map[item.id] = item;
  // 只保留最近 200 条
  const keys = Object.keys(map).sort((a, b) => map[b].at - map[a].at);
  if (keys.length > 200) {
    for (const k of keys.slice(200)) delete map[k];
  }
  writeMap(KEY_PROGRESS, map);
}

export function clearProgress(id: string) {
  const map = readMap<ProgressItem>(KEY_PROGRESS);
  delete map[id];
  writeMap(KEY_PROGRESS, map);
}

/** 记录「最近播放」（同时写入进度） */
export function touchRecent(item: RecentItem) {
  saveProgress({ id: item.id, sec: item.sec, dur: item.dur, at: item.at });
  const map = readMap<RecentItem>(KEY_RECENT);
  map[item.id] = item;
  const keys = Object.keys(map).sort((a, b) => map[b].at - map[a].at);
  if (keys.length > 60) {
    for (const k of keys.slice(60)) delete map[k];
  }
  writeMap(KEY_RECENT, map);
}

export function listRecent(limit = 20): RecentItem[] {
  const map = readMap<RecentItem>(KEY_RECENT);
  return Object.values(map)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}

export function clearRecent() {
  writeMap(KEY_RECENT, {});
}
