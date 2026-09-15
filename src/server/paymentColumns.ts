import { exec, q } from './db';

/**
 * donations 表接入线上支付所需的扩展列(老库免迁移，与 reminderColumns.ts 同套路)。
 *
 * 注意：这些列在接入线上支付之前建的老库上都不存在，
 * 运行时补齐才能在不做手工迁移的前提下上线。
 */
let checked = false;

const COLUMNS: Array<[string, string]> = [
  ['payment_method', "VARCHAR(20) NOT NULL DEFAULT 'offline'"],
  ['out_trade_no', 'VARCHAR(64) NULL'],
  ['transaction_id', 'VARCHAR(64) NULL'],
  ['paid_at', 'DATETIME NULL'],
];

export async function ensurePaymentColumns(): Promise<void> {
  if (checked) return;
  checked = true;
  try {
    const rows = await q<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'donations'`
    );
    const have = new Set(rows.map((r) => r.COLUMN_NAME));
    for (const [name, ddl] of COLUMNS) {
      if (have.has(name)) continue;
      await exec(`ALTER TABLE donations ADD COLUMN ${name} ${ddl}`);
    }
    // 商户订单号唯一索引:幂等入账的最后一道防线(回调重发不会重复确认)
    const idx = await q<{ INDEX_NAME: string }>(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'donations'
          AND INDEX_NAME = 'uk_donations_out_trade_no'`
    );
    if (!idx.length) {
      await exec(`ALTER TABLE donations ADD UNIQUE KEY uk_donations_out_trade_no (out_trade_no)`).catch(
        () => undefined
      );
    }

    // 线上支付总闸的配置行。后台设置的 UPDATE 只能改已存在的 key，
    // 所以这行必须先种下去，管理员才能在后台把开关拨起来（默认关闭＝仅线下转账）。
    await exec(
      `INSERT INTO settings (key_name, value, label, group_name, updated_at)
       VALUES ('donation_online_payment', 'false', '开启线上支付', 'general', NOW())
       ON DUPLICATE KEY UPDATE label = VALUES(label)`
    ).catch(() => undefined);
  } catch {
    // 补列失败不阻断:最多是线上支付不可用，原有线下登记流程不受影响
  }
}
