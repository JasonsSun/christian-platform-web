import { randomBytes } from 'node:crypto';
import { exec, one, q } from './db';
import { ensurePaymentColumns } from './paymentColumns';
import { getBool, getSetting } from './settings';
import { unpackSecret } from './secret';
import { notify } from './services';
import {
  aesGcmDecrypt, buildQuery, rsaSign, rsaVerify, verifyStripeSig, verifyWechatNotifySig, wechatV3Auth,
} from './paymentCrypto';
import { formatMoney } from '@/lib/format';

/**
 * 支付网关适配层。
 *
 * 设计取舍：网关能力做成接口 + 按环境变量自动启用。配了哪个商户号的密钥，
 * 哪个通道就出现在付款选项里；一个都没配（或管理员关掉总闸）时，
 * 自动回落到既有的「线下转账 + 管理员确认」流程，行为与改动前完全一致。
 *
 * 三条硬规则：
 *  1. 金额一律以「分」为单位在内部流转，只有拼网关参数时才转元。
 *  2. 入账必须幂等 —— 支付网关的异步通知可能重复投递，重复到达不得重复确认、
 *     也不得因为上游金额对不上就把订单标成异常以外的状态。
 *  3. 验签失败一律拒绝。宁可漏确认让管理员人工处理，也不能被伪造回调骗过。
 */

export type GatewayKey = 'offline' | 'wechat' | 'alipay' | 'stripe';

export type CreatePaymentInput = {
  outTradeNo: string;
  amountCents: number;
  subject: string;
  notifyUrl: string;
  returnUrl?: string;
  clientIp?: string;
};

export type CreatePaymentResult = {
  gateway: GatewayKey;
  outTradeNo: string;
  /** 跳转类网关：前端 location.href = payUrl */
  payUrl?: string;
  /** 表单类网关（支付宝电脑网站支付）：前端以这些字段自动提交到 action */
  form?: { method: 'GET' | 'POST'; action: string; fields: Record<string, string> };
  /** 扫码类网关：把 codeUrl 渲染成二维码给用户扫 */
  codeUrl?: string;
  /** 线下等无需跳转的通道，直接给文案 */
  message?: string;
};

export type NotifyResult = {
  outTradeNo: string;
  transactionId: string;
  amountCents: number;
};

export interface PaymentGateway {
  key: GatewayKey;
  label: string;
  configured(): boolean | Promise<boolean>;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  parseNotify(req: Request): Promise<NotifyResult>;
  successReply(): Response;
  failureReply(msg: string): Response;
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function newOutTradeNo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `DN${stamp}${randomBytes(4).toString('hex').toUpperCase()}`;
}

/** 密钥配置来源优先级：数据库(settings 表，加密存储) > 环境变量(.env 兜底) */
const SECRET_ENV: Record<string, string> = {
  alipay_app_id: 'ALIPAY_APP_ID',
  alipay_private_key: 'ALIPAY_PRIVATE_KEY',
  alipay_public_key: 'ALIPAY_PUBLIC_KEY',
  wechat_mchid: 'WECHAT_MCHID',
  wechat_appid: 'WECHAT_APPID',
  wechat_api_v3_key: 'WECHAT_API_V3_KEY',
  wechat_private_key: 'WECHAT_PRIVATE_KEY',
  wechat_serial_no: 'WECHAT_SERIAL_NO',
  wechat_platform_cert: 'WECHAT_PLATFORM_CERT',
  stripe_secret_key: 'STRIPE_SECRET_KEY',
  stripe_webhook_secret: 'STRIPE_WEBHOOK_SECRET',
};

/**
 * 读取支付密钥：先查 settings 表（解密），未配置时回退到环境变量。
 * 于是管理员在后台「支付配置」页填的密钥优先于 .env，且改完即时生效（无需重启）。
 */
async function secret(name: string): Promise<string> {
  const dbv = (await getSetting(name, '')).trim();
  if (dbv) return unpackSecret(dbv);
  return (process.env[SECRET_ENV[name]] || '').trim();
}

async function readForm(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j)) out[k] = String(v ?? '');
    return out;
  }
  const text = await req.text();
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(text).entries()) out[k] = v;
  return out;
}

/* ------------------------------------------------------------------ */
/* 线下转账（永远可用，作为安全兜底）                                     */
/* ------------------------------------------------------------------ */

const offline: PaymentGateway = {
  key: 'offline',
  label: '线下转账',
  configured: () => true,
  async createPayment({ outTradeNo }) {
    return {
      gateway: 'offline',
      outTradeNo,
      message: '请按页面上的收款账号转账，管理员核对后会确认并公示（名录金额始终脱敏）。',
    };
  },
  async parseNotify() {
    throw new Error('线下转账不支持异步回调');
  },
  successReply: () => new Response('success', { status: 200 }),
  failureReply: (m) => new Response(m, { status: 400 }),
};

/* ------------------------------------------------------------------ */
/* 支付宝电脑网站支付（alipay.trade.page.pay，RSA2 签名）                 */
/* ------------------------------------------------------------------ */

const ALIPAY_GATEWAY = 'https://openapi.alipay.com/gateway.do';

const alipay: PaymentGateway = {
  key: 'alipay',
  label: '支付宝',
  configured: async () =>
    !!(await secret('alipay_app_id')) && !!(await secret('alipay_private_key')) && !!(await secret('alipay_public_key')),
  async createPayment({ outTradeNo, amountCents, subject, notifyUrl, returnUrl }) {
    const appId = await secret('alipay_app_id');
    const privateKey = await secret('alipay_private_key');
    const publicKey = await secret('alipay_public_key');
    if (!appId || !privateKey || !publicKey) {
      throw new Error('支付宝未配置：请在后台「支付配置」填写 APP_ID / 应用私钥 / 支付宝公钥');
    }
    const biz = {
      out_trade_no: outTradeNo,
      total_amount: (amountCents / 100).toFixed(2),
      subject: subject.slice(0, 120),
      product_code: 'FAST_INSTANT_TRADE_PAY',
    };
    const params: Record<string, string> = {
      app_id: appId,
      method: 'alipay.trade.page.pay',
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      version: '1.0',
      notify_url: notifyUrl,
      biz_content: JSON.stringify(biz),
    };
    if (returnUrl) params.return_url = returnUrl;
    const content = buildQuery(params);
    const sign = rsaSign(content, privateKey);
    const fields = { ...params, sign };
    return {
      gateway: 'alipay',
      outTradeNo,
      form: { method: 'GET', action: ALIPAY_GATEWAY, fields },
    };
  },
  async parseNotify(req) {
    const data = await readForm(req);
    const sign = data.sign || '';
    const signType = data.sign_type || 'RSA2';
    if (!sign || signType.toUpperCase() !== 'RSA2') throw new Error('签名类型不支持');
    const publicKey = await secret('alipay_public_key');
    if (!publicKey) throw new Error('支付宝公钥未配置');
    const ok = rsaVerify(buildQuery(data, ['sign', 'sign_type']), sign, publicKey);
    if (!ok) throw new Error('验签失败');
    // trade_status 可能是 WAIT_BUYER_PAY / TRADE_CLOSED，只有成功类才入账
    const status = data.trade_status || '';
    if (!['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(status)) {
      throw new Error(`未成交状态 ${status}`);
    }
    return {
      outTradeNo: data.out_trade_no || '',
      transactionId: data.trade_no || '',
      amountCents: Math.round(Number(data.total_amount || 0) * 100),
    };
  },
  // 支付宝要求：返回纯文本 success，否则视为失败并持续重发
  successReply: () => new Response('success', { status: 200 }),
  failureReply: (m) => new Response(m, { status: 400 }),
};

/* ------------------------------------------------------------------ */
/* 微信支付 v3 Native / Stripe：纯 node:crypto 实现，零三方 SDK          */
/* ------------------------------------------------------------------ */

const wechat: PaymentGateway = {
  key: 'wechat',
  label: '微信支付',
  configured: async () =>
    !!(await secret('wechat_mchid')) && !!(await secret('wechat_api_v3_key')) &&
    !!(await secret('wechat_private_key')) && !!(await secret('wechat_appid')) &&
    !!(await secret('wechat_serial_no')) && !!(await secret('wechat_platform_cert')),
  async createPayment({ outTradeNo, amountCents, subject, notifyUrl, clientIp }) {
    const mchid = await secret('wechat_mchid');
    const apiV3Key = await secret('wechat_api_v3_key');
    const privateKey = await secret('wechat_private_key');
    const appid = await secret('wechat_appid');
    const serialNo = await secret('wechat_serial_no');
    if (!mchid || !apiV3Key || !privateKey || !appid || !serialNo) {
      throw new Error('微信支付未配置：请后台填写 商户号/Mchid、APIv3密钥、商户API私钥、AppID、证书序列号');
    }
    const bodyObj = {
      mchid, appid,
      description: subject.slice(0, 120),
      notify_url: notifyUrl,
      out_trade_no: outTradeNo,
      amount: { total: amountCents, currency: 'CNY' },
      ...(clientIp ? { spbill_create_ip: clientIp } : {}),
    };
    const body = JSON.stringify(bodyObj);
    const urlPath = '/v3/pay/transactions/native';
    const auth = wechatV3Auth('POST', urlPath, body, mchid, serialNo, privateKey);
    const resp = await fetch(`https://api.mweixin.qq.com${urlPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
      body,
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`微信下单失败 ${resp.status}: ${text}`);
    const json = JSON.parse(text) as { code_url?: string };
    if (!json.code_url) throw new Error('微信下单未返回 code_url');
    return { gateway: 'wechat', outTradeNo, codeUrl: json.code_url };
  },
  async parseNotify(req) {
    const apiV3Key = await secret('wechat_api_v3_key');
    const platformCert = await secret('wechat_platform_cert');
    if (!apiV3Key || !platformCert) throw new Error('微信支付未配置 APIv3 密钥或平台证书');
    const timestamp = req.headers.get('wechatpay-timestamp') || '';
    const nonce = req.headers.get('wechatpay-nonce') || '';
    const signature = req.headers.get('wechatpay-signature') || '';
    const body = await req.text();
    if (!verifyWechatNotifySig(timestamp, nonce, body, signature, platformCert)) {
      throw new Error('微信回调验签失败');
    }
    const payload = JSON.parse(body) as { event_type?: string; resource?: Record<string, string> };
    // 同一个回调地址会收到退款等其它事件的通知。
    // 这些事件一律「已收到但与我无关」：回 ACK 让微信别再重发，绝不进入入账流程。
    const eventType = payload.event_type || '';
    if (eventType && eventType !== 'TRANSACTION.SUCCESS') {
      return { outTradeNo: '', transactionId: '', amountCents: 0 };
    }
    const resource = payload.resource;
    const plain = aesGcmDecrypt(resource.ciphertext, apiV3Key, resource.iv, resource.associated_data);
    const data = JSON.parse(plain) as { out_trade_no?: string; transaction_id?: string; trade_state?: string; amount?: { total?: number } };
    if (data.trade_state !== 'SUCCESS') throw new Error(`微信未成交状态 ${data.trade_state}`);
    return {
      outTradeNo: data.out_trade_no || '',
      transactionId: data.transaction_id || '',
      amountCents: Number(data.amount?.total || 0),
    };
  },
  successReply: () => new Response(JSON.stringify({ code: 'SUCCESS', message: '成功' }), { status: 200 }),
  failureReply: (m) => new Response(JSON.stringify({ code: 'FAIL', message: m }), { status: 400 }),
};

const stripe: PaymentGateway = {
  key: 'stripe',
  label: 'Stripe',
  configured: async () => !!(await secret('stripe_secret_key')) && !!(await secret('stripe_webhook_secret')),
  async createPayment({ outTradeNo, amountCents, subject, notifyUrl, returnUrl }) {
    const sk = await secret('stripe_secret_key');
    if (!sk) throw new Error('Stripe 未配置：请在后台「支付配置」填写 Secret Key');
    const currency = (process.env.STRIPE_CURRENCY || 'cny').toLowerCase();
    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', `${returnUrl || notifyUrl}?paid=1&session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${returnUrl || notifyUrl}?canceled=1`);
    params.set('client_reference_id', outTradeNo);
    params.set('line_items[0][price_data][currency]', currency);
    params.set('line_items[0][price_data][product_data][name]', subject.slice(0, 120));
    params.set('line_items[0][price_data][unit_amount]', String(amountCents));
    params.set('line_items[0][quantity]', '1');
    params.set('payment_method_types[0]', 'card');
    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sk}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`Stripe 建会话失败 ${resp.status}: ${text}`);
    const json = JSON.parse(text) as { url?: string };
    if (!json.url) throw new Error('Stripe 未返回跳转地址');
    return { gateway: 'stripe', outTradeNo, payUrl: json.url };
  },
  async parseNotify(req) {
    const whSecret = await secret('stripe_webhook_secret');
    if (!whSecret) throw new Error('Stripe 未配置 Webhook Secret');
    const sig = req.headers.get('stripe-signature') || '';
    const payload = await req.text();
    if (!verifyStripeSig(payload, sig, whSecret)) throw new Error('Stripe 回调验签失败');
    const event = JSON.parse(payload) as any;
    if (event.type !== 'checkout.session.completed') {
      // 其它事件直接回 200，让 Stripe 不再重发
      return { outTradeNo: '', transactionId: '', amountCents: 0 };
    }
    const s = event.data?.object || {};
    return {
      outTradeNo: s.client_reference_id || '',
      transactionId: s.payment_intent || '',
      amountCents: Number(s.amount_total || 0),
    };
  },
  successReply: () => new Response('{}', { status: 200 }),
  failureReply: (m) => new Response(JSON.stringify({ error: m }), { status: 400 }),
};

const GATEWAYS: Record<GatewayKey, PaymentGateway> = { offline, alipay, wechat, stripe };

export function resolveGateway(key: string): PaymentGateway {
  const g = GATEWAYS[(key || '') as GatewayKey];
  if (!g) throw new Error(`未知支付通道 ${key}`);
  return g;
}

/** 给前端用：哪些通道可用（含总闸状态），用于渲染付款选项 */
export async function listGateways() {
  const enabled = await onlinePaymentEnabled();
  const items = await Promise.all(
    [alipay, wechat, stripe].map(async (g) => {
      const configured = await g.configured();
      return { key: g.key, label: g.label, configured, available: enabled && configured };
    })
  );
  return {
    onlineEnabled: enabled,
    online: items,
    offlineAvailable: true, // 线下转账永远可用，管理员关闸也不影响
  };
}

/**
 * 总闸：管理员可在后台随时关闭线上支付。
 * 关闭后所有在线通道立即不可用，自动回落到线下转账 —— 这是合规风险的一键止血阀。
 */
export async function onlinePaymentEnabled(): Promise<boolean> {
  try {
    // 必须先补种配置行：后台设置的 PATCH 只能 UPDATE 已存在的 key，
    // 若这行从没被插入过，管理员把开关拨到"开启"会静默失效(影响了 0 行)。
    await ensurePaymentColumns();
    return await getBool('donation_online_payment', false);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 下单与入账                                                            */
/* ------------------------------------------------------------------ */

export type StartPayInput = {
  donationId: string;
  gateway: GatewayKey;
  subject: string;
  origin: string;
  clientIp?: string;
};

/**
 * 为一条已登记的捐赠发起支付。
 * 登记记录本来就有（/api/v1/donations POST 创建 pending），这里只负责挂上商户订单号并调网关。
 */
export async function startDonationPayment(input: StartPayInput): Promise<CreatePaymentResult> {
  await ensurePaymentColumns();
  const row = await one<{ id: string; amount_cents: number; status: string; donor_id: string | null }>(
    `SELECT id, amount_cents, status, donor_id FROM donations WHERE id=?`,
    [input.donationId]
  );
  if (!row) throw new Error('捐赠记录不存在');
  if (row.status === 'confirmed') throw new Error('该捐赠已确认，无需重复支付');

  const gw = resolveGateway(input.gateway);
  // 线上通道要走总闸 + 该通道自身配置；offline 永远放行
  if (gw.key !== 'offline') {
    if (!(await onlinePaymentEnabled())) throw new Error('线上支付已关闭，请使用线下转账');
    if (!(await gw.configured())) throw new Error(`${gw.label}暂未开通`);
  }

  // 已存在的订单号直接复用，避免用户重复点击产生多个订单
  const exist = await one<{ out_trade_no: string }>(
    `SELECT out_trade_no FROM donations WHERE id=? AND payment_method=? AND out_trade_no IS NOT NULL`,
    [row.id, gw.key]
  );
  const outTradeNo = exist?.out_trade_no || newOutTradeNo();

  const result = await gw.createPayment({
    outTradeNo,
    amountCents: Number(row.amount_cents || 0),
    subject: input.subject,
    notifyUrl: `${input.origin}/api/v1/payments/notify/${gw.key}`,
    returnUrl: `${input.origin}/donate?paid=1`,
    clientIp: input.clientIp,
  });

  if (!exist) {
    await exec(`UPDATE donations SET payment_method=?, out_trade_no=? WHERE id=?`, [gw.key, outTradeNo, row.id]);
  }
  return result;
}

export type ConfirmResult =
  | { ok: true; duplicated: boolean }
  | { ok: false; reason: string; httpStatus: number };

/**
 * 支付成功入账。必须是幂等的：网关重发通知、用户重复回调都不应重复确认。
 */
export async function confirmPaid(args: {
  outTradeNo: string;
  transactionId: string;
  amountCents: number;
  gateway: GatewayKey;
}): Promise<ConfirmResult> {
  await ensurePaymentColumns();
  const row = await one<{
    id: string; donor_id: string | null; amount_cents: number; status: string; display_name: string;
  }>(`SELECT id, donor_id, amount_cents, status, display_name FROM donations WHERE out_trade_no=?`, [
    args.outTradeNo,
  ]);
  if (!row) return { ok: false, reason: '订单不存在', httpStatus: 404 };

  // 幂等核心：已确认的直接返回成功，绝不二次记账
  if (row.status === 'confirmed') return { ok: true, duplicated: true };

  const expect = Number(row.amount_cents || 0);
  if (expect > 0 && args.amountCents > 0 && expect !== args.amountCents) {
    // 金额对不上：宁可不入账，留给管理员人工核对，也不要静默改金额
    return { ok: false, reason: '金额与订单不符', httpStatus: 409 };
  }

  await exec(
    `UPDATE donations SET status='confirmed', transaction_id=?, paid_at=NOW(), payment_method=?, reviewed_at=COALESCE(reviewed_at, NOW())
      WHERE id=? AND status<>'confirmed'`,
    [args.transactionId, args.gateway, row.id]
  );

  /** 通知里给人看的金额走全站统一口径（千分位、整数不补零）；网关对账用的 total_amount 仍是两位小数字符串 */
  const yuan = formatMoney(expect);
  try {
    if (row.donor_id) {
      await notify(row.donor_id, 'donation.paid', '捐赠已到账', `你的一笔 ¥${yuan} 捐赠已确认，感谢你的摆上。`, '/donate/transparency');
    }
    const admins = await q<{ id: string }>(`SELECT id FROM users WHERE role='admin' AND status='active'`);
    for (const a of admins) {
      await notify(a.id, 'donation.paid_admin', '收到一笔线上捐赠', `${row.display_name || '匿名'} ¥${yuan}（流水 ${args.transactionId}）`, '/admin/donations');
    }
  } catch {
    /* 通知失败不影响资金入账 */
  }

  return { ok: true, duplicated: false };
}
