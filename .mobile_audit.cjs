// 手机端适配自动审计：375x667 视口逐页检测
const http = require('http');

const BROWSER = 'http://localhost:9333';
const BASE = 'http://localhost:3000';

const PAGES = JSON.parse(process.env.PAGES || '[]');

function getJson(p) {
  return new Promise((res, rej) => {
    http
      .get(BROWSER + p, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          try {
            res(JSON.parse(d));
          } catch (e) {
            rej(e);
          }
        });
      })
      .on('error', rej);
  });
}

function mkConn(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  ws.addEventListener('message', (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch (e) {
      return;
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
    }
  });
  const ready = new Promise((r) => ws.addEventListener('open', r));
  function send(method, params) {
    const myid = ++id;
    return new Promise((resolve, reject) => {
      pending.set(myid, { resolve, reject });
      ws.send(JSON.stringify({ id: myid, method, params: params || {} }));
    });
  }
  return { ws, ready, send };
}

const AUDIT_EXPR = `(() => {
  const vw = window.innerWidth;
  const de = document.documentElement;
  const clipped = (el) => {
    let n = el.parentElement;
    while (n && n !== de) {
      const s = getComputedStyle(n);
      if (s.overflowX !== 'visible') return true;
      n = n.parentElement;
    }
    return false;
  };
  const offenders = [];
  const all = document.querySelectorAll('*');
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      const s = getComputedStyle(el);
      if (s.position === 'fixed') continue;
      if (clipped(el)) continue;
      offenders.push({
        tag: el.tagName,
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 55),
        l: Math.round(r.left),
        r: Math.round(r.right),
        w: Math.round(r.width),
      });
    }
  }
  const small = [];
  document.querySelectorAll('a,button,input,select,textarea').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.height < 32 || r.width < 32) {
      small.push({
        tag: el.tagName,
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 45),
        h: Math.round(r.height),
        w: Math.round(r.width),
      });
    }
  });
  let tinyText = 0;
  document.querySelectorAll('*').forEach((el) => {
    if (el.children.length) return;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && fs < 12 && el.textContent && el.textContent.trim()) tinyText++;
  });
  return {
    vw: vw,
    docScrollW: de.scrollWidth,
    hasHScroll: de.scrollWidth > vw + 1,
    offenderCount: offenders.length,
    offenders: offenders.slice(0, 5),
    smallTouch: small.length,
    smallSample: small.slice(0, 3),
    tinyText: tinyText,
  };
})()`;

async function auditPage(pagePath) {
  const url = BASE + pagePath;
  let b;
  let p;
  try {
    const version = await getJson('/json/version');
    b = mkConn(version.webSocketDebuggerUrl);
    await b.ready;
    const created = await b.send('Target.createTarget', { url: url });
    const targetId = created.targetId;
    await new Promise((r) => setTimeout(r, 400));
    const targets = await getJson('/json');
    const t = targets.find((x) => x.id === targetId);
    if (!t) return { path: pagePath, error: 'target not found' };
    p = mkConn(t.webSocketDebuggerUrl);
    await p.ready;
    await p.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true,
    });
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const st = await p.send('Runtime.evaluate', {
        returnByValue: true,
        expression: 'document.readyState',
      });
      if (st.result && st.result.value === 'complete') break;
    }
    await new Promise((r) => setTimeout(r, 1200));
    const res = await p.send('Runtime.evaluate', {
      returnByValue: true,
      expression: AUDIT_EXPR,
    });
    const out = { path: pagePath, url: url };
    if (res.result && res.result.value) Object.assign(out, res.result.value);
    else if (res.exceptionDetails) out.error = 'eval failed';
    try {
      await b.send('Target.closeTarget', { targetId: targetId });
    } catch (e) {}
    return out;
  } catch (e) {
    return { path: pagePath, error: String(e && e.message ? e.message : e) };
  } finally {
    try {
      if (p) p.ws.close();
    } catch (e) {}
    try {
      if (b) b.ws.close();
    } catch (e) {}
  }
}

(async () => {
  const results = [];
  for (const pg of PAGES) {
    const r = await auditPage(pg);
    results.push(r);
    const flag = r.hasHScroll ? 'OVERFLOW' : 'ok';
    console.log(
      `${flag.padEnd(9)} ${pg.padEnd(34)} scrollW=${r.docScrollW} offenders=${r.offenderCount} smallTouch=${r.smallTouch} tinyText=${r.tinyText}` +
        (r.error ? ` ERR:${r.error}` : '')
    );
  }
  console.log('\n===== DETAIL (overflow offenders) =====');
  results
    .filter((r) => r.hasHScroll || r.offenderCount > 0)
    .forEach((r) => {
      console.log(`\n[${r.path}] scrollW=${r.docScrollW} vw=${r.vw}`);
      (r.offenders || []).forEach((o) => {
        console.log(`   ${o.tag} | ${o.cls} | l=${o.l} r=${o.r} w=${o.w}`);
      });
    });
})();
