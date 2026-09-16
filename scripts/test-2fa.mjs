// TOTP 单元测试：用 RFC 6238 附录 B 的官方测试向量校验实现是否标准兼容。
// 若这里挂了，说明生成的动态码在 Google Authenticator / 1Password 里会全部对不上。
//
// 运行: node scripts/test-2fa.mjs
import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[=\s]/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function hotp(key, counter) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 1000000).padStart(6, '0');
}

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

console.log('1) base32 编解码');
const raw = Buffer.from('12345678901234567890');
const secret = base32Encode(raw);
check('编码符合 RFC 向量', secret === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', `got=${secret}`);
check('解码可逆', base32Decode(secret).equals(raw));

console.log('\n2) TOTP 官方测试向量（8 位码取后 6 位）');
const key = base32Decode(secret);
const cases = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];
for (const [t, oct] of cases) {
  const expect = oct.slice(-6);
  const got = hotp(key, Math.floor(t / 30));
  check(`T=${t}`, got === expect, `expect=${expect} got=${got}`);
}

console.log('\n3) 时间步边界');
const nowSec = 1700000000;
const c0 = hotp(key, Math.floor(nowSec / 30));
const c1 = hotp(key, Math.floor((nowSec + 30) / 30));
check('相邻 30s 步进产生不同码', c0 !== c1, `${c0} vs ${c1}`);
check('同一时间步内稳定', hotp(key, Math.floor(nowSec / 30)) === c0);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
