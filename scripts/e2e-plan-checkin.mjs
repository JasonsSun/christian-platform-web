// 端到端验证「真实读经 → 计划打卡」（用本地库 + 生产构建起的服务）
// 运行: node scripts/e2e-plan-checkin.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3125';
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);

const b64 = (s) => Buffer.from(s).toString('base64url');
function signJwt(payload, secret) {
  const body = { ...payload, iss: 'christian-platform' };
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = b64(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
}

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name} ${extra}`); }
};

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});

const [[peer]] = await conn.query(
  "SELECT id, role FROM users WHERE status='active' ORDER BY created_at LIMIT 1"
);
if (!peer) { console.log('没有可用测试用户，跳过'); process.exit(0); }
const UID = peer.id;
const TOKEN = signJwt(
  { sub: UID, role: peer.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 900 },
  env.JWT_SECRET
);
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
console.log(`测试用户: ${UID} (role=${peer.role})\n`);

const api = async (method, path, body) => {
  const res = await fetch(BASE + '/api/v1' + path, {
    method, headers: H, body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
};

// ---- 清理本测试将要触动的数据，保证起点干净 ----
const TEST_PLANS = ['john-21', 'psalms-30', 'psalm23-7'];
const TEST_CHAPTERS = [['john', 1], ['psalms', 1], ['psalms', 2], ['psalms', 3], ['psalms', 4], ['psalms', 5], ['psalms', 23]];
for (const p of TEST_PLANS) {
  await conn.query('DELETE FROM reading_plan_progress WHERE user_id=? AND plan_id=?', [UID, p]);
  await conn.query('DELETE FROM reading_plan_enrollment WHERE user_id=? AND plan_id=?', [UID, p]);
}
for (const [b, c] of TEST_CHAPTERS) {
  await conn.query('DELETE FROM bible_reading_history WHERE user_id=? AND book_id=? AND chapter=?', [UID, b, c]);
}

console.log('1) 报名才参与自动打卡（未报名不静默打卡）');
{
  const { json: before } = await api('GET', '/plans');
  const j = before.plans.find((p) => p.id === 'john-21');
  check('未报名时 enrolled=false', j?.enrolled === false);
  // 未报名就读约翰福音 1 章 → 不应产生打卡
  const { json: r } = await api('POST', '/bible/history', { bookId: 'john', chapter: 1, version: 'cuv', recordPlan: true });
  check('未报名读经 → completedDays 为空', Array.isArray(r.completedDays) && r.completedDays.length === 0, JSON.stringify(r));
  const [[row]] = await conn.query(
    'SELECT COUNT(*) AS c FROM reading_plan_progress WHERE user_id=? AND plan_id=?', [UID, 'john-21']
  );
  check('未报名 → 库里无打卡行', Number(row.c) === 0, `c=${row.c}`);
}

console.log('2) 报名后：单章日计划读完即打卡');
{
  const { json: e } = await api('POST', '/plans/john-21/enroll');
  check('enroll 返回 ok', e?.ok === true, JSON.stringify(e));
  const { json: d } = await api('GET', '/plans/john-21');
  check('详情 enrolled=true', d.enrolled === true);
  // 约翰福音 1 章已在上一步读过 —— 再记录一次应触发 day1
  const { json: r } = await api('POST', '/bible/history', { bookId: 'john', chapter: 1, version: 'cuv', recordPlan: true });
  check('读约翰1章 → 完成 day1', r.completedDays?.[0]?.planId === 'john-21' && r.completedDays?.[0]?.day === 1, JSON.stringify(r));
  check('带 planTitle 便于提示', !!r.completedDays?.[0]?.planTitle, JSON.stringify(r));
}

console.log('3) 多章日：诗篇30天第1天=诗篇1-5，须全读完才打卡');
{
  await api('POST', '/plans/psalms-30/enroll');
  // 先只读 1-4
  for (const c of [1, 2, 3, 4]) {
    await api('POST', '/bible/history', { bookId: 'psalms', chapter: c, version: 'cuv', recordPlan: true });
  }
  const { json: r4 } = await api('POST', '/bible/history', { bookId: 'psalms', chapter: 4, version: 'cuv', recordPlan: true });
  check('只读诗篇1-4 → 不打卡', (r4.completedDays || []).length === 0, JSON.stringify(r4));
  // 再读第5篇 → 触发 day1
  const { json: r5 } = await api('POST', '/bible/history', { bookId: 'psalms', chapter: 5, version: 'cuv', recordPlan: true });
  check('补上诗篇5 → 完成 day1', r5.completedDays?.[0]?.day === 1, JSON.stringify(r5));
}

console.log('4) 同章多天：诗篇23篇默想7天，每读一次推进一天');
{
  await api('POST', '/plans/psalm23-7/enroll');
  const days = [];
  for (let i = 0; i < 4; i++) {
    const { json: r } = await api('POST', '/bible/history', { bookId: 'psalms', chapter: 23, version: 'cuv', recordPlan: true });
    days.push(r.completedDays?.[0]?.day ?? null);
  }
  check('连续读4次 → 依次推进 day1,2,3,4', JSON.stringify(days) === JSON.stringify([1, 2, 3, 4]), JSON.stringify(days));
  const [[row]] = await conn.query(
    'SELECT COUNT(*) AS c FROM reading_plan_progress WHERE user_id=? AND plan_id=?', [UID, 'psalm23-7']
  );
  check('库中恰有 4 天记录', Number(row.c) === 4, `c=${row.c}`);
}

// ---- 清理测试数据 ----
for (const p of TEST_PLANS) {
  await conn.query('DELETE FROM reading_plan_progress WHERE user_id=? AND plan_id=?', [UID, p]);
  await conn.query('DELETE FROM reading_plan_enrollment WHERE user_id=? AND plan_id=?', [UID, p]);
}
for (const [b, c] of TEST_CHAPTERS) {
  await conn.query('DELETE FROM bible_reading_history WHERE user_id=? AND book_id=? AND chapter=?', [UID, b, c]);
}
await conn.end();

console.log(`\n结果: ${pass} 通过, ${fail} 失败  (测试数据已清理)`);
process.exit(fail > 0 ? 1 : 0);
