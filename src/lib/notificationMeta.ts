/**
 * 通知类型 / 渠道 的中文元数据。
 *
 * 数据库里存的是英文 code（media_pending、friend_request ...），
 * 后台与前台都必须经此映射后展示，禁止直接把原始 code 抛给用户。
 * 新增通知类型时，只需在这里补一条，全站（管理端统计、用户端列表）同步生效。
 */

export type NotifCategory = 'activity' | 'community' | 'system';

/** 类型 → 中文名 */
export const NOTIF_TYPE_LABEL: Record<string, string> = {
  // 审核类
  media_pending: '媒体待审核',
  media_approved: '媒体审核通过',
  media_rejected: '媒体审核未通过',
  content_pending: '内容待审核',
  content_approved: '内容审核通过',
  content_rejected: '内容审核未通过',
  content_removed: '内容被移除',
  content_reported: '内容被举报',
  song_pending: '诗歌待审核',
  song_approved: '诗歌审核通过',
  song_rejected: '诗歌审核未通过',
  song_submitted: '诗歌投稿',
  live_pending: '直播待审核',
  live_approved: '直播审核通过',
  live_rejected: '直播审核未通过',
  live_reminder: '直播开播提醒',
  org_review: '组织认证审核',
  // 社区互动
  new_comment: '新评论',
  new_like: '新点赞',
  new_follow: '新关注',
  new_message: '新私信',
  mention: '被提及',
  friend_request: '好友申请',
  friend_accepted: '好友申请通过',
  group_joined: '加入团契',
  group_post: '团契新动态',
  prayer_amen: '祷告阿们',
  // 活动
  activity: '活动通知',
  activity_published: '新活动发布',
  activity_registered: '活动报名成功',
  activity_checkin: '活动签到',
  activity_reminder: '活动提醒',
  activity_cancelled: '活动已取消',
  activity_updated: '活动信息变更',
  // 组织 / 团契
  group_owner: '团契负责人变更',
  group_dissolved: '团契已解散',
  group_member_joined: '新成员加入团契',
  group_member_left: '成员退出团契',
  org_approved: '组织认证通过',
  org_rejected: '组织认证未通过',
  // 系统
  welcome: '欢迎加入',
  password_reset: '密码重置',
  quota_changed: '配额变更',
  quota_levelup_tip: '等级提升提示',
};

/** 类型 → 图标（用户端通知列表用） */
export const NOTIF_TYPE_ICON: Record<string, string> = {
  media_pending: '⏳', media_approved: '🖼️', media_rejected: '🚫',
  content_pending: '⏳', content_approved: '✅', content_rejected: '⚠️', content_removed: '🗑️', content_reported: '🚩',
  song_pending: '🎵', song_approved: '🎶', song_rejected: '🚫', song_submitted: '🎵',
  live_pending: '⏳', live_approved: '📺', live_rejected: '🚫', live_reminder: '📺',
  org_review: '⛪',
  new_comment: '💬', mention: '💬', new_like: '❤️', new_follow: '👤', new_message: '✉️',
  friend_request: '🤝', friend_accepted: '🤝', group_joined: '👥', group_post: '📝', prayer_amen: '🙏',
  activity: '📅', activity_published: '📅', activity_registered: '📅', activity_checkin: '📍', activity_reminder: '⏰',
  activity_cancelled: '🚫', activity_updated: '📝',
  group_owner: '👥', group_dissolved: '💔', group_member_joined: '👥', group_member_left: '👋',
  org_approved: '⛪', org_rejected: '🚫',
  welcome: '🎉', password_reset: '🔐', quota_changed: '📊', quota_levelup_tip: '🚀',
};

/** 类型 → 所属分类（用户端 Tab 用） */
export function categoryOfNotif(type: string): NotifCategory {
  if (type.startsWith('activity') || type === 'live_reminder') return 'activity';
  if ([
    'content_approved', 'content_rejected', 'content_removed', 'content_reported',
    'new_comment', 'new_like', 'new_follow', 'new_message', 'mention',
    'friend_request', 'friend_accepted', 'group_joined', 'group_post', 'prayer_amen',
  ].includes(type)) return 'community';
  return 'system';
}

/** 渠道 → 中文名 */
export const CHANNEL_LABEL: Record<string, string> = {
  inapp: '站内', push: '推送', email: '邮件', sms: '短信', wechat: '微信',
};

/** 未知 code 的兜底：按命名规则粗译，绝不裸露英文 code 给用户 */
const TOKEN_ZH: Record<string, string> = {
  activity: '活动', group: '团契', org: '组织', content: '内容', media: '媒体', song: '诗歌',
  live: '直播', user: '用户', friend: '好友', prayer: '祷告', quota: '配额',
  pending: '待处理', approved: '已通过', rejected: '未通过', cancelled: '已取消', canceled: '已取消',
  updated: '有更新', removed: '已移除', reported: '被举报', submitted: '已提交',
  created: '已创建', deleted: '已删除', changed: '有变更', reminder: '提醒', joined: '已加入',
  left: '已退出', owner: '负责人', new: '新', review: '审核', tip: '提示', reset: '重置',
};

export function notifTypeLabel(type?: string): string {
  if (!type) return '未知类型';
  if (NOTIF_TYPE_LABEL[type]) return NOTIF_TYPE_LABEL[type];
  // 未收录的类型：按 _ 分词逐段翻译，译不出就保留原词，但保证整体不是纯英文 code 的裸奔观感
  const parts = type.split('_').map((seg) => TOKEN_ZH[seg]).filter(Boolean);
  if (parts.length) return parts.join('');
  return `其他通知（${type}）`;
}

export function channelLabel(channel?: string): string {
  if (!channel) return '未知渠道';
  return CHANNEL_LABEL[channel] || channel;
}
