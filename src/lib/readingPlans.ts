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
  /** 第 day 天覆盖的「书卷+章」列表(用于把"真实读经"反查回计划天数) */
  chaptersOf?: (day: number) => { bookId: string; chapter: number }[];
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
    chaptersOf: (d) => {
      const from = (d - 1) * 5 + 1;
      const to = Math.min(150, d * 5);
      const out: { bookId: string; chapter: number }[] = [];
      for (let c = from; c <= to; c++) out.push({ bookId: 'psalms', chapter: c });
      return out;
    },
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
    chaptersOf: (d) => [{ bookId: 'john', chapter: d }],
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
    chaptersOf: (d) => [{ bookId: 'proverbs', chapter: d }],
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
    chaptersOf: () => [{ bookId: 'psalms', chapter: 23 }],
  },
];

export function getPlan(id: string): ReadingPlan | undefined {
  return READING_PLANS.find((p) => p.id === id);
}

/**
 * 反查：某「书卷+章」属于哪些计划的第几天。
 * 用于把"真实读经"映射到读经计划的打卡天数（读到分配章即自动打卡）。
 *
 * 注意：此函数对"同章多天"计划(如诗篇23篇默想7天,7天都是诗篇23章)会返回多天,
 * 自动打卡逻辑需据此区分"单章日 / 多章日 / 同章多天",见 planProgress.ts 的 autoCheckinOnRead。
 */
export function matchPlanDay(
  bookId: string,
  chapter: number
): { planId: string; day: number }[] {
  const out: { planId: string; day: number }[] = [];
  for (const p of READING_PLANS) {
    const fn = p.chaptersOf;
    if (!fn) continue;
    for (let d = 1; d <= p.days; d++) {
      if (fn(d).some((c) => c.bookId === bookId && c.chapter === chapter)) {
        out.push({ planId: p.id, day: d });
      }
    }
  }
  return out;
}

/** 章节唯一键：用于"该天分配的章是否都已读"的集合判定 */
export function chapterKeyOf(bookId: string, chapter: number): string {
  return `${bookId}:${chapter}`;
}

/** 取某计划第 day 天分配的「书卷+章」列表（无 chaptersOf 时为空） */
export function planDayChapters(plan: ReadingPlan, day: number): { bookId: string; chapter: number }[] {
  return plan.chaptersOf ? plan.chaptersOf(day) : [];
}

/** 某计划第 day 天是否包含指定章节 */
export function dayContainsChapter(plan: ReadingPlan, day: number, bookId: string, chapter: number): boolean {
  return planDayChapters(plan, day).some((c) => c.bookId === bookId && c.chapter === chapter);
}

/** 该计划里命中指定章节的天列表（升序） */
export function matchPlanDays(plan: ReadingPlan, bookId: string, chapter: number): number[] {
  if (!plan.chaptersOf) return [];
  const out: number[] = [];
  for (let d = 1; d <= plan.days; d++) {
    if (dayContainsChapter(plan, d, bookId, chapter)) out.push(d);
  }
  return out;
}

/**
 * 纯判定：读完 (bookId,chapter) 后，该计划应打勾哪一天？返回 null 表示不打勾。
 * - 命中 0 天：不属于该计划。
 * - 命中 1 天：
 *    - 该天只有 1 章 → 直接打勾这一天的章。
 *    - 该天多章(如诗篇30天一天5篇) → 仅当"该天分配的所有章都已读"才打勾(参数 readKeys 提供已读章集合)。
 * - 命中多天(同章多天计划,如诗篇23篇默想7天)：返回 null，由调用方按"当前未完成的下一天"推进
 *   （因为无法从章节判断读到的是第几天，需结合已打卡天集合）。
 *
 * 该函数无 DB 依赖，便于单测（见 scripts/test-plan-checkin.ts）。
 */
export function decidePlanCheckin(
  plan: ReadingPlan,
  bookId: string,
  chapter: number,
  readKeys: Set<string>,
  doneDays: Set<number>
): number | null {
  const hit = matchPlanDays(plan, bookId, chapter);
  if (hit.length === 0) return null;
  if (hit.length === 1) {
    const day = hit[0];
    const chs = planDayChapters(plan, day);
    const allRead = chs.every((c) => readKeys.has(chapterKeyOf(c.bookId, c.chapter)));
    return allRead ? day : null;
  }
  // 同章多天：推进到当前未完成的下一天(按天序取最小未完成)
  for (const d of hit) {
    if (!doneDays.has(d)) return d;
  }
  return null; // 全打勾了
}

/** 已打卡天数 → 完成百分比（0-100） */
export function planPercent(doneDays: number, totalDays: number): number {
  if (!totalDays) return 0;
  return Math.min(100, Math.round((doneDays / totalDays) * 100));
}
