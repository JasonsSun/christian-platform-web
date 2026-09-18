import { NextRequest } from 'next/server';
import { ok, withApi, HttpError, clientIp } from '@/server/http';
import { rateLimitAsync } from '@/server/ratelimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 用 Bing 网页搜索抓取真实赞美诗资源（标题/链接/摘要），供"站内搜不到 → 站外搜"使用 */
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const keyword = (sp.get('q') || '').trim();
  if (!keyword) throw new HttpError(400, 'BAD_REQUEST', '请输入搜索关键词');

  // 必须限流：每个请求都会向 Bing 发起一次真实网络调用，最多占用 15 秒连接。
  // 没有这道闸门时，并发刷这个接口就能把出站连接池耗尽，进而拖垮整站。
  // 上限按"正常用户手搜"给足余量，正常用远到不了。
  const rl = await rateLimitAsync(`extsearch:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) throw new HttpError(429, 'RATE_LIMITED', '搜索太频繁了，请稍后再试');

  // 构造更精准的站外查询：引号强制整词匹配 + 限定赞美诗/圣诗/歌词
  const query = encodeURIComponent(`"${keyword}" 赞美诗 圣诗 歌词`);
  const url = `https://www.bing.com/search?q=${query}&count=10`;

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new HttpError(502, 'UPSTREAM_ERROR', `站外搜索服务暂不可用(${res.status})`);

  const html = await res.text();

  // 解析 Bing 结果块 <li class="b_algo">...</li>
  const items: { title: string; url: string; snippet: string }[] = [];
  const blockRe = /<li class="b_algo"[\s\S]*?<\/li>/gi;
  let m: RegExpExecArray | null;
  const titleRe = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i;
  const snipRe = /<p[^>]*>([\s\S]*?)<\/p>/i;
  while ((m = blockRe.exec(html)) !== null && items.length < 8) {
    const block = m[0];
    const t = titleRe.exec(block);
    if (!t) continue;
    let title = t[2]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const url = t[1].replace(/&amp;/g, '&').split('#')[0];
    const s = snipRe.exec(block);
    let snippet = s ? s[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
    if (!title || !url) continue;
    // 过滤明显无关的导航站/视频平台/词典站
    if (/iqiyi|bilibili|youku|tieba|hgcha|hanyuguoxue|baike\.baidu\.com/i.test(url)) continue;
    items.push({ title, url, snippet });
  }

  return ok({
    keyword,
    engine: 'bing',
    query: `${keyword} 赞美诗 圣诗 歌词`,
    items,
  });
});