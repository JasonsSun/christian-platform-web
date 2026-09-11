// CDP mobile verification for 3 issues
const http = require('http');
const WebSocket = require('ws');

const CDP_PORT = 9333;
const TARGET_URL = process.argv[2] || 'http://localhost:3000/community';

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

let msgId = 0;
const pending = new Map();
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const targets = await getJson('/json');
  let target = targets.find((t) => t.type === 'page');
  if (!target) { console.log(JSON.stringify({ error: 'no page target' })); return; }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  });
  await new Promise((r) => ws.on('open', r));

  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 375, height: 667, deviceScaleFactor: 2, mobile: true,
  });
  await send(ws, 'Page.navigate', { url: TARGET_URL });
  await new Promise((r) => setTimeout(r, 3500));

  const evalRes = await send(ws, 'Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const winW = window.innerWidth;
      const docScrollW = document.documentElement.scrollWidth;
      const overflow = [];
      document.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > winW + 2) {
          const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 60) : el.tagName;
          overflow.push(el.tagName + '|' + cls + '|R' + Math.round(r.right) + '|W' + Math.round(r.width) + '|SW' + Math.round(el.scrollWidth));
        }
      });
      const playBtns = document.querySelectorAll('[title="在线试听"], [title="暂停"]').length;
      const cards = document.querySelectorAll('article').length;
      const playerBar = !!document.querySelector('[data-global-player]');
      const navItems = Array.from(document.querySelectorAll('nav a, nav button')).map((a) => (a.textContent || '').trim()).filter(Boolean);
      const hasDonate = navItems.some((t) => t.includes('捐赠'));
      const hasTuanqi = navItems.some((t) => t.includes('团契'));
      return { winW, docScrollW, overflowCount: overflow.length, overflowSample: overflow.slice(0, 8), playBtns, cards, playerBar, hasDonate, hasTuanqi, navItems: navItems.slice(0, 20), url: location.pathname };
    })()`,
  });

  console.log(JSON.stringify(evalRes.result.value, null, 2));
  ws.close();
}

main().catch((e) => { console.error(JSON.stringify({ fatal: e.message })); process.exit(1); });