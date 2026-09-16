// 支付网关加密链路离线自测 —— 不需要商户密钥、不需要数据库、不需要起服务。
//
// 为什么需要它：微信 / Stripe 的适配器是「配了商户号才算真跑」的代码，
// 平时 CI 碰不到；一旦有人改坏验签或 AES 解密，只有真线上等用户付完钱才发现 ——
// 那时候钱已经收了、回调验不过、订单永远停在 pending。
// 这里用当场生成的 RSA 密钥对 + 随机 APIv3 密钥，把「签名 → 验签」「加密 → 解密」
// 两条闭环在本地跑完整的一轮，任何一环错都会在这里红。
//
// 运行: npm run test:payments
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * 载入被测模块（src/server/paymentCrypto.ts）。
 *
 * 它是 TS，直接 import 需要 Node ≥22.6 的 type stripping；
 * 生产镜像跑的是 node:20-alpine，所以这里留一条退路：
 * 用本地已装的 typescript 把它编译到临时目录再 import。
 * 两条路都不依赖网络、不依赖商户密钥。
 */
async function loadCrypto() {
  const src = fileURLToPath(new URL('../src/server/paymentCrypto.ts', import.meta.url));
  try {
    return await import(src);
  } catch {
    const out = await mkdtemp(path.join(tmpdir(), 'paycrypto-'));
    execFileSync(
      process.execPath,
      [
        path.resolve('node_modules/typescript/bin/tsc'),
        src,
        '--outDir', out,
        '--target', 'es2022',
        '--module', 'es2022',
        '--moduleResolution', 'node',
      ],
      { stdio: 'ignore' }
    );
    await writeFile(path.join(out, 'package.json'), '{"type":"module"}');
    return import(pathToFileURL(path.join(out, 'paymentCrypto.js')).href);
  }
}

const {
  rsaSign,
  rsaVerify,
  buildQuery,
  wechatV3Auth,
  parseWechatV3Auth,
  aesGcmEncrypt,
  aesGcmDecrypt,
  verifyWechatNotifySig,
  verifyStripeSig,
  makeStripeSig,
} = await loadCrypto();

let pass = 0;
let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? ` — ${extra}` : ''}`); }
}

// 一次性生成测试密钥对（不落盘、不上传，仅本进程内使用）
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const API_V3_KEY = randomBytes(32).toString('hex').slice(0, 32); // 微信要求 32 字节

console.log('1) 支付宝 RSA2：待签串构造 + 自签自验');
{
  const params = {
    app_id: '2021000000000000',
    method: 'alipay.trade.page.pay',
    biz_content: JSON.stringify({ out_trade_no: 'DN20260101000000ABCD', total_amount: '10.00' }),
    sign_type: 'RSA2',
    sign: 'xxx-should-be-excluded',
    timestamp: '2026-01-01 00:00:00',
  };
  // sign / sign_type 不参与签名 —— 这是支付宝最容易写错的地方：
  // 少了 exclude 就等于把签名本身也签进去，验签必然失败。
  const content = buildQuery(params, ['sign', 'sign_type']);
  ok('空值字段被剔除、sign/sign_type 已排除', !content.includes('sign=') && !content.includes('sign_type='), content);
  ok('按 key 升序拼接', content.split('&')[0].startsWith('app_id='), content.split('&')[0]);

  const sign = rsaSign(content, privateKey);
  ok('RSA2 签名可验通过', rsaVerify(content, sign, publicKey));

  const tampered = content.replace('10.00', '0.01'); // 金额被中间人改过
  ok('篡改金额后验签失败', rsaVerify(tampered, sign, publicKey) === false);
  ok('坏公钥不会抛异常，一律拒绝', rsaVerify(content, sign, 'not-a-pem') === false);
}

console.log('2) 支付宝 notify：伪造回调必须验不过');
{
  const data = { out_trade_no: 'DN20260101000000ABCD', trade_status: 'TRADE_SUCCESS', total_amount: '10.00' };
  const content = buildQuery(data, ['sign', 'sign_type']);
  const good = rsaSign(content, privateKey);
  ok('用正确私钥签名 → 通过', rsaVerify(content, good, publicKey));
  const other = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const forged = rsaSign(content, other.privateKey);
  ok('伪造回调（别人私钥签名）→ 拒绝', rsaVerify(content, forged, publicKey) === false);
}

console.log('3) 微信支付 v3：下单 Authorization 头');
{
  const body = JSON.stringify({ mchid: '1900000001', out_trade_no: 'DN20260101000000ABCD', amount: { total: 1000 } });
  const auth = wechatV3Auth('POST', '/v3/pay/transactions/native', body, '1900000001', 'SERIAL123', privateKey);
  const parsed = parseWechatV3Auth(auth);
  ok('scheme 正确', auth.startsWith('WECHATPAY2-SHA256-RSA2048 '));
  ok('mchid / serial_no 携带正确', parsed.mchid === '1900000001' && parsed.serial_no === 'SERIAL123');
  ok('nonce_str 为 32 位 hex', /^[0-9a-f]{32}$/.test(parsed.nonce_str || ''), parsed.nonce_str);
  ok('timestamp 是当前 unix 秒', Math.abs(Number(parsed.timestamp) - Math.floor(Date.now() / 1000)) < 30);

  // 复算待签串：微信的规定是 method\npath\ntimestamp\nnonce\nbody\n（末尾必须有换行）
  const message = `POST\n/v3/pay/transactions/native\n${parsed.timestamp}\n${parsed.nonce_str}\n${body}\n`;
  ok('签名可用商户公钥验通（待签串格式正确）', rsaVerify(message, parsed.signature, publicKey));

  const badMessage = message.replace('1000', '1'); // 金额被改
  ok('金额被改则验签失败', rsaVerify(badMessage, parsed.signature, publicKey) === false);
}

console.log('4) 微信支付回调：AES-256-GCM 解密 + 平台证书验签');
{
  const resourcePayload = JSON.stringify({
    out_trade_no: 'DN20260101000000ABCD',
    transaction_id: '4200000000000000000000000000',
    trade_state: 'SUCCESS',
    amount: { total: 1000 },
  });
  const associated = 'certificate-type';
  const enc = aesGcmEncrypt(resourcePayload, API_V3_KEY, associated);
  const plain = aesGcmDecrypt(enc.ciphertext, API_V3_KEY, enc.iv, enc.associated_data);
  ok('解密结果与原文一致', plain === resourcePayload, plain);
  ok(
    '解出的订单号/金额正确（钱数不能错）',
    JSON.parse(plain).out_trade_no === 'DN20260101000000ABCD' && JSON.parse(plain).amount.total === 1000
  );

  // GCM 是 AEAD：AAD 不匹配必须炸，这正是「伪造回调骗不过」的保障
  let aadRejected = false;
  try { aesGcmDecrypt(enc.ciphertext, API_V3_KEY, enc.iv, 'another-aad'); } catch { aadRejected = true; }
  ok('associated_data 对不上 → 解密抛错', aadRejected);

  let keyRejected = false;
  try { aesGcmDecrypt(enc.ciphertext, 'x'.repeat(32), enc.iv, enc.associated_data); } catch { keyRejected = true; }
  ok('APIv3 密钥错误 → 解密抛错', keyRejected);

  // 回调 body 的验签（时间戳\n随机串\n报文\n）
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');
  const notifyBody = JSON.stringify({ resource: enc });
  const notifySig = rsaSign(`${timestamp}\n${nonce}\n${notifyBody}\n`, privateKey);
  ok('正常回调验签通过', verifyWechatNotifySig(timestamp, nonce, notifyBody, notifySig, publicKey));
  ok(
    '报文体被改写 → 验签失败',
    verifyWechatNotifySig(timestamp, nonce, notifyBody + ' ', notifySig, publicKey) === false
  );
  ok('时间戳被改写 → 验签失败', verifyWechatNotifySig(String(Date.now()), nonce, notifyBody, notifySig, publicKey) === false);
}

console.log('5) Stripe Webhook：HMAC-SHA256 + 常量时间比较');
{
  const secret = 'whsec_test_abc123';
  const payload = JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: { client_reference_id: 'DN20260101000000ABCD', amount_total: 1000, payment_intent: 'pi_1' } },
  });
  const t = Math.floor(Date.now() / 1000);
  const header = makeStripeSig(payload, secret, t);
  ok('正常签名通过', verifyStripeSig(payload, header, secret));
  ok(
    '时间戳参与签名（换 t 立即失效）',
    verifyStripeSig(payload, `t=${t + 5},v1=${header.split('v1=')[1]}`, secret) === false
  );
  const ev = JSON.parse(payload);
  ok('金额篡改后签名失效', verifyStripeSig(JSON.stringify({ ...ev, data: { object: { ...ev.data.object, amount_total: 1 } } }), header, secret) === false);
  // 伪造者没有 webhook secret：用错密钥算出来的 v1 必须被拒
  const fakeV1 = makeStripeSig(payload, 'whsec_wrong', t).split('v1=')[1];
  ok('伪造 v1 被拒', verifyStripeSig(payload, `t=${t},v1=${fakeV1}`, secret) === false);
  // 畸形头不能抛异常把服务打挂
  let crashed = false;
  try { verifyStripeSig(payload, 'garbage', secret); } catch { crashed = true; }
  ok('畸形签名头不抛异常（返回 false 而不是 500）', !crashed && verifyStripeSig(payload, 'garbage', secret) === false);
  ok('空签名头被拒', verifyStripeSig(payload, '', secret) === false);
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
