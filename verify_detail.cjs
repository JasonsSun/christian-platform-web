'use strict';
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 3031;
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

  // 取一首歌 id
  const songsRaw = await httpGetText('http://localhost:' + PORT + '/api/v1/songs');
  let songId = 'sng_ej55ecpiepo4';
  try { const j = JSON.parse(songsRaw); const it = j.items || j; if (it && it[0]) songId = it[0].id; } catch (e) {}
  console.log('SONG_ID', songId);

  await srpc('Page.navigate', { url: 'http://localhost:' + PORT + '/songs/' + songId });
  await sleep(4000);

  // 找详情页顶部分享按钮并点击
  const click = await srpc('Runtime.evaluate', {
    expression: `(function(){
      var b = document.querySelector('button[aria-label="分享"]') || document.querySelector('button[title="分享"]');
      if (!b) return 'NO_BTN';
      var r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return 'HIDDEN';
      b.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  console.log('DETAIL_CLICK', click.result.value);
  await sleep(2000);

  const r = await srpc('Runtime.evaluate', {
    expression: `JSON.stringify({
      dlg: document.querySelectorAll('[role=dialog]').length,
      qr: !!document.querySelector('img[alt="分享二维码"]'),
      shareUrlShown: (function(){var d=document.querySelector('[role=dialog]');return d? d.innerText.indexOf('/songs/')>=0 : false;})()
    })`,
    returnByValue: true,
  });
  console.log('DETAIL_MODAL', r.result.value);

  srv.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
