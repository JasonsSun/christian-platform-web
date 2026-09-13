import { q } from './db';
import { cacheGetOrSet } from './cache';
import { mapContent, mapActivity, mapSong, mapGroup, mapPrayer } from './mappers';
import { bookById } from './bible';
import { publicUrlFor, kindLabel } from './media';

/**
 * 首页聚合数据(与登录态无关的公开数据)。
 * 同时被 /api/v1/home 与首页 ISR 预渲染复用,避免两处 SQL 分叉。
 */

export type HomeFeed = Awaited<ReturnType<typeof buildHome>>;

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

  const dayIndex = Math.floor(Date.now() / 86400000);
  const pool = await cacheGetOrSet<any[]>('bible:daily-pool:v1', 6 * 3600_000, () =>
    q<any>(`
    SELECT version, book_id, chapter, verse, text FROM bible_verses
    WHERE version='cuv' AND book_id IN ('Psa','Pro') ORDER BY book_id, chapter, verse`)
  );
  const verse = pool.length ? pool[dayIndex % pool.length] : null;

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

/** 30s 短缓存:首页访问量大,避免每次打满 8+ 条聚合查询 */
export const getHomeFeed = () => cacheGetOrSet('home:v1', 30_000, buildHome);

function mapMediaRow(r: any) {
  return {
    id: r.id,
    kind: r.kind,
    kindLabel: kindLabel(r.kind),
    title: r.title || r.file_name,
    fileName: r.file_name,
    mimeType: r.mime_type,
    extension: r.extension,
    sizeBytes: Number(r.size_bytes),
    url: r.storage_key ? publicUrlFor(r.storage_key) : '',
    posterUrl: r.poster_key ? publicUrlFor(r.poster_key) : '',
    durationSec: Number(r.duration_sec || 0),
    playCount: Number(r.play_count || 0),
    status: r.status,
    reviewStatus: r.review_status,
    reviewReason: r.review_reason,
    refCount: Number(r.ref_count),
    createdAt: r.created_at,
    source: r.source || 'upload',
    sourceRef: r.source_ref || null,
    owner: r.owner_name || '',
    ownerId: r.owner_id,
  };
}

/** 首页「最新媒体」用的公开列表(仅审核通过、未删除) */
export const getPublicMedia = async (pageSize = 16) => {
  const rows = await q<any>(
    `SELECT m.*, u.display_name AS owner_name,
            DATE_FORMAT(m.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM media_files m LEFT JOIN users u ON u.id = m.owner_id
     WHERE m.review_status = 'approved' AND m.status <> 'trashed'
     ORDER BY m.created_at DESC LIMIT ?`,
    [pageSize]
  );
  return rows.map(mapMediaRow);
};
