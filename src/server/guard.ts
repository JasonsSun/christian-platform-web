import { NextRequest } from 'next/server';
import { clientIp } from './http';
import { rateLimitAsync } from './ratelimit';
import { HttpError } from './http';

/**
 * 按「写操作」维度限流的统一入口。
 *
 * 为什么单独抽一层：
 * - 业务路由只需一行 `await guardWrite(req, 'comment')`，不必自己拼 key、判 IP、算窗口。
 * - 登录用户按 userId 计（换 IP 也受限），匿名用户按 IP 计。
 * - 默认配额集中在 PRESETS，改配额不用逐个文件找。
 */

export type WriteAction =
  | 'login'
  | 'register'
  | 'captcha'
  | 'comment'
  | 'upload'
  | 'message'
  | 'prayer'
  | 'content'
  | 'report'
  | 'follow'
  | 'like'
  | 'donation'
  | 'feedback'
  | 'group'
  | 'activity'
  | 'default';

interface Preset {
  limit: number;
  windowMs: number;
  /** 提示语 */
  message?: string;
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const PRESETS: Record<WriteAction, Preset> = {
  login: { limit: 10, windowMs: 10 * MIN, message: '登录尝试过于频繁，请稍后再试' },
  register: { limit: 5, windowMs: HOUR, message: '注册过于频繁，请稍后再试' },
  captcha: { limit: 30, windowMs: 10 * MIN, message: '验证码获取过于频繁' },
  comment: { limit: 20, windowMs: 10 * MIN, message: '评论过于频繁，请稍后再试' },
  upload: { limit: 30, windowMs: HOUR, message: '上传过于频繁，请稍后再试' },
  message: { limit: 60, windowMs: 10 * MIN, message: '发消息过于频繁，请稍后再试' },
  prayer: { limit: 20, windowMs: HOUR, message: '发布代祷过于频繁，请稍后再试' },
  content: { limit: 30, windowMs: HOUR, message: '发布过于频繁，请稍后再试' },
  report: { limit: 10, windowMs: HOUR, message: '举报过于频繁，请稍后再试' },
  follow: { limit: 100, windowMs: HOUR, message: '操作过于频繁，请稍后再试' },
  like: { limit: 200, windowMs: HOUR, message: '操作过于频繁，请稍后再试' },
  donation: { limit: 10, windowMs: HOUR, message: '捐赠请求过于频繁，请稍后再试' },
  feedback: { limit: 10, windowMs: DAY, message: '反馈提交过于频繁，请稍后再试' },
  group: { limit: 30, windowMs: HOUR, message: '操作过于频繁，请稍后再试' },
  activity: { limit: 30, windowMs: HOUR, message: '操作过于频繁，请稍后再试' },
  default: { limit: 60, windowMs: 10 * MIN, message: '操作过于频繁，请稍后再试' },
};

/**
 * 对写操作限流。超过配额直接抛 429（withApi 会转成标准错误响应）。
 *
 * @param identity 已登录时传用户 id（更精准，换 IP 也受限）；不传则按 IP
 */
export async function guardWrite(
  req: NextRequest | Request,
  action: WriteAction,
  identity?: string | null
): Promise<void> {
  const preset = PRESETS[action] || PRESETS.default;
  const ip = clientIp(req as Request);
  // 维度：登录用户看 userId，匿名看 IP
  const subject = identity ? `u:${identity}` : `ip:${ip}`;
  const key = `${action}:${subject}`;

  const r = await rateLimitAsync(key, preset.limit, preset.windowMs);
  if (!r.ok) {
    const secs = Math.max(1, Math.ceil(r.retryAfterMs / 1000));
    throw new HttpError(429, 'RATE_LIMITED', `${preset.message}（约 ${secs} 秒后可再试）`);
  }
}
