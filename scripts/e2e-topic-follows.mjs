// 话题关注 e2e：关注/取关幂等 / 关注列表 / 广场与详情的 following+followers /
// only=following 过滤 / 未登录只读 / 参数校验 / 审核上架后通知关注者 / 页面 SSR。
// 用法：BASE=http://127.0.0.1:3200 node scripts/e2e-topic-follows.mjs
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

async function api(method, path, token, body) {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, raw: res };
}

const [[u1]] = await conn.query("SELECT id FROM users WHERE status='active' AND role='member' LIMIT 1");
const ME = String(u1.id);
const [[o]] = await conn.query("SELECT id FROM users WHERE status='active' AND id <> ? LIMIT 1", [ME]);
const OTHER = String(o.id);
const [[ad]] = await conn.query("SELECT id FROM users WHERE status='active' AND role='admin' LIMIT 1");
const ADMIN = String(ad?.id || ME);
const mk = (id, role) => signJwt({ sub: id, role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 }, env.JWT_SECRET);
const TOKEN = mk(ME, 'member');
const TOKEN2 = mk(OTHER, 'member');
const ADMIN_TOKEN = mk(ADMIN, 'admin');

const TAG = 'e2e信仰';
const TAG2 = 'e2e盼望';

// 造两条带标签的已发布内容，保证话题真实存在
const C1 = crypto.randomUUID();
const C2 = crypto.randomUUID();
const insContent = (id, title, tags) =>
  conn.query(
    `INSERT INTO contents (id, author_id, title, body, content_type, status, scope, region, tags, cover,
                           like_count, comment_count, view_count, created_at, published_at)
     VALUES (?,?,?,?,'article','published','global','CN',?,'📝',0,0,0,NOW(),NOW())`,
    [id, ME, title, '话题关注 e2e 正文内容，长度足够通过校验。', tags]
  );
await insContent(C1, 'e2e-话题关注-内容一', `${TAG},${TAG2}`);
await insContent(C2, 'e2e-话题关注-内容二', TAG);

const cleanup = async () => {
  await conn.query('DELETE FROM contents WHERE title LIKE ?', ['e2e-话题关注-%']);
  await conn.query('DELETE FROM review_tasks WHERE content_id IN (?,?)', [C1, C2]);
  await conn.query('DELETE FROM topic_follows WHERE tag IN (?,?)', [TAG, TAG2]);
  await conn.query('DELETE FROM notifications WHERE type = ?', ['topic.new_content']);
};
// 表是运行时幂等建的，脚本启动时它可能还不存在 —— 清库失败无关紧要，忽略
try { await conn.query('DELETE FROM topic_follows WHERE tag IN (?,?)', [TAG, TAG2]); } catch {}

// 等按需编译
for (let i = 0; i < 40; i++) {
  const r = await api('GET', '/topics?q=e2e&limit=200');
  if (r.status !== 404) break;
  await new Promise((r2) => setTimeout(r2, 500));
}

console.log('\n[e2e] 话题关注');

/* 1. 未登录只读 */
{
  const r = await api('GET', '/topics?q=e2e&limit=200');
  check('广场接口 200', r.status === 200, `status=${r.status}`);
  check('未登录 loggedIn=false', r.data?.loggedIn === false);
  const t = (r.data?.items || []).find((x) => x.name === TAG);
  check('话题出现在广场', !!t, `items=${(r.data?.items || []).map((x) => x.name).join(',')}`);
  check('未登录时 following=false', t?.following === false);
  check('关注者数字段存在', typeof t?.followers === 'number');

  const anon = await api('POST', '/me/topics', null, { tag: TAG });
  check('未登录关注返回 401', anon.status === 401, `status=${anon.status}`);

  const anonList = await api('GET', '/me/topics');
  check('未登录看关注列表返回 401', anonList.status === 401, `status=${anonList.status}`);
}

/* 2. 关注幂等 */
{
  const a = await api('POST', '/me/topics', TOKEN, { tag: TAG });
  check('首次关注返回 201', a.status === 201, `status=${a.status}`);
  check('首次关注 created=true', a.data?.created === true);
  const b = await api('POST', '/me/topics', TOKEN, { tag: TAG });
  check('重复关注返回 200', b.status === 200, `status=${b.status}`);
  check('重复关注 created=false（幂等）', b.data?.created === false);
  const [rows] = await conn.query('SELECT COUNT(*) AS c FROM topic_follows WHERE user_id=? AND tag=?', [ME, TAG]);
  check('重复关注不产生重复行', Number(rows[0].c) === 1, `count=${rows[0].c}`);

  await api('POST', '/me/topics', TOKEN2, { tag: TAG });
  await api('POST', '/me/topics', TOKEN, { tag: TAG2 });
}

/* 3. 关注列表 */
{
  const r = await api('GET', '/me/topics', TOKEN);
  check('关注列表 200', r.status === 200);
  const names = (r.data?.items || []).map((x) => x.tag);
  check('列表含已关注话题', names.includes(TAG) && names.includes(TAG2), names.join(','));
  const t = (r.data?.items || []).find((x) => x.tag === TAG);
  check('列表带实时内容数', t?.count === 2, `count=${t?.count}`);
  check('列表带最近活跃时间', typeof t?.lastAt === 'string' && t.lastAt.length > 0);

  const one = await api('GET', `/me/topics/${encodeURIComponent(TAG)}`, TOKEN);
  check('单话题状态 200', one.status === 200);
  check('单话题 following=true', one.data?.following === true);
  check('单话题关注人数=2', one.data?.followers === 2, `followers=${one.data?.followers}`);
}

/* 4. 广场与详情的关注态 */
{
  const r = await api('GET', '/topics?q=e2e&limit=200', TOKEN);
  const t = (r.data?.items || []).find((x) => x.name === TAG);
  check('登录时 following=true', t?.following === true);
  check('登录时关注人数=2', t?.followers === 2, `followers=${t?.followers}`);

  const only = await api('GET', '/topics?q=e2e&limit=200&only=following', TOKEN);
  const names = (only.data?.items || []).map((x) => x.name);
  check('only=following 只返回我关注的', names.length === 2 && names.includes(TAG) && names.includes(TAG2), names.join(','));

  const none = await api('GET', '/topics?q=e2e&limit=200&only=following', mk(ADMIN, 'admin'));
  check('没关注的人 only=following 为空', (none.data?.items || []).length === 0);

  const d = await api('GET', `/topics/${encodeURIComponent(TAG)}`, TOKEN);
  check('详情 200', d.status === 200);
  check('详情 following=true', d.data?.following === true);
  check('详情 followers=2', d.data?.followers === 2, `followers=${d.data?.followers}`);

  const d2 = await api('GET', `/topics/${encodeURIComponent(TAG)}`);
  check('未登录详情 following=false', d2.data?.following === false);
  check('未登录详情仍返回关注人数', d2.data?.followers === 2);
}

/* 5. 参数校验 */
{
  const r = await api('POST', '/me/topics', TOKEN, { tag: '   ' });
  check('空话题名返回 422', r.status === 422, `status=${r.status}`);
  const r2 = await api('POST', '/me/topics', TOKEN, {});
  check('缺 tag 返回 422', r2.status === 422, `status=${r2.status}`);
}

/* 6. 取关 */
{
  const r = await api('DELETE', `/me/topics/${encodeURIComponent(TAG2)}`, TOKEN);
  check('取关 200', r.status === 200, `status=${r.status}`);
  check('取关后 following=false', r.data?.following === false);
  const again = await api('DELETE', `/me/topics/${encodeURIComponent(TAG2)}`, TOKEN);
  check('重复取关不报错（幂等）', again.status === 200 && again.data?.removed === false);
  const list = await api('GET', '/me/topics', TOKEN);
  check('取关后列表只剩 1 个', (list.data?.items || []).length === 1, JSON.stringify(list.data?.items?.map((x) => x.tag)));
}

/* 7. 审核上架后通知关注者 */
{
  // 新内容（作者=ME 之外的第二人），关注者=ME（关注了 TAG），作者不应收到自己的通知
  const C3 = crypto.randomUUID();
  await conn.query(
    `INSERT INTO contents (id, author_id, title, body, content_type, status, scope, region, tags, cover,
                           like_count, comment_count, view_count, created_at, published_at)
     VALUES (?,?,?,?,'article','pending_review','global','CN',?,'📝',0,0,0,NOW(),NULL)`,
    [C3, OTHER, 'e2e-话题关注-待审', '待审核正文，长度足够。', TAG]
  );
  const taskId = crypto.randomUUID();
  await conn.query(
    `INSERT INTO review_tasks (id, content_id, status, reviewer_id, reason, created_at) VALUES (?,?,'pending',NULL,'',NOW())`,
    [taskId, C3]
  );
  await conn.query('DELETE FROM notifications WHERE type = ?', ['topic.new_content']);

  const ap = await api('POST', `/moderation/${taskId}/action`, ADMIN_TOKEN, { action: 'approve' });
  check('审核通过 200', ap.status === 200, `status=${ap.status}`);
  check('返回 notified=1（通知了 1 位关注者）', ap.data?.notified === 1, `notified=${ap.data?.notified}`);

  const [ntf] = await conn.query(
    `SELECT user_id, title, link FROM notifications WHERE type='topic.new_content'`
  );
  check('生成 topic.new_content 通知', ntf.length === 1, `count=${ntf.length}`);
  check('通知发给关注者本人', String(ntf[0]?.user_id) === ME, `uid=${ntf[0]?.user_id}`);
  check('通知指向内容详情', String(ntf[0]?.link || '').includes(C3), `link=${ntf[0]?.link}`);
  check('作者本人不被通知', !ntf.some((n) => String(n.user_id) === OTHER));

  await conn.query('DELETE FROM contents WHERE id = ?', [C3]);
  await conn.query('DELETE FROM review_tasks WHERE id = ?', [taskId]);
}

/* 8. 页面 SSR */
{
  const p = await fetch(BASE + '/topics');
  const h = await p.text();
  check('/topics 页面 200', p.status === 200, `status=${p.status}`);
  check('/topics SSR 含「话题广场」', h.includes('话题广场'));

  const d = await fetch(BASE + '/topics/' + encodeURIComponent(TAG));
  const dh = await d.text();
  check('话题详情页 200', d.status === 200, `status=${d.status}`);
  check('话题详情页 SSR 含话题名', dh.includes(TAG), '');
}

await cleanup();
await conn.end();

console.log(`\n[e2e] 结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
