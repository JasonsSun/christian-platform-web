import { q, one, exec, ts } from './db';
import { HttpError } from './http';
import { mediaKindLabel } from '@/lib/labels';
import { formatDuration } from '@/lib/format';

/**
 * 用户成长画像 + 动态上传配额
 *
 * 设计目标:
 *  1) 新注册用户默认只能传很小的文件、很短的视频,防止"挤爆"磁盘与带宽;
 *  2) 随着「在线时长 / 使用次数 / 内容贡献 / 审核通过率」提升,信任分上升、等级提升,
 *     单文件大小、视频/音乐最长时长、每日次数、总存储配额同步放开;
 *  3) 被驳回/违规会扣分,配额随之收紧;
 *  4) 所有阈值落在 quota_policies 表,管理员可在后台实时调整,无需改代码。
 */

export const MB = 1024 * 1024;

export type MediaKind = 'image' | 'audio' | 'video' | 'score' | 'doc';

export interface QuotaPolicy {
  level: number;
  name: string;
  minScore: number;
  maxVideoMb: number;
  maxAudioMb: number;
  maxImageMb: number;
  maxDocMb: number;
  maxVideoSeconds: number;
  maxAudioSeconds: number;
  dailyUploads: number;
  dailyBytes: number;
  totalBytes: number;
}

/** 内置默认策略(首次运行时落库) */
export const DEFAULT_POLICIES: QuotaPolicy[] = [
  {
    level: 0, name: '新朋友', minScore: 0,
    maxVideoMb: 60, maxAudioMb: 20, maxImageMb: 5, maxDocMb: 10,
    maxVideoSeconds: 180, maxAudioSeconds: 300,
    dailyUploads: 3, dailyBytes: 120 * MB, totalBytes: 300 * MB,
  },
  {
    level: 1, name: '慕道友', minScore: 20,
    maxVideoMb: 150, maxAudioMb: 40, maxImageMb: 8, maxDocMb: 20,
    maxVideoSeconds: 600, maxAudioSeconds: 900,
    dailyUploads: 6, dailyBytes: 400 * MB, totalBytes: 1024 * MB,
  },
  {
    level: 2, name: '会友', minScore: 40,
    maxVideoMb: 300, maxAudioMb: 80, maxImageMb: 10, maxDocMb: 40,
    maxVideoSeconds: 1800, maxAudioSeconds: 1800,
    dailyUploads: 12, dailyBytes: 1024 * MB, totalBytes: 5 * 1024 * MB,
  },
  {
    level: 3, name: '热心会友', minScore: 60,
    maxVideoMb: 600, maxAudioMb: 150, maxImageMb: 15, maxDocMb: 80,
    maxVideoSeconds: 3600, maxAudioSeconds: 3600,
    dailyUploads: 20, dailyBytes: 2 * 1024 * MB, totalBytes: 20 * 1024 * MB,
  },
  {
    level: 4, name: '同工', minScore: 80,
    maxVideoMb: 1500, maxAudioMb: 300, maxImageMb: 25, maxDocMb: 150,
    maxVideoSeconds: 7200, maxAudioSeconds: 7200,
    dailyUploads: 40, dailyBytes: 5 * 1024 * MB, totalBytes: 50 * 1024 * MB,
  },
  {
    level: 5, name: '长老', minScore: 95,
    maxVideoMb: 4000, maxAudioMb: 600, maxImageMb: 50, maxDocMb: 300,
    maxVideoSeconds: 14400, maxAudioSeconds: 14400,
    dailyUploads: 100, dailyBytes: 20 * 1024 * MB, totalBytes: 200 * 1024 * MB,
  },
];

/* ---------------- 策略读写 ---------------- */

export async function ensurePolicies(): Promise<QuotaPolicy[]> {
  const rows = await q<QuotaPolicy & { min_score: number }>(
    `SELECT level, name, min_score,
            max_video_mb, max_audio_mb, max_image_mb, max_doc_mb,
            max_video_seconds, max_audio_seconds, daily_uploads, daily_bytes, total_bytes
       FROM quota_policies ORDER BY level`
  );
  if (rows.length) {
    return rows.map((r: any) => ({
      level: Number(r.level), name: r.name, minScore: Number(r.min_score ?? r.minScore),
      maxVideoMb: Number(r.max_video_mb), maxAudioMb: Number(r.max_audio_mb),
      maxImageMb: Number(r.max_image_mb), maxDocMb: Number(r.max_doc_mb),
      maxVideoSeconds: Number(r.max_video_seconds), maxAudioSeconds: Number(r.max_audio_seconds),
      dailyUploads: Number(r.daily_uploads),
      dailyBytes: Number(r.daily_bytes), totalBytes: Number(r.total_bytes),
    }));
  }
  for (const p of DEFAULT_POLICIES) {
    await exec(
      `INSERT INTO quota_policies
         (level, name, min_score, max_video_mb, max_audio_mb, max_image_mb, max_doc_mb,
          max_video_seconds, max_audio_seconds, daily_uploads, daily_bytes, total_bytes, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name)`,
      [p.level, p.name, p.minScore, p.maxVideoMb, p.maxAudioMb, p.maxImageMb, p.maxDocMb,
        p.maxVideoSeconds, p.maxAudioSeconds, p.dailyUploads, p.dailyBytes, p.totalBytes, ts()]
    );
  }
  return DEFAULT_POLICIES;
}

export function levelFor(score: number, policies: QuotaPolicy[]): QuotaPolicy {
  let cur = policies[0];
  for (const p of policies) if (score >= p.minScore) cur = p;
  return cur;
}

/* ---------------- 画像计算 ---------------- */

export interface GrowthProfile {
  userId: string;
  accountAgeDays: number;
  activeDays: number;
  onlineSeconds: number;
  visitCount: number;
  actionCount: number;
  contentCount: number;
  approvedContentCount: number;
  mediaCount: number;
  approvedMediaCount: number;
  rejectedMediaCount: number;
  checkinDays: number;
  friendCount: number;
  commentCount: number;
  likeReceived: number;
  violationCount: number;
  trustScore: number;
  level: number;
  levelName: string;
  storageBytes: number;
}

interface RawMetrics {
  account_age_days: number; active_days: number; online_seconds: number;
  visit_count: number; action_count: number;
  content_count: number; approved_content_count: number;
  media_count: number; approved_media_count: number; rejected_media_count: number;
  checkin_days: number; friend_count: number; comment_count: number;
  like_received: number; violation_count: number; storage_bytes: number;
  role: string; status: string;
}

const n = (v: any) => Number(v || 0);

/** 信任分:在线时长 25 + 活跃天数 20 + 使用次数 15 + 内容贡献 15 + 媒体通过 10 + 签到 10 + 好友 5 + 获赞 5 - 违规 */
export function scoreOf(m: RawMetrics): number {
  const onlinePts = Math.min(25, Math.floor(n(m.online_seconds) / 600));      // 每 10 分钟 1 分
  const activePts = Math.min(20, n(m.active_days) * 2);                       // 每天 2 分
  const actionPts = Math.min(15, Math.floor(n(m.action_count) / 10));         // 每 10 次操作 1 分
  const contentPts = Math.min(15, n(m.approved_content_count) * 3);           // 每篇已发布 3 分
  const mediaPts = Math.min(10, n(m.approved_media_count));                   // 每个通过媒体 1 分
  const checkinPts = Math.min(10, Math.floor(n(m.checkin_days) * 0.5));       // 每 2 天签到 1 分
  const friendPts = Math.min(5, Math.floor(n(m.friend_count) * 0.5));
  const likePts = Math.min(5, Math.floor(n(m.like_received) / 5));
  const penalty = n(m.rejected_media_count) * 2 + n(m.violation_count) * 8;
  const score = onlinePts + activePts + actionPts + contentPts + mediaPts + checkinPts + friendPts + likePts - penalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function fetchMetrics(userId: string): Promise<RawMetrics | null> {
  return await one<RawMetrics>(
    `SELECT
       DATEDIFF(NOW(), u.created_at)                                                   AS account_age_days,
       (SELECT COUNT(DISTINCT d.day) FROM user_activity_daily d WHERE d.user_id = u.id) AS active_days,
       (SELECT IFNULL(SUM(d.online_seconds),0) FROM user_activity_daily d WHERE d.user_id = u.id) AS online_seconds,
       (SELECT IFNULL(SUM(d.visit_count),0)    FROM user_activity_daily d WHERE d.user_id = u.id) AS visit_count,
       (SELECT IFNULL(SUM(d.action_count),0)   FROM user_activity_daily d WHERE d.user_id = u.id) AS action_count,
       (SELECT COUNT(*) FROM contents c WHERE c.author_id = u.id)                       AS content_count,
       (SELECT COUNT(*) FROM contents c WHERE c.author_id = u.id AND c.status='published') AS approved_content_count,
       (SELECT COUNT(*) FROM media_files m WHERE m.owner_id = u.id)                     AS media_count,
       (SELECT COUNT(*) FROM media_files m WHERE m.owner_id = u.id AND m.review_status='approved') AS approved_media_count,
       (SELECT COUNT(*) FROM media_files m WHERE m.owner_id = u.id AND m.review_status='rejected') AS rejected_media_count,
       (SELECT COUNT(*) FROM activity_checkins k WHERE k.user_id = u.id)                AS checkin_days,
       (SELECT COUNT(*) FROM friend_requests f
          WHERE f.status='accepted' AND (f.requester_id = u.id OR f.addressee_id = u.id)) AS friend_count,
       (SELECT COUNT(*) FROM comments cm WHERE cm.user_id = u.id)                       AS comment_count,
       (SELECT COUNT(*) FROM content_likes l JOIN contents c2 ON c2.id = l.content_id
          WHERE c2.author_id = u.id)                                                    AS like_received,
       (SELECT COUNT(*) FROM reports rp WHERE rp.status='upheld' AND rp.target_type='content'
          AND rp.target_id IN (SELECT id FROM contents WHERE author_id = u.id))          AS violation_count,
       (SELECT IFNULL(SUM(m.size_bytes),0) FROM media_files m WHERE m.owner_id = u.id)  AS storage_bytes,
       u.role, u.status
     FROM users u WHERE u.id = ?`,
    [userId]
  );
}

/** 重算并写入画像(管理员/上传前后调用) */
export async function recomputeProfile(userId: string): Promise<GrowthProfile> {
  const m = await fetchMetrics(userId);
  if (!m) throw new HttpError(404, 'NOT_FOUND', '用户不存在');
  const policies = await ensurePolicies();
  const score = scoreOf(m);
  const policy = levelFor(score, policies);
  // 管理员/审核员直接给到最高等级,避免内部协作被配额卡住
  const isStaff = m.role === 'admin' || m.role === 'moderator';
  const finalLevel = isStaff ? policies[policies.length - 1].level : policy.level;
  const finalName = isStaff ? policies[policies.length - 1].name : policy.name;

  await exec(
    `INSERT INTO user_growth_profiles
       (user_id, account_age_days, active_days, online_seconds, visit_count, action_count,
        content_count, approved_content_count, media_count, approved_media_count, rejected_media_count,
        checkin_days, friend_count, comment_count, like_received, violation_count,
        trust_score, level, level_name, storage_bytes, computed_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       account_age_days=VALUES(account_age_days), active_days=VALUES(active_days),
       online_seconds=VALUES(online_seconds), visit_count=VALUES(visit_count),
       action_count=VALUES(action_count), content_count=VALUES(content_count),
       approved_content_count=VALUES(approved_content_count), media_count=VALUES(media_count),
       approved_media_count=VALUES(approved_media_count), rejected_media_count=VALUES(rejected_media_count),
       checkin_days=VALUES(checkin_days), friend_count=VALUES(friend_count),
       comment_count=VALUES(comment_count), like_received=VALUES(like_received),
       violation_count=VALUES(violation_count), trust_score=VALUES(trust_score),
       level=VALUES(level), level_name=VALUES(level_name), storage_bytes=VALUES(storage_bytes),
       computed_at=VALUES(computed_at), updated_at=VALUES(updated_at)`,
    [userId, n(m.account_age_days), n(m.active_days), n(m.online_seconds), n(m.visit_count), n(m.action_count),
      n(m.content_count), n(m.approved_content_count), n(m.media_count), n(m.approved_media_count),
      n(m.rejected_media_count), n(m.checkin_days), n(m.friend_count), n(m.comment_count),
      n(m.like_received), n(m.violation_count), score, finalLevel, finalName, n(m.storage_bytes), ts(), ts()]
  );
  return profileOf(userId, m, score, finalLevel, finalName);
}

function profileOf(userId: string, m: RawMetrics, score: number, level: number, levelName: string): GrowthProfile {
  return {
    userId,
    accountAgeDays: n(m.account_age_days),
    activeDays: n(m.active_days),
    onlineSeconds: n(m.online_seconds),
    visitCount: n(m.visit_count),
    actionCount: n(m.action_count),
    contentCount: n(m.content_count),
    approvedContentCount: n(m.approved_content_count),
    mediaCount: n(m.media_count),
    approvedMediaCount: n(m.approved_media_count),
    rejectedMediaCount: n(m.rejected_media_count),
    checkinDays: n(m.checkin_days),
    friendCount: n(m.friend_count),
    commentCount: n(m.comment_count),
    likeReceived: n(m.like_received),
    violationCount: n(m.violation_count),
    trustScore: score,
    level, levelName,
    storageBytes: n(m.storage_bytes),
  };
}

async function readProfile(userId: string): Promise<GrowthProfile | null> {
  return await one<any>(
    `SELECT p.*, u.role FROM user_growth_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?`,
    [userId]
  ).then((r) => (r ? {
    userId,
    accountAgeDays: n(r.account_age_days), activeDays: n(r.active_days),
    onlineSeconds: n(r.online_seconds), visitCount: n(r.visit_count), actionCount: n(r.action_count),
    contentCount: n(r.content_count), approvedContentCount: n(r.approved_content_count),
    mediaCount: n(r.media_count), approvedMediaCount: n(r.approved_media_count),
    rejectedMediaCount: n(r.rejected_media_count), checkinDays: n(r.checkin_days),
    friendCount: n(r.friend_count), commentCount: n(r.comment_count),
    likeReceived: n(r.like_received), violationCount: n(r.violation_count),
    trustScore: n(r.trust_score), level: n(r.level), levelName: r.level_name,
    storageBytes: n(r.storage_bytes),
  } : null));
}

/* ---------------- 用量 ---------------- */

interface Usage { todayCount: number; todayBytes: number; totalBytes: number; }

async function usageOf(userId: string): Promise<Usage> {
  const r = await one<any>(
    `SELECT
       (SELECT COUNT(*) FROM media_files WHERE owner_id=? AND created_at >= CURDATE()) AS today_count,
       (SELECT IFNULL(SUM(size_bytes),0) FROM media_files WHERE owner_id=? AND created_at >= CURDATE()) AS today_bytes,
       (SELECT IFNULL(SUM(size_bytes),0) FROM media_files WHERE owner_id=?) AS total_bytes`,
    [userId, userId, userId]
  );
  return {
    todayCount: n(r?.today_count),
    todayBytes: n(r?.today_bytes),
    totalBytes: n(r?.total_bytes),
  };
}

/* ---------------- 对外:配额视图 ---------------- */

export interface QuotaView {
  level: number;
  levelName: string;
  trustScore: number;
  policy: QuotaPolicy;
  next?: { level: number; name: string; minScore: number; gap: number; gains: string };
  usage: Usage & { dailyBytesLimit: number; totalBytesLimit: number; remainingTotal: number };
  limits: { image: number; audio: number; video: number; doc: number; videoSeconds: number; audioSeconds: number };
  profile: GrowthProfile | null;
}

export async function getQuota(userId: string, refresh = false): Promise<QuotaView> {
  const policies = await ensurePolicies();
  let profile = refresh ? null : await readProfile(userId);
  if (!profile || refresh) profile = await recomputeProfile(userId);
  const policy = policies.find((p) => p.level === profile!.level) || levelFor(profile!.trustScore, policies);
  const usage = await usageOf(userId);
  const next = policies.find((p) => p.level === profile!.level + 1);
  const gap = next ? Math.max(0, next.minScore - profile!.trustScore) : 0;

  return {
    level: profile!.level,
    levelName: profile!.levelName || policy.name,
    trustScore: profile!.trustScore,
    policy,
    next: next ? { level: next.level, name: next.name, minScore: next.minScore, gap, gains: gainText(next, policy) } : undefined,
    usage: {
      ...usage,
      dailyBytesLimit: policy.dailyBytes,
      totalBytesLimit: policy.totalBytes,
      remainingTotal: Math.max(0, policy.totalBytes - usage.totalBytes),
    },
    limits: {
      image: policy.maxImageMb * MB,
      audio: policy.maxAudioMb * MB,
      video: policy.maxVideoMb * MB,
      doc: policy.maxDocMb * MB,
      videoSeconds: policy.maxVideoSeconds,
      audioSeconds: policy.maxAudioSeconds,
    },
    profile,
  };
}

function gainText(next: QuotaPolicy, cur: QuotaPolicy): string {
  const parts: string[] = [];
  if (next.maxVideoSeconds > cur.maxVideoSeconds) {
    parts.push(`视频时长 ${formatDuration(cur.maxVideoSeconds)}→${formatDuration(next.maxVideoSeconds)}`);
  }
  if (next.maxVideoMb > cur.maxVideoMb) parts.push(`单视频 ${cur.maxVideoMb}MB→${next.maxVideoMb}MB`);
  if (next.maxAudioSeconds > cur.maxAudioSeconds) {
    parts.push(`音频时长 ${formatDuration(cur.maxAudioSeconds)}→${formatDuration(next.maxAudioSeconds)}`);
  }
  if (next.dailyUploads > cur.dailyUploads) parts.push(`每日 ${cur.dailyUploads}→${next.dailyUploads} 个`);
  return parts.join('，') || '更多权益';
}

/* ---------------- 对外:上传前校验 ---------------- */

export function maxBytesFor(kind: MediaKind, p: QuotaPolicy): number {
  switch (kind) {
    case 'video': return p.maxVideoMb * MB;
    case 'audio': return p.maxAudioMb * MB;
    case 'image': return p.maxImageMb * MB;
    default: return p.maxDocMb * MB;
  }
}

/** 校验单文件大小 / 每日次数 / 每日流量 / 总存储,超限时抛 HttpError */
export async function assertUploadAllowed(userId: string, kind: MediaKind, sizeBytes: number) {
  const view = await getQuota(userId);
  const p = view.policy;
  const limit = maxBytesFor(kind, p);
  if (sizeBytes > limit) {
    throw new HttpError(413, 'QUOTA_FILE_TOO_LARGE',
      `当前等级「${view.levelName}」单个${mediaKindLabel(kind)}不能超过 ${(limit / MB).toFixed(0)}MB（` +
      `本文件 ${(sizeBytes / MB).toFixed(1)}MB）。提升信任分可解锁更大文件。`);
  }
  if (view.usage.todayCount >= p.dailyUploads) {
    throw new HttpError(429, 'QUOTA_DAILY_LIMIT',
      `今日上传次数已达上限（${p.dailyUploads} 个），明天再来，或通过发布内容提升等级。`);
  }
  if (view.usage.todayBytes + sizeBytes > p.dailyBytes) {
    throw new HttpError(429, 'QUOTA_DAILY_BYTES',
      `今日上传流量已达上限（${(p.dailyBytes / MB).toFixed(0)}MB），请明天再试。`);
  }
  if (view.usage.totalBytes + sizeBytes > p.totalBytes) {
    throw new HttpError(413, 'QUOTA_TOTAL_BYTES',
      `存储空间已达上限（${(p.totalBytes / MB).toFixed(0)}MB）。清理旧文件或提升等级后可继续上传。`);
  }
  return view;
}

/** 校验音视频时长(需用 ffmpeg 探测后再调用) */
export function assertDurationAllowed(kind: MediaKind, durationSec: number, view: QuotaView) {
  const limit = kind === 'video' ? view.policy.maxVideoSeconds : view.policy.maxAudioSeconds;
  if (durationSec > limit) {
    throw new HttpError(413, 'QUOTA_DURATION_EXCEEDED',
      `当前等级「${view.levelName}」的${mediaKindLabel(kind)}最长 ${formatDuration(limit)}，` +
      `本文件 ${formatDuration(durationSec)}。继续使用或发布内容即可解锁更长时长。`);
  }
}

/* ---------------- 活跃上报 ---------------- */

/** 记录在线时长 / 访问 / 操作次数(由前端心跳上报) */
export async function recordActivity(userId: string, seconds: number, visits = 0, actions = 0) {
  const s = Math.max(0, Math.min(300, Math.floor(seconds)));
  if (s <= 0 && visits <= 0 && actions <= 0) return;
  await exec(
    `INSERT INTO user_activity_daily (user_id, day, online_seconds, visit_count, action_count)
     VALUES (?, CURDATE(), ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       online_seconds = online_seconds + VALUES(online_seconds),
       visit_count    = visit_count    + VALUES(visit_count),
       action_count   = action_count   + VALUES(action_count)`,
    [userId, s, Math.max(0, Math.floor(visits)), Math.max(0, Math.floor(actions))]
  );
}

/** 媒体被驳回:累加违规计数,下次重算时降级 */
export async function penalizeRejectedMedia(ownerId: string) {
  await exec(
    `UPDATE user_growth_profiles SET violation_count = violation_count + 1, updated_at=? WHERE user_id=?`,
    [ts(), ownerId]
  );
}
