/**
 * 中文文案映射：把后端返回的英文枚举（内容状态 / 审计动作 / 对象类型）
 * 转成界面显示用的中文，避免中文界面里冒出 draft / CONTENT_APPROVE 这类英文。
 * 查不到时原样回退，保证不会显示空白。
 */

/** 内容状态：draft | pending | published | rejected（与 admin/_components 的 StatusBadge 保持一致） */
export const CONTENT_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending: '待审核',
  pending_review: '待审核',
  published: '已发布',
  rejected: '已驳回',
  active: '正常',
  suspended: '已封禁',
};

export function contentStatusLabel(status?: string | null): string {
  if (!status) return '-';
  return CONTENT_STATUS_LABEL[status] || status;
}

/** 审计动作码 → 中文 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  // 账号
  LOGIN_SUCCESS: '登录成功',
  LOGIN_FAILURE: '登录失败',
  LOGOUT: '退出登录',
  USER_REGISTER: '注册账号',
  USER_INVITED: '邀请注册',
  PASSWORD_CHANGE: '修改密码',
  ACCOUNT_DEACTIVATED: '注销账号',
  USER_ROLE_CHANGE: '变更用户角色',
  USER_STATUS_CHANGE: '变更用户状态',
  USER_PASSWORD_RESET: '重置用户密码',
  // 内容
  CONTENT_CREATE: '创建内容',
  CONTENT_UPDATE: '更新内容',
  CONTENT_DELETE: '删除内容',
  CONTENT_SUBMIT: '提交审核',
  CONTENT_APPROVE: '内容通过',
  CONTENT_REJECT: '内容驳回',
  CONTENT_REPORT: '举报内容',
  COMMENT_DELETE: '删除评论',
  // 诗歌
  SONG_SUBMIT: '提交诗歌',
  SONG_REVIEW: '审核诗歌',
  SONG_META_UPDATE: '更新诗歌信息',
  // 活动
  ACTIVITY_CREATE: '创建活动',
  ACTIVITY_REGISTER: '活动报名',
  ACTIVITY_CANCEL: '取消报名',
  ACTIVITY_CHECKIN: '活动签到',
  ACTIVITY_STATUS_CHANGE: '变更活动状态',
  // 团契
  GROUP_CREATE: '创建团契',
  GROUP_JOIN: '加入团契',
  GROUP_LEAVE: '退出团契',
  // 好友
  'friend.request': '好友申请',
  'friend.accept': '同意好友',
  'friend.decline': '拒绝好友',
  'friend.remove': '删除好友',
  // 捐赠 / 支出
  DONATION_SUBMIT: '提交捐赠登记',
  DONATION_REVIEW: '审核捐赠',
  EXPENSE_CREATE: '新增支出公示',
  EXPENSE_UPDATE: '更新支出公示',
  EXPENSE_DELETE: '删除支出公示',
  // 建议
  FEEDBACK_SUBMIT: '提交平台建议',
  FEEDBACK_HANDLE: '处理平台建议',
  // 媒体
  MEDIA_UPLOAD: '上传媒体',
  MEDIA_TRASH: '删除媒体',
  MEDIA_APPROVE: '媒体通过',
  MEDIA_REJECT: '媒体驳回',
  MEDIA_STATUS_CHANGE: '变更媒体状态',
  // 直播
  LIVE_START: '开始直播',
  LIVE_END: '结束直播',
  LIVE_CANCEL: '取消直播',
  LIVE_REVIEW_APPROVE: '直播审核通过',
  LIVE_REVIEW_REJECT: '直播审核驳回',
  LIVE_RECORDING_CLEANUP: '清理直播录像',
  // 平台管理
  ORG_STATUS_CHANGE: '变更机构状态',
  REPORT_UPHELD: '举报成立',
  REPORT_DISMISSED: '举报驳回',
  SETTINGS_UPDATE: '更新系统设置',
  QUOTA_POLICY_UPDATE: '更新配额策略',
  BIBLE_VERSE_UPDATE: '修订经文',
};

export function auditActionLabel(action?: string | null): string {
  if (!action) return '-';
  return AUDIT_ACTION_LABEL[action] || action;
}

/** 审计对象类型 → 中文 */
export const ENTITY_TYPE_LABEL: Record<string, string> = {
  content: '内容',
  user: '用户',
  activity: '活动',
  media: '媒体',
  group: '团契',
  donation: '捐赠',
  expense: '支出',
  feedback: '平台建议',
  organization: '机构',
  settings: '系统设置',
  quota: '配额',
  live: '直播',
  songs: '诗歌',
  song: '诗歌',
  bible_verses: '经文',
  comment: '评论',
  report: '举报',
};

export function entityTypeLabel(type?: string | null): string {
  if (!type) return '-';
  return ENTITY_TYPE_LABEL[type] || type;
}
