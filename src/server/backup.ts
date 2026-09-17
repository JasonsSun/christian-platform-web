import fs from 'fs';
import path from 'path';
import { q, exec, newId, ts } from './db';

/**
 * 后台备份管理。
 *
 * 两类备份共用 `backups/` 目录（容器内 /app/backups，已挂载到宿主机 ./backups）：
 *  - 自动备份：宿主机 cron 跑 deploy/backup.sh 产生的 `*.sql.gz`（mysqldump 全量，运维用 mysqldump 恢复）；
 *  - 应用备份：本模块「立即备份」产生的 `*.json`（自包含逻辑快照，可由本模块「恢复」回灌，INSERT IGNORE 只补不覆盖）。
 *
 * 应用备份不依赖 mysql 客户端，纯 JS SELECT → JSON，容器内有网/无网都能跑。
 */

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const NAME_RE = /^[A-Za-z0-9_.\-]+$/;

export function ensureBackupDir(): void {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  } catch { /* ignore */ }
}

function safeName(name: string): boolean {
  // 防目录穿越：仅允许安全文件名，且必须落在 backups 目录内
  if (!NAME_RE.test(name)) return false;
  const abs = path.resolve(BACKUP_DIR, name);
  return abs === path.join(BACKUP_DIR, name);
}

export interface BackupFile {
  name: string;
  size: number;
  mtime: string;
  kind: 'sql.gz' | 'json';
  source: 'cron' | 'app';
  createdBy?: string;
}

export async function listBackups(): Promise<BackupFile[]> {
  ensureBackupDir();
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const records = await q<any>(
    `SELECT filename, created_by, DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
       FROM db_backups ORDER BY created_at DESC`
  ).catch(() => [] as any[]);
  const recMap = new Map<string, any>();
  for (const r of records) recMap.set(r.filename, r);

  const out: BackupFile[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.sql.gz') && !e.name.endsWith('.json')) continue;
    let stat: fs.Stats | null = null;
    try { stat = fs.statSync(path.join(BACKUP_DIR, e.name)); } catch { continue; }
    const kind = e.name.endsWith('.sql.gz') ? 'sql.gz' : 'json';
    const rec = recMap.get(e.name);
    out.push({
      name: e.name,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      kind,
      source: rec ? 'app' : 'cron',
      createdBy: rec?.created_by,
    });
  }
  out.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  return out;
}

/** 生成应用逻辑备份（全表 JSON 快照），写入文件并记录元数据 */
export async function createAppBackup(adminId: string): Promise<{ name: string; size: number; rowCount: number }> {
  ensureBackupDir();
  const tables = await q<{ [k: string]: string }>(`SHOW TABLES`);
  const tableKey = tables.length && tables[0] ? Object.keys(tables[0])[0] : 'Tables_in_unknown';
  const snapshot: Record<string, any[]> = {};
  let rowCount = 0;
  for (const t of tables) {
    const tableName = t[tableKey];
    const rows = await q<any>(`SELECT * FROM \`${tableName}\``);
    snapshot[tableName] = rows;
    rowCount += rows.length;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `christian_platform_app_${stamp}.json`;
  const abs = path.join(BACKUP_DIR, name);
  fs.writeFileSync(abs, JSON.stringify({ generatedAt: new Date().toISOString(), tables: snapshot }), 'utf8');
  const size = fs.statSync(abs).size;
  await exec(
    `INSERT INTO db_backups (id, filename, size_bytes, tables_json, row_count, created_by, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [newId('bk'), name, size, JSON.stringify(Object.keys(snapshot)), rowCount, adminId, ts()]
  );
  return { name, size, rowCount };
}

export function readBackupFile(name: string): { buf: Buffer; contentType: string } | null {
  if (!safeName(name)) return null;
  const abs = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  const contentType = name.endsWith('.sql.gz') ? 'application/gzip' : 'application/json';
  return { buf, contentType };
}

export async function deleteBackup(name: string): Promise<boolean> {
  if (!safeName(name)) return false;
  const abs = path.join(BACKUP_DIR, name);
  try { fs.rmSync(abs, { force: true }); } catch { /* ignore */ }
  await exec(`DELETE FROM db_backups WHERE filename = ?`, [name]).catch(() => undefined);
  return true;
}

/**
 * 恢复应用备份：用 INSERT IGNORE 回灌，只补不覆盖（已存在的行按主键/唯一键跳过）。
 * 这是有风险的操作，调用方须经二次确认。
 */
export async function restoreAppBackup(name: string): Promise<{ tables: number; inserted: number }> {
  const f = readBackupFile(name);
  if (!f || !name.endsWith('.json')) throw new Error('仅支持恢复应用 JSON 备份');
  const snap = JSON.parse(f.buf.toString('utf8'));
  if (!snap.tables || typeof snap.tables !== 'object') throw new Error('备份文件格式错误');
  let inserted = 0;
  const tableNames = Object.keys(snap.tables);
  for (const table of tableNames) {
    const rows: any[] = snap.tables[table] || [];
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    if (!cols.length) continue;
    const placeholders = cols.map(() => '?').join(',');
    const colSql = cols.map((c) => `\`${c}\``).join(',');
    const sql = `INSERT IGNORE INTO \`${table}\` (${colSql}) VALUES (${placeholders})`;
    for (const row of rows) {
      const vals = cols.map((c) => row[c]);
      await exec(sql, vals).then((r: any) => { if (r?.affectedRows) inserted += r.affectedRows; }).catch(() => undefined);
    }
  }
  return { tables: tableNames.length, inserted };
}
