import { exec, q, one, newId, ts } from '@/server/db';
import { HttpError } from '@/server/http';

/**
 * 收藏分类（稍后读清单）。
 *
 * 原 content_favorites 只有 (user_id, content_id)，没有分类概念，所以这里：
 *   1) 运行时幂等建 favorite_folders 表
 *   2) 运行时幂等给 content_favorites 加 folder_id 列（可空 = 未分类）
 * 两者都不写进 schema.sql —— schema 里外键名是库级唯一的，改动容易让整段
 * bootstrap throw 从而静默回退 mock 模式。
 */

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

let ensured = false;

async function hasColumn(table: string, column: string): Promise<boolean> {
  const row = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(row?.c || 0) > 0;
}

async function hasIndex(table: string, index: string): Promise<boolean> {
  const row = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index]
  );
  return Number(row?.c || 0) > 0;
}

export async function ensureFavoriteFolderTables(): Promise<void> {
  if (ensured) return;
  await exec(`CREATE TABLE IF NOT EXISTS favorite_folders (
    id         CHAR(36)    NOT NULL PRIMARY KEY,
    user_id    CHAR(36)    NOT NULL,
    name       VARCHAR(60) NOT NULL,
    color      VARCHAR(20) NOT NULL DEFAULT 'primary',
    sort_order INT         NOT NULL DEFAULT 0,
    created_at DATETIME    NOT NULL,
    UNIQUE KEY uk_ff_user_name (user_id, name),
    KEY idx_ff_user (user_id),
    CONSTRAINT fk_ff_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  if (!(await hasColumn('content_favorites', 'folder_id'))) {
    await exec(`ALTER TABLE content_favorites ADD COLUMN folder_id CHAR(36) NULL`);
  }
  if (!(await hasIndex('content_favorites', 'idx_cf_folder'))) {
    await exec(`ALTER TABLE content_favorites ADD KEY idx_cf_folder (folder_id)`);
  }
  ensured = true;
}

export interface FavoriteFolder {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  count: number;
}

/** 分类列表 + 每个分类的收藏数；unfiled 单独给「未分类」计数 */
export async function listFolders(userId: string): Promise<{
  folders: FavoriteFolder[];
  unfiled: number;
  total: number;
}> {
  await ensureFavoriteFolderTables();
  const rows = await q<{
    id: string;
    name: string;
    color: string;
    sort_order: number;
    cnt: number;
  }>(
    `SELECT f.id, f.name, f.color, f.sort_order,
            (SELECT COUNT(*) FROM content_favorites c WHERE c.folder_id = f.id AND c.user_id = f.user_id) AS cnt
     FROM favorite_folders f
     WHERE f.user_id = ?
     ORDER BY f.sort_order ASC, f.created_at ASC`,
    [userId]
  );
  const unfiledRow = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM content_favorites WHERE user_id = ? AND (folder_id IS NULL OR folder_id = '')`,
    [userId]
  );
  const unfiled = Number(unfiledRow?.c || 0);
  const folders = rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    color: String(r.color || 'primary'),
    sortOrder: Number(r.sort_order) || 0,
    count: Number(r.cnt) || 0,
  }));
  return { folders, unfiled, total: folders.reduce((s, f) => s + f.count, 0) + unfiled };
}

async function folderOf(userId: string, folderId: string) {
  const f = await one<{ id: string; user_id: string; name: string }>(
    `SELECT id, user_id, name FROM favorite_folders WHERE id = ?`,
    [folderId]
  );
  if (!f) throw new HttpError(404, 'NOT_FOUND', '分类不存在');
  if (String(f.user_id) !== String(userId)) throw new HttpError(403, 'FORBIDDEN', '无权操作该分类');
  return f;
}

export async function createFolder(userId: string, name: string, color = 'primary'): Promise<FavoriteFolder> {
  await ensureFavoriteFolderTables();
  const nm = str(name).trim().slice(0, 60);
  if (!nm) throw new HttpError(422, 'VALIDATION_FAILED', '分类名不能为空');
  const dup = await one<{ id: string }>(`SELECT id FROM favorite_folders WHERE user_id = ? AND name = ?`, [userId, nm]);
  if (dup) throw new HttpError(409, 'CONFLICT', '已存在同名分类');
  const maxRow = await one<{ m: number }>(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM favorite_folders WHERE user_id = ?`, [userId]);
  const id = newId('ffld');
  await exec(
    `INSERT INTO favorite_folders (id, user_id, name, color, sort_order, created_at) VALUES (?,?,?,?,?,?)`,
    [id, userId, nm, str(color).trim().slice(0, 20) || 'primary', Number(maxRow?.m || 0) + 1, ts()]
  );
  return { id, name: nm, color: str(color).trim() || 'primary', sortOrder: Number(maxRow?.m || 0) + 1, count: 0 };
}

export async function updateFolder(
  userId: string,
  folderId: string,
  patch: { name?: string; color?: string; sortOrder?: number }
): Promise<void> {
  await ensureFavoriteFolderTables();
  await folderOf(userId, folderId);
  const sets: string[] = [];
  const args: any[] = [];
  if (patch.name !== undefined) {
    const nm = str(patch.name).trim().slice(0, 60);
    if (!nm) throw new HttpError(422, 'VALIDATION_FAILED', '分类名不能为空');
    const dup = await one<{ id: string }>(
      `SELECT id FROM favorite_folders WHERE user_id = ? AND name = ? AND id <> ?`,
      [userId, nm, folderId]
    );
    if (dup) throw new HttpError(409, 'CONFLICT', '已存在同名分类');
    sets.push('name = ?');
    args.push(nm);
  }
  if (patch.color !== undefined) {
    sets.push('color = ?');
    args.push(str(patch.color).trim().slice(0, 20) || 'primary');
  }
  if (patch.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    args.push(Number(patch.sortOrder) || 0);
  }
  if (!sets.length) return;
  args.push(folderId);
  await exec(`UPDATE favorite_folders SET ${sets.join(', ')} WHERE id = ?`, args);
}

/** 删除分类：里面的收藏不删，退回「未分类」 */
export async function deleteFolder(userId: string, folderId: string): Promise<number> {
  await ensureFavoriteFolderTables();
  await folderOf(userId, folderId);
  await exec(`UPDATE content_favorites SET folder_id = NULL WHERE user_id = ? AND folder_id = ?`, [userId, folderId]);
  await exec(`DELETE FROM favorite_folders WHERE id = ? AND user_id = ?`, [folderId, userId]);
  return 1;
}

/** 把若干收藏移动进分类（folderId 为 null/空表示移回未分类），返回实际影响条数 */
export async function moveFavorites(
  userId: string,
  contentIds: string[],
  folderId: string | null
): Promise<number> {
  await ensureFavoriteFolderTables();
  const ids = (contentIds || []).map((x) => str(x).trim()).filter(Boolean);
  if (!ids.length) throw new HttpError(422, 'VALIDATION_FAILED', '请先选择要移动的内容');
  if (folderId) await folderOf(userId, folderId);

  const target: string | null = folderId ? folderId : null;
  let changed = 0;
  for (const cid of ids) {
    const row = await one<{ id: string }>(
      `SELECT id FROM content_favorites WHERE user_id = ? AND content_id = ?`,
      [userId, cid]
    );
    if (!row) continue; // 没收藏的不新建
    await exec(`UPDATE content_favorites SET folder_id = ? WHERE id = ?`, [target, row.id]);
    changed++;
  }
  return changed;
}
