// 手机端详情：列出触摸目标过小 / 字号过小的具体元素
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

const DETAIL_EXPR = `(() => {
  const vw = window.innerWidth;
  const cls = (el) => (typeof el.className === 'string' ? el.className : '').slice(0, 70);
  const txt = (el) => (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28);

  const small = [];
  const seen = new Set();
  document.querySelectorAll('a,button,input,select,textarea').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.height < 32 || r.width < 32) {
      const key = el.tagName + '|' + cls(el);
      if (seen.has(key)) return;
      seen.add(key);
      small.push({ tag: el.tagName, c: cls(el), t: txt(el), h: Math.round(r.height), w: Math.round(r.width) });
    }
  });
  small.sort((a, b) => a.h * a.w - b.h * b.w);

  const tiny = [];
  const tseen = new Set();
  document.querySelectorAll('*').forEach((el) => {
    if (el.children.length) return;
    const s = getComputedStyle(el);
    const fs = parseFloat(s.fontSize);
    if (!fs || fs >= 12) return;
    const t = txt(el);
    if (!t) return;
    const key = el.tagName + '|' + cls(el) + '|' + fs;
    if (tseen.has(key)) return;
    tseen.add(key);
    tiny.push({ tag: el.tagName, c: cls(el), t: t, fs: fs });
  });
  tiny.sort((a, b) => a.fs - b.fs);

  // 底部固定导航/播放条遮挡检测
  const fixedBottoms = [];
  document.querySelectorAll('*').forEach((el) => {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.bottom > 500 && r.height > 0) {
      fixedBottoms.push({ tag: el.tagName, c: cls(el), top: Math.round(r.top), h: Math.round(r.height) });
    }
  });

  return { vw, smallCount: small.length, small: small.slice(0, 12), tinyCount: tiny.length, tiny: tiny.slice(0, 12), fixedBottoms: fixedBottoms.slice(0, 6) };
})()`;

async function detail(pagePath) {
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
    await p.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const st = await p.send('Runtime.evaluate', { returnByValue: true, expression: 'document.readyState' });
      if (st.result && st.result.value === 'complete') break;
    }
    await new Promise((r) => setTimeout(r, 1200));
    const res = await p.send('Runtime.evaluate', { returnByValue: true, expression: DETAIL_EXPR });
    const out = { path: pagePath };
    if (res.result && res.result.value) Object.assign(out, res.result.value);
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
  for (const pg of PAGES) {
    const r = await detail(pg);
    console.log(`\n================ ${pg} ================`);
    if (r.error) {
      console.log('ERR ' + r.error);
      continue;
    }
    console.log(`触摸目标过小: ${r.smallCount} 类`);
    (r.small || []).forEach((s) => console.log(`   ${s.tag} ${s.w}x${s.h} | ${s.c} | "${s.t}"`));
    console.log(`字号<12px: ${r.tinyCount} 类`);
    (r.tiny || []).forEach((s) => console.log(`   ${s.tag} ${s.fs}px | ${s.c} | "${s.t}"`));
    console.log(`底部固定元素: ${(r.fixedBottoms || []).length}`);
    (r.fixedBottoms || []).forEach((s) => console.log(`   ${s.tag} top=${s.top} h=${s.h} | ${s.c}`));
  }
})();
