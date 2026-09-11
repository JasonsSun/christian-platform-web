import type { SendMailOptions, Transporter } from 'nodemailer';

/* 通道:邮件(SMTP)
 * 未配置 SMTP_HOST 时不启用 —— 调用方需要先判断 smtpConfigured()。
 */

export type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function smtpConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

export function smtpConfig() {
  return {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true', // 465=true, 587=false
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@example.com',
  };
}

let transporter: Transporter | null = null;

async function getTransport(): Promise<Transporter> {
  if (transporter) return transporter;
  const cfg = smtpConfig();
  const nodemailer = await import('nodemailer');
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    // 国内部分邮箱用自签证书;仅在本机/内网环境放宽
    tls: { rejectUnauthorized: String(process.env.SMTP_REJECT_UNAUTHORIZED || 'true') === 'true' },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export async function sendMail(input: MailInput): Promise<{ messageId?: string }> {
  if (!smtpConfigured()) throw new Error('smtp_not_configured');
  if (!input.to) throw new Error('empty_recipient');

  const cfg = smtpConfig();
  const t = await getTransport();
  const mail: SendMailOptions = {
    from: cfg.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html || undefined,
  };
  const info = await t.sendMail(mail);
  return { messageId: info?.messageId };
}

/** 管理后台「发送测试邮件」用 */
export async function verifySmtp(): Promise<boolean> {
  if (!smtpConfigured()) return false;
  try {
    const t = await getTransport();
    await t.verify();
    return true;
  } catch {
    return false;
  }
}
