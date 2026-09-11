import { ok, withApi } from '@/server/http';
import { createCaptcha } from '@/server/captcha';

export const dynamic = 'force-dynamic';

// GET /api/v1/auth/captcha -> { id, svg }
export const GET = withApi(async () => {
  const { id, svg } = createCaptcha();
  return ok({ id, svg });
});
