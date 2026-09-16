import { q, exec } from './db';

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

/**
 * 首次搜索时自动补齐全文索引，彻底免去「运维手动跑迁移 004」这一步。
 * - 用 SHOW INDEX 探测每个表是否已有 FULLTEXT，没有才创建；
 * - 整轮只尝试一次（attempted 标记），失败也只记日志、回退 LIKE，不阻塞搜索；
 * - 创建完成后 resetFtCache()，下一个请求就会自动切到 MATCH...AGAINST（带相关度排序）。
 */
const FT_SPECS: Array<[string, string, string]> = [
  ['contents', 'ft_contents', 'title, body, tags'],
  ['sermons', 'ft_sermons', 'title, speaker, scripture, description'],
  ['media_files', 'ft_media', 'title, description, file_name'],
  ['prayers', 'ft_prayers', 'body'],
];
let ensureAttempted = false;

export async function ensureFulltextIndex(): Promise<void> {
  if (ensureAttempted) return;
  ensureAttempted = true;
  for (const [table, name, cols] of FT_SPECS) {
    try {
      const rows = await q<any>(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
      if (Array.isArray(rows) && rows.length > 0) continue;
      await exec(`CREATE FULLTEXT INDEX \`${name}\` ON \`${table}\` (${cols})`);
      console.warn(`[search] 已自动创建全文索引 ${name}（${table}）`);
    } catch (e: any) {
      console.warn(`[search] 创建全文索引 ${name} 失败，将继续回退 LIKE：${e?.message || e}`);
    }
  }
  resetFtCache();
}
