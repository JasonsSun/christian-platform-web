import { withApi, ok } from '@/server/http';
import { listProviders } from '@/server/oauth';

export const dynamic = 'force-dynamic';

/** 列出已配置的第三方登录 provider（前端据此渲染按钮）。 */
export const GET = withApi(async () => {
  return ok({ providers: listProviders() });
});
