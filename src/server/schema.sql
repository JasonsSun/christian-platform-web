-- =============================================================
--  基督教内容传播与社交社区平台 —— MySQL 8 数据库结构
--  与 backend/ (Spring Boot) 领域模型保持一致:
--  users / contents / review_tasks / activities / groups /
--  prayers / notifications / audit_logs / outbox / bible_verses / songs
-- =============================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  display_name  VARCHAR(64)  NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'member',   -- member | moderator | admin
  status        VARCHAR(20)  NOT NULL DEFAULT 'active',   -- active | suspended
  avatar_color  VARCHAR(10)  NOT NULL DEFAULT '#4f6df5',
  bio           VARCHAR(255) NOT NULL DEFAULT '',
  city          VARCHAR(64)  NOT NULL DEFAULT '',
  region        VARCHAR(32)  NOT NULL DEFAULT 'CN',
  church        VARCHAR(120) NOT NULL DEFAULT '',
  created_at    DATETIME     NOT NULL,
  UNIQUE KEY uk_users_username (username),
  UNIQUE KEY uk_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  user_id      CHAR(36)     NOT NULL,
  refresh_hash VARCHAR(128) NOT NULL,
  user_agent   VARCHAR(255) NOT NULL DEFAULT '',
  ip           VARCHAR(64)  NOT NULL DEFAULT '',
  expires_at   DATETIME     NOT NULL,
  revoked      TINYINT(1)   NOT NULL DEFAULT 0,
  rotated_from CHAR(36)     NULL,
  created_at   DATETIME     NOT NULL,
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contents (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  author_id     CHAR(36)     NOT NULL,
  title         VARCHAR(200) NOT NULL,
  body          MEDIUMTEXT   NOT NULL,
  content_type  VARCHAR(20)  NOT NULL DEFAULT 'article',  -- article|testimony|devotion|media|prayer
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending_review', -- draft|pending_review|published|rejected
  scope         VARCHAR(16)  NOT NULL DEFAULT 'global',   -- global | region
  region        VARCHAR(32)  NOT NULL DEFAULT '',
  tags          VARCHAR(255) NOT NULL DEFAULT '',
  cover         VARCHAR(20)  NOT NULL DEFAULT '',
  like_count    INT          NOT NULL DEFAULT 0,
  comment_count INT          NOT NULL DEFAULT 0,
  view_count    INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL,
  published_at  DATETIME     NULL,
  KEY idx_contents_status (status),
  KEY idx_contents_author (author_id),
  KEY idx_contents_type (content_type),
  CONSTRAINT fk_contents_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS content_likes (
  content_id CHAR(36) NOT NULL,
  user_id    CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (content_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS content_favorites (
  id         CHAR(36)    NOT NULL PRIMARY KEY,
  user_id    CHAR(36)    NOT NULL,
  content_id CHAR(36)    NOT NULL,
  created_at DATETIME    NOT NULL,
  UNIQUE KEY uk_cf_user_content (user_id, content_id),
  KEY idx_cf_user (user_id),
  KEY idx_cf_content (content_id),
  CONSTRAINT fk_cf_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_cf_content FOREIGN KEY (content_id) REFERENCES contents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comments (
  id         CHAR(36)    NOT NULL PRIMARY KEY,
  content_id CHAR(36)    NOT NULL,
  user_id    CHAR(36)    NOT NULL,
  body       VARCHAR(1000) NOT NULL,
  created_at DATETIME    NOT NULL,
  KEY idx_comments_content (content_id),
  CONSTRAINT fk_comments_content FOREIGN KEY (content_id) REFERENCES contents (id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS review_tasks (
  id          CHAR(36)    NOT NULL PRIMARY KEY,
  content_id  CHAR(36)    NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reviewer_id CHAR(36)    NULL,
  reason      VARCHAR(255) NOT NULL DEFAULT '',
  created_at  DATETIME    NOT NULL,
  decided_at  DATETIME    NULL,
  KEY idx_review_status (status),
  CONSTRAINT fk_review_content FOREIGN KEY (content_id) REFERENCES contents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activities (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  organizer_id CHAR(36)     NOT NULL,
  title        VARCHAR(200) NOT NULL,
  description  MEDIUMTEXT   NOT NULL,
  category     VARCHAR(32)  NOT NULL DEFAULT 'fellowship',
  location     VARCHAR(200) NOT NULL DEFAULT '',
  city         VARCHAR(64)  NOT NULL DEFAULT '',
  start_at     DATETIME     NOT NULL,
  end_at       DATETIME     NULL,
  capacity     INT          NOT NULL DEFAULT 50,
  cover        VARCHAR(20)  NOT NULL DEFAULT '',
  status       VARCHAR(20)  NOT NULL DEFAULT 'published',
  created_at   DATETIME     NOT NULL,
  KEY idx_activities_start (start_at),
  CONSTRAINT fk_activities_organizer FOREIGN KEY (organizer_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 并发报名不变量:同一用户对同一活动只能有一条报名记录
CREATE TABLE IF NOT EXISTS activity_registrations (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  activity_id CHAR(36) NOT NULL,
  user_id     CHAR(36) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'confirmed', -- confirmed | waitlist | cancelled
  created_at  DATETIME NOT NULL,
  UNIQUE KEY uk_reg (activity_id, user_id),
  CONSTRAINT fk_reg_activity FOREIGN KEY (activity_id) REFERENCES activities (id) ON DELETE CASCADE,
  CONSTRAINT fk_reg_user     FOREIGN KEY (user_id)     REFERENCES users (id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `groups` (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL,
  category    VARCHAR(32)  NOT NULL DEFAULT 'fellowship',
  owner_id    CHAR(36)     NOT NULL,
  city        VARCHAR(64)  NOT NULL DEFAULT '',
  cover       VARCHAR(20)  NOT NULL DEFAULT '',
  created_at  DATETIME     NOT NULL,
  CONSTRAINT fk_groups_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS group_members (
  group_id  CHAR(36) NOT NULL,
  user_id   CHAR(36) NOT NULL,
  role      VARCHAR(20) NOT NULL DEFAULT 'member', -- owner | member
  joined_at DATETIME NOT NULL,
  PRIMARY KEY (group_id, user_id),
  CONSTRAINT fk_gm_group FOREIGN KEY (group_id) REFERENCES `groups` (id) ON DELETE CASCADE,
  CONSTRAINT fk_gm_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS group_posts (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  group_id   CHAR(36)     NOT NULL,
  user_id    CHAR(36)     NOT NULL,
  body       VARCHAR(2000) NOT NULL,
  created_at DATETIME     NOT NULL,
  KEY idx_gp_group (group_id),
  CONSTRAINT fk_gp_group FOREIGN KEY (group_id) REFERENCES `groups` (id) ON DELETE CASCADE,
  CONSTRAINT fk_gp_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prayers (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  body       VARCHAR(1000) NOT NULL,
  amen_count INT          NOT NULL DEFAULT 0,
  answered   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL,
  KEY idx_prayers_created (created_at),
  CONSTRAINT fk_prayers_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prayer_amens (
  prayer_id  CHAR(36) NOT NULL,
  user_id    CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (prayer_id, user_id),
  CONSTRAINT fk_amens_prayer  FOREIGN KEY (prayer_id) REFERENCES prayers (id) ON DELETE CASCADE,
  CONSTRAINT fk_amens_user    FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS follows (
  follower_id CHAR(36) NOT NULL,
  followee_id CHAR(36) NOT NULL,
  created_at  DATETIME NOT NULL,
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT fk_follow_follower FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_followee FOREIGN KEY (followee_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* 黑名单 / 屏蔽：屏蔽後不再出现在关注流、私信会话与公开推荐中 */
CREATE TABLE IF NOT EXISTS user_blocks (
  id         CHAR(36)    NOT NULL PRIMARY KEY,
  blocker_id CHAR(36)    NOT NULL,
  blocked_id CHAR(36)    NOT NULL,
  created_at DATETIME    NOT NULL,
  UNIQUE KEY uk_ub_blocker_blocked (blocker_id, blocked_id),
  KEY idx_ub_blocker (blocker_id),
  KEY idx_ub_blocked (blocked_id),
  CONSTRAINT fk_ub_blocker FOREIGN KEY (blocker_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_ub_blocked FOREIGN KEY (blocked_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  from_id    CHAR(36)     NOT NULL,
  to_id      CHAR(36)     NOT NULL,
  body       VARCHAR(2000) NOT NULL,
  `read`     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL,
  KEY idx_msg_pair (from_id, to_id),
  CONSTRAINT fk_msg_from FOREIGN KEY (from_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_to   FOREIGN KEY (to_id)   REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  type       VARCHAR(40)  NOT NULL,
  title      VARCHAR(200) NOT NULL,
  body       VARCHAR(500) NOT NULL,
  link       VARCHAR(255) NOT NULL DEFAULT '',
  `read`     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL,
  KEY idx_notif_user (user_id, `read`),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  actor_id    CHAR(36)     NULL,
  action      VARCHAR(80)  NOT NULL,
  entity_type VARCHAR(40)  NOT NULL DEFAULT '',
  entity_id   CHAR(36)     NOT NULL DEFAULT '',
  detail      VARCHAR(500) NOT NULL DEFAULT '',
  ip          VARCHAR(64)  NOT NULL DEFAULT '',
  created_at  DATETIME     NOT NULL,
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 事务性发件箱:事件先落库,再由派发器投递成通知
CREATE TABLE IF NOT EXISTS outbox (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  event_type  VARCHAR(60)  NOT NULL,
  payload     JSON         NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending | done | failed
  created_at  DATETIME     NOT NULL,
  processed_at DATETIME    NULL,
  KEY idx_outbox_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bible_verses (
  id      BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(16)  NOT NULL,
  book_id VARCHAR(32)  NOT NULL,
  chapter INT          NOT NULL,
  verse   INT          NOT NULL,
  text    VARCHAR(1000) NOT NULL,
  UNIQUE KEY uk_verse (version, book_id, chapter, verse),
  KEY idx_bible_text (text(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS songs (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  title        VARCHAR(200) NOT NULL,
  author       VARCHAR(120) NOT NULL DEFAULT '',
  category     VARCHAR(32)  NOT NULL DEFAULT '赞美',
  tags         VARCHAR(200) NOT NULL DEFAULT '',
  lyrics       MEDIUMTEXT   NOT NULL,
  audio_url    VARCHAR(255) NOT NULL DEFAULT '',
  -- 音频类型: vocal=真人演唱 / instrumental=纯伴奏(含合成) / none=暂无音频
  -- 平台优先展示 vocal, 见 /songs?audioType=vocal
  audio_type   VARCHAR(16)  NOT NULL DEFAULT 'none',
  -- 演唱者 + 授权来源说明, 如 "演唱:光盐诗班 / 已获教会授权" 或 "公有领域录音"
  audio_credit VARCHAR(255) NOT NULL DEFAULT '',
  -- 外部人声试听:平台不搬运版权音频,只登记"这首歌在哪儿能听到人声版"
  -- 留空时前台自动降级为按歌名去 B 站搜索,不会产生死链
  listen_url    VARCHAR(500) NOT NULL DEFAULT '',
  listen_source VARCHAR(40)  NOT NULL DEFAULT '',
  play_count   INT          NOT NULL DEFAULT 0,
  source       VARCHAR(20)  NOT NULL DEFAULT 'internal', -- internal|upload|external
  submitter_id CHAR(36)     NULL,                          -- 用户投稿时记录投稿人
  status       VARCHAR(20)  NOT NULL DEFAULT 'published', -- published|pending|rejected
  created_at   DATETIME     NOT NULL,
  KEY idx_songs_category (category),
  KEY idx_songs_status (status),
  KEY idx_songs_audio_type (audio_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================

-- =============================================================
--  补充功能表(V1.10 查漏补缺):圣经书签 / 读经历史 / 诗歌收藏 / 举报 / 活动签到
-- =============================================================

CREATE TABLE IF NOT EXISTS bible_bookmarks (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  version    VARCHAR(16)  NOT NULL DEFAULT 'cuv',
  book_id    VARCHAR(32)  NOT NULL,
  chapter    INT          NOT NULL,
  verse      INT          NOT NULL DEFAULT 0,   -- 0 表示整章书签
  note       VARCHAR(280) NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL,
  UNIQUE KEY uk_bm (user_id, version, book_id, chapter, verse),
  KEY idx_bm_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bible_reading_history (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  version    VARCHAR(16)  NOT NULL DEFAULT 'cuv',
  book_id    VARCHAR(32)  NOT NULL,
  chapter    INT          NOT NULL,
  read_date  DATE         NOT NULL,
  read_at    DATETIME     NOT NULL,
  UNIQUE KEY uk_rh (user_id, version, book_id, chapter, read_date),
  KEY idx_rh_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS song_favorites (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  song_id    CHAR(36)     NOT NULL,
  created_at DATETIME     NOT NULL,
  UNIQUE KEY uk_fav (user_id, song_id),
  KEY idx_fav_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reports (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  reporter_id CHAR(36)     NOT NULL,
  target_type VARCHAR(20)  NOT NULL,   -- content | comment | user | song
  target_id   CHAR(36)     NOT NULL,
  reason      VARCHAR(40)  NOT NULL,
  detail      VARCHAR(500) NOT NULL DEFAULT '',
  status      VARCHAR(20)  NOT NULL DEFAULT 'open',  -- open | dismissed | upheld
  handled_by  CHAR(36)     NULL,
  handled_at  DATETIME     NULL,
  created_at  DATETIME     NOT NULL,
  KEY idx_reports_status (status),
  KEY idx_reports_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_checkins (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  activity_id CHAR(36)     NOT NULL,
  user_id     CHAR(36)     NOT NULL,
  created_at  DATETIME     NOT NULL,
  UNIQUE KEY uk_ci (activity_id, user_id),
  KEY idx_ci_activity (activity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
--  补充功能表(V1.10 续):好友申请 friend_requests
-- =============================================================

CREATE TABLE IF NOT EXISTS friend_requests (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  requester_id CHAR(36)     NOT NULL,
  addressee_id CHAR(36)     NOT NULL,
  message      VARCHAR(280) NOT NULL DEFAULT '',
  status       VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | accepted | declined | cancelled
  created_at   DATETIME     NOT NULL,
  updated_at   DATETIME     NOT NULL,
  UNIQUE KEY uk_fr (requester_id, addressee_id),
  KEY idx_fr_addressee (addressee_id, status),
  KEY idx_fr_requester (requester_id, status),
  CONSTRAINT fk_fr_requester FOREIGN KEY (requester_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_fr_addressee FOREIGN KEY (addressee_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
--  补充功能表(V1.14):组织 / 媒体 / 通知模板 / 系统设置
-- =============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  name        VARCHAR(160) NOT NULL,
  type        VARCHAR(32)  NOT NULL DEFAULT 'church',   -- church | fellowship | ministry | charity
  description VARCHAR(500) NOT NULL DEFAULT '',
  city        VARCHAR(64)  NOT NULL DEFAULT '',
  region      VARCHAR(32)  NOT NULL DEFAULT 'CN',
  contact     VARCHAR(120) NOT NULL DEFAULT '',
  owner_id    CHAR(36)     NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at  DATETIME     NOT NULL,
  KEY idx_org_status (status),
  KEY idx_org_city (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS organization_members (
  org_id    CHAR(36)    NOT NULL,
  user_id   CHAR(36)    NOT NULL,
  role      VARCHAR(20) NOT NULL DEFAULT 'member',      -- owner | admin | member
  joined_at DATETIME    NOT NULL,
  PRIMARY KEY (org_id, user_id),
  CONSTRAINT fk_om_org  FOREIGN KEY (org_id)  REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_om_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS media_files (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  owner_id      CHAR(36)     NULL,
  file_name     VARCHAR(255) NOT NULL,
  title         VARCHAR(200) NOT NULL DEFAULT '',
  mime_type     VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
  extension     VARCHAR(20)  NOT NULL DEFAULT '',
  kind          VARCHAR(20)  NOT NULL DEFAULT 'image',   -- image | audio | video | score | doc
  size_bytes    BIGINT       NOT NULL DEFAULT 0,
  checksum      VARCHAR(128) NOT NULL DEFAULT '',
  storage_key   VARCHAR(255) NOT NULL DEFAULT '',
  status        VARCHAR(20)  NOT NULL DEFAULT 'ready',   -- ready | transcoding | failed | trashed | rejected
  review_status VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  review_reason VARCHAR(255) NOT NULL DEFAULT '',
  reviewed_by   CHAR(36)     NULL,
  reviewed_at   DATETIME     NULL,
  ref_count     INT          NOT NULL DEFAULT 0,
  play_count    INT          NOT NULL DEFAULT 0,
  duration_sec  INT          NULL,                        -- 音视频时长(秒);图片/曲谱/资料为 NULL
  poster_key    VARCHAR(255) NOT NULL DEFAULT '',         -- 视频封面(storage_key 同体系)
  description   TEXT         NULL,                       -- 媒体描述
  source        VARCHAR(20)  NOT NULL DEFAULT 'upload',  -- upload | live
  source_ref    CHAR(36)     NULL,                        -- 当 source=live 时,关联 live_rooms.id
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NULL,
  KEY idx_media_kind (kind),
  KEY idx_media_status (status),
  KEY idx_media_review (review_status),
  KEY idx_media_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 媒体处理任务(缩略图 / 转码 / 音频标准化 / 安全扫描)
CREATE TABLE IF NOT EXISTS media_processing_tasks (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  media_file_id CHAR(36)     NOT NULL,
  task_type     VARCHAR(40)  NOT NULL,                  -- thumbnail | transcode | audio_normalize | scan
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending',-- pending | running | done | failed
  attempts      INT          NOT NULL DEFAULT 0,
  error_message VARCHAR(500) NOT NULL DEFAULT '',
  output        VARCHAR(500) NOT NULL DEFAULT '',
  created_at    DATETIME     NOT NULL,
  finished_at   DATETIME     NULL,
  KEY idx_mpt_media (media_file_id),
  KEY idx_mpt_status (status),
  CONSTRAINT fk_mpt_media FOREIGN KEY (media_file_id) REFERENCES media_files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 内容与媒体关联(文章/见证可附带图片/视频/音乐/资料)
CREATE TABLE IF NOT EXISTS content_media (
  content_id    CHAR(36)    NOT NULL,
  media_file_id CHAR(36)    NOT NULL,
  media_role    VARCHAR(30) NOT NULL DEFAULT 'attachment', -- cover | attachment | audio | video
  sort_order    INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (content_id, media_file_id),
  KEY idx_cm_media (media_file_id),
  CONSTRAINT fk_cm_content FOREIGN KEY (content_id)    REFERENCES contents (id)    ON DELETE CASCADE,
  CONSTRAINT fk_cm_media   FOREIGN KEY (media_file_id) REFERENCES media_files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_templates (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  code        VARCHAR(64)  NOT NULL,
  channel     VARCHAR(20)  NOT NULL DEFAULT 'inapp',     -- inapp | push | email | sms
  title_tpl   VARCHAR(200) NOT NULL,
  body_tpl    VARCHAR(500) NOT NULL DEFAULT '',
  enabled     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL,
  UNIQUE KEY uk_nt_code_channel (code, channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  key_name   VARCHAR(64)  NOT NULL PRIMARY KEY,
  value      VARCHAR(500) NOT NULL DEFAULT '',
  label      VARCHAR(120) NOT NULL DEFAULT '',
  group_name VARCHAR(40)  NOT NULL DEFAULT 'general',    -- general | upload | notify | search
  updated_at DATETIME     NOT NULL,
  updated_by CHAR(36)     NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



/* ============================================================
   用户成长画像 & 动态上传配额(V1.14)
   ============================================================ */

-- 用户成长画像:按使用时长/使用次数/贡献/违规等计算信任分与等级
CREATE TABLE IF NOT EXISTS user_growth_profiles (
  user_id               CHAR(36)     NOT NULL PRIMARY KEY,
  account_age_days      INT          NOT NULL DEFAULT 0,  -- 注册天数
  active_days           INT          NOT NULL DEFAULT 0,  -- 累计活跃天数
  online_seconds        BIGINT       NOT NULL DEFAULT 0,  -- 累计在线时长(秒)
  visit_count           INT          NOT NULL DEFAULT 0,  -- 累计访问/会话次数
  action_count          INT          NOT NULL DEFAULT 0,  -- 累计互动操作数
  content_count         INT          NOT NULL DEFAULT 0,  -- 发布内容数
  approved_content_count INT         NOT NULL DEFAULT 0,  -- 已通过内容数
  media_count           INT          NOT NULL DEFAULT 0,  -- 上传媒体数
  approved_media_count  INT          NOT NULL DEFAULT 0,  -- 已通过媒体数
  rejected_media_count  INT          NOT NULL DEFAULT 0,  -- 被驳回媒体数
  checkin_days          INT          NOT NULL DEFAULT 0,  -- 签到天数
  friend_count          INT          NOT NULL DEFAULT 0,  -- 好友数
  comment_count         INT          NOT NULL DEFAULT 0,  -- 评论数
  like_received         INT          NOT NULL DEFAULT 0,  -- 获赞数
  violation_count       INT          NOT NULL DEFAULT 0,  -- 违规次数
  trust_score           INT          NOT NULL DEFAULT 0,  -- 信任分 0-100
  level                 INT          NOT NULL DEFAULT 0,  -- 成长等级
  level_name            VARCHAR(30)  NOT NULL DEFAULT '新朋友',
  storage_bytes         BIGINT       NOT NULL DEFAULT 0,  -- 已用存储(字节)
  computed_at           DATETIME     NULL,
  updated_at            DATETIME     NOT NULL,
  KEY idx_ugp_level (level),
  KEY idx_ugp_score (trust_score),
  CONSTRAINT fk_ugp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 每日活跃明细(在线时长 / 访问次数 / 操作数),画像的时长与次数来源
CREATE TABLE IF NOT EXISTS user_activity_daily (
  user_id        CHAR(36) NOT NULL,
  day            DATE     NOT NULL,
  online_seconds INT      NOT NULL DEFAULT 0,
  visit_count    INT      NOT NULL DEFAULT 0,
  action_count   INT      NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day),
  KEY idx_uad_day (day),
  CONSTRAINT fk_uad_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 配额策略(按成长等级,后台可调)
CREATE TABLE IF NOT EXISTS quota_policies (
  level             INT         NOT NULL PRIMARY KEY,
  name              VARCHAR(30) NOT NULL,
  min_score         INT         NOT NULL DEFAULT 0,
  max_video_mb      INT         NOT NULL DEFAULT 60,
  max_audio_mb      INT         NOT NULL DEFAULT 20,
  max_image_mb      INT         NOT NULL DEFAULT 5,
  max_doc_mb        INT         NOT NULL DEFAULT 10,
  max_video_seconds INT         NOT NULL DEFAULT 180,
  max_audio_seconds INT         NOT NULL DEFAULT 300,
  daily_uploads     INT         NOT NULL DEFAULT 3,
  daily_bytes       BIGINT      NOT NULL DEFAULT 104857600,
  total_bytes       BIGINT      NOT NULL DEFAULT 314572800,
  updated_at        DATETIME    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


/* ============================================================
   直播(LIVE)V1.15 —— 教会广播型:RTMP 推流 + HLS 网页观看
   ============================================================ */

-- 直播间:主播用 OBS/手机推 RTMP,会员网页看 HLS
CREATE TABLE IF NOT EXISTS live_rooms (
  id            CHAR(36)    NOT NULL PRIMARY KEY,
  title         VARCHAR(120) NOT NULL,
  description   TEXT        NULL,
  cover_url     VARCHAR(255) NULL,
  stream_key    VARCHAR(64) NOT NULL UNIQUE,    -- 推流路径名(随机,不可猜)
  publish_secret VARCHAR(64) NOT NULL,          -- 推流鉴权密码
  owner_id      CHAR(36)    NOT NULL,
  status        ENUM('created','live','ended') NOT NULL DEFAULT 'created',
  review_status VARCHAR(16)  NOT NULL DEFAULT 'approved',  -- pending(待审核) | approved(已通过) | rejected(已驳回)
  review_note   VARCHAR(255) NOT NULL DEFAULT '',          -- 审核备注(驳回原因等)
  review_video_id CHAR(36)   NULL,                          -- 普通用户申请开播时提交的"现场视频"审核材料(media_files.id)
  reviewed_by   CHAR(36)     NULL,                          -- 审核人 users.id
  scheduled_at  DATETIME     NULL,                          -- 约定开播时间(UTC,可空=随时)
  cancel_reason VARCHAR(255) NOT NULL DEFAULT '',            -- 非空=已被取消(创建人取消/管理员强制关闭)
  started_at    DATETIME    NULL,
  ended_at      DATETIME    NULL,
  viewer_peak   INT         NOT NULL DEFAULT 0,
  record_enabled    TINYINT(1)  NOT NULL DEFAULT 0,     -- 主播申请录像
  recording_media_id CHAR(36)   NULL,                  -- 录制成品的 media_files.id
  created_at    DATETIME    NOT NULL,
  updated_at    DATETIME    NOT NULL,
  KEY idx_lr_status (status),
  KEY idx_lr_owner (owner_id),
  KEY idx_lr_review (review_status),
  CONSTRAINT fk_lr_user FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* 幂等迁移:已存在的旧库补齐直播审核/约定时间/取消原因字段 */
SET @lr_scheduled_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'live_rooms' AND column_name = 'scheduled_at');
SET @lr_stmt = IF(@lr_scheduled_exists = 0,
  'ALTER TABLE live_rooms
     ADD COLUMN review_status VARCHAR(16) NOT NULL DEFAULT ''approved'' COMMENT ''pending|approved|rejected'' AFTER status,
     ADD COLUMN review_note VARCHAR(255) NOT NULL DEFAULT '''' AFTER review_status,
     ADD COLUMN review_video_id CHAR(36) NULL AFTER review_note,
     ADD COLUMN reviewed_by CHAR(36) NULL AFTER review_video_id,
     ADD COLUMN scheduled_at DATETIME NULL AFTER reviewed_by,
     ADD COLUMN cancel_reason VARCHAR(255) NOT NULL DEFAULT '''' AFTER scheduled_at,
     ADD KEY idx_lr_review (review_status)',
  'SELECT 1');
PREPARE lr_ps FROM @lr_stmt;
EXECUTE lr_ps;
DEALLOCATE PREPARE lr_ps;

-- 幂等迁移:旧库若已有 review 字段但缺 review_video_id,单独补列(不重建整表)
SET @lr_video_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'live_rooms' AND column_name = 'review_video_id');
SET @lr_video_stmt = IF(@lr_video_exists = 0,
  'ALTER TABLE live_rooms ADD COLUMN review_video_id CHAR(36) NULL AFTER review_note',
  'SELECT 1');
PREPARE lr_video_ps FROM @lr_video_stmt;
EXECUTE lr_video_ps;
DEALLOCATE PREPARE lr_video_ps;

-- 直播聊天消息
CREATE TABLE IF NOT EXISTS live_messages (
  id          CHAR(36)    NOT NULL PRIMARY KEY,
  room_id     CHAR(36)    NOT NULL,
  user_id     CHAR(36)    NULL,               -- 游客可为空,用 display_name
  display_name VARCHAR(60) NOT NULL,
  avatar_color VARCHAR(16) NULL,
  content     VARCHAR(500) NOT NULL,
  created_at  DATETIME    NOT NULL,
  KEY idx_lm_room (room_id, created_at),
  CONSTRAINT fk_lm_room FOREIGN KEY (room_id) REFERENCES live_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_lm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 在线观众心跳(用于实时在线人数)
CREATE TABLE IF NOT EXISTS live_viewers (
  room_id   CHAR(36) NOT NULL,
  session   VARCHAR(64) NOT NULL,
  last_seen DATETIME NOT NULL,
  PRIMARY KEY (room_id, session),
  KEY idx_lv_seen (last_seen),
  CONSTRAINT fk_lv_room FOREIGN KEY (room_id) REFERENCES live_rooms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 直播预约:用户预约开播提醒(开播时向预约者发站内/外部通知)
CREATE TABLE IF NOT EXISTS live_reminders (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  room_id     CHAR(36)     NOT NULL,
  user_id     CHAR(36)     NOT NULL,
  created_at  DATETIME     NOT NULL,
  UNIQUE KEY uk_lrem_room_user (room_id, user_id),
  KEY idx_lrem_user (user_id),
  CONSTRAINT fk_lrem_room FOREIGN KEY (room_id) REFERENCES live_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_lrem_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


/* ============================================================
   捐赠专区 V1.16 —— 自愿捐赠,用于维持平台平稳运行
   ------------------------------------------------------------
   透明度规则(核心约束):
   - 名录对外公开展示,但金额一律脱敏为 ****元;
   - 真实捐赠金额(amount_cents)仅管理员可见,且只在管理员接口返回;
   - 非管理员的任何接口响应中不包含真实金额字段;
   - 不按教会分区展示,统一以「个人捐赠」形态呈现;
     以教会名义捐赠时展示为「xxx教会 捐赠 ****元」。
   ============================================================ */

CREATE TABLE IF NOT EXISTS donations (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  donor_id     CHAR(36)     NULL,                        -- 关联用户(用户注销后置空,记录保留)
  display_name VARCHAR(64)  NOT NULL DEFAULT '',         -- 个人名义时的展示名(昵称)
  donor_type   VARCHAR(16)  NOT NULL DEFAULT 'personal', -- personal(个人) | church(教会名义)
  church_name  VARCHAR(120) NOT NULL DEFAULT '',         -- 教会名义时的教会名称
  amount_cents BIGINT       NOT NULL DEFAULT 0,          -- 金额(分),对外永不直接暴露
  message      VARCHAR(255) NOT NULL DEFAULT '',         -- 捐赠留言/祝福
  anonymous    TINYINT      NOT NULL DEFAULT 0,          -- 1=名录中匿名展示
  status       VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending(待确认) | confirmed(已确认) | rejected(已驳回)
  note         VARCHAR(255) NOT NULL DEFAULT '',         -- 管理员备注(如驳回原因)
  reviewed_by  CHAR(36)     NULL,
  reviewed_at  DATETIME     NULL,
  payment_method  VARCHAR(20) NOT NULL DEFAULT 'offline', -- offline(线下转账人工确认) | wechat | alipay | stripe
  out_trade_no    VARCHAR(64) NULL,                       -- 我方商户订单号(幂等键,唯一)
  transaction_id  VARCHAR(64) NULL,                       -- 网关流水号(对账用)
  paid_at         DATETIME   NULL,                        -- 支付网关确认到账时间(NULL=未线上支付)
  created_at   DATETIME     NOT NULL,
  KEY idx_donations_status (status),
  KEY idx_donations_created (created_at),
  KEY idx_donations_donor (donor_id),
  UNIQUE KEY uk_donations_out_trade_no (out_trade_no),
  CONSTRAINT fk_donations_user FOREIGN KEY (donor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


/* ============================================================
   支出公示 V1.17 —— 捐赠用在哪了,逐笔公开
   ------------------------------------------------------------
   透明度规则(与捐赠方向相反,注意区分):
   - 支出明细对所有人全额公开(真实金额),因为公示的
     意义就是让奉献者知道钱花在哪儿;
   - 公开接口只返回 published 状态的记录;
   - 捐赠收入总额依然仅管理员可见,公开页面只展示
     「收入 ****元 / 支出 ¥xxx」的结余口径。
   ============================================================ */

CREATE TABLE IF NOT EXISTS expenses (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  category     VARCHAR(20)  NOT NULL DEFAULT 'other',     -- server(服务器) | bandwidth(带宽/CDN) | storage(存储) | ops(运维人力) | domain(域名证书) | other(其他)
  title        VARCHAR(120) NOT NULL DEFAULT '',          -- 支出事项(如「3月云服务器续费」)
  note         VARCHAR(500) NOT NULL DEFAULT '',          -- 说明/凭证备注
  amount_cents BIGINT       NOT NULL DEFAULT 0,           -- 支出金额(分),公开
  period       CHAR(7)      NOT NULL DEFAULT '',          -- 归属月份 YYYY-MM,用于按月汇总
  status       VARCHAR(20)  NOT NULL DEFAULT 'published', -- published(已公示) | hidden(暂不公示,如账单未出)
  created_by   CHAR(36)     NULL,
  created_at   DATETIME     NOT NULL,
  KEY idx_expenses_status (status),
  KEY idx_expenses_period (period),
  KEY idx_expenses_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ==================== 通知偏好 / 外发队列 / 微信绑定 ==================== */

-- 用户通知偏好(每个用户一条;不存在的行 = 使用默认值)
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id            CHAR(36)     NOT NULL PRIMARY KEY,
  inapp              TINYINT(1)   NOT NULL DEFAULT 1,   -- 站内通知
  email              TINYINT(1)   NOT NULL DEFAULT 0,   -- 邮件
  wechat             TINYINT(1)   NOT NULL DEFAULT 0,   -- 微信服务号/订阅通知
  sms                TINYINT(1)   NOT NULL DEFAULT 0,   -- 短信(付费,默认关)
  quiet_enabled      TINYINT(1)   NOT NULL DEFAULT 0,   -- 免打扰开关
  quiet_from         VARCHAR(5)   NOT NULL DEFAULT '22:00',
  quiet_to           VARCHAR(5)   NOT NULL DEFAULT '08:00',
  digest             VARCHAR(20)  NOT NULL DEFAULT 'realtime', -- realtime | daily | off
  remind_enabled     TINYINT(1)   NOT NULL DEFAULT 0,   -- 每日灵修/读经提醒总开关
  remind_read_at     VARCHAR(5)   NOT NULL DEFAULT '06:30',  -- 每日读经提醒时间 HH:mm
  remind_devotion_at VARCHAR(5)   NOT NULL DEFAULT '21:30',  -- 每日灵修提醒时间 HH:mm
  remind_read_done   DATE         NULL,                      -- 上次发出读经提醒的日期(幂等,一天只发一次)
  remind_devotion_done DATE       NULL,                      -- 上次发出灵修提醒的日期
  updated_at         DATETIME     NOT NULL,
  CONSTRAINT fk_np_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 外发任务队列(站内已写 notifications;这里只记录需要投递到外部通道的作业)
CREATE TABLE IF NOT EXISTS notify_jobs (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  user_id      CHAR(36)     NOT NULL,
  channel      VARCHAR(20)  NOT NULL,          -- email | wechat | sms
  kind         VARCHAR(40)  NOT NULL DEFAULT '',  -- 通知类型,如 content_approved
  title        VARCHAR(200) NOT NULL,
  body         VARCHAR(500) NOT NULL DEFAULT '',
  link         VARCHAR(255) NOT NULL DEFAULT '',
  to_addr      VARCHAR(255) NOT NULL DEFAULT '',  -- 邮箱 / openid / 手机号
  status       VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  reason       VARCHAR(255) NOT NULL DEFAULT '',  -- skipped/failed 原因
  attempts     INT          NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL,
  processed_at DATETIME     NULL,
  KEY idx_nj_status (status, created_at),
  KEY idx_nj_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 微信绑定令牌:二维码 scene 携带,扫码关注后通过 openid+scene 完成账号对齐
CREATE TABLE IF NOT EXISTS wechat_bind_tokens (
  token        VARCHAR(64)  NOT NULL PRIMARY KEY,
  user_id      CHAR(36)     NOT NULL,
  scene        VARCHAR(64)  NOT NULL,          -- 带参二维码场景值(回调回传)
  status       VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending | bound | expired
  openid       VARCHAR(64)  NOT NULL DEFAULT '',
  expires_at   DATETIME     NOT NULL,
  created_at   DATETIME     NOT NULL,
  bound_at     DATETIME     NULL,
  UNIQUE KEY uk_wbt_scene (scene),
  KEY idx_wbt_user (user_id, status),
  CONSTRAINT fk_wbt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 读经计划打卡: 计划内容为内置静态配置(src/lib/readingPlans.ts), 此表只记用户每天的完成情况
CREATE TABLE IF NOT EXISTS reading_plan_progress (
  id         CHAR(36)    NOT NULL PRIMARY KEY,
  user_id    CHAR(36)    NOT NULL,
  plan_id    VARCHAR(64) NOT NULL,
  day        INT         NOT NULL,
  done_at    DATETIME    NOT NULL,
  UNIQUE KEY uk_rpp_user_plan_day (user_id, plan_id, day),
  KEY idx_rpp_user_plan (user_id, plan_id),
  CONSTRAINT fk_rpp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 读经计划报名: 用户"加入"某计划后才参与真实读经的自动打卡(避免读任意章节被静默计入未选计划)。
-- 已存在 reading_plan_progress 的也视为已加入(兼容升级前数据)。
CREATE TABLE IF NOT EXISTS reading_plan_enrollment (
  user_id     CHAR(36)    NOT NULL,
  plan_id     VARCHAR(64) NOT NULL,
  enrolled_at DATETIME    NOT NULL,
  PRIMARY KEY (user_id, plan_id),
  KEY idx_rpe_user (user_id),
  CONSTRAINT fk_rpe_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 每日签到(站点级, 与线下活动的 activity_checkins 区分): 连续天数驱动留存
CREATE TABLE IF NOT EXISTS user_daily_checkins (
  user_id    CHAR(36)  NOT NULL,
  day        DATE      NOT NULL,
  streak     INT       NOT NULL DEFAULT 1,     -- 签到当天算出的连续天数(冗余,便于展示历史)
  created_at DATETIME  NOT NULL,
  PRIMARY KEY (user_id, day),
  KEY idx_udc_day (day),
  CONSTRAINT fk_udc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 邀请关系: 一个被邀请人只能归属一个邀请人(防刷)
CREATE TABLE IF NOT EXISTS user_invites (
  inviter_id  CHAR(36)    NOT NULL,
  invitee_id  CHAR(36)    NOT NULL,
  created_at  DATETIME    NOT NULL,
  rewarded    TINYINT(1)  NOT NULL DEFAULT 0,  -- 双方成长奖励是否已发放
  PRIMARY KEY (invitee_id),
  KEY idx_ui_inviter (inviter_id),
  CONSTRAINT fk_ui_inviter FOREIGN KEY (inviter_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_ui_invitee FOREIGN KEY (invitee_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 新用户引导: 记录清单完成进度, 服务端持久化(换设备/清缓存不丢)
CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id     CHAR(36)      NOT NULL PRIMARY KEY,
  done        TEXT          NULL,               -- JSON 数组, 已完成步骤 key
  dismissed   TINYINT(1)    NOT NULL DEFAULT 0, -- 用户手动关闭后不再展示
  updated_at  DATETIME      NOT NULL,
  CONSTRAINT fk_uo_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
--  平台建议 / 需求反馈: 用户提交, 仅管理员可见（用于了解使用者需求）
-- =============================================================

CREATE TABLE IF NOT EXISTS platform_feedback (
  id          CHAR(36)      NOT NULL PRIMARY KEY,
  user_id     CHAR(36)      NULL,                       -- 匿名提交时为 NULL
  category    VARCHAR(30)   NOT NULL DEFAULT 'idea',    -- idea | bug | content | ux | other
  content     VARCHAR(1000) NOT NULL,
  contact     VARCHAR(120)  NOT NULL DEFAULT '',        -- 选填, 便于回访
  page_url    VARCHAR(255)  NOT NULL DEFAULT '',        -- 提交时所在页面, 便于复现问题
  status      VARCHAR(20)   NOT NULL DEFAULT 'new',     -- new | processing | done | rejected
  admin_reply VARCHAR(1000) NOT NULL DEFAULT '',
  handled_by  CHAR(36)      NULL,
  handled_at  DATETIME      NULL,
  created_at  DATETIME      NOT NULL,
  KEY idx_pf_status (status),
  KEY idx_pf_user (user_id),
  KEY idx_pf_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
--  模块审核员体系 V1.18 —— 分模块治理 + 管理层专属私信
--  ------------------------------------------------------------
--  权限等级:管理员(admin) > 模块审核员(moderator + scope) > 普通成员(member)
--   - admin     : 全部模块 + 系统治理权(用户封禁/团契解散移交/财务/系统设置/权限分配)
--   - moderator : 能力严格等于本表登记的模块,一人可兼任多个模块
--   - 联动规则  : 分配首个模块时 member->moderator;撤销最后一个模块时 moderator->member
--   - staff_messages 是**管理层专属**私信通道,与普通用户私信(messages)完全隔离,
--     普通成员既没有入口,接口层也一律 403。
-- =============================================================

CREATE TABLE IF NOT EXISTS moderator_scopes (
  user_id     CHAR(36)    NOT NULL,
  module      VARCHAR(32) NOT NULL,   -- prayers|contents|comments|songs|media|live|activities|organizations|groups|reports|feedback
  assigned_by CHAR(36)    NULL,
  assigned_at DATETIME    NOT NULL,
  PRIMARY KEY (user_id, module),
  KEY idx_ms_module (module),
  CONSTRAINT fk_ms_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS staff_messages (
  id         CHAR(36)      NOT NULL PRIMARY KEY,
  from_id    CHAR(36)      NOT NULL,
  to_id      CHAR(36)      NOT NULL,
  body       VARCHAR(2000) NOT NULL,
  `read`     TINYINT(1)    NOT NULL DEFAULT 0,
  created_at DATETIME      NOT NULL,
  KEY idx_sm_pair (from_id, to_id),
  KEY idx_sm_created (created_at),
  CONSTRAINT fk_sm_from FOREIGN KEY (from_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_to   FOREIGN KEY (to_id)   REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 灵修日记：个人与神独处时的默想记录，默认仅自己可见（区别于公开的 prayers 代祷墙）。
-- 运行时会再由 ensureDevotionalsTable() 幂等补建一次，兼容升级前已存在的库。
CREATE TABLE IF NOT EXISTS devotionals (
  id         CHAR(36)      NOT NULL PRIMARY KEY,
  user_id    CHAR(36)      NOT NULL,
  title      VARCHAR(120)  NOT NULL DEFAULT '',
  body       TEXT          NOT NULL,
  ref        VARCHAR(120)  NOT NULL DEFAULT '',   -- 关联经文，如「诗篇 23:1-6」
  mood       VARCHAR(16)   NOT NULL DEFAULT '',   -- 可选心情：感恩/认罪/祈求/赞美/安静/争战
  created_at DATETIME      NOT NULL,
  updated_at DATETIME      NOT NULL,
  KEY idx_dev_user_created (user_id, created_at),
  CONSTRAINT fk_dev_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
