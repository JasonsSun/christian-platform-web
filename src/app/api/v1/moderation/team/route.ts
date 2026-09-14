import { ok, withApi } from '@/server/http';
import { listModerationTeam } from '@/server/moderation';

export const dynamic = 'force-dynamic';

/**
 * 公开查询「平台治理团队」：管理员 + 各模块审核员。
 *
 * 这是治理透明化的公示接口：所有人（含未登录访客）都能看到
 * 每个模块由谁负责、管理员是谁，方便弟兄姊妹知道该找谁反馈。
 * 只返回昵称/城市/教会等非敏感信息。
 */
export const GET = withApi(async () => {
  const team = await listModerationTeam();
  return ok(team);
});
