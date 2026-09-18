import { exec, q } from './db';

/**
 * 私信 / 评论的扩展列（老库免迁移，与 paymentColumns.ts 同套路）。
 *
 * 这些列在早期版本建的库上都不存在，运行时补齐才能在不手工跑迁移的前提下上线：
 * - attachment      图片附件地址（由 /media/upload 产出）
 * - recalled_at     发送方撤回时间
 * - deleted_for_*   单方删除标记（一条消息在 from/to 之间是共享记录，删除必须分侧）
 * - read_at         已读时间（原来只有 read 布尔，发送方看不到"对方什么时候读的"）
 */
const MESSAGE_COLUMNS: Array<[string, string]> = [
  ['attachment', 'VARCHAR(600) NULL'],
  ['recalled_at', 'DATETIME NULL'],
  ['deleted_for_from', "TINYINT(1) NOT NULL DEFAULT 0"],
  ['deleted_for_to', "TINYINT(1) NOT NULL DEFAULT 0"],
  ['read_at', 'DATETIME NULL'],
];

const COMMENT_COLUMNS: Array<[string, string]> = [['attachment', 'VARCHAR(600) NULL']];

const ensured = new Set<string>();

async function ensure(table: string, cols: Array<[string, string]>, cacheKey: string): Promise<void> {
  if (ensured.has(cacheKey)) return;
  ensured.add(cacheKey);
  try {
    const rows = await q<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table]
    );
    const have = new Set(rows.map((r) => r.COLUMN_NAME));
    for (const [name, ddl] of cols) {
      if (have.has(name)) continue;
      await exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`).catch(() => undefined);
    }
  } catch {
    // 查询失败不应拖垮读消息主链路：调用方本来就依赖"缺列也能跑"的兜底
  }
}

export async function ensureMessageColumns(): Promise<void> {
  await ensure('messages', MESSAGE_COLUMNS, 'messages');
}

export async function ensureCommentColumns(): Promise<void> {
  await ensure('comments', COMMENT_COLUMNS, 'comments');
}
