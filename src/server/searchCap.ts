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
 * 关键词能不能交给 MATCH...AGAINST。
 *
 * InnoDB 默认全文解析器按空格/标点切词，一整句中文会被切成一个词，
 * 所以 AGAINST('敬拜') 对「敬拜赞美主视觉」永远命中不了——而 LIKE 能。
 * 中文要能全文检索，索引得建成 WITH PARSER ngram
 * （见 migrations/004_fulltext_search.sql 顶部说明），现有索引没带 parser，
 * 因此中文只能回退 LIKE。另外短于 innodb_ft_min_token_size（默认 3）的英文词
 * 同样进不了索引，一并回退，否则「ab」这种查询会静默返回 0 行。
 */
export function ftUsableFor(keyword: string): boolean {
  const k = keyword.trim();
  if (!k) return false;
  if (/[^\x00-\x7F]/.test(k)) return false;
  return k.length >= 3;
}

/**
 * 服务启动时自动补齐全文索引，彻底免去「运维手动跑迁移 004」这一步。
 * - 用 SHOW INDEX 探测每个表是否已有 FULLTEXT，没有才创建；
 * - 成功一次即不再重试（attempted 标记）；
 * - 失败不阻塞服务：自动降级 LIKE，并留出冷却期，下一次触发（search 路由兜底）
 *   会再试一轮 —— 覆盖「服务先于迁移跑起来、表当时还不存在」这类冷启动时序问题；
 * - 创建完成后 resetFtCache()，下一个请求就会自动切到 MATCH...AGAINST（带相关度排序）。
 */
const FT_SPECS: Array<[string, string, string]> = [
  ['contents', 'ft_contents', 'title, body, tags'],
  ['sermons', 'ft_sermons', 'title, speaker, scripture, description'],
  ['media_files', 'ft_media', 'title, description, file_name'],
  ['prayers', 'ft_prayers', 'body'],
];
let ensureAttempted = false;
/** 失败后的重试冷却时间戳（毫秒） */
let nextRetryAt = 0;
const RETRY_COOLDOWN_MS = 5 * 60_000;
/** 进行中的那一轮：启动期与首个搜索请求可能同时触发，用这个避免并发建两次索引 */
let inflight: Promise<void> | null = null;

/** 幂等 + 单飞：同一时刻只会有一轮在建索引 */
export function ensureFulltextIndex(): Promise<void> {
  if (inflight) return inflight;
  inflight = runEnsureFulltextIndex()
    .catch(() => undefined)
    .finally(() => {
      // 清掉单飞标记；是否允许再试由 runEnsureFulltextIndex 设置的 nextRetryAt 决定
      inflight = null;
    });
  return inflight;
}

async function runEnsureFulltextIndex(): Promise<void> {
  if (ensureAttempted) return;
  // 冷启动竞态保护：上一轮刚失败且还在冷却期内，不要重复打 DDL
  if (nextRetryAt && Date.now() < nextRetryAt) return;

  let allOk = true;
  for (const [table, name, cols] of FT_SPECS) {
    try {
      const rows = await q<any>(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
      if (Array.isArray(rows) && rows.length > 0) continue;
      await exec(`CREATE FULLTEXT INDEX \`${name}\` ON \`${table}\` (${cols})`);
      console.warn(`[search] 已自动创建全文索引 ${name}（${table}）`);
    } catch (e: any) {
      // 表不存在 / 权限不足等非致命问题：标记为未完成，交给下一次触发重试
      allOk = false;
      console.warn(`[search] 创建全文索引 ${name} 失败，本轮继续回退 LIKE：${e?.message || e}`);
    }
  }

  if (allOk) {
    ensureAttempted = true;
    nextRetryAt = 0;
  } else {
    nextRetryAt = Date.now() + RETRY_COOLDOWN_MS;
  }
  resetFtCache();
}
