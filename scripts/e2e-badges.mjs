// 成就徽章 e2e：建表幂等 / 未登录 401 / 阈值达成自动授予 / 重复调用不刷记录 /
// 他人主页只读已解锁。直连真实 MySQL 造数据，通过 HTTP 调 API。
// 用法：BASE=http://127.0.0.1:3200 node scripts/e2e-badges.mjs
import mysql from 'mysql2/promise';
import fs from 'fs';
import crypto from 'node:crypto';

const BASE = process.env.BASE || 'http://127.0.0.1:3200';
const b64 = (s) => Buffer.from(s).toString('base64url');
const signJwt = (payload, secret) => {
  const body = { ...payload, iss: 'christian-platform' };
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = b64(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
};

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
});

async function jwt(role) {
  const [rows] = await conn.query("SELECT id, role FROM users WHERE status='active' AND role=? LIMIT 1", [role]);
  if (!rows.length) throw new Error(`no active ${role}`);
  const u = rows[0];
  return { token: signJwt({ sub: u.id, role: u.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 }, env.JWT_SECRET), id: String(u.id) };
}

async function api(method, path, token, body) {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const M = await jwt('member');
const ME = M.id;

// 冷启动：新路由首次命中可能 404，重试到非 404
for (let i = 0; i < 40; i++) {
  const r = await api('GET', '/me/badges', M.token);
  if (r.status !== 404) break;
  await new Promise((r2) => setTimeout(r2, 500));
}

console.log('\n[e2e] 成就徽章体系');

/* 1. 未登录 */
{
  const r = await fetch(BASE + '/api/v1/me/badges');
  check('未登录访问 /me/badges 返回 401', r.status === 401, `status=${r.status}`);
}

/* 2. 建表 + 定义落库 */
{
  const [t] = await conn.query("SHOW TABLES LIKE 'badges'");
  const [t2] = await conn.query("SHOW TABLES LIKE 'user_badges'");
  check('badges 表已建', Array.isArray(t) && t.length === 1);
  check('user_badges 表已建', Array.isArray(t2) && t2.length === 1);
  const [cnt] = await conn.query('SELECT COUNT(*) AS c FROM badges');
  check('徽章定义已入库(>=20)', Number(cnt[0].c) >= 20, `count=${cnt[0].c}`);
}

/* 3. 总览结构 */
let first;
{
  const r = await api('GET', '/me/badges', M.token);
  first = r.data;
  check('GET /me/badges 200', r.status === 200, `status=${r.status}`);
  check('返回徽章总数 >= 20', Number(r.data?.total) >= 20, `total=${r.data?.total}`);
  check('badges 数组长度与 total 一致', r.data?.badges?.length === r.data?.total);
  check('含 stats 指标', !!r.data?.stats && typeof r.data.stats.checkinStreak === 'number');
  check('每项含 earned/percent/target', r.data?.badges?.every?.((b) => typeof b.earned === 'boolean' && typeof b.percent === 'number' && typeof b.target === 'number'));
}

/* 4. 造数据触发「静默有时」(devotion_7，写满 7 篇灵修) */
const MARK = '徽章e2e测试';
const before = Number(first?.badges?.find((b) => b.id === 'devotion_7')?.earned ? 1 : 0);
{
  // 该徽章尚未解锁时才造数据，已解锁则跳过插入（仍要验证 earned=true）
  const cur = Number(first?.stats?.devotionCount || 0);
  if (cur < 7) {
    const need = 7 - cur;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    for (let i = 0; i < need; i++) {
      await conn.query(
        'INSERT INTO devotionals (id, user_id, title, body, ref, mood, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        [crypto.randomUUID(), ME, `${MARK}-${i}`, 'e2e 测试正文', '诗篇 23:1', '感恩', now, now]
      );
    }
  }
  const r = await api('GET', '/me/badges', M.token);
  const b = r.data?.badges?.find((x) => x.id === 'devotion_7');
  check('写满 7 篇灵修后 devotion_7 解锁', !!b?.earned, `earned=${b?.earned} current=${b?.current}`);
  check('devotion_7 进度为 100%', Number(b?.percent) === 100, `percent=${b?.percent}`);
  check('首次解锁出现在 newEarned 中', before === 0 ? (r.data?.newEarned || []).some((x) => x.id === 'devotion_7') : true);
}

/* 5. 幂等：再调一次不应重复授予 */
{
  const r = await api('GET', '/me/badges', M.token);
  check('重复调用 newEarned 为空（不重复授予）', (r.data?.newEarned || []).length === 0, `new=${JSON.stringify((r.data?.newEarned || []).map((x) => x.id))}`);
  const [dup] = await conn.query(
    'SELECT COUNT(*) AS c FROM user_badges WHERE user_id = ? AND badge_id = ?',
    [ME, 'devotion_7']
  );
  check('user_badges 中该徽章只有 1 行', Number(dup[0].c) === 1, `rows=${dup[0].c}`);
}

/* 6. earnedCount 与 DB 一致 */
{
  const r = await api('GET', '/me/badges', M.token);
  const [db] = await conn.query('SELECT COUNT(*) AS c FROM user_badges WHERE user_id = ?', [ME]);
  check('earnedCount 与数据库行数一致', Number(r.data?.earnedCount) === Number(db[0].c), `api=${r.data?.earnedCount} db=${db[0].c}`);
}

/* 7. 他人主页只读已解锁 */
{
  const r = await api('GET', `/users/${ME}/badges`, M.token);
  check('GET /users/:id/badges 200', r.status === 200, `status=${r.status}`);
  check('只返回已解锁徽章', Array.isArray(r.data?.badges) && r.data.badges.every((b) => b.earned === true));
  check('他人视图总数 = 已解锁数', Number(r.data?.total) === r.data?.badges?.length);
}

/* 8. 不存在的用户 */
{
  const r = await api('GET', '/users/definitely-not-exist/badges', M.token);
  check('不存在的用户返回 404', r.status === 404, `status=${r.status}`);
}

/* 清理：删测试灵修 + 本次因测试解锁的 devotion_7 */
await conn.query("DELETE FROM devotionals WHERE user_id = ? AND title LIKE ?", [ME, `${MARK}-%`]);
await conn.query("DELETE FROM user_badges WHERE user_id = ? AND badge_id = 'devotion_7'", [ME]);
await conn.end();

console.log(`\n[e2e] 结果：${pass} 通过 / ${fail} 失败`);
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
