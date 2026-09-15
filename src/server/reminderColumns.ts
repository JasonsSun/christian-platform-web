import { exec, q } from './db';

/**
 * 每日提醒所需的 notification_prefs 扩展列。
 *
 * 老库是在这些列之前建的,运行时补齐才能免手工迁移 —— 与 devotionals.ts
 * 的 ensureDevotionalsTable 同一套路:模块级 checked 守卫 + information_schema
 * 探查 + try/catch 吞掉多实例并发竞态。
 *
 * 单独成文件是为了避免循环依赖:notify.ts(读写偏好) 与 reminders.ts(触发提醒)
 * 两边都要用它,而 reminders.ts 又要 import notify.ts。
 */
let checked = false;

const COLUMNS: Array<[string, string]> = [
  ['remind_enabled', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['remind_read_at', "VARCHAR(5) NOT NULL DEFAULT '06:30'"],
  ['remind_devotion_at', "VARCHAR(5) NOT NULL DEFAULT '21:30'"],
  ['remind_read_done', 'DATE NULL'],
  ['remind_devotion_done', 'DATE NULL'],
];

export async function ensureReminderColumns(): Promise<void> {
  if (checked) return;
  checked = true;
  try {
    const rows = await q<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_prefs'`
    );
    const have = new Set(rows.map((r) => r.COLUMN_NAME));
    for (const [name, ddl] of COLUMNS) {
      if (have.has(name)) continue;
      await exec(`ALTER TABLE notification_prefs ADD COLUMN ${name} ${ddl}`);
    }
  } catch {
    // 探查/加列失败不阻断主流程:提醒写不进去最多是少发一条,不能让页面报错
  }
}
