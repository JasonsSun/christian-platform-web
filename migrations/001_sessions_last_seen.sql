-- 001_sessions_last_seen
-- 说明：会话管理需要记录设备「最近活跃时间」，用于「登录设备」页展示
--       活跃于 X 分钟前，以及判断哪些会话是僵死的。
--       线上表已存在，用 information_schema 判列存在性，保证幂等可重复执行。

SET @db = DATABASE();
SET @tbl = 'sessions';
SET @col = 'last_seen_at';
SET @exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = @tbl AND COLUMN_NAME = @col
);
SET @sql = IF(@exists = 0,
  'ALTER TABLE sessions ADD COLUMN last_seen_at DATETIME NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
