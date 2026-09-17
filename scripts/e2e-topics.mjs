// 话题聚合 e2e：/topics 聚合统计 / 排序 / 搜索；/topics/[tag] 概览与共现；
// /contents?tag= 精确整词过滤（含中文逗号兼容、子串不误匹配、只统计已发布）。
// 页面级冒烟：/topics 与 /topics/[tag] 能 SSR 出标题。
// 用法：BASE=http://127.0.0.1:3200 node scripts/e2e-topics.mjs
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
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const M = await jwt('member');
const ME = M.id;

const T1 = '话题测试信心';
const T2 = '话题测试祷告';
const T3 = '话题测试信心长尾';   // 用于验证整词匹配不会误命中 T1
const T_DRAFT = '话题测试仅草稿'; // 不应出现在 /topics
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const newId = () => crypto.randomUUID();

async function insertContent({ title, tags, status, likeCount = 0 }) {
  const id = newId();
  await conn.query(
    `INSERT INTO contents (id, author_id, title, body, content_type, status, scope, region, tags, cover, like_count, comment_count, view_count, created_at, published_at)
     VALUES (?,?,?,?,?,?, 'global', '', ?, '📝', ?, 0, 0, ?, ?)`,
    [id, ME, title, '话题 e2e 正文内容', 'article', status, tags, likeCount, now(), status === 'published' ? now() : null]
  );
  return id;
}

// 造数据：T1 两篇（其中一篇同时带 T2，制造共现）、T2 共两篇、T3 一篇（子串干扰）、草稿一篇
await insertContent({ title: 'e2e-信心-1', tags: `${T1},${T2}`, status: 'published', likeCount: 5 });
await insertContent({ title: 'e2e-信心-2', tags: `${T1}`, status: 'published', likeCount: 2 });
await insertContent({ title: 'e2e-祷告-1', tags: `${T2}`, status: 'published' });
await insertContent({ title: 'e2e-长尾-1', tags: `${T3}`, status: 'published' });
await insertContent({ title: 'e2e-中文逗号', tags: `${T1}，${T2}`, status: 'published' }); // 中文逗号
await insertContent({ title: 'e2e-草稿', tags: `${T_DRAFT}`, status: 'draft' });

const cleanup = async () => {
  await conn.query('DELETE FROM contents WHERE title LIKE ?', ['e2e-%']);
};

// 冷启动：新路由首次命中可能 404，重试到非 404
for (let i = 0; i < 40; i++) {
  const r = await api('GET', '/topics');
  if (r.status !== 404) break;
  await new Promise((r2) => setTimeout(r2, 500));
}

console.log('\n[e2e] 话题广场与话题详情');

/* 1. /topics 基础结构 */
{
  const r = await api('GET', `/topics?q=${encodeURIComponent('话题测试')}&limit=50`);
  check('/topics 返回 200', r.status === 200, `status=${r.status}`);
  const items = r.data?.items || [];
  check('返回标签列表非空', items.length > 0, `len=${items.length}`);
  check('含 contentTotal 统计', typeof r.data?.contentTotal === 'number');
  const t1 = items.find((x) => x.name === T1);
  check('聚合出测试话题 T1', !!t1);
  check('T1 内容数=3（两篇 + 中文逗号那篇）', t1?.count === 3, `count=${t1?.count}`);
  check('T1 点赞数=7（5+2）', t1?.likes === 7, `likes=${t1?.likes}`);
  check('热度分为正数', (t1?.heat || 0) > 0, `heat=${t1?.heat}`);
  check('热度百分比在 1~100', (t1?.heatPct || 0) > 0 && (t1?.heatPct || 0) <= 100, `pct=${t1?.heatPct}`);
  check('草稿话题不进聚合', !items.find((x) => x.name === T_DRAFT));
  check('中文逗号被正确拆分（T2 计数含该篇）', (items.find((x) => x.name === T2)?.count || 0) === 3, `t2=${items.find((x) => x.name === T2)?.count}`);
}

/* 2. 排序 */
{
  const hot = (await api('GET', '/topics?sort=hot&limit=200')).data?.items || [];
  const byCount = (await api('GET', '/topics?sort=count&limit=200')).data?.items || [];
  const byName = (await api('GET', '/topics?sort=name&limit=200')).data?.items || [];
  const byNew = (await api('GET', '/topics?sort=new&limit=200')).data?.items || [];
  const desc = (arr, f) => arr.every((x, i) => i === 0 || arr[i - 1][f] >= x[f]);
  check('sort=hot 按热度降序', desc(hot, 'heat'));
  check('sort=count 按内容数降序', desc(byCount, 'count'));
  check('sort=name 按名称升序', byName.every((x, i) => i === 0 || byName[i - 1].name.localeCompare(x.name, 'zh') <= 0));
  check('sort=new 首项有活跃时间', !!byNew[0]?.lastAt);
}

/* 3. 搜索与 min 过滤 */
{
  const hit = (await api('GET', `/topics?q=${encodeURIComponent('话题测试信心')}&limit=200`)).data?.items || [];
  check('搜索命中包含 T1', hit.some((x) => x.name === T1));
  const strict = (await api('GET', `/topics?q=${encodeURIComponent('话题测试信心长尾')}&limit=200`)).data?.items || [];
  check('搜索为包含匹配（长尾词只命中自身）', strict.length === 1 && strict[0].name === T3, `len=${strict.length}`);
  const min3 = (await api('GET', `/topics?min=3&q=${encodeURIComponent('话题测试')}&limit=50`)).data?.items || [];
  check('min=3 过滤掉低频话题', min3.every((x) => x.count >= 3) && min3.some((x) => x.name === T1));
}

/* 4. /topics/[tag] 概览 */
{
  const r = await api('GET', `/topics/${encodeURIComponent(T1)}`);
  check('话题详情返回 200', r.status === 200, `status=${r.status}`);
  const d = r.data || {};
  check('tag 回显正确', d.tag === T1, `tag=${d.tag}`);
  check('count=3', d.count === 3, `count=${d.count}`);
  check('likes=7', d.likes === 7, `likes=${d.likes}`);
  check('types 含 article 且总数对齐', d.types?.length === 1 && d.types[0].type === 'article' && d.types[0].count === 3);
  check('authors 含测试作者', (d.authors || []).some((a) => a.id === ME));
  check('共现相关话题含 T2', (d.related || []).some((x) => x.name === T2));
  check('共现不含自身', !(d.related || []).some((x) => x.name === T1));
  check('共现不含非共现的 T3', !(d.related || []).some((x) => x.name === T3));
  check('recent 最多 5 条且非空', (d.recent || []).length > 0 && (d.recent || []).length <= 5);
  check('empty=false', d.empty === false);

  const none = await api('GET', `/topics/${encodeURIComponent('话题测试不存在XYZ')}`);
  check('不存在的话题返回 200 且 empty=true', none.status === 200 && none.data?.empty === true, `status=${none.status}`);
  check('不存在的话题 count=0', none.data?.count === 0);

  const bad = await api('GET', '/topics/%20');
  check('空话题名返回 422', bad.status === 422, `status=${bad.status}`);
}

/* 5. /contents?tag= 精确过滤 */
{
  const r = await api('GET', `/contents?tag=${encodeURIComponent(T1)}&status=published&pageSize=50`, M.token);
  check('按 tag 过滤返回 200', r.status === 200, `status=${r.status}`);
  const items = r.data?.items || [];
  check('命中 3 篇', items.length === 3, `len=${items.length}`);
  check('命中项都含该标签', items.every((x) => (x.tags || []).includes(T1)));
  check('不含仅带长尾标签的内容', !items.some((x) => (x.tags || []).includes(T3)));

  // 整词匹配：tag=T1 不应命中 tags=T3（T3 是 T1 的超串）
  const longTail = await api('GET', `/contents?tag=${encodeURIComponent(T3)}&status=published&pageSize=50`, M.token);
  check('长尾标签只命中自身 1 篇', (longTail.data?.items || []).length === 1, `len=${(longTail.data?.items || []).length}`);

  const draft = await api('GET', `/contents?tag=${encodeURIComponent(T_DRAFT)}&status=published&pageSize=50`, M.token);
  check('草稿内容不在公开结果里', (draft.data?.items || []).length === 0);

  // 与 type 组合
  const withType = await api('GET', `/contents?tag=${encodeURIComponent(T1)}&status=published&type=testimony&pageSize=50`, M.token);
  check('tag + type 组合过滤生效', (withType.data?.items || []).length === 0, `len=${(withType.data?.items || []).length}`);
}

/* 6. 页面 SSR 冒烟 */
{
  const p1 = await fetch(BASE + '/topics');
  const h1 = await p1.text();
  check('/topics 页面 200', p1.status === 200, `status=${p1.status}`);
  check('/topics SSR 含「话题广场」', h1.includes('话题广场'));

  const p2 = await fetch(BASE + '/topics/' + encodeURIComponent(T1));
  const h2 = await p2.text();
  check('/topics/[tag] 页面 200', p2.status === 200, `status=${p2.status}`);
  check('/topics/[tag] SSR 含话题名', h2.includes(T1) || h2.includes('返回话题广场'));
}

await cleanup();
await conn.end();

console.log(`\n[e2e] 结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
