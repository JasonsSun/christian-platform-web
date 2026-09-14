/**
 * 站点模块清单（前后端共用，纯数据 + 纯函数，不依赖 DOM/DB）。
 *
 * 管理员可在后台「系统设置 → 模块开关」逐个开关这些模块。
 * 关闭后：导航自动隐藏入口，直接访问页面显示「模块已暂停服务」，
 * 对应 API 返回 403 MODULE_DISABLED（管理员豁免，后台仍要能治理历史数据）。
 * 数据一律保留，重新打开即恢复。
 */

export type ModuleKey =
  | 'bible' | 'plans' | 'songs' | 'media' | 'live' | 'prayers'
  | 'activities' | 'groups' | 'community' | 'messages' | 'nearby' | 'donate';

export interface SiteModule {
  key: ModuleKey;
  label: string;
  desc: string;
  /** 前端页面路径前缀 */
  pages: string[];
  /** /api/v1 下的路径前缀 */
  apis: string[];
  icon: string;
}

export const SITE_MODULES: SiteModule[] = [
  { key: 'bible', label: '圣经阅读', desc: '经文阅读、书签、朗读与读经历史', pages: ['/bible'], apis: ['bible'], icon: '📖' },
  { key: 'plans', label: '读经计划', desc: '读经计划列表/详情、报名与自动打卡', pages: ['/plans'], apis: ['plans'], icon: '📅' },
  { key: 'songs', label: '赞美诗歌', desc: '诗歌本、音频伴奏、收藏与歌单', pages: ['/songs'], apis: ['songs'], icon: '🎵' },
  { key: 'media', label: '媒体中心', desc: '音视频/图文资源浏览与上传', pages: ['/media', '/upload'], apis: ['media'], icon: '🎬' },
  { key: 'live', label: '直播', desc: '直播间列表、开播与互动聊天', pages: ['/live'], apis: ['live'], icon: '📡' },
  { key: 'prayers', label: '代祷墙', desc: '代祷发布、阿们与代祷列表', pages: ['/prayers'], apis: ['prayers'], icon: '🕊️' },
  { key: 'activities', label: '活动', desc: '活动发布、报名、签到与取消', pages: ['/activities'], apis: ['activities'], icon: '🎪' },
  { key: 'groups', label: '团契小组', desc: '团契创建、加入、动态与成员管理', pages: ['/groups'], apis: ['groups'], icon: '👥' },
  { key: 'community', label: '社区内容', desc: '文章/见证发布、评论、关注流', pages: ['/community', '/contents', '/feed'], apis: ['contents', 'feed'], icon: '🌿' },
  { key: 'messages', label: '私信', desc: '用户之间的一对一消息往来', pages: ['/messages'], apis: ['messages'], icon: '💬' },
  { key: 'nearby', label: '附近的人', desc: '按城市/地区发现附近的弟兄姊妹', pages: ['/nearby'], apis: [], icon: '📍' },
  { key: 'donate', label: '捐赠与支出', desc: '在线捐赠、捐赠记录与支出公示', pages: ['/donate'], apis: ['donations', 'expenses'], icon: '💝' },
];

export const MODULE_SETTING_KEY = (key: string) => `module.${key}`;

/** 由 settings 的 key 反解模块 key（'module.bible' → 'bible'；非模块配置返回 null） */
export function moduleFromSettingKey(settingKey: string): string | null {
  return settingKey.startsWith('module.') ? settingKey.slice('module.'.length) : null;
}

/**
 * 任意路径 → 所属模块。同时支持页面路径('/bible/cuv/john/1')与接口路径('/api/v1/bible/books')。
 * 匹配不到返回 null（说明不属于任何可开关模块，如 /me、/admin、/users）。
 */
export function moduleOfPath(input: string): ModuleKey | null {
  let rest = String(input || '').split('?')[0].split('#')[0];
  if (!rest) return null;
  // NextRequest.url 是绝对地址(http://host/api/v1/plans)，先取路径部分
  if (/^https?:\/\//i.test(rest)) {
    try { rest = new URL(rest).pathname; } catch { /* 解析失败就用原串 */ }
  }
  const apiPrefix = '/api/v1/';
  const isApi = rest.startsWith(apiPrefix);
  const path = isApi ? rest.slice(apiPrefix.length - 1) : rest; // 保留前导斜杠
  for (const m of SITE_MODULES) {
    const prefixes = isApi ? m.apis : m.pages;
    // 接口前缀写作 'bible' 不带斜杠，页面前缀写作 '/bible' 带斜杠
    const target = isApi ? path.replace(/^\//, '') : path;
    if (prefixes.some((p) => target === p || target.startsWith(p + '/'))) return m.key;
  }
  return null;
}

export function moduleLabel(key: string): string {
  return SITE_MODULES.find((m) => m.key === key)?.label || key;
}
