/* 一次性迁移:给 prayer_amens 补上外键,并清理历史孤儿记录
 *
 * 背景:prayer_amens(prayer_id, user_id) 从建表起就没有任何外键约束,
 * 于是「删除一条代祷」只会删掉 prayers 里的那一行,prayer_amens 里的
 * 「阿们」记录全部变成孤儿数据,长期堆积且计数不准。
 *
 * 本次做两件事:
 *   1) 清掉指向已不存在代祷 / 用户的孤儿 amen 行
 *   2) 补上 fk_amens_prayer(ON DELETE CASCADE) 与 fk_amens_user(ON DELETE CASCADE)
 *
 * 说明:接口层已改为在事务内显式删除 amen,所以即使本迁移暂时没跑,删除代祷
 * 也不会再产生孤儿;本迁移是把约束补齐,让任何直连 SQL 的删除同样安全。
 *
 * 用法(在 apps/web 目录执行):
 *   node bin/migrate-prayer-amens-fk.mjs            # 执行迁移
 *   node bin/migrate-prayer-amens-fk.mjs --dry-run  # 只看会做什么,不写库
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

// 1) 清理孤儿:先删指向不存在代祷的,再删指向不存在用户的
const cleanup = [
  `DELETE a FROM prayer_amens a
     LEFT JOIN prayers p ON p.id = a.prayer_id
    WHERE p.id IS NULL`,
  `DELETE a FROM prayer_amens a
     LEFT JOIN users u ON u.id = a.user_id
    WHERE u.id IS NULL`,
];

// 2) 结构变更(幂等,重复执行靠错误码跳过)
const stmts = [
  `ALTER TABLE prayer_amens
     ADD CONSTRAINT fk_amens_prayer FOREIGN KEY (prayer_id) REFERENCES prayers (id) ON DELETE CASCADE`,
  `ALTER TABLE prayer_amens
     ADD CONSTRAINT fk_amens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE`,
];

console.log(`[migrate] ${DRY ? 'DRY-RUN ' : ''}mysql://${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
if (DRY) {
  for (const s of [...cleanup, ...stmts]) console.log(`  would run: ${s.replace(/\s+/g, ' ')}`);
  process.exit(0);
}

const mysqlUrl = pathToFileURL(path.resolve('node_modules/mysql2/promise.js')).href;
const { default: mysql } = await import(mysqlUrl);
const conn = await mysql.createConnection(cfg);

// 先看看有多少孤儿要清
const [[before]] = await conn.query(
  `SELECT COUNT(*) AS c FROM prayer_amens a
     LEFT JOIN prayers p ON p.id = a.prayer_id
    WHERE p.id IS NULL`
);
console.log(`[migrate] 发现指向已删代祷的孤儿 amen 行:${before.c}`);

let failed = false;

for (const sql of cleanup) {
  try {
    const [r] = await conn.query(sql);
    console.log(`[migrate] OK   -> 清理完成,影响 ${r.affectedRows} 行`);
  } catch (e) {
    console.error(`[migrate] FAIL\n  ${sql}\n  -> ${String((e && e.message) || e)}`);
    failed = true;
    break;
  }
}

if (!failed) {
  for (const sql of stmts) {
    try {
      await conn.query(sql);
      console.log(`[migrate] OK   -> ${sql.replace(/\s+/g, ' ').slice(0, 78)}…`);
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/Duplicate foreign key|already exists|errno: 121/i.test(msg)) {
        console.log(`[migrate] SKIP -> ${msg.split('\n')[0]}`);
        continue;
      }
      console.error(`[migrate] FAIL\n  ${sql}\n  -> ${msg}`);
      failed = true;
      break;
    }
  }
}

if (!failed) {
  const [fks] = await conn.query(
    `SELECT k.CONSTRAINT_NAME, k.REFERENCED_TABLE_NAME, r.DELETE_RULE
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA
      WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = 'prayer_amens'`,
    [cfg.database]
  );
  console.log('[migrate] 当前外键:');
  if (!fks.length) console.log('  (无)');
  for (const f of fks) {
    console.log(`  ${f.CONSTRAINT_NAME} -> ${f.REFERENCED_TABLE_NAME} ON DELETE ${f.DELETE_RULE}`);
  }
  const [[left]] = await conn.query(`SELECT COUNT(*) AS c FROM prayer_amens`);
  console.log(`[migrate] prayer_amens 现存 ${left.c} 行`);
}

await conn.end();
if (failed) process.exit(1);
console.log('[migrate] done.');
