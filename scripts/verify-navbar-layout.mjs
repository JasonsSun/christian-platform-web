// 顶栏布局回归：多视口下断言「无中文竖排换行 / 无横向溢出 / 断点正确 / 偏好弹层与汉堡菜单内容完整」。
// 运行: BASE=http://127.0.0.1:3988 node scripts/verify-navbar-layout.mjs
//
// 判据说明：中文被压到 min-content 时会「一字一行」。用 Range.getClientRects() 数
// 文本实际占据的行数（按 top 去重）比量高度可靠 —— 高度还含 padding。
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3988';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// 每次用独立 profile：dev 下 chunk 路径稳定，复用 profile 会命中 HTTP 缓存 → 跑到旧模块，
// 症状是「改了代码页面没变、hydration 报 Extra attributes from the server」。
const UDD = 'F:/sjjob/_shots/chrome-navverify-' + Date.now();
const DPORT = 9600 + (Date.now() % 300);
const OUT = 'F:/sjjob/_shots';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url) => (await fetch(url)).text();

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name} ${extra}`); }
};

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});
const [[owner]] = await conn.query(
  "SELECT id, role FROM users WHERE status='active' AND role='admin' ORDER BY created_at LIMIT 1"
);
await conn.end();
const TOKEN = signJwt(
  { sub: owner.id, role: owner.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 3600 },
  env.JWT_SECRET
);

fs.mkdirSync(UDD, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DPORT}`, `--user-data-dir=${UDD}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--no-proxy-server', '--proxy-bypass-list=*',
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = {};
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && this.pending[m.id]) { this.pending[m.id](m); delete this.pending[m.id]; } };
  }
  send(method, params = {}) {
    return new Promise((res) => { const id = ++this.id; this.pending[id] = res; this.ws.send(JSON.stringify({ id, method, params })); });
  }
}

let ver = null;
for (let i = 0; i < 40 && !ver; i++) {
  try { ver = JSON.parse(await get(`http://127.0.0.1:${DPORT}/json/version`)); } catch { await sleep(300); }
}
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
// 在每个新文档的页面脚本之前注入 JWT：比「导航后 setItem」可靠（后者有时会晚于首屏鉴权请求）
await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('platform_access_token', ${JSON.stringify(TOKEN)}); } catch (e) {}`,
});

const evaluate = async (expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};
const shot = async (out) => {
  const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(s.result.data, 'base64'));
};
const setW = (w) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
/**
 * guardOn=false 时带 `?__guard=off`：
 * 无头下 Emulation 伪造的 innerWidth 会让 Guards 的「开发者工具已打开」启发式误判
 * （outerWidth-innerWidth>200），整页被盾牌遮罩盖住 → 截图全废。
 * `__guard=off` 是本站给自动化预留的官方开关；测守卫本身的用例再传 true 打开它。
 */
const goto = async (p, guardOn = false) => {
  const url = guardOn ? `${BASE}${p}` : `${BASE}${p}${p.includes('?') ? '&' : '?'}__guard=off`;
  await cdp.send('Page.navigate', { url });
  // dev 首次编译较慢 —— 轮询等 nav 出现，别用固定 sleep
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    const has = await evaluate(`!!document.querySelector('nav')`);
    if (has) { await sleep(400); return; }
  }
  throw new Error(`nav 未出现: ${p}`);
};

/** dev 下水合晚于 DOM，点击需幂等重试：点一次 → 等条件成立 → 未成立再点 */
const clickUntil = async (clickExpr, waitExpr, tries = 6) => {
  for (let i = 0; i < tries; i++) {
    await evaluate(clickExpr);
    for (let j = 0; j < 8; j++) {
      await sleep(250);
      if (await evaluate(waitExpr)) return true;
    }
  }
  return false;
};

await goto('/');
await evaluate(`localStorage.setItem('platform_access_token', ${JSON.stringify(TOKEN)})`);
const whoami = await evaluate(`(async () => {
  const r = await fetch('/api/v1/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('platform_access_token') } });
  return r.status;
})()`);
console.log(`引导：/api/v1/me => ${whoami}（200 表示 JWT 有效，后续断言按已登录用户跑）`);

/** 行数按 Range 的 top 去重；> 1 视为发生了换行 */
const WRAP_PROBE = `(() => {
  const nav = document.querySelector('nav');
  if (!nav) return { err: 'no nav' };
  const vis = (el) => { const r = el.getBoundingClientRect(); return el.offsetParent !== null && r.width > 0 && r.height > 0; };
  const lines = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter(x => x.width > 0 && x.height > 0);
    return new Set(rects.map(x => Math.round(x.top))).size || 1;
  };
  const items = [...nav.querySelectorAll('a, span, button')].filter(vis);
  const wrapped = [];
  for (const el of items) {
    if (el.children.length > 0) continue;          // 只看纯文本叶子节点
    const txt = (el.textContent || '').trim();
    if (txt.length < 2) continue;
    const n = lines(el);
    if (n > 1) wrapped.push(txt.slice(0, 8) + '×' + n);
  }
  const deskRow = nav.querySelector('.no-scrollbar');
  const deskVisible = !!deskRow && vis(deskRow);
  const burger = [...nav.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === 'Toggle menu');
  return {
    vw: window.innerWidth,
    wrapped,
    deskVisible,
    deskScroll: deskRow ? { sw: deskRow.scrollWidth, cw: deskRow.clientWidth } : null,
    burgerVisible: !!burger && vis(burger),
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    navH: Math.round(nav.getBoundingClientRect().height),
  };
})()`;

console.log('\n[A] 多视口顶栏布局');
for (const w of [1920, 1837, 1536, 1440, 1280, 1279, 1100, 900, 768, 480, 375]) {
  await setW(w);
  await goto('/me');
  const r = await evaluate(WRAP_PROBE);
  if (r.err) { check(`vw=${w} 顶栏存在`, false, r.err); continue; }
  const okNoWrap = r.wrapped.length === 0;
  check(`vw=${w} 无文字竖排换行`, okNoWrap, JSON.stringify(r.wrapped));
  check(`vw=${w} 无横向溢出`, r.docOverflow <= 1, `overflow=${r.docOverflow}`);
  if (w >= 1280) {
    check(`vw=${w} 桌面导航可见`, r.deskVisible);
    check(`vw=${w} 桌面导航未溢出`, !!r.deskScroll && r.deskScroll.sw <= r.deskScroll.cw + 1, JSON.stringify(r.deskScroll));
    check(`vw=${w} 汉堡按钮隐藏`, !r.burgerVisible);
  } else {
    check(`vw=${w} 汉堡按钮可见`, r.burgerVisible);
    check(`vw=${w} 桌面导航隐藏`, !r.deskVisible);
  }
  await shot(`${OUT}/nav-verify-${w}.png`);
}

console.log('\n[B] 偏好弹层（桌面）');
await setW(1440);
await goto('/me');
// dev 下水合可能晚于 DOM，点击要幂等重试：先点，再等出现，未出现则再点
const openPref = async () => {
  for (let i = 0; i < 6; i++) {
    await evaluate(`(() => { const b = document.querySelector('nav button[aria-label="显示与偏好"]'); if (b) b.click(); return !!b; })()`);
    for (let j = 0; j < 8; j++) {
      await sleep(250);
      const has = await evaluate(`!!document.querySelector('[role="dialog"][aria-label="显示与偏好设置"]')`);
      if (has) return true;
    }
  }
  return false;
};
const prefOpened = await openPref();
check('弹层打开', prefOpened);
const panel = prefOpened ? await evaluate(`(() => {
  const d = document.querySelector('[role="dialog"][aria-label="显示与偏好设置"]');
  const r = d.getBoundingClientRect();
  return { text: d.innerText.replace(/\\n+/g, '|'), w: Math.round(r.width), inView: r.right <= window.innerWidth && r.left >= 0 };
})()`) : null;
check('含语言/字形/主题/字号/高对比/动效', !!panel && ['语言','字形','主题','字号','高对比','动效'].every((k) => panel.text.includes(k)), panel ? panel.text : '');
check('弹层未超出视口右侧', !!panel && panel.inView, panel ? `w=${panel.w}` : '');
await shot(`${OUT}/nav-verify-pref-panel.png`);

console.log('\n[C] 偏好弹层生效（切繁体 + 切深色 + 字号大）');
const applied = await evaluate(`(async () => {
  const d = document.querySelector('[role="dialog"][aria-label="显示与偏好设置"]');
  if (!d) return { err: 'panel-closed' };
  const btns = [...d.querySelectorAll('button')];
  const hit = (label) => { const b = btns.find(x => x.textContent.trim() === label); if (b) b.click(); return !!b; };
  const r = { t: hit('繁體'), dark: hit('深色'), lg: hit('大') };
  await new Promise(res => setTimeout(res, 500));
  return { ...r, theme: document.documentElement.getAttribute('data-theme'), font: document.documentElement.getAttribute('data-a11y-font') };
})()`);
check('繁体/深色/大字三项按钮都在', !!applied && applied.t && applied.dark && applied.lg, JSON.stringify(applied));
check('主题切换生效', applied?.theme === 'dark', JSON.stringify(applied));
check('字号切换生效', applied?.font === 'lg', JSON.stringify(applied));
const wrappedAfter = await evaluate(WRAP_PROBE);
check('放大字号后仍无竖排换行', (wrappedAfter.wrapped || []).length === 0, JSON.stringify(wrappedAfter.wrapped));
check('放大字号后仍无横向溢出', wrappedAfter.docOverflow <= 1, `overflow=${wrappedAfter.docOverflow}`);
await shot(`${OUT}/nav-verify-font-lg-dark.png`);
// 还原：主题 / 字号 / 简繁（简繁存 localStorage + cookie，必须一起复位，否则后续断言拿到繁体文案）
await evaluate(`(() => {
  localStorage.setItem('a11y_font','normal');
  localStorage.setItem('theme','light');
  localStorage.setItem('platform_locale','zh');
  localStorage.setItem('platform_variant','s');
  document.cookie = 'platform_locale=zh;path=/;max-age=31536000;samesite=lax';
  document.cookie = 'platform_variant=s;path=/;max-age=31536000;samesite=lax';
  return true;
})()`);

console.log('\n[D] 汉堡菜单（平板/窄屏）');
await setW(1100);
await goto('/me');
const burgerOpened = await clickUntil(
  `(() => { const b = [...document.querySelectorAll('nav button')].find(x => (x.getAttribute('aria-label')||'')==='Toggle menu'); if (b) b.click(); return !!b; })()`,
  `(() => { const p = document.querySelector('nav [data-nav-mobile-menu]'); return !!p && p.innerText.includes('显示与偏好'); })()`
);
check('汉堡菜单可展开', burgerOpened);
const burgerText = await evaluate(`(() => {
  const panel = document.querySelector('nav [data-nav-mobile-menu]');
  if (!panel) return null;
  return panel.innerText.replace(/\\n+/g, '|');
})()`);
const burgerDiag = await evaluate(`(() => {
  const navs = [...document.querySelectorAll('nav')];
  return { navCount: navs.length, panelCounts: navs.map((n) => n.querySelectorAll('[data-nav-mobile-menu]').length) };
})()`);
const need = ['首页','圣经','读经计划','诗歌','讲道','媒体','直播','活动','社区','代祷','团契','捐赠','显示与偏好','语言','主题','字号','个人中心','管理后台','退出登录'];
check('汉堡菜单含全部导航项与偏好项', !!burgerText && need.every((k) => burgerText.includes(k)),
  '缺少: ' + need.filter((k) => !(burgerText || '').includes(k)).join(',') + ' | text=' + JSON.stringify(String(burgerText).slice(0, 80)) + ' | diag=' + JSON.stringify(burgerDiag));
await shot(`${OUT}/nav-verify-burger-1100.png`);

console.log('\n[E] 移动端（375）');
await setW(375);
await goto('/me');
const mOpened = await clickUntil(
  `(() => { const b = [...document.querySelectorAll('nav button')].find(x => (x.getAttribute('aria-label')||'')==='Toggle menu'); if (b) b.click(); return !!b; })()`,
  `(() => { const p = document.querySelector('nav [data-nav-mobile-menu]'); return !!p && p.getBoundingClientRect().height > 200; })()`
);
check('375 汉堡菜单可展开', mOpened);
const m = await evaluate(`(() => {
  const nav = document.querySelector('nav');
  const panel = nav.querySelector('[data-nav-mobile-menu]');
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  return { text: panel.innerText.replace(/\\n+/g, '|').slice(0, 200), overflowRight: Math.round(r.right - window.innerWidth), docOverflow: document.documentElement.scrollWidth - window.innerWidth };
})()`);
check('375 菜单未溢出视口', !!m && m.overflowRight <= 1, m ? `right=${m.overflowRight}` : 'no panel');
check('375 页面无横向溢出', !!m && m.docOverflow <= 1, m ? `overflow=${m.docOverflow}` : 'no panel');
await shot(`${OUT}/nav-verify-375.png`);

console.log('\n[F] 全局守卫不误删本站浮层（Guards 回归，此处守卫开启）');
await setW(1440);
await goto('/me', true);
const prefOk = await openPref();
check('弹层可打开（守卫不秒删）', prefOk);
// 等过至少一次 1200ms 周期清扫 + MutationObserver(60ms)
await sleep(2200);
const survived = await evaluate(`(() => { const d = document.querySelector('[role="dialog"][aria-label="显示与偏好设置"]'); return !!d && d.isConnected && d.getBoundingClientRect().height > 50; })()`);
check('2.2s 后弹层仍在（未被当作广告移除）', survived);
// 守卫开着时无头会被误判「开发者工具已打开」而盖盾牌遮罩，截图前先摘掉（DOM 断言不受影响）
await evaluate(`document.querySelector('[data-guard="devtools"]')?.remove()`);
await shot(`${OUT}/nav-verify-guard-keep.png`);

// 反向断言：守卫必须仍然能清掉外部注入的弹窗，别把守卫改废了
const purged = await evaluate(`(async () => {
  const ad = document.createElement('div');
  ad.setAttribute('role', 'dialog');
  ad.setAttribute('aria-modal', 'true');
  ad.style.cssText = 'position:fixed;inset:0;z-index:99999';
  ad.textContent = 'FAKE AD';
  document.body.appendChild(ad);
  await new Promise((r) => setTimeout(r, 500));
  return !document.body.contains(ad);
})()`);
check('外部注入的 role=dialog 仍被清除', purged === true, String(purged));

console.log('\n[G] 无障碍面板（Guards 回归，守卫开启）');
await setW(375);
await goto('/me', true);
const a11yOk = await clickUntil(
  `(() => { const b = document.querySelector('button[aria-label="无障碍设置"]'); if (b) b.click(); return !!b; })()`,
  `!!document.querySelector('[aria-label="无障碍设置面板"]')`
);
check('无障碍面板可打开', a11yOk);
await sleep(2200);
check('2.2s 后无障碍面板仍在', (await evaluate(`!!document.querySelector('[aria-label="无障碍设置面板"]')`)) === true);
await evaluate(`document.querySelector('[data-guard="devtools"]')?.remove()`);
await shot(`${OUT}/nav-verify-guard-a11y.png`);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
try { chrome.kill('SIGKILL'); } catch { /* ignore */ }
process.exit(fail ? 1 : 0);
