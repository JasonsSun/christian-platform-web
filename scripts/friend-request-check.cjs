/**
 * 好友申请状态一致性验证
 * 覆盖:1) 已处理的申请不再计角标/不再返回可点击语义  2) 接受后状态立即变终态
 *      3) 重复接受返回明确冲突而非静默  4) pending 计数随处理动作下降
 */
const crypto = require('crypto');
const http = require('http');
const mysql = require('mysql2/promise');

const DB = { host: '127.0.0.1', port: 3306, user: 'root', password: '123456', database: 'christian_platform' };
const SECRET = 'christian-platform-local-dev-secret-please-change-in-production';
const ISSUER = 'christian-platform';
const B = (s) => Buffer.from(s).toString('base64url');

function signToken(user) {
  const head = B(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = B(JSON.stringify({ sub: user.id, role: user.role, typ: 'access', iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 900 }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

function req(method, path, token) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: 3000, path, method, headers: token ? { Authorization: `Bearer ${token}` } : {} }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch {} resolve({ status: res.statusCode, json: j, raw: d }); });
    });
    r.on('error', reject); r.end();
  });
}

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); } };

(async () => {
  const c = await mysql.createConnection(DB);
  const [users] = await c.query(`SELECT id, username, role FROM users`);
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));
  const admin = byName.admin, grace = byName.grace, david = byName.david, sarah = byName.sarah;

  console.log('\n===== A. 现存「已接受」申请不应再进角标、不应可点击 =====');
  {
    // admin 是 grace 那条 accepted 申请的接收方
    const asAdmin = await req('GET', '/api/v1/friends/requests?type=incoming', signToken(admin));
    const item = (asAdmin.json?.items || []).find((x) => x.status === 'accepted');
    check('admin 列表能取到该记录且 status=accepted', asAdmin.status === 200 && !!item, `http=${asAdmin.status}`);
    check('admin 角标计数(total/pendingTotal)为 0', asAdmin.json?.total === 0 && asAdmin.json?.pendingTotal === 0, JSON.stringify({ total: asAdmin.json?.total, pendingTotal: asAdmin.json?.pendingTotal }));
    check('admin handledTotal=1', asAdmin.json?.handledTotal === 1, String(asAdmin.json?.handledTotal));
    check('accepted 记录已排在 pending 之后(无可点击语义)', asAdmin.json?.items?.[0]?.status !== 'pending', asAdmin.json?.items?.[0]?.status);
  }

  console.log('\n===== B. 完整流程:pending -> accept -> 终态 =====');
  // 清理历史测试数据,保证从干净状态开始
  await c.query(`DELETE FROM friend_requests WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`, [david.id, sarah.id, sarah.id, david.id]);

  const tDavid = signToken(david), tSarah = signToken(sarah);

  const sendReal = await new Promise((resolve, reject) => {
    const payload = JSON.stringify({ addresseeId: sarah.id, message: '平安,一起读经吗?' });
    const r = http.request({ host: '127.0.0.1', port: 3000, path: '/api/v1/friends/request', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Authorization: `Bearer ${tDavid}` } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch {} resolve({ status: res.statusCode, json: j }); });
    });
    r.on('error', reject); r.write(payload); r.end();
  });
  check('发起申请成功', sendReal.status === 200, `http=${sendReal.status}`);

  const afterSend = await req('GET', '/api/v1/friends/requests?type=incoming', tSarah);
  const pendItem = (afterSend.json?.items || []).find((x) => x.status === 'pending');
  check('接收方看到 1 条 pending', afterSend.json?.pendingTotal === 1 && !!pendItem, JSON.stringify({ pendingTotal: afterSend.json?.pendingTotal }));
  check('pending 记录排在列表最前', afterSend.json?.items?.[0]?.status === 'pending');

  const accept = await req('POST', `/api/v1/friends/requests/${pendItem.id}/accept`, tSarah);
  check('接受申请成功', accept.status === 200 && accept.json?.status === 'accepted', `http=${accept.status}`);

  const afterAccept = await req('GET', '/api/v1/friends/requests?type=incoming', tSarah);
  const accItem = (afterAccept.json?.items || []).find((x) => x.id === pendItem.id);
  check('接受后 pendingTotal 归零', afterAccept.json?.pendingTotal === 0, String(afterAccept.json?.pendingTotal));
  check('接受后该条 status=accepted(前端据此渲染禁用标签)', accItem?.status === 'accepted', String(accItem?.status));
  check('接受后 handledTotal=1', afterAccept.json?.handledTotal === 1, String(afterAccept.json?.handledTotal));

  const acceptAgain = await req('POST', `/api/v1/friends/requests/${pendItem.id}/accept`, tSarah);
  check('重复接受返回明确冲突(非静默)', acceptAgain.status === 409 && /已被处理/.test(acceptAgain.raw), `http=${acceptAgain.status}`);

  console.log('\n===== C. status=pending 过滤 =====');
  {
    const onlyPend = await req('GET', '/api/v1/friends/requests?type=incoming&status=pending', tSarah);
    check('status=pending 时已处理记录不返回', (onlyPend.json?.items || []).every((x) => x.status === 'pending'), JSON.stringify(onlyPend.json?.items?.map((x) => x.status)));
  }

  // 清理测试数据
  await c.query(`DELETE FROM friend_requests WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`, [david.id, sarah.id, sarah.id, david.id]);
  await c.query(`DELETE FROM notifications WHERE user_id=? AND type IN ('friend_request','friend_accepted')`, [sarah.id]);
  const [left] = await c.query(`SELECT COUNT(*) AS c FROM friend_requests`);
  console.log(`\n测试数据已清理,friend_requests 剩余 ${left[0].c} 条(应为 1,即原 grace->admin 那条)`);

  await c.end();
  console.log(`\n===== 结果:${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
