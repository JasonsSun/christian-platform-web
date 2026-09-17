import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, num } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * 话题广场数据。
 *
 * 平台没有独立的 tags 表 —— 标签是 contents.tags （逗号分隔字符串）里的虚拟维度，
 * 所以这里把全部「已发布」内容的标签拆出来做聚合统计：
 *   内容数 / 总点赞 / 总浏览 / 总评论 / 最近活跃时间 / 热度分。
 *
 * 拆分口径与后台 /admin/tags 保持一致：英文逗号或中文逗号分隔，逐项 trim，
 * 空项丢弃，同一篇内容里重复写同一个标签只计一次。
 */

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const splitTags = (raw: string) =>
  Array.from(new Set(raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean)));

const SORTS = ['hot', 'count', 'new', 'name'] as const;
type SortKey = (typeof SORTS)[number];

export interface TopicItem {
  name: string;
  count: number;
  likes: number;
  views: number;
  comments: number;
  lastAt: string;
  heat: number;
}

/** 热度：内容数为主，互动为辅，浏览按 1/10 折算 */
const heatOf = (t: { count: number; likes: number; comments: number; views: number }) =>
  Math.round(t.count * 3 + t.likes + t.comments * 2 + t.views * 0.1);

async function aggregate(): Promise<TopicItem[]> {
  const rows = await q<{
    tags: string;
    like_count: number;
    view_count: number;
    comment_count: number;
    at: string;
  }>(
    `SELECT c.tags, c.like_count, c.view_count, c.comment_count,
            DATE_FORMAT(COALESCE(c.published_at, c.created_at), '%Y-%m-%dT%H:%i:%sZ') AS at
     FROM contents c
     WHERE c.status = 'published' AND c.tags <> ''`
  );

  const map = new Map<string, Omit<TopicItem, 'heat'>>();
  for (const r of rows) {
    const at = String(r.at || '');
    for (const t of splitTags(String(r.tags || ''))) {
      const cur =
        map.get(t) ||
        { name: t, count: 0, likes: 0, views: 0, comments: 0, lastAt: at };
      cur.count += 1;
      cur.likes += Number(r.like_count) || 0;
      cur.views += Number(r.view_count) || 0;
      cur.comments += Number(r.comment_count) || 0;
      if (at > cur.lastAt) cur.lastAt = at;
      map.set(t, cur);
    }
  }

  return Array.from(map.values()).map((t) => ({ ...t, heat: heatOf(t) }));
}

/** GET /api/v1/topics?sort=hot|count|new|name&q=&limit=&min= */
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const kw = str(sp.get('q')).trim().toLowerCase();
  const rawSort = str(sp.get('sort')).trim();
  const sort: SortKey = (SORTS as readonly string[]).includes(rawSort) ? (rawSort as SortKey) : 'hot';
  const limit = Math.min(Math.max(num(sp.get('limit'), 60), 1), 200);
  const min = Math.max(num(sp.get('min'), 1), 1);

  let items = await aggregate();
  const contentTotal = await q<{ c: number }>(
    `SELECT COUNT(*) AS c FROM contents WHERE status = 'published' AND tags <> ''`
  ).then((r) => Number(r[0]?.c || 0));

  if (min > 1) items = items.filter((t) => t.count >= min);
  if (kw) items = items.filter((t) => t.name.toLowerCase().includes(kw));

  const total = items.length;
  const maxCount = items.reduce((m, t) => Math.max(m, t.count), 1);
  const maxHeat = items.reduce((m, t) => Math.max(m, t.heat), 1);

  items.sort((a, b) => {
    if (sort === 'count') return b.count - a.count || a.name.localeCompare(b.name, 'zh');
    if (sort === 'new') return (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0) || a.name.localeCompare(b.name, 'zh');
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh');
    return b.heat - a.heat || a.name.localeCompare(b.name, 'zh');
  });

  return ok({
    items: items.slice(0, limit).map((t) => ({
      ...t,
      // 0~100，供前端画热度条
      heatPct: Math.max(4, Math.round((t.heat / maxHeat) * 100)),
      countPct: Math.max(4, Math.round((t.count / maxCount) * 100)),
    })),
    total,
    contentTotal,
    sort,
  });
});
