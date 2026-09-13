/**
 * 读经计划：计划内容为内置静态配置（无需入库/运营维护），
 * 用户每天的完成情况单独存在 reading_plan_progress 表中。
 *
 * 每个计划用 readingOf(day) 给出「第 day 天读什么」，linkOf(day) 给出跳转读经页的链接。
 */

export type ReadingPlan = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  /** 卡片渐变（Tailwind 类） */
  accent: string;
  /** 总天数 */
  days: number;
  /** 第 day 天（1-based）的读经安排文案 */
  readingOf: (day: number) => string;
  /** 第 day 天起始章跳转链接 */
  linkOf: (day: number) => string;
  /** 每日一句鼓励（可选，按天循环） */
  verseOf?: (day: number) => string;
};

export const READING_PLANS: ReadingPlan[] = [
  {
    id: 'psalms-30',
    title: '诗篇 30 天',
    subtitle: '每天 5 篇，一个月读完 150 篇诗篇',
    emoji: '🎵',
    accent: 'from-primary-500 to-primary-700',
    days: 30,
    readingOf: (d) => {
      const from = (d - 1) * 5 + 1;
      const to = Math.min(150, d * 5);
      return `诗篇 ${from}${to > from ? `-${to}` : ''} 篇`;
    },
    linkOf: (d) => `/bible/cuv/psalms/${(d - 1) * 5 + 1}`,
  },
  {
    id: 'john-21',
    title: '约翰福音 21 天',
    subtitle: '每天 1 章，三周读完生命的福音书',
    emoji: '✝️',
    accent: 'from-gold-500 to-gold-700',
    days: 21,
    readingOf: (d) => `约翰福音 第 ${d} 章`,
    linkOf: (d) => `/bible/cuv/john/${d}`,
  },
  {
    id: 'proverbs-31',
    title: '箴言 31 天',
    subtitle: '每天 1 章，一个月领受智慧',
    emoji: '📖',
    accent: 'from-emerald-500 to-emerald-700',
    days: 31,
    readingOf: (d) => `箴言 第 ${d} 章`,
    linkOf: (d) => `/bible/cuv/proverbs/${d}`,
  },
  {
    id: 'psalm23-7',
    title: '诗篇 23 篇默想 7 天',
    subtitle: '七天反复默想「耶和华是我的牧者」',
    emoji: '🌿',
    accent: 'from-warm-500 to-warm-700',
    days: 7,
    readingOf: (d) => `诗篇 23 篇 · 第 ${d} 天默想`,
    linkOf: () => `/bible/cuv/psalms/23`,
  },
];

export function getPlan(id: string): ReadingPlan | undefined {
  return READING_PLANS.find((p) => p.id === id);
}

/** 已打卡天数 → 完成百分比（0-100） */
export function planPercent(doneDays: number, totalDays: number): number {
  if (!totalDays) return 0;
  return Math.min(100, Math.round((doneDays / totalDays) * 100));
}
