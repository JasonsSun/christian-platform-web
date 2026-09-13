import { NextRequest } from 'next/server';
import { ok, withApi } from '@/server/http';
import { getHomeFeed } from '@/server/homeFeed';

export const dynamic = 'force-dynamic';

/** 首页聚合:统计 / 精选内容 / 近期活动 / 热门诗歌 / 每日经文 / 代祷墙 / 团契
 *  实现已下沉到 @/server/homeFeed,与首页 ISR 预渲染共用同一份 SQL。 */
export const GET = withApi(async () => ok(await getHomeFeed()));
