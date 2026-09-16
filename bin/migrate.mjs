/* 版本化数据库迁移工具
 *
 * 背景：此前所有建表都是「运行时幂等 ensureXxxTable()」，好处是老库升级免操作，
 * 坏处是没有任何版本记录 —— 无法回答"这个库现在到底跑到哪一步了"，
 * 也无法做一次性数据订正、更没法回滚。
 *
 * 本工具补上版本层：
 *   - migrations/ 目录存放 .sql 文件，命名 001_xxx.sql / 002_yyy.sql
 *   - schema_migrations 表记录已执行版本 + 执行时间 + 校验和
 *   - 每个迁移在**单个事务**里执行：失败整体回滚，不留半截状态
 *   - 校验和不一致（有人手改了已跑过的迁移文件）直接拒绝，避免库与代码漂移
 *
 * 用法（在 apps/web 目录）：
 *   node bin/migrate.mjs            # 执行未跑过的迁移
 *   node bin/migrate.mjs status     # 查看当前状态
 *   node bin/migrate.mjs create xxx # 生成一个新迁移文件模板
 */
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const MIGRATIONS_DIR = path.resolve('migrations');

/* ---------- .env.local 简易加载（不引入额外依赖） ---------- */
const envPath = path.resolve('.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'christian_platform',
  multipleStatements: true,
};

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

async function connect() {
  return mysql.createConnection(cfg);
}

async function ensureMetaTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version      VARCHAR(20)  NOT NULL PRIMARY KEY,
      name         VARCHAR(200) NOT NULL DEFAULT '',
      checksum     VARCHAR(32)  NOT NULL DEFAULT '',
      executed_at  DATETIME     NOT NULL,
      ms           INT          NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function listFiles() {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3,}_.+\.sql$/.test(f))
    .sort();
}

async function main() {
  const cmd = process.argv[2] || 'up';

  if (cmd === 'create') {
    const name = process.argv[3];
    if (!name) {
      console.error('用法: node bin/migrate.mjs create <名字>');
      process.exit(1);
    }
    mkdirSync(MIGRATIONS_DIR, { recursive: true });
    const files = listFiles();
    const next = String(files.length + 1).padStart(3, '0');
    const file = path.join(MIGRATIONS_DIR, `${next}_${name}.sql`);
    writeFileSync(
      file,
      `-- ${next}_${name}\n-- 说明：这个迁移做什么、为什么要做\n\n-- 写 DDL / DML。整个文件在单个事务里执行，失败整体回滚。\n-- 注意：MySQL 的 DDL 会隐式提交，因此请把 DDL 单独放一个迁移文件。\n\nSELECT 1;\n`
    );
    console.log('已创建:', path.relative(process.cwd(), file));
    return;
  }

  const conn = await connect();
  try {
    await ensureMetaTable(conn);

    const [done] = await conn.query(
      `SELECT version, name, checksum, executed_at FROM schema_migrations ORDER BY version`
    );
    const doneMap = new Map(done.map((r) => [r.version, r]));
    const files = listFiles();

    if (cmd === 'status') {
      console.log(`数据库: ${cfg.database} @ ${cfg.host}:${cfg.port}`);
      console.log(`迁移目录: ${path.relative(process.cwd(), MIGRATIONS_DIR)}`);
      console.log(`已执行 ${done.length} 个，共 ${files.length} 个\n`);
      for (const f of files) {
        const v = f.split('_')[0];
        const rec = doneMap.get(v);
        if (!rec) {
          console.log(`  [ ] ${f}`);
        } else if (rec.checksum !== sha256(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))) {
          console.log(`  [!] ${f}  <-- 校验和不匹配（文件被修改过）`);
        } else {
          console.log(`  [x] ${f}  ${new Date(rec.executed_at).toISOString().slice(0, 19).replace('T', ' ')}`);
        }
      }
      return;
    }

    if (files.length === 0) {
      console.log('没有迁移文件。可用 `node bin/migrate.mjs create <名字>` 新建。');
      return;
    }

    let applied = 0;
    for (const f of files) {
      const version = f.split('_')[0];
      const sql = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      const checksum = sha256(sql);
      const rec = doneMap.get(version);

      if (rec) {
        if (rec.checksum !== checksum) {
          console.error(`\n[FATAL] ${f} 已执行过但内容已变更（期望 ${rec.checksum}，实际 ${checksum}）。`);
          console.error('        已跑过的迁移不允许修改 —— 请新增一个迁移来修正。');
          process.exit(1);
        }
        continue;
      }

      const t0 = Date.now();
      process.stdout.write(`  执行 ${f} ... `);
      await conn.beginTransaction();
      try {
        await conn.query(sql);
        const ms = Date.now() - t0;
        await conn.query(
          `INSERT INTO schema_migrations (version, name, checksum, executed_at, ms) VALUES (?,?,?,NOW(),?)`,
          [version, f, checksum, ms]
        );
        await conn.commit();
        console.log(`OK (${ms}ms)`);
        applied += 1;
      } catch (e) {
        await conn.rollback();
        console.log('FAILED');
        console.error(`\n[FATAL] ${f} 执行失败，已回滚：\n  ${e.message}`);
        process.exit(1);
      }
    }

    console.log(applied === 0 ? '\n已是最新，无需迁移。' : `\n完成，本次执行 ${applied} 个迁移。`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
