import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { mapContent, mapActivity, mapSong, mapGroup, mapPrayer } from '@/server/mappers';
import { bookById } from '@/server/bible';
import { cacheGetOrSet } from '@/server/cache';

export const dynamic = 'force-dynamic';

/** 首页聚合:统计 / 精选内容 / 近期活动 / 热门诗歌 / 每日经文 / 代祷墙 / 团契
 *  公开数据、与登录态无关 -> 短 TTL 缓存,避免每次访问打满 8+ 条聚合查询。 */
const HOME_TTL_MS = 30_000;

const buildHome = async () => {
  const [counts] = await q<any>(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE status='active') AS users,
      (SELECT COUNT(*) FROM contents WHERE status='published') AS contents,
      (SELECT COUNT(*) FROM activities WHERE start_at >= NOW()) AS activities,
      (SELECT COUNT(*) FROM songs) AS songs,
      (SELECT COUNT(*) FROM \`groups\`) AS groupCount,
      (SELECT COUNT(*) FROM prayers) AS prayers,
      (SELECT COUNT(*) FROM comments) AS comments,
      (SELECT COUNT(*) FROM activity_registrations WHERE status='confirmed') AS registrations`);

  const contents = await q<any>(`
    SELECT c.id, c.title, c.body, c.content_type, c.status, c.cover, c.tags,
           c.like_count, c.comment_count, c.view_count,
           DATE_FORMAT(c.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
           DATE_FORMAT(c.published_at,'%Y-%m-%dT%H:%i:%sZ') AS published_at,
           u.id AS author_id, u.username AS author_username,
           u.display_name AS author_name, u.avatar_color AS author_color, 0 AS liked
    FROM contents c JOIN users u ON u.id = c.author_id
    WHERE c.status = 'published' ORDER BY c.like_count DESC, c.created_at DESC LIMIT 6`);

  const activities = await q<any>(`
    SELECT a.id, a.title, a.description, a.category, a.location, a.city, a.capacity, a.cover, a.status,
           DATE_FORMAT(a.start_at,'%Y-%m-%dT%H:%i:%sZ') AS start_at,
           DATE_FORMAT(a.end_at,'%Y-%m-%dT%H:%i:%sZ') AS end_at,
           DATE_FORMAT(a.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
           u.id AS organizer_id, u.username AS organizer_username,
           u.display_name AS organizer_name, u.avatar_color AS organizer_color,
           (SELECT COUNT(*) FROM activity_registrations r WHERE r.activity_id = a.id AND r.status='confirmed') AS confirmed_count,
           (SELECT COUNT(*) FROM activity_registrations r WHERE r.activity_id = a.id AND r.status='waitlist') AS waitlist_count,
           NULL AS my_status
    FROM activities a JOIN users u ON u.id = a.organizer_id
    WHERE a.start_at >= NOW() ORDER BY a.start_at ASC LIMIT 3`);

  const songs = await q<any>(`
    SELECT id, title, author, category, tags, lyrics, audio_url, audio_type, audio_credit,
           listen_url, listen_source, play_count,
           DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
    FROM songs ORDER BY (audio_type = 'vocal') DESC, play_count DESC LIMIT 4`);

  const groups = await q<any>(`
    SELECT g.id, g.name, g.description, g.category, g.city, g.cover,
           DATE_FORMAT(g.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
           u.id AS owner_id, u.username AS owner_username,
           u.display_name AS owner_name, u.avatar_color AS owner_color,
           (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count, 0 AS joined
    FROM \`groups\` g JOIN users u ON u.id = g.owner_id ORDER BY member_count DESC LIMIT 3`);

  const prayers = await q<any>(`
    SELECT p.id, p.body, p.amen_count, p.answered,
           DATE_FORMAT(p.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
           u.id AS user_id, u.username, u.display_name, u.avatar_color, 0 AS amened
    FROM prayers p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 3`);

  // 每日经文:按日期在诗篇/箴言中取值(该池为静态数据,长缓存,避免每次全量扫描)
  const dayIndex = Math.floor(Date.now() / 86400000);
  const pool = await cacheGetOrSet<any[]>('bible:daily-pool:v1', 6 * 3600_000, () =>
    q<any>(`
    SELECT version, book_id, chapter, verse, text FROM bible_verses
    WHERE version='cuv' AND book_id IN ('Psa','Pro') ORDER BY book_id, chapter, verse`)
  );
  const verse = pool.length ? pool[dayIndex % pool.length] : null;

  // 注意:缓存的是「纯数据」而非 ok() 的 Response —— Response 的 body 是一次性流,
  // 缓存后第二次复用会得到空响应。
  return {
    stats: { ...counts, groups: Number(counts.groupCount || 0) },
    featured: contents.map(mapContent),
    activities: activities.map((a) => mapActivity({ ...a, registered: false })),
    songs: songs.map(mapSong),
    groups: groups.map(mapGroup),
    prayers: prayers.map(mapPrayer),
    verse: verse
      ? {
          bookId: verse.book_id,
          bookName: bookById(verse.book_id)?.name || verse.book_id,
          chapter: verse.chapter,
          verse: verse.verse,
          text: verse.text,
        }
      : null,
  };
};

export const GET = withApi(async () => ok(await cacheGetOrSet('home:v1', HOME_TTL_MS, buildHome)));
