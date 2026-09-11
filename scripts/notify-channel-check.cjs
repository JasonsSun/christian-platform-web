/**
 * 通知通道(P0 偏好层 + 外发队列 + P1 微信绑定)端到端验证
 * 覆盖:
 *   1) 偏好读写与默认值
 *   2) 外发队列按偏好扇出 / 免打扰顺延 / 通道未配置时 skipped
 *   3) 微信绑定令牌 + 带参二维码 + 回调绑定 + 状态掩码
 *   4) 越权绑定(用别人的 scene)必须失败
 *   5) 解绑
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

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { Authorization: `Bearer ${token}` };
    if (payload) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const r = http.request(
      { host: '127.0.0.1', port: 3000, path, method, headers },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          let j = null;
          try { j = JSON.parse(d); } catch {}
          resolve({ status: res.statusCode, json: j, raw: d, location: res.headers.location || '' });
        });
      }
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}  ${detail}`); }
};

(async () => {
  const c = await mysql.createConnection(DB);
  const [users] = await c.query(`SELECT id, username, role FROM users`);
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));
  const admin = byName.admin;
  const other = byName.grace || byName.david || users.find((u) => u.id !== admin.id);
  const tAdmin = signToken(admin);
  const tOther = signToken(other);

  // 环境归零
  await c.query(`UPDATE users SET wechat_openid=NULL WHERE id IN (?,?)`, [admin.id, other.id]);
  await c.query(`DELETE FROM wechat_bind_tokens WHERE user_id IN (?,?)`, [admin.id, other.id]);
  await c.query(`DELETE FROM notify_jobs WHERE user_id IN (?,?)`, [admin.id, other.id]);
  await c.query(`DELETE FROM notification_prefs WHERE user_id IN (?,?)`, [admin.id, other.id]);

  console.log('\n===== A. 偏好默认值与写入 =====');
  const a1 = await req('GET', '/api/v1/me/notification-prefs', tAdmin);
  check('A1 读取偏好 200', a1.status === 200, `status=${a1.status}`);
  check('A2 默认仅开站内', a1.json?.prefs?.inapp === true && a1.json?.prefs?.email === false && a1.json?.prefs?.wechat === false,
    JSON.stringify(a1.json?.prefs));

  const a2 = await req('PUT', '/api/v1/me/notification-prefs', tAdmin, {
    prefs: { inapp: true, email: true, wechat: true, quietEnabled: true, quietFrom: '00:00', quietTo: '23:59', digest: 'realtime' },
  });
  check('A3 写入偏好 200', a2.status === 200, `status=${a2.status}`);
  const a3 = await req('GET', '/api/v1/me/notification-prefs', tAdmin);
  check('A4 偏好已持久化', a3.json?.prefs?.email === true && a3.json?.prefs?.wechat === true && a3.json?.prefs?.quietEnabled === true,
    JSON.stringify(a3.json?.prefs));
  check('A5 免打扰判定生效(00:00-23:59)', a3.json?.inQuietHoursNow === true, String(a3.json?.inQuietHoursNow));

  console.log('\n===== B. 外发队列:免打扰顺延 / 未配置通道 skipped =====');
  await c.query(
    `INSERT INTO notify_jobs (id,user_id,channel,kind,title,body,link,to_addr,status,reason,attempts,created_at)
     VALUES (?,?, 'email','content_approved','投稿已通过','《测试》已发布','/contents/x',?,'pending','',0,NOW())`,
    [`njb_check_${Date.now()}`, admin.id, admin.email || 'admin@shengyue.com']
  );
  const b1 = await req('POST', '/api/v1/admin/notify?limit=50', tAdmin);
  check('B1 队列冲刷 200', b1.status === 200, `status=${b1.status}`);
  check('B2 免打扰期间作业被顺延', Number(b1.json?.deferred || 0) >= 1, JSON.stringify(b1.json));

  await req('PUT', '/api/v1/me/notification-prefs', tAdmin, { prefs: { quietEnabled: false } });
  const b2 = await req('POST', '/api/v1/admin/notify?limit=50', tAdmin);
  check('B3 关闭免打扰后被消费', Number(b2.json?.sent || 0) + Number(b2.json?.skipped || 0) >= 1, JSON.stringify(b2.json));
  const [jobs] = await c.query(`SELECT status, reason FROM notify_jobs WHERE user_id=?`, [admin.id]);
  const doneJob = jobs.find((j) => j.status !== 'pending');
  check('B4 未配置 SMTP 时标记 skipped 并写明原因',
    !!doneJob && (doneJob.status === 'skipped' ? doneJob.reason === 'smtp_not_configured' : doneJob.status === 'sent'),
    JSON.stringify(jobs));

  console.log('\n===== C. 微信绑定:令牌 + 二维码 + 回调 =====');
  const c1 = await req('POST', '/api/v1/me/wechat/bind-token', tAdmin, {});
  check('C1 生成绑定令牌 200', c1.status === 200, `status=${c1.status}`);
  check('C2 返回二维码 SVG', /<svg[\s\S]*<\/svg>/.test(c1.json?.qrSvg || ''), (c1.json?.qrSvg || '').slice(0, 40));
  check('C3 二维码内容携带一次性 scene',
    (c1.json?.qrContent || '').includes(c1.json?.scene || '@@'), c1.json?.qrContent);

  const c2 = await req('GET', '/api/v1/me/wechat/bind', tAdmin);
  check('C4 绑定前状态为未绑定且有待处理令牌', c2.json?.bound === false && !!c2.json?.pending, JSON.stringify(c2.json));

  const c3 = await req('GET', `/api/v1/wechat/callback?demo=1&scene=${c1.json.scene}`, tAdmin);
  check('C5 回调完成绑定并跳转', c3.status === 307 && (c3.location || '').includes('wechat=bound'),
    `status=${c3.status} loc=${c3.location}`);

  const c4 = await req('GET', '/api/v1/me/wechat/bind', tAdmin);
  check('C6 绑定后状态为已绑定', c4.json?.bound === true, JSON.stringify(c4.json));
  check('C7 openid 仅回传掩码', /^.{3}\*\*\*.{3}$/.test(c4.json?.openidMasked || ''), c4.json?.openidMasked);
  const [urow] = await c.query(`SELECT wechat_openid FROM users WHERE id=?`, [admin.id]);
  check('C8 数据库已写入 openid', !!urow[0]?.wechat_openid, JSON.stringify(urow[0]));

  console.log('\n===== D. 越权与冲突防护 =====');
  const d1 = await req('POST', '/api/v1/me/wechat/bind-token', tOther, {});
  const d2 = await req('GET', `/api/v1/wechat/callback?demo=1&scene=${d1.json.scene}`, tAdmin);
  check('D1 用他人 scene 绑定被拒绝', (d2.location || '').includes('wechat=error'), `loc=${d2.location}`);
  const [otherRow] = await c.query(`SELECT wechat_openid FROM users WHERE id=?`, [other.id]);
  check('D2 他人账号未被误绑', !otherRow[0]?.wechat_openid, JSON.stringify(otherRow[0]));

  console.log('\n===== E. 解绑 =====');
  const e1 = await req('DELETE', '/api/v1/me/wechat/bind', tAdmin);
  check('E1 解绑 200', e1.status === 200, `status=${e1.status}`);
  const e2 = await req('GET', '/api/v1/me/wechat/bind', tAdmin);
  check('E2 状态回到未绑定', e2.json?.bound === false, JSON.stringify(e2.json));

  console.log('\n===== F. 队列健康度接口 =====');
  const f1 = await req('GET', '/api/v1/admin/notify?limit=5', tAdmin);
  check('F1 管理员可查队列', f1.status === 200 && typeof f1.json?.pending === 'number', `status=${f1.status}`);
  const f2 = await req('GET', '/api/v1/admin/notify?limit=5', tOther);
  check('F2 普通用户不可访问', f2.status === 403, `status=${f2.status}`);

  await c.end();
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('脚本异常:', e); process.exit(1); });
