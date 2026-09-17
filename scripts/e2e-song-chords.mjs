// E2E 验证：诗歌和弦谱字段全链路（API 级）
//   1) 管理员 PATCH 一首歌设置 chords/originalKey -> 详情与列表均透传
//   2) 公开列表 /songs 与后台列表 /admin/songs 透传 chords/originalKey
//   3) 投稿接口接受 chords/originalKey
// 运行: BASE=http://127.0.0.1:3200 node scripts/e2e-song-chords.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3200';
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const b64 = (s) => Buffer.from(s).toString('base64url');
const signJwt = (payload, secret) => {
  const body = { ...payload, iss: 'christian-platform' };
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = b64(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
};
const uid = () => crypto.randomUUID();

let pass = 0, fail = 0;
const check = (n, c, e = '') => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n} ${e}`); }
};

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});

const pick = async (role) => {
  const [rows] = await conn.query(
    `SELECT id, role FROM users WHERE status='active'${role ? ` AND role='${role}'` : ''} LIMIT 6`
  );
  return rows;
};
const tok = (u) => signJwt(
  { sub: u.id, role: u.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 },
  env.JWT_SECRET
);
const api = async (method, path, t, body) => {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  const payload = j?.data ?? j ?? {};
  return { status: res.status, data: payload, code: j?.code ?? payload?.code, message: j?.message ?? payload?.message };
};

try {
  const admins = await pick('admin');
  if (!admins.length) { console.log('需要至少 1 个 admin 账号'); await conn.end(); process.exit(1); }
  const admin = admins[0];
  const T = { admin: tok(admin) };

  const [songs] = await conn.query("SELECT id, title FROM songs WHERE status='published' LIMIT 1");
  if (!songs.length) { console.log('无已发布歌曲'); await conn.end(); process.exit(1); }
  const sid = songs[0].id;

  const CHORDS = '[C]Amazing [G]grace how [Am]sweet the [F]sound';
  const KEY = 'G';

  // 1) 管理员设置
  const p = await api('PATCH', `/admin/songs/${sid}`, T.admin, { chords: CHORDS, originalKey: KEY });
  check('管理员设置和弦谱 200', p.status === 200, `status=${p.status} ${p.message || ''}`);
  check('返回 chords 透传', p.data?.chords === CHORDS, JSON.stringify(p.data));
  check('返回 originalKey 透传', p.data?.originalKey === KEY, JSON.stringify(p.data));

  // 2) 详情回读
  const d = await api('GET', `/songs/${sid}`);
  check('详情返回 chords', d.data?.chords === CHORDS, JSON.stringify(d.data));
  check('详情返回 originalKey', d.data?.originalKey === KEY, JSON.stringify(d.data));

  // 3) 公开列表透传
  const list = await api('GET', '/songs?pageSize=50');
  const item = (list.data?.items || []).find((i) => i.id === sid);
  check('公开列表含该歌曲', !!item, '未找到');
  check('列表项透传 chords', item?.chords === CHORDS, JSON.stringify(item));
  check('列表项透传 originalKey', item?.originalKey === KEY, JSON.stringify(item));

  // 4) 后台列表透传
  const alist = await api('GET', '/admin/songs', T.admin);
  const aitem = (alist.data?.items || []).find((i) => i.id === sid);
  check('后台列表透传 chords', aitem?.chords === CHORDS, JSON.stringify(aitem));
  check('后台列表透传 originalKey', aitem?.originalKey === KEY, JSON.stringify(aitem));

  // 还原，避免污染生产数据
  await api('PATCH', `/admin/songs/${sid}`, T.admin, { chords: '', originalKey: '' });

  // 5) 投稿接受 chords
  const members = await pick('member');
  const u = members[0];
  const Tu = tok(u);
  const fd = new FormData();
  const subTitle = 'E2E和弦谱投稿' + uid().slice(0, 8);
  fd.set('title', subTitle);
  fd.set('category', '赞美');
  fd.set('lyrics', 'test lyrics for e2e');
  fd.set('chords', '[C]test [G]chord');
  fd.set('originalKey', 'C');
  const sub = await fetch(BASE + '/api/v1/songs/submit', {
    method: 'POST', headers: { Authorization: `Bearer ${Tu}` }, body: fd,
  });
  check('投稿接受 chords 201', sub.status === 201, `status=${sub.status}`);
  const sj = await sub.json().catch(() => ({}));
  // 清理投稿产生的测试数据
  if (sj?.data?.id) {
    await conn.query('DELETE FROM songs WHERE id = ?', [sj.data.id]);
  } else {
    await conn.query('DELETE FROM songs WHERE title = ?', [subTitle]);
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.error('E2E 异常:', e);
  fail++;
} finally {
  await conn.end();
  process.exit(fail ? 1 : 0);
}
