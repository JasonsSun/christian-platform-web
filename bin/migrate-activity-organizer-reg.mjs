/* 一次性迁移:补齐活动创建人(organizer)的「已报名」记录
 *
 * 背景:早期版本(含种子数据)创建活动时没有把创建人写进 activity_registrations,
 * 导致「你是本活动创建人,已自动加入参与者」这句提示是假的 —— 参与人列表/报名进度
 * 把创建人漏掉(显示 0),点签到又会提示「请先报名」。创建人本身就应是第一个参与人。
 *
 * 本脚本幂等补齐:对每场活动,若创建人没有有效(非 cancelled)报名记录,
 *   就补一条 confirmed;若创建人只有一条 cancelled 记录(曾误点「取消报名」),
 *   则改回 confirmed(创建人恒为参与人,不应从自己活动消失)。
 *
 * 用法(在 apps/web 目录执行):
 *   node bin/migrate-activity-organizer-reg.mjs
 * 可重复执行,已正确的活动会被跳过。
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

const mysqlUrl = pathToFileURL(path.resolve('node_modules/mysql2/promise.js')).href;
const { default: mysql } = await import(mysqlUrl);
const conn = await mysql.createConnection(cfg);

const [acts] = await conn.query(
  `SELECT a.id AS activity_id, a.organizer_id,
          (SELECT r.status FROM activity_registrations r WHERE r.activity_id = a.id AND r.user_id = a.organizer_id LIMIT 1) AS reg_status
   FROM activities a`
);

const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
let inserted = 0;
let restored = 0;
let skipped = 0;

for (const a of acts) {
  if (!a.organizer_id) { skipped++; continue; }
  if (!a.reg_status) {
    // 完全没有报名记录 → 补一条 confirmed(用原生 UUID 兼容 CHAR(36))
    await conn.query(
      `INSERT INTO activity_registrations (id, activity_id, user_id, status, created_at)
       VALUES (UUID(), ?, ?, 'confirmed', ?)`,
      [a.activity_id, a.organizer_id, now]
    );
    inserted++;
  } else if (a.reg_status === 'cancelled') {
    // 只有一条 cancelled(创建人误取消了自己在自己活动的报名)→ 改回 confirmed
    await conn.query(
      `UPDATE activity_registrations SET status = 'confirmed', created_at = ?
       WHERE activity_id = ? AND user_id = ?`,
      [now, a.activity_id, a.organizer_id]
    );
    restored++;
  } else {
    skipped++;
  }
}

console.log(`[backfill] 活动总数 ${acts.length}: 新增创建人报名 ${inserted} 条, 恢复 cancelled→confirmed ${restored} 条, 已正确跳过 ${skipped} 条`);
await conn.end();
console.log('[backfill] done.');
