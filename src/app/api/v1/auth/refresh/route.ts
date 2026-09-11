import { NextRequest } from 'next/server';
import { ok, readJson, withApi } from '@/server/http';
import { publicUser, rotateSession, signAccessToken } from '@/server/auth';

export const dynamic = 'force-dynamic';

export const POST = withApi(async (req: NextRequest) => {
  const body = await readJson<{ refreshToken?: string }>(req).catch(() => ({} as any));
  const token = body.refreshToken || '';
  const { user, refresh, access } = await rotateSession(token);
  return ok({
    user: publicUser(user),
    accessToken: access,
    refreshToken: refresh,
    expiresIn: Number(process.env.JWT_ACCESS_TTL || 900),
  });
});
