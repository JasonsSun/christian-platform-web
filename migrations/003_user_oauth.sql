-- 通用第三方账号（OAuth2 授权码流程）绑定表。
-- 与既有微信 openid 绑定（users.wechat_openid）相互独立：
-- 微信是「扫码绑定到已登录账号」，这里是「用第三方身份直接登录/注册」。
CREATE TABLE IF NOT EXISTS user_oauth (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id         VARCHAR(36)  NOT NULL,
  provider        VARCHAR(40)  NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  provider_email   VARCHAR(255) DEFAULT NULL,
  display_name     VARCHAR(120) DEFAULT NULL,
  access_token     VARCHAR(1024) DEFAULT NULL,   -- 加密存储
  refresh_token    VARCHAR(1024) DEFAULT NULL,   -- 加密存储
  expires_at       BIGINT       DEFAULT NULL,
  created_at       BIGINT       NOT NULL,
  updated_at       BIGINT       NOT NULL,
  UNIQUE KEY uniq_provider_sub (provider, provider_user_id),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
