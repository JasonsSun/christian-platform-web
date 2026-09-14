import { ok, withApi } from '@/server/http';
import { getBool, getSetting } from '@/server/settings';
import { disabledModules } from '@/server/modules';

export const dynamic = 'force-dynamic';

/**
 * 公开运行配置：站点名、站点公告、维护状态。
 * 无需登录，供前端顶部公告条与页面标题使用。
 * 刻意只暴露这四项，其余配置项不外泄。
 */
export const GET = withApi(async () => {
  const [siteName, siteNotice, mode, modeNotice] = await Promise.all([
    getSetting('site_name', '圣约社区'),
    getSetting('site_notice', ''),
    getBool('maintenance_mode', false),
    getSetting('maintenance_notice', ''),
  ]);
  return ok({
    siteName,
    siteNotice,
    maintenance: mode,
    maintenanceNotice: mode ? modeNotice : '',
    disabledModules: await disabledModules(),
  });
});
