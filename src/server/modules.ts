import { NextRequest } from 'next/server';
import { HttpError } from './http';
import { SITE_MODULES, MODULE_SETTING_KEY, moduleOfPath, moduleLabel, type ModuleKey } from '@/lib/siteModules';
import { getSetting } from './settings';

/**
 * 模块开关的运行时判定。
 *
 * 配置存在 `settings` 表，key 为 `module.<key>`，值 'true'/'false'。
 * **未登记的配置一律视为开启** —— 这样迁移没跑、或新增模块还没配种子时，
 * 不会把站点功能误关掉。
 */
export async function isModuleEnabled(key: string): Promise<boolean> {
  const raw = await getSetting(MODULE_SETTING_KEY(key), '');
  if (raw === '') return true;
  return /^(true|1|yes|on)$/i.test(raw.trim());
}

/** 当前被关闭的模块 key 列表（供导航隐藏、公开接口返回） */
export async function disabledModules(): Promise<string[]> {
  const out: string[] = [];
  for (const m of SITE_MODULES) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await isModuleEnabled(m.key))) out.push(m.key);
  }
  return out;
}

/**
 * 路径守卫：命中的模块若已关闭，则抛 403 MODULE_DISABLED。
 * 管理员豁免——模块下线后仍需能在后台处理历史数据（代祷清理、举报处理等）。
 * 配置读取失败时不拦截，绝不让开关把整个站打挂。
 */
export async function assertModuleOpen(req: NextRequest | Request | string, adminBypassUserId?: string) {
  try {
    const path = typeof req === 'string' ? req : (req as Request).url || '';
    const key = moduleOfPath(path);
    if (!key) return;
    if (await isModuleEnabled(key)) return;

    if (typeof req !== 'string') {
      const { currentUser } = await import('./auth');
      const u = await currentUser(req as Request).catch(() => null);
      // 管理员与持有该模块的模块审核员仍可进入（后台治理不受前台下线影响）
      if (u?.role === 'admin') return;
      if (u?.role === 'moderator') {
        const { getModeratorScopes } = await import('./moderation');
        const scopes: string[] = await getModeratorScopes(u.id).catch(() => []);
        if (scopes.indexOf(String(key)) >= 0) return;
      }
    }
    if (adminBypassUserId) return;

    throw new HttpError(403, 'MODULE_DISABLED', `「${moduleLabel(key)}」模块已暂停服务`);
  } catch (e) {
    if (e instanceof HttpError) throw e;
  }
}

/** 页面层用：模块是否开放（layout 守卫） */
export async function isModuleOpen(key: string): Promise<boolean> {
  return isModuleEnabled(key);
}
