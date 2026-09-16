-- 002_password_resets
-- 说明：忘记密码功能的重置令牌表。
--       只存 token 的 sha256，明文不落库；used 保证一次性；索引支撑按 token 查。
--       （运行时 passwordReset.ts 也有一份 ensure 建表，两者结构保持一致，
--         这里放在迁移里是为了让「库的版本」可被回答。）

CREATE TABLE IF NOT EXISTS password_resets (
  id         VARCHAR(40)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(40)  NOT NULL,
  token_hash VARCHAR(64)  NOT NULL,
  expires_at DATETIME     NOT NULL,
  used       TINYINT(1)   NOT NULL DEFAULT 0,
  used_at    DATETIME     NULL,
  ip         VARCHAR(64)  DEFAULT '',
  created_at DATETIME     NOT NULL,
  KEY idx_pr_user  (user_id),
  KEY idx_pr_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
