import { NextRequest } from 'next/server';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { isFollowing, followerCount, unfollowTopic } from '@/server/topicFollows';

export const dynamic = 'force-dynamic';

/**
 * GET    /api/v1/me/topics/[tag]   我是否关注 + 该话题关注人数
 * DELETE /api/v1/me/topics/[tag]   取关（幂等，本来没关注也返回 200）
 */

type Ctx = { params: { tag: string } };

const decode = (raw: string) => {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
};

export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireUser(req)) as UserRow;
  const tag = decode(ctx.params.tag || '');
  const following = await isFollowing(user.id, tag);
  const followers = await followerCount(tag);
  return ok({ tag, following, followers });
});

export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireUser(req)) as UserRow;
  const tag = decode(ctx.params.tag || '');
  const removed = await unfollowTopic(user.id, tag);
  const followers = await followerCount(tag);
  return ok({ tag, following: false, removed, followers });
});
