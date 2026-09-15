/**
 * 主题歌单（精选合集）
 *
 * 背景：诗歌已有 `category`（单选）与 `tags`（多标签），但用户只能按分类平铺浏览。
 * 这里把标签重新聚合为「按场景/主题组织的歌单」——受洗、圣诞、灵修、安慰……
 * 让用户按「我现在的处境」而不是「歌曲分类」来找歌。
 *
 * 设计：纯声明式、零后端改动。
 *  - 歌单本身是代码里的常量（人工策展，避免自由标签拼错就消失）；
 *  - 归属判定 = 命中任一 `categories` 或任一 `tags`（OR 语义）；
 *  - 若要精确指定曲目，用 `ids`（一旦给出则只认这些曲目）。
 *
 * 新增歌单只要往 SONG_COLLECTIONS 里加一条；标签写错不会报错，只会少几首，
 * 所以改动后用「主题歌单」页面的曲目数肉眼核对一下。
 */
import type { SongItem } from './types';

export interface SongCollection {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  emoji: string;
  /** 封面用的 tailwind 渐变类，形如 `from-violet-500 to-violet-700` */
  gradient: string;
  /** 配套经句 */
  verse?: string;
  /** 命中任一分类即属于本歌单 */
  categories?: string[];
  /** 命中任一标签即属于本歌单 */
  tags?: string[];
  /** 显式指定曲目 id（给出后忽略分类/标签） */
  ids?: string[];
}

export const SONG_COLLECTIONS: SongCollection[] = [
  {
    id: 'draw-near',
    name: '灵修亲近',
    subtitle: '安静下来，靠近他',
    description: '适合个人灵修、清晨与睡前的安静时刻，帮助心从纷扰中转向神。',
    emoji: '🕯️',
    gradient: 'from-violet-500 to-violet-700',
    verse: '你们亲近神，神就必亲近你们。雅各书 4:8',
    tags: ['亲近', '灵修', '安息', '渴慕', '同在'],
  },
  {
    id: 'peace',
    name: '平安与安慰',
    subtitle: '在风浪中有安息',
    description: '忧伤、焦虑、失去力量的时候，让这些诗歌把神的安慰唱进心里。',
    emoji: '🕊️',
    gradient: 'from-sky-500 to-sky-700',
    verse: '我留下平安给你们，我将我的平安赐给你们。约翰福音 14:27',
    tags: ['平安', '安慰', '交托', '依靠', '安息'],
  },
  {
    id: 'praise',
    name: '感恩与赞美',
    subtitle: '以颂赞为祭献上',
    description: '主日崇拜、家庭敬拜与感恩聚会的常用诗歌，口唱心和地赞美。',
    emoji: '🎺',
    gradient: 'from-gold-500 to-gold-700',
    verse: '凡有气息的都要赞美耶和华。诗篇 150:6',
    tags: ['赞美', '颂赞', '感恩', '崇拜', '三一'],
  },
  {
    id: 'worship',
    name: '敬拜全能神',
    subtitle: '尊崇创造的主',
    description: '仰望神的伟大与全能，适合聚会开始时的敬拜与高举。',
    emoji: '👑',
    gradient: 'from-primary-500 to-primary-700',
    verse: '耶和华本为大，该受大赞美。诗篇 145:3',
    tags: ['敬拜', '创造', '伟大', '全能'],
  },
  {
    id: 'grace',
    name: '救恩与恩典',
    subtitle: '因恩得救的见证',
    description: '福音布道、受洗见证与个人回转向神的时刻，述说主的救恩。',
    emoji: '✝️',
    gradient: 'from-rose-500 to-rose-700',
    verse: '你们得救是本乎恩，也因着信。以弗所书 2:8',
    tags: ['救恩', '救赎', '恩典', '磐石'],
  },
  {
    id: 'christmas',
    name: '节期 · 圣诞',
    subtitle: '记念主降生',
    description: '将临期与圣诞聚会用诗，唱响「以马内利」的喜讯。',
    emoji: '⭐',
    gradient: 'from-emerald-500 to-emerald-700',
    verse: '因今天在大卫的城里，为你们生了救主。路加福音 2:11',
    categories: ['节期'],
    tags: ['圣诞'],
  },
  {
    id: 'prayer',
    name: '祷告与主祷文',
    subtitle: '学习向神倾心',
    description: '帮助初信者与小组学习祷告的诗歌，含主祷文与经文诗歌。',
    emoji: '🙏',
    gradient: 'from-indigo-500 to-indigo-700',
    verse: '应当一无挂虑，只要凡事藉着祷告和祈求，将你们所要的告诉神。腓立比书 4:6',
    tags: ['祷告', '主祷文', '经文'],
  },
  {
    id: 'trust',
    name: '信靠与坚固',
    subtitle: '在试炼中站立得稳',
    description: '患难、争战与等候的时候，靠主坚固、凭信前行。',
    emoji: '🛡️',
    gradient: 'from-amber-500 to-amber-700',
    verse: '你们当刚强壮胆，不要害怕。申命记 31:6',
    tags: ['信靠', '争战', '坚固', '见证'],
  },
];

/** 一首歌是否属于某个歌单 */
export function matchCollection(c: SongCollection, s: SongItem): boolean {
  if (c.ids && c.ids.length) return c.ids.includes(s.id);
  const tags = Array.isArray(s.tags)
    ? s.tags
    : String(s.tags || '').split(/[,，\s]+/).filter(Boolean);
  const byCat = !!c.categories?.includes(s.category);
  const byTag = !!c.tags?.some((t) => tags.includes(t));
  return byCat || byTag;
}

/** 从一批歌曲里筛出某个歌单的曲目（保持传入顺序） */
export function songsInCollection(c: SongCollection, songs: SongItem[]): SongItem[] {
  return songs.filter((s) => matchCollection(c, s));
}

/** 按 id 找歌单 */
export function findCollection(id: string): SongCollection | undefined {
  return SONG_COLLECTIONS.find((c) => c.id === id);
}
