import { NextRequest } from 'next/server';
import { ok, withApi, readJson } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { onboardingView, setOnboardingDone, dismissOnboarding } from '@/server/growth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 新用户引导清单（完成情况按真实数据判定，非本地缓存） */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  return ok(await onboardingView(user.id));
});

/** body: { action: 'done'|'dismiss', key?: string } */
export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const body = await readJson<{ action?: string; key?: string }>(req).catch(() => ({}) as any);
  if (body?.action === 'dismiss') {
    await dismissOnboarding(user.id);
  } else if (body?.key) {
    await setOnboardingDone(user.id, String(body.key));
  }
  return ok(await onboardingView(user.id));
});
