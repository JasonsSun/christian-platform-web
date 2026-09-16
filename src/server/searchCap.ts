import { q } from './db';

/**
 * 全文索引能力探测（带缓存）。
 * 搜索路由据此在 MATCH...AGAINST（更快、带相关度排序）与 LIKE 之间自动切换：
 * 若对应表已建 FULLTEXT 索引则走 MATCH，否则回退 LIKE，保证任何部署都能搜。
 */
const cache = new Map<string, boolean>();

export async function ftAvailable(table: string): Promise<boolean> {
  if (cache.has(table)) return cache.get(table)!;
  try {
    const rows = await q<any>(`SHOW INDEX FROM \`${table}\` WHERE Index_type = 'FULLTEXT'`);
    const ok = Array.isArray(rows) && rows.length > 0;
    cache.set(table, ok);
    return ok;
  } catch {
    cache.set(table, false);
    return false;
  }
}

/** 清空缓存（建完索引后调用，避免旧结果被缓存）。 */
export function resetFtCache(): void {
  cache.clear();
}
