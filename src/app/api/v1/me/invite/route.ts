import { NextRequest } from 'next/server';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { inviteSummary } from '@/server/growth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 我的邀请码与邀请成果 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const s = await inviteSummary(user.id);
  return ok({
    ...s,
    tips: [
      `把链接发给朋友，注册后你会获得成长奖励（当前已邀请 ${s.invitedCount} 人）`,
      '等级越高，可上传的单文件与每日次数越多',
    ],
  });
});
