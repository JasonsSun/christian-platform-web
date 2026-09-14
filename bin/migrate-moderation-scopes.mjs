/* 幂等迁移:建立「模块审核员」体系的数据层
 *
 * 背景:原来 role 只有 member / moderator / admin 三档,moderator 一旦被授予
 * 就是"全站审核员",没有模块维度。人一多,管理员忙不过来,也需要把内容治理
 * 按模块分下去。本迁移做三件事:
 *
 *   1) 建 moderator_scopes(user_id, module):某人负责哪些模块,一人可多行
 *   2) 建 staff_messages:管理层专属私信通道,与普通用户私信(messages)隔离
 *   3) 回填:把现存的 moderator 全部登记为"全模块审核员",保证本次升级不降权,
 *      之后由管理员在「权限中心」按人裁剪到具体模块
 *
 * 用法(在 apps/web 目录执行):
 *   node bin/migrate-moderation-scopes.mjs            # 执行迁移
 *   node bin/migrate-moderation-scopes.mjs --dry-run  # 只看会做什么,不写库
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DRY = process.argv.includes('--dry-run');

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
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'christian_platform',
};

const MODULES = [
  'prayers', 'contents', 'comments', 'songs', 'media', 'live',
  'activities', 'organizations', 'groups', 'reports', 'feedback',
];

const stmts = [
  `CREATE TABLE IF NOT EXISTS moderator_scopes (
     user_id     CHAR(36)    NOT NULL,
     module      VARCHAR(32) NOT NULL,
     assigned_by CHAR(36)    NULL,
     assigned_at DATETIME    NOT NULL,
     PRIMARY KEY (user_id, module),
     KEY idx_ms_module (module),
     CONSTRAINT fk_ms_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS staff_messages (
     id         CHAR(36)      NOT NULL PRIMARY KEY,
     from_id    CHAR(36)      NOT NULL,
     to_id      CHAR(36)      NOT NULL,
     body       VARCHAR(2000) NOT NULL,
     \`read\`     TINYINT(1)    NOT NULL DEFAULT 0,
     created_at DATETIME      NOT NULL,
     KEY idx_sm_pair (from_id, to_id),
     KEY idx_sm_created (created_at),
     CONSTRAINT fk_sm_from FOREIGN KEY (from_id) REFERENCES users (id) ON DELETE CASCADE,
     CONSTRAINT fk_sm_to   FOREIGN KEY (to_id)   REFERENCES users (id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

console.log(`[migrate] ${DRY ? 'DRY-RUN ' : ''}mysql://${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
if (DRY) {
  for (const s of stmts) console.log(`  would run: ${s.replace(/\s+/g, ' ').slice(0, 100)}…`);
  console.log(`  would backfill moderators with modules: ${MODULES.join(', ')}`);
  process.exit(0);
}

const mysqlUrl = pathToFileURL(path.resolve('node_modules/mysql2/promise.js')).href;
const { default: mysql } = await import(mysqlUrl);
const conn = await mysql.createConnection(cfg);

let failed = false;
for (const sql of stmts) {
  try {
    await conn.query(sql);
    console.log(`[migrate] OK   -> ${sql.replace(/\s+/g, ' ').slice(0, 70)}…`);
  } catch (e) {
    console.error(`[migrate] FAIL\n  ${sql.replace(/\s+/g, ' ')}\n  -> ${String((e && e.message) || e)}`);
    failed = true;
    break;
  }
}

// 回填:现存 moderator 先登记为全模块,保证升级不降权
if (!failed) {
  const [mods] = await conn.query(`SELECT id, username FROM users WHERE role = 'moderator'`);
  console.log(`[migrate] 现存审核员 ${mods.length} 人`);
  let granted = 0;
  for (const u of mods) {
    for (const m of MODULES) {
      const [r] = await conn.query(
        `INSERT IGNORE INTO moderator_scopes (user_id, module, assigned_by, assigned_at) VALUES (?,?,NULL,NOW())`,
        [u.id, m]
      );
      granted += r.affectedRows || 0;
    }
    console.log(`  · ${u.username} -> 已登记 ${MODULES.length} 个模块(可在权限中心裁剪)`);
  }
  console.log(`[migrate] 共写入 ${granted} 条模块范围`);

  const [[scopeCount]] = await conn.query(`SELECT COUNT(*) AS c FROM moderator_scopes`);
  const [[admins]] = await conn.query(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`);
  console.log(`[migrate] moderator_scopes 现存 ${scopeCount.c} 行;管理员 ${admins.c} 人(全模块,无需登记)`);
}

await conn.end();
if (failed) process.exit(1);
console.log('[migrate] done.');
