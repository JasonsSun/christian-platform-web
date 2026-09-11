'use strict';
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 3030;
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

  const pos = await srpc('Runtime.evaluate', { expression: `(function(){var b=document.querySelector('button[title="推荐给朋友"]');var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`, returnByValue: true });
  const p = JSON.parse(pos.result.value);
  await srpc('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await srpc('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await srpc('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(2500);

  const expr = `JSON.stringify({
    dlg: document.querySelectorAll('[role=dialog]').length,
    qrImg: !!document.querySelector('img[alt="分享二维码"]'),
    qrIsPng: (function(){var i=document.querySelector('img[alt="分享二维码"]');return i? i.src.indexOf('data:image/png')===0:false;})(),
    title: document.body.innerText.indexOf('推荐给朋友')>=0,
    tip: document.body.innerText.indexOf('扫码或复制链接')>=0,
    copyBtn: !!Array.prototype.find.call(document.querySelectorAll('button'), function(b){return b.textContent.indexOf('复制链接')>=0;}),
    shareBtn: !!Array.prototype.find.call(document.querySelectorAll('button'), function(b){return b.textContent.indexOf('系统分享')>=0;}),
    hasDataGuard: !!document.querySelector('[data-guard="share-modal"]')
  })`;
  const r = await srpc('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log('FINAL', r.result.value);

  // 测试点击遮罩关闭
  await srpc('Input.dispatchMouseEvent', { type: 'mousePressed', x: 50, y: 700, button: 'left', clickCount: 1 });
  await srpc('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 50, y: 700, button: 'left', clickCount: 1 });
  await sleep(600);
  const r2 = await srpc('Runtime.evaluate', { expression: 'document.querySelectorAll("[role=dialog]").length', returnByValue: true });
  console.log('AFTER_OVERLAY_CLICK dlg=', r2.result.value);

  // 重新打开, 测试二维码是否仍在
  await srpc('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await srpc('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(1500);
  const r3 = await srpc('Runtime.evaluate', { expression: 'JSON.stringify({dlg: document.querySelectorAll("[role=dialog]").length, qr: !!document.querySelector(\'img[alt="分享二维码"]\')})', returnByValue: true });
  console.log('REOPEN', r3.result.value);

  srv.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
