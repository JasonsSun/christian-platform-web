import { createSign, createVerify, createDecipheriv, createCipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * 支付网关的纯加密原语集合（零依赖、零 IO、零 DB）。
 *
 * 单独成文件的原因：这些函数是「能不能真收钱」的安全底线 ——
 * 验签写错等于给伪造回调开门，AES 解密错就是永远解不开微信的回调密文。
 * 抽出来后可以被离线单测（npm run test:payments）直接 import，
 * 不需要商户密钥、不需要数据库、不需要起服务，CI 里就能守住。
 *
 * 本文件刻意不 import 任何 @/server/* 模块：保持纯函数，测试才会轻。
 */

/** RSA2(SHA256withRSA) 私钥签名 */
export function rsaSign(content: string, privateKeyPem: string): string {
  return createSign('RSA-SHA256').update(content, 'utf8').sign(privateKeyPem, 'base64');
}

/** RSA2 公钥验签。任何异常（含公钥格式错）一律视为验签失败，绝不放行。 */
export function rsaVerify(content: string, signature: string, publicKeyPem: string): boolean {
  try {
    return createVerify('RSA-SHA256').update(content, 'utf8').verify(publicKeyPem, signature, 'base64');
  } catch {
    return false;
  }
}

/**
 * 参数按 key 升序拼成 key=value&key=value。
 * 各网关待签串规则略有差异，可用 exclude 排掉 sign / sign_type 之类不参与签名的字段。
 */
export function buildQuery(params: Record<string, string>, exclude: string[] = []): string {
  return Object.keys(params)
    .filter((k) => k && params[k] !== '' && !exclude.includes(k))
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
}

/** 微信支付 v3 请求签名：Authorization: WECHATPAY2-SHA256-RSA2048 mchid=... */
export function wechatV3Auth(
  method: string,
  urlPath: string,
  body: string,
  mchid: string,
  serialNo: string,
  privateKey: string
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');
  const message = `${method.toUpperCase()}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = rsaSign(message, privateKey);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`;
}

/** 微信 v3 的 nonce_str：32 位十六进制随机串（生产与自测共用） */
export function wechatNonce(): string {
  return randomBytes(16).toString('hex');
}

/** 解析微信 v3 Authorization 头，供自测与排障使用 */
export function parseWechatV3Auth(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  const prefix = 'WECHATPAY2-SHA256-RSA2048 ';
  const body = header.startsWith(prefix) ? header.slice(prefix.length) : header;
  for (const m of body.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

/**
 * 微信回调 resource 的 AES-256-GCM 解密。
 * 微信的 ciphertext 是「密文 + 16 字节 GCM tag」拼在一起再做 base64，
 * 所以这里要手动切分后再喂给 decipher。
 */
export function aesGcmDecrypt(ciphertextB64: string, apiV3Key: string, ivB64: string, associated?: string): string {
  const data = Buffer.from(ciphertextB64, 'base64');
  const tag = data.subarray(data.length - 16);
  const enc = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(tag);
  if (associated) decipher.setAAD(Buffer.from(associated, 'utf8'));
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** 校验微信回调签名（用平台证书公钥验相邻的时间戳/随机串/报文体） */
export function verifyWechatNotifySig(
  timestamp: string,
  nonce: string,
  body: string,
  signatureB64: string,
  platformCertPem: string
): boolean {
  try {
    const message = `${timestamp}\n${nonce}\n${body}\n`;
    return createVerify('RSA-SHA256').update(message, 'utf8').verify(platformCertPem, signatureB64, 'base64');
  } catch {
    return false;
  }
}

/** 构造微信回调 resource（仅测试与本地联调使用，生产由微信发出） */
export function aesGcmEncrypt(plain: string, apiV3Key: string, associated?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), iv);
  if (associated) cipher.setAAD(Buffer.from(associated, 'utf8'));
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([enc, tag]).toString('base64'),
    iv: iv.toString('base64'),
    associated_data: associated || '',
  };
}

/**
 * 校验 Stripe webhook 签名（常量时间比较，防时序攻击）。
 * 头格式：t=<unix>,v1=<hex hmac>
 */
export function verifyStripeSig(payload: string, header: string, secret: string): boolean {
  const m = /^t=(\d+),v1=(.+)$/.exec(header || '');
  if (!m) return false;
  const expected = createHmac('sha256', secret).update(`${m[1]}.${payload}`).digest('hex');
  const a = Buffer.from(m[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** 生成 Stripe 风格签名头（仅自测使用） */
export function makeStripeSig(payload: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}
