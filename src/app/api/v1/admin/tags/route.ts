import { NextRequest } from 'next/server';
import { exec, q } from '@/server/db';
import { ok, withApi, readJson, clientIp, HttpError } from '@/server/http';
import { UserRow } from '@/server/auth';
import { requireModeratorModule } from '@/server/moderation';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

/**
 * 后台「标签管理」。
 *
 * contents.tags 是逗号分隔的字符串列（没有独立的 tags 表），所以标签是「虚拟维度」：
 * 这里把全站内容的标签拆出来做聚合统计（使用次数 / 覆盖内容数），并支持重命名、
 * 合并、删除 —— 三者本质上都是对 contents.tags 做字符串改写。
 *
 * 拆分口径：以英文逗号或中文逗号分隔，逐项 trim，空项丢弃。
 */

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const splitTags = (raw: string) =>
  raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);

/** GET /api/v1/admin/tags?q=&sort=count|name */
export const GET = withApi(async (req: NextRequest) => {
  await requireModeratorModule(req, 'contents');
  const sp = new URL(req.url).searchParams;
  const kw = str(sp.get('q')).trim().toLowerCase();
  const sort = sp.get('sort') === 'name' ? 'name' : 'count';

  const rows = await q<{ id: string; tags: string; status: string }>(
    `SELECT id, tags, status FROM contents WHERE tags <> ''`
  );

  const map = new Map<string, { name: string; total: number; published: number }>();
  for (const r of rows) {
    // 同一篇内容里重复写同一个标签只计一次
    const uniq = Array.from(new Set(splitTags(r.tags || '')));
    for (const t of uniq) {
      const cur = map.get(t) || { name: t, total: 0, published: 0 };
      cur.total += 1;
      if (r.status === 'published') cur.published += 1;
      map.set(t, cur);
    }
  }

  let items = Array.from(map.values());
  if (kw) items = items.filter((t) => t.name.toLowerCase().includes(kw));
  items.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'zh') : (a, b) => b.total - a.total || a.name.localeCompare(b.name, 'zh'));

  return ok({ items: items.slice(0, 500), total: items.length });
});

/**
 * PATCH /api/v1/admin/tags
 * body:
 *  - { op:'rename', from, to }  重命名标签
 *  - { op:'merge',  from: string[], to }  把多个标签合并为一个
 *  - { op:'delete', from: string[] }  删除标签
 */
export const PATCH = withApi(async (req: NextRequest) => {
  const user = (await requireModeratorModule(req, 'contents')) as UserRow;
  const body = await readJson<{ op?: unknown; from?: unknown; to?: unknown }>(req);
  const op = str(body.op).trim();
  const to = str(body.to).trim();
  const fromArr = Array.isArray(body.from) ? body.from.map((x) => str(x).trim()).filter(Boolean) : [str(body.from).trim()].filter(Boolean);

  if (!fromArr.length) throw new HttpError(422, 'VALIDATION_FAILED', '请先选择要操作的标签');
  if ((op === 'rename' || op === 'merge') && !to) throw new HttpError(422, 'VALIDATION_FAILED', '请填写目标标签名');
  if (!['rename', 'merge', 'delete'].includes(op)) throw new HttpError(422, 'VALIDATION_FAILED', '操作类型不合法');

  // 逐条内容改写：读出来在 JS 里处理再写回，避免 SQL 里做字符串拆分
  const rows = await q<{ id: string; tags: string }>(`SELECT id, tags FROM contents WHERE tags <> ''`);
  let changed = 0;
  for (const r of rows) {
    const tags = splitTags(r.tags || '');
    let next: string[];
    if (op === 'delete') {
      next = tags.filter((t) => !fromArr.includes(t));
    } else {
      next = tags.map((t) => (fromArr.includes(t) ? to : t));
    }
    next = Array.from(new Set(next));
    if (next.join(',') === tags.join(',')) continue;
    await exec(`UPDATE contents SET tags = ? WHERE id = ?`, [next.join(','), r.id]);
    changed++;
  }

  await audit(
    user.id, 'TAG_' + op.toUpperCase(), 'tag', fromArr.join(','),
    op === 'delete' ? `删除标签 ${fromArr.join('、')}，影响 ${changed} 篇内容` : `将 ${fromArr.join('、')} 改为「${to}」，影响 ${changed} 篇内容`,
    clientIp(req)
  );
  return ok({ op, changed, to });
});
