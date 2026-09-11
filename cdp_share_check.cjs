'use strict';
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 3024;
const APP = __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function httpGetText(url) { return new Promise((res, rej) => { http.get(url, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d)); }).on('error', rej); }); }
function waitServer() { return new Promise((resolve, reject) => { const t0 = Date.now(); const tick = () => { http.get('http://localhost:' + PORT + '/', (r) => { r.resume(); resolve(r.statusCode); }).on('error', () => { if (Date.now() - t0 > 30000) reject(new Error('timeout')); else setTimeout(tick, 800); }); }; tick(); }); }

async function main() {
  const srv = spawn(process.execPath, ['server.js'], { cwd: APP, env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) } });
  srv.stderr.on('data', (c) => process.stderr.write('[srv] ' + c));
  try { await waitServer(); } catch (e) { console.log('SERVER_FAIL', e.message); srv.kill('SIGKILL'); process.exit(1); }
  console.log('SERVER_READY');

  const ver = JSON.parse(await httpGetText('http://127.0.0.1:9333/json/version'));
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  let id = 0;
  function rpc(method, params) { return new Promise((res, rej) => { const i = ++id; const h = (d) => { const m = JSON.parse(d.toString()); if (m.id === i) { ws.removeListener('message', h); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } }; ws.on('message', h); ws.send(JSON.stringify({ id: i, method, params: params || {} })); }); }
  const tgt = await rpc('Target.createTarget', { url: 'about:blank' });
  const sess = (await rpc('Target.attachToTarget', { targetId: tgt.targetId, flatten: true })).sessionId;
  function srpc(method, params) { return new Promise((res, rej) => { const i = ++id; const h = (d) => { const m = JSON.parse(d.toString()); if (m.id === i) { ws.removeListener('message', h); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } }; ws.on('message', h); ws.send(JSON.stringify({ id: i, sessionId: sess, method, params: params || {} })); }); }

  await srpc('Page.enable', {});
  await srpc('Runtime.enable', {});
  await srpc('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await srpc('Page.navigate', { url: 'http://localhost:' + PORT + '/' });
  await sleep(4000);

  // 监听: 一旦 dialog 出现, 保存引用; 一旦被移除, 记录 previousParent 与是否仍在 document
  await srpc('Runtime.evaluate', {
    expression: `(function(){
      window.__ev = [];
      window.__dlg = null;
      function scan(){
        var d = document.querySelector('[role=dialog]');
        if (d && !window.__dlg) { window.__dlg = d; window.__ev.push('FOUND dialog @'+Math.round(performance.now())); }
        if (!d && window.__dlg) {
          var dlg = window.__dlg;
          window.__ev.push('GONE from doc @'+Math.round(performance.now())+' connected='+dlg.isConnected+' parent='+(dlg.parentNode?dlg.parentNode.tagName+'.'+((dlg.parentNode.className&&typeof dlg.parentNode.className==='string')?dlg.parentNode.className.slice(0,40):''):'NULL'));
          window.__dlg = null;
        }
      }
      var iv = setInterval(scan, 8);
      window.__stopScan = function(){ clearInterval(iv); };
      return 'SCAN';
    })()`,
    returnByValue: true,
  });

  const pos = await srpc('Runtime.evaluate', { expression: `(function(){var b=document.querySelector('button[title="推荐给朋友"]');var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`, returnByValue: true });
  const p = JSON.parse(pos.result.value);
  await srpc('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await srpc('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await srpc('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(2500);

  const ev = await srpc('Runtime.evaluate', { expression: 'JSON.stringify(window.__ev)', returnByValue: true });
  console.log('EVENTS', ev.result.value);
  const fin = await srpc('Runtime.evaluate', {
    expression: `JSON.stringify({
      dlgInDoc: document.querySelectorAll('[role=dialog]').length,
      textHasShare: document.body.innerText.indexOf('推荐给朋友') >= 0,
      navInnerLen: (function(){var n=document.querySelector('nav');return n? n.innerHTML.length : -1;})()
    })`,
    returnByValue: true,
  });
  console.log('FINAL', fin.result.value);

  srv.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
