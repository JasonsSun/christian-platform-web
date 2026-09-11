/**
 * 好友关系一致性补充验证
 *  1) 「发现」页 friendStatus:存在 accepted 时必须是 friends,不能被反向 pending 记录盖掉
 *  2) 已互为好友时再发申请 -> 明确拦截
 *  3) 对方已有待处理申请时再发 -> 引导去处理,不产生双向脏记录
 */
const crypto = require('crypto');
const http = require('http');
const mysql = require('mysql2/promise');

const DB = { host: '127.0.0.1', port: 3306, user: 'root', password: '123456', database: 'christian_platform' };
const SECRET = 'christian-platform-local-dev-secret-please-change-in-production';
const ISSUER = 'christian-platform';
const B = (s) => Buffer.from(s).toString('base64url');
const signToken = (u) => {
  const head = B(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = B(JSON.stringify({ sub: u.id, role: u.role, typ: 'access', iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 900 }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};
const httpReq = (method, path, body, token) => new Promise((res, rej) => {
  const payload = body ? JSON.stringify(body) : null;
  const r = http.request({ host: '127.0.0.1', port: 3000, path, method, headers: { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (rr) => {
    let d = ''; rr.on('data', (c) => (d += c)); rr.on('end', () => { let j = null; try { j = JSON.parse(d); } catch {} res({ status: rr.statusCode, json: j, raw: d }); });
  });
  r.on('error', rej); if (payload) r.write(payload); r.end();
});

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

(async () => {
  const c = await mysql.createConnection(DB);
  const [users] = await c.query(`SELECT id, username, role FROM users`);
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));
  const grace = byName.grace, admin = byName.admin, david = byName.david, sarah = byName.sarah, mary = byName.mary;

  const clean = async () => c.query(
    `DELETE FROM friend_requests WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`,
    [david.id, sarah.id, sarah.id, david.id, david.id, mary.id, mary.id, david.id]
  );

  console.log('\n===== D. friendStatus:accepted 优先于反向 pending =====');
  {
    await clean();
    // 模拟:第一版遗留的双向脏数据 —— david->sarah 已 accepted,同时存在 sarah->david pending
    await c.query(`INSERT INTO friend_requests (id,requester_id,addressee_id,message,status,created_at,updated_at) VALUES ('fr_t_acc',?,?,'','accepted',NOW(),NOW())`, [david.id, sarah.id]);
    await c.query(`INSERT INTO friend_requests (id,requester_id,addressee_id,message,status,created_at,updated_at) VALUES ('fr_t_pend',?,?,'','pending',DATE_ADD(NOW(), INTERVAL 1 MINUTE),NOW())`, [sarah.id, david.id]);

    const r = await httpReq('GET', `/api/v1/users?q=sarah&pageSize=10`, null, signToken(david));
    const card = (r.json?.items || []).find((x) => x.id === sarah.id);
    check('david 视角:sarah 的 friendStatus = friends', card?.friendStatus === 'friends', String(card?.friendStatus));

    const r2 = await httpReq('GET', `/api/v1/users?q=david&pageSize=10`, null, signToken(sarah));
    const card2 = (r2.json?.items || []).find((x) => x.id === david.id);
    check('sarah 视角:david 的 friendStatus = friends', card2?.friendStatus === 'friends', String(card2?.friendStatus));
  }

  console.log('\n===== E. 已是好友时再发申请 -> 拦截 =====');
  {
    const p = await httpReq('POST', '/api/v1/friends/request', { addresseeId: david.id }, signToken(sarah));
    check('sarah->david(已是好友) 被拦截', p.status === 409 && /已经是好友/.test(p.raw), `http=${p.status} ${p.raw}`);
    const [cnt] = await c.query(`SELECT COUNT(*) AS c FROM friend_requests WHERE requester_id=? AND addressee_id=?`, [sarah.id, david.id]);
    check('未新增反向脏记录', Number(cnt[0].c) === 1, `count=${cnt[0].c}`);
  }

  console.log('\n===== F. 对方已有待处理申请 -> 引导处理 =====');
  {
    await clean();
    const p1 = await httpReq('POST', '/api/v1/friends/request', { addresseeId: david.id }, signToken(mary));
    check('mary->david 发起成功', p1.status === 200, `http=${p1.status}`);
    const p2 = await httpReq('POST', '/api/v1/friends/request', { addresseeId: mary.id }, signToken(david));
    check('david->mary(对方已申请) 被拦截并引导处理', p2.status === 409 && /好友申请/.test(p2.raw), `http=${p2.status} ${p2.raw}`);
    const [cnt] = await c.query(`SELECT COUNT(*) AS c FROM friend_requests WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`, [mary.id, david.id, david.id, mary.id]);
    check('未产生双向重复记录(仅 1 条)', Number(cnt[0].c) === 1, `count=${cnt[0].c}`);
  }

  await clean();
  const [left] = await c.query(`SELECT COUNT(*) AS c FROM friend_requests`);
  console.log(`\n测试数据已清理,friend_requests 剩余 ${left[0].c} 条(应为 1)`);
  await c.end();
  console.log(`\n===== 结果:${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
