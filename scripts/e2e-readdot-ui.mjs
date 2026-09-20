// 无头 Chrome 验证「红点读经 + 点击只点亮不朗读」的真实渲染行为
// 运行: node scripts/e2e-readdot-ui.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3127';
const DPORT = Number(process.env.DPORT || 9341);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UDD = 'F:/sjjob/_shots/chrome-readdot';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url) => new Promise((res, rej) => {
  http.get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d)); }).on('error', rej);
});

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name} ${extra}`); }
};

// 站点登录带图形验证码，无法用 API 直接登录 → 用同一个 SECRET 直签 access token
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

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});
const [[peer]] = await conn.query("SELECT id, role FROM users WHERE status='active' ORDER BY created_at LIMIT 1");
const UID = peer.id;
const token = signJwt(
  { sub: UID, role: peer.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 900 },
  env.JWT_SECRET
);
console.log(`直签 token: ok (user=${UID})`);

fs.mkdirSync(UDD, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DPORT}`, `--user-data-dir=${UDD}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=420,900',
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = {};
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && this.pending[m.id]) { this.pending[m.id](m); delete this.pending[m.id]; } };
  }
  send(method, params = {}) { return new Promise((res) => { const id = ++this.id; this.pending[id] = res; this.ws.send(JSON.stringify({ id, method, params })); }); }
}

let code = 0;
try {
  // 等 DevTools 就绪
  let ver = null;
  for (let i = 0; i < 40 && !ver; i++) {
    try { ver = JSON.parse(await get(`http://127.0.0.1:${DPORT}/json/version`)); } catch { await sleep(300); }
  }
  if (!ver) throw new Error('Chrome DevTools 未就绪');

  const bws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => (bws.onopen = r));
  const bcdp = new CDP(bws);
  const { result } = await bcdp.send('Target.createTarget', { url: 'about:blank' });
  const list = JSON.parse(await get(`http://127.0.0.1:${DPORT}/json/list`));
  const tgt = list.find((t) => t.id === result.targetId);
  const pws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise((r) => (pws.onopen = r));
  const cdp = new CDP(pws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  const evaluate = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    return r.result?.result?.value;
  };

  // 页面上的写库/回填都是异步的（驻留计时、防抖 flush、read-state 往返），
  // 固定 sleep 要么抢跑要么把偶发的慢网络误判成缺陷 → 一律轮询到有界超时。
  const waitFor = async (expr, timeoutMs = 12000, stepMs = 400) => {
    const t0 = Date.now();
    for (;;) {
      const v = await evaluate(expr);
      if (v || Date.now() - t0 > timeoutMs) return !!v;
      await sleep(stepMs);
    }
  };
  const waitRow = async (sql, params, ok = (r) => !!r, timeoutMs = 8000) => {
    const t0 = Date.now();
    for (;;) {
      const [[r]] = await conn.query(sql, params);
      if (ok(r) || Date.now() - t0 > timeoutMs) return r;
      await sleep(400);
    }
  };
  const countLit = () => evaluate(`document.querySelectorAll('.read-dot:not(.is-read)').length`);

  // 先报名 john-21，确保「读完自动打卡」这条链路可验证
  const enrollRes = await fetch(BASE + '/api/v1/plans/john-21/enroll', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  console.log('报名 john-21:', enrollRes.status);

  // 归零：本脚本必须从干净状态起步。上一轮留下的 localStorage / 库里残留会让浏览器
  // 认为本章早读完了，于是不再触发「读完本章」写库，历史与打卡两项会假失败。
  await conn.query('DELETE FROM bible_verse_read WHERE user_id=? AND book_id=? AND chapter IN (3,4)', [UID, 'john']);
  await conn.query('DELETE FROM bible_reading_history WHERE user_id=? AND book_id=? AND chapter IN (3,4)', [UID, 'john']);
  await conn.query('DELETE FROM reading_plan_progress WHERE user_id=? AND plan_id=? AND day=3', [UID, 'john-21']);

  // 先落地 token，再进读经页
  await cdp.send('Page.navigate', { url: BASE + '/' });
  await sleep(1200);
  await evaluate(`(() => {
    Object.keys(localStorage).filter((k) => k.startsWith('bible:readVerses:')).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('platform_access_token', ${JSON.stringify(token)});
    localStorage.setItem('platform_refresh_token', ${JSON.stringify(token)});
    return 1;
  })()`);
  await cdp.send('Page.navigate', { url: BASE + '/bible/cuv/john/3' });
  await sleep(2500);

  // 等经文渲染
  let verseCount = 0;
  for (let i = 0; i < 30; i++) {
    verseCount = await evaluate(`document.querySelectorAll('[data-verse]').length`);
    if (verseCount > 0) break;
    await sleep(500);
  }
  console.log(`\n经文节数: ${verseCount}`);
  check('经文已渲染（data-verse）', verseCount > 0, `count=${verseCount}`);

  const dotCount = await evaluate(`document.querySelectorAll('.read-dot').length`);
  check('每节末尾都渲染了红点', dotCount === verseCount, `dots=${dotCount} verses=${verseCount}`);

  const readAtStart = await evaluate(`document.querySelectorAll('.read-dot.is-read').length`);
  console.log(`初始已读红点: ${readAtStart}`);
  check('起始状态已归零（无历史蓝点）', readAtStart === 0, `read=${readAtStart}`);

  // 点击第 2 节：应只点亮（选中高亮），且不触发朗读
  await evaluate(`(() => { const p=document.getElementById('v2'); if(p) p.click(); return 1; })()`);
  await sleep(600);
  const selected = await evaluate(`(() => {
    const p=document.getElementById('v2'); if(!p) return 'nop';
    return p.className.includes('border-primary-400') || p.className.includes('bg-primary-50') ? 'yes' : 'no';
  })()`);
  check('点击经文 → 本节被点亮（选中样式）', selected === 'yes', `cls=${selected}`);
  const speaking = await evaluate(`!!(window.speechSynthesis && window.speechSynthesis.speaking)`);
  check('点击经文 → 未触发朗读', speaking === false, `speaking=${speaking}`);

  // 完成提示只活 3.2s，必须一边滚一边抓拍，等滚完再读 innerText 早就没了
  let sawComplete = false;
  const hasCompleteToast = async () => {
    if (sawComplete) return true;
    sawComplete = /读完本章/.test((await evaluate(`document.body.innerText || ''`)) || '');
    return sawComplete;
  };

  // 拟真阅读节奏：每屏停留 3.6s（> 3s 驻留阈值），让每节都能经过「阅读带」并计时完成
  const vh = await evaluate('window.innerHeight');
  const total = await evaluate('document.body.scrollHeight');
  let y = 0;
  while (y < total) {
    await evaluate(`window.scrollTo(0, ${y}); 1`);
    await sleep(3600);
    await hasCompleteToast();
    y += Math.floor(vh * 0.8);
  }
  await evaluate(`window.scrollTo(0, document.body.scrollHeight); 1`);
  await sleep(3600);
  // 最后一节的驻留计时可能在这次 sleep 之后才走完：等蓝点全灭，别用固定值抢跑
  const allDim = await waitFor(`document.querySelectorAll('.read-dot:not(.is-read)').length === 0`, 12000);
  await hasCompleteToast();

  const litAfter = await countLit();
  const readAfter = verseCount - litAfter;
  console.log(`滚动阅读后已读红点: ${readAfter} / ${verseCount}`);
  check('滚动阅读后红点淡出（>0）', readAfter > 0, `read=${readAfter}`);
  check('按阅读节奏滚完 → 全部红点淡出', allDim && litAfter === 0, `lit=${litAfter}/${verseCount}`);
  check('读完本章出现完成提示', sawComplete);

  // 落库校验：应写入 john:3 的历史 + john-21 第3天打卡
  const hist = await waitRow(
    'SELECT COUNT(*) AS c FROM bible_reading_history WHERE user_id=? AND book_id=? AND chapter=?', [UID, 'john', 3],
    (r) => Number(r?.c) > 0
  );
  check('已读记录写入 bible_reading_history', Number(hist?.c) > 0, `c=${hist?.c}`);
  const prog = await waitRow(
    'SELECT COUNT(*) AS c FROM reading_plan_progress WHERE user_id=? AND plan_id=? AND day=?', [UID, 'john-21', 3],
    (r) => Number(r?.c) > 0
  );
  check('自动打卡 john-21 第3天', Number(prog?.c) > 0, `c=${prog?.c}`);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('F:/sjjob/_shots/readdot-verify.png', Buffer.from(shot.result.data, 'base64'));
  console.log('截图: F:/sjjob/_shots/readdot-verify.png');

  // ---- 跨会话记忆：换浏览器（清掉本地缓存）重进本章，蓝点不该再亮 ----
  const vr = await waitRow(
    'SELECT verses FROM bible_verse_read WHERE user_id=? AND book_id=? AND chapter=?', [UID, 'john', 3],
    (r) => (r?.verses || '').split(',').filter(Boolean).length > 0
  );
  const stored3 = (vr?.verses || '').split(',').filter(Boolean).map(Number);
  check('逐节已读写入 bible_verse_read', stored3.length > 0, `verses=${vr?.verses || ''}`);
  check('整章读完后 bible_verse_read 覆盖全部节号', stored3.length >= verseCount, `stored=${stored3.length}/${verseCount}`);

  await evaluate(`localStorage.removeItem('bible:readVerses:cuv:john:3');'ok'`);
  await cdp.send('Page.navigate', { url: BASE + '/bible/cuv/john/3' });
  await sleep(2500);
  // 回填要走 read-state 往返，等它落定；顺带跨过上一轮那条 3.2s 的完成提示
  const cleared = await waitFor(`document.querySelectorAll('.read-dot').length > 0 && document.querySelectorAll('.read-dot:not(.is-read)').length === 0`, 12000);
  await sleep(1500);
  const litAfterReenter = await countLit();
  const bodyAfterReenter = await evaluate(`document.body.innerText || ''`);
  check('重进本章后没有残留蓝点', cleared && litAfterReenter === 0, `lit=${litAfterReenter}`);
  check('重进本章不再重复弹「读完本章」', !/读完本章/.test(bodyAfterReenter), bodyAfterReenter.slice(0, 80));

  // ---- 只读半章：读过的该灭，没读到的该继续亮 ----
  await evaluate(`localStorage.removeItem('bible:readVerses:cuv:john:4');'ok'`);
  await conn.query('DELETE FROM bible_verse_read WHERE user_id=? AND book_id=? AND chapter=?', [UID, 'john', 4]);
  await cdp.send('Page.navigate', { url: BASE + '/bible/cuv/john/4' });
  await sleep(2800);
  const vh4 = await evaluate('window.innerHeight');
  for (let y = 0; y < vh4 * 1.6; y += Math.floor(vh4 * 0.5)) {
    await evaluate(`window.scrollTo(0, ${y}); 1`);
    await sleep(3600);
  }
  await sleep(1500); // 防抖 flush 的窗口
  const litFirst = await evaluate(`document.querySelectorAll('.read-dot:not(.is-read)').length`);
  const total4 = await evaluate(`document.querySelectorAll('.read-dot').length`);
  check('半章阅读后仍有未读蓝点', litFirst > 0 && litFirst < total4, `lit=${litFirst}/${total4}`);
  const vr4 = await waitRow(
    'SELECT verses FROM bible_verse_read WHERE user_id=? AND book_id=? AND chapter=?', [UID, 'john', 4],
    (r) => (r?.verses || '').split(',').filter(Boolean).length > 0
  );
  const saved4 = (vr4?.verses || '').split(',').filter(Boolean).map(Number);
  check('半章进度按节号存库', saved4.length > 0 && saved4.length < total4, `saved=${saved4.join(',')}/${total4}`);

  await evaluate(`localStorage.removeItem('bible:readVerses:cuv:john:4');'ok'`);
  await cdp.send('Page.navigate', { url: BASE + '/bible/cuv/john/4' });
  await sleep(2500);
  // 回填同样是异步的：只断言不变量——存过的节必须灭、没存过的仍有亮的节
  // （顶部阅读带里没读过的节可能在这几秒里刚好驻留完成，用精确等值会误报）
  const ok4 = await waitFor(`(() => {
    const stored = ${JSON.stringify(saved4)};
    const dots = [...document.querySelectorAll('[data-verse]')];
    if (!dots.length) return false;
    const dark = (n) => document.getElementById('v' + n)?.querySelector('.read-dot')?.classList.contains('is-read');
    return stored.every((n) => dark(n)) && dots.some((el) => !el.querySelector('.read-dot')?.classList.contains('is-read'));
  })()`, 12000);
  const litAfter4 = await countLit();
  check('重进半章后：读过的节不再亮，其余照旧', ok4, `lit=${litAfter4} 已存=${saved4.length} 总数=${total4}`);

  // 清理本次测试产生的数据
  await conn.query('DELETE FROM reading_plan_progress WHERE user_id=? AND plan_id=?', [UID, 'john-21']);
  await conn.query('DELETE FROM reading_plan_enrollment WHERE user_id=? AND plan_id=?', [UID, 'john-21']);
  await conn.query('DELETE FROM bible_reading_history WHERE user_id=? AND book_id=? AND chapter IN (3,4)', [UID, 'john']);
  await conn.query('DELETE FROM bible_verse_read WHERE user_id=? AND book_id=? AND chapter IN (3,4)', [UID, 'john']);
  console.log('测试数据已清理');
} catch (e) {
  console.log('ERR', e.message);
  code = 2;
} finally {
  chrome.kill();
  try { await conn.end(); } catch { /* ignore */ }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 || code ? 1 : 0);
