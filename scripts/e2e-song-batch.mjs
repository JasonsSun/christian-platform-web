// 诗歌批量导入 e2e：验证解析器 + 后台批量路由（admin 权限 + 逐首建库 + 幂等跳过）。
// 直接连真实 MySQL 造/查数据，通过 HTTP 调 API。用法：BASE=http://127.0.0.1:3200 node scripts/e2e-song-batch.mjs
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
  return signJwt(
    { sub: u.id, role: u.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 },
    env.JWT_SECRET
  );
}
const T = { admin: await jwt('admin'), member: await jwt('member') };

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

// 造一段含 3 首的批量文本（含 --- 分隔 / 和弦段 / 原调 / 标签）
const SAMPLE = `# 批量测试·奇异恩典
作者：约翰·牛顿
分类：恩典
原调：G
标签：救恩, 安慰

和弦：
[C]Amazing [G]grace how [Am]sweet the [F]sound

千古忧患归何处，我灵安息主怀中。

---
# 批量测试·你真伟大
作者：斯图尔特
分类：敬拜
原调：C
标签：创造

[K]O Lord my [G]God when I in [C]awesome wonder

---
# 批量测试·第三首
作者：佚名
歌词只有内容没有和弦
`;

// 预热：自定义 server.js 下新增路由首次命中可能触发按需编译竞态(偶发 404)，先打几次直到非 404
for (let i = 0; i < 8; i++) {
  const w = await api('GET', '/admin/songs/batch', T.admin, undefined).catch(() => ({ status: 0 }));
  if (w.status !== 404) break;
  await new Promise((r) => setTimeout(r, 600));
}

console.log('\n[e2e] 诗歌批量导入');

// 1) 非管理员应被拒
const denied = await api('POST', '/admin/songs/batch', T.member, { text: SAMPLE });
check('非管理员批量导入被拒(403)', denied.status === 403, `status=${denied.status}`);

// 2) 空文本报错
const empty = await api('POST', '/admin/songs/batch', T.admin, { text: '   ' });
check('空文本返回 422', empty.status === 422, `status=${empty.status}`);

// 3) 正常批量导入：应新建 3 首
const r = await api('POST', '/admin/songs/batch', T.admin, { text: SAMPLE });
check('批量导入返回 201', r.status === 201, `status=${r.status}`);
check('新建 3 首', r.data?.created === 3, JSON.stringify(r.data));
check('无跳过', r.data?.skipped === 0, JSON.stringify(r.data));
check('无错误', r.data?.errors === 0, JSON.stringify(r.data));

// 4) 数据库核对：字段写入正确（和弦/原调/分类/标签）
const [rows] = await conn.query(
  'SELECT title, author, category, tags, original_key, chords, lyrics FROM songs WHERE title LIKE ? ORDER BY title',
  ['批量测试%']
);
const byTitle = Object.fromEntries(rows.map((x) => [x.title, x]));
check('库中确有 3 首批量测试诗歌', rows.length === 3, `got ${rows.length}`);
const g = byTitle['批量测试·奇异恩典'];
check('第一首 author 写入', g?.author === '约翰·牛顿', JSON.stringify(g));
check('第一首 category 写入', g?.category === '恩典', g?.category);
check('第一首 original_key 写入', g?.original_key === 'G', g?.original_key);
check('第一首 tags 写入', g?.tags === '救恩, 安慰', g?.tags);
check('第一首 chords 多行写入', /\[C\]Amazing/.test(g?.chords || ''), g?.chords);
check('第一首 lyrics 不含和弦标记(已分离)', !/\[C\]/.test(g?.lyrics || ''), g?.lyrics?.slice(0, 20));
const c = byTitle['批量测试·你真伟大'];
check('第二首 original_key=C', c?.original_key === 'C', c?.original_key);
const t3 = byTitle['批量测试·第三首'];
check('第三首无和弦仍入库', t3 && t3.lyrics.includes('歌词只有内容'), t3?.lyrics?.slice(0, 20));

// 5) 幂等：再次导入同名应跳过 3 首
const r2 = await api('POST', '/admin/songs/batch', T.admin, { text: SAMPLE });
check('重复导入跳过 3 首', r2.data?.skipped === 3 && r2.data?.created === 0, JSON.stringify(r2.data));

// 6) 部分错误：缺歌词应计入 errors
const bad = `# 批量测试·缺歌词
作者：某人

---
# 批量测试·正常一首
作者：佚名
歌词在这里
`;
const r3 = await api('POST', '/admin/songs/batch', T.admin, { text: bad });
check('缺歌词计 1 错误', r3.data?.errors === 1, JSON.stringify(r3.data));
check('正常一首仍入库', r3.data?.created === 1, JSON.stringify(r3.data));

// 清理测试数据
await conn.query("DELETE FROM songs WHERE title LIKE ?", ['批量测试%']);
await conn.end();

console.log(`\n[e2e] 结果：${pass} 通过 / ${fail} 失败`);
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
