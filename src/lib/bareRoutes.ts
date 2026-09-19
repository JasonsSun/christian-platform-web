/** 认证类全屏页（登录 / 注册 / 找回密码 / 重置密码）。
    它们自带品牌头和返回入口，不需要全站导航、底部标签栏和页脚：
    去掉后表单能整块落在首屏内（手机上「登录」按钮原本被挤到折叠线以下，
    还被固定底部栏压住），也少掉一截随数据到达而上下位移的页脚。
    /confirm（通用确认页）和 /wechat/bind（绑定落地页）不在其列：
    它们是站点流程中的子页，需要保留导航才能自然回到上下文。 */
const BARE_PREFIXES = ['/login', '/forgot', '/reset'];

export function isBareRoute(pathname?: string | null): boolean {
  const p = pathname || '/';
  return BARE_PREFIXES.some((r) => p === r || p.startsWith(`${r}/`));
}
