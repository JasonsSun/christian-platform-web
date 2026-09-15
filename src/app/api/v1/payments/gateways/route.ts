import { NextRequest } from 'next/server';
import { resolveGateway, confirmPaid, listGateways } from '@/server/payments';
import { ok, withApi } from '@/server/http';

export const dynamic = 'force-dynamic';

/** 可用支付通道。公开接口：未开启/未配置的通道前端直接不展示 */
export const GET = withApi(async () => ok(await listGateways()));
