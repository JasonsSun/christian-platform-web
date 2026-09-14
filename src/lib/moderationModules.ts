/**
 * 平台「模块审核员」体系的模块元数据。
 *
 * 设计要点：
 * - 权限等级 管理员(admin) > 模块审核员(moderator,带范围) > 普通成员(member)
 * - 管理员 = 全模块审核员 + 系统治理权，拥有专属金色角标
 * - 审核员的能力由 moderator_scopes 表里他负责的模块决定，一人可兼任多个模块
 * - 每个模块有专属图标 + 配色，用于角标区分与社区公示页
 *
 * 本文件是纯数据/类型，前后端共用（不要在它里面 import 任何 server 代码）。
 */

export type ModuleKey =
  | 'prayers'
  | 'contents'
  | 'comments'
  | 'songs'
  | 'media'
  | 'live'
  | 'activities'
  | 'organizations'
  | 'groups'
  | 'reports'
  | 'feedback';

export interface ModuleMeta {
  key: ModuleKey;
  /** 短名，角标里显示为「XX审核员」 */
  label: string;
  /** 全名，公示页模块标题 */
  fullLabel: string;
  /** 模块专属图标 */
  icon: string;
  /** 模块专属配色（角标与公示框主色） */
  color: string;
  /** 该模块审核员的职责说明 */
  desc: string;
}

export const MODULE_META: Record<ModuleKey, ModuleMeta> = {
  prayers: {
    key: 'prayers',
    label: '代祷',
    fullLabel: '代祷墙',
    icon: '🕊️',
    color: '#0ea5e9',
    desc: '巡查并清理代祷墙的违规、广告、涉政涉黄内容，守护祷告的圣洁',
  },
  contents: {
    key: 'contents',
    label: '文章',
    fullLabel: '文章 · 见证',
    icon: '📝',
    color: '#4f6df5',
    desc: '审核文章与见证投稿，处理标题党、抄袭与不合乎信仰告白的内容',
  },
  comments: {
    key: 'comments',
    label: '评论',
    fullLabel: '评论互动',
    icon: '💬',
    color: '#8b5cf6',
    desc: '处理评论区的争吵、人身攻击与恶意刷屏，维护彼此相爱的讨论氛围',
  },
  songs: {
    key: 'songs',
    label: '诗歌',
    fullLabel: '赞美诗',
    icon: '🎵',
    color: '#ec4899',
    desc: '审核诗歌投稿，核对歌词、曲谱与音频授权信息是否真实合规',
  },
  media: {
    key: 'media',
    label: '媒体',
    fullLabel: '媒体中心',
    icon: '🎬',
    color: '#f59e0b',
    desc: '审核图片/音视频/曲谱资料，处理侵权、涉黄涉暴与违规上传',
  },
  live: {
    key: 'live',
    label: '直播',
    fullLabel: '直播管理',
    icon: '📡',
    color: '#ef4444',
    desc: '审核开播申请与现场视频，对违规直播及时关闭、驳回',
  },
  activities: {
    key: 'activities',
    label: '活动',
    fullLabel: '活动管理',
    icon: '📅',
    color: '#10b981',
    desc: '审核线下活动信息，下架虚假招募、传销与安全隐患活动',
  },
  organizations: {
    key: 'organizations',
    label: '组织',
    fullLabel: '组织 · 教会',
    icon: '⛪',
    color: '#14b8a6',
    desc: '审核教会/团契/事工/公益机构档案，核验真实性与联系方式',
  },
  groups: {
    key: 'groups',
    label: '团契',
    fullLabel: '团契社区',
    icon: '🤝',
    color: '#0891b2',
    desc: '巡查团契动态与小组发言，清理违规信息；团契解散与团长移交仍归管理员',
  },
  reports: {
    key: 'reports',
    label: '举报',
    fullLabel: '举报中心',
    icon: '🚩',
    color: '#f97316',
    desc: '受理并裁决用户举报（内容/评论/用户/诗歌），成立则下架并通知',
  },
  feedback: {
    key: 'feedback',
    label: '建议',
    fullLabel: '平台建议',
    icon: '💡',
    color: '#84cc16',
    desc: '跟进用户提交的建议与故障反馈，回复处理进展并同步管理员',
  },
};

/** 展示顺序（公示页与角标堆叠都按此顺序） */
export const MODULE_ORDER: ModuleKey[] = [
  'prayers',
  'contents',
  'comments',
  'songs',
  'media',
  'live',
  'activities',
  'organizations',
  'groups',
  'reports',
  'feedback',
];

/** 管理员专属标识：全平台治理者，用金色 + 冠冕区分于任何模块审核员 */
export const ADMIN_BADGE = {
  icon: '👑',
  label: '管理员',
  fullLabel: '平台管理员（全部模块）',
  color: '#d4a017',
  desc: '全平台审核与治理：内容删除、用户封禁、团契与组织处置、财务与系统设置',
};

export const MODULE_KEYS = MODULE_ORDER;

export function isModuleKey(x: unknown): x is ModuleKey {
  return typeof x === 'string' && (MODULE_ORDER as string[]).includes(x);
}

export function moduleMeta(key: string): ModuleMeta | null {
  return isModuleKey(key) ? MODULE_META[key] : null;
}
