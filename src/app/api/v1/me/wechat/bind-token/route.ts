import { NextRequest } from 'next/server';
import { ok, withApi } from '@/server/http';
import { requireUser } from '@/server/auth';
import { createBindToken } from '@/server/wechat';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';

/**
 * 生成一次性微信绑定令牌,并返回二维码(SVG)。
 * 二维码内容 = 微信网页授权地址(state 携带一次性 scene),
 * 未配置公众号凭证时返回本站演示页地址。
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const t = await createBindToken(user.id);
  const qrSvg = await QRCode.toString(t.qrContent, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  });
  return ok({
    token: t.token,
    scene: t.scene,
    expiresAt: t.expiresAt,
    mode: t.mode,
    qrContent: t.qrContent,
    qrSvg,
  });
});
