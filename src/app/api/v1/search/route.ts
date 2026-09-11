import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, HttpError } from '@/server/http';
import { mapContent, mapSong, mapActivity, mapGroup } from '@/server/mappers';
import { bookById } from '@/server/bible';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const keyword = (sp.get('q') || '').trim();
  if (!keyword) throw new HttpError(400, 'BAD_REQUEST', '请输入搜索关键词');
  const like = `%${keyword}%`;

  const [contents, songs, activities, groups, verses, users] = await Promise.all([
    q<any>(`SELECT c.id, c.title, c.body, c.content_type, c.status, c.cover, c.tags,
                   c.like_count, c.comment_count, c.view_count,
                   DATE_FORMAT(c.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
                   DATE_FORMAT(c.published_at,'%Y-%m-%dT%H:%i:%sZ') AS published_at,
                   u.id AS author_id, u.username AS author_username,
                   u.display_name AS author_name, u.avatar_color AS author_color, 0 AS liked
            FROM contents c JOIN users u ON u.id = c.author_id
            WHERE c.status = 'published' AND (c.title LIKE ? OR c.body LIKE ? OR c.tags LIKE ?)
            ORDER BY c.created_at DESC LIMIT 10`, [like, like, like]),
    q<any>(`SELECT id, title, author, category, tags, lyrics, audio_url, audio_type, audio_credit,
                   listen_url, listen_source, play_count,
                   DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
            FROM songs WHERE status = 'published' AND (title LIKE ? OR author LIKE ? OR tags LIKE ? OR lyrics LIKE ?)
            ORDER BY (audio_type = 'vocal') DESC, play_count DESC LIMIT 8`,
      [like, like, like, like]),
    q<any>(`SELECT a.id, a.title, a.description, a.category, a.location, a.city, a.capacity, a.cover, a.status,
                   DATE_FORMAT(a.start_at,'%Y-%m-%dT%H:%i:%sZ') AS start_at,
                   DATE_FORMAT(a.end_at,'%Y-%m-%dT%H:%i:%sZ') AS end_at,
                   DATE_FORMAT(a.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
                   u.id AS organizer_id, u.username AS organizer_username,
                   u.display_name AS organizer_name, u.avatar_color AS organizer_color,
                   0 AS confirmed_count, 0 AS waitlist_count, NULL AS my_status
            FROM activities a JOIN users u ON u.id = a.organizer_id
            WHERE a.title LIKE ? OR a.description LIKE ? OR a.city LIKE ? LIMIT 8`, [like, like, like]),
    q<any>(`SELECT g.id, g.name, g.description, g.category, g.city, g.cover,
                   DATE_FORMAT(g.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
                   u.id AS owner_id, u.username AS owner_username,
                   u.display_name AS owner_name, u.avatar_color AS owner_color,
                   (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count, 0 AS joined
            FROM \`groups\` g JOIN users u ON u.id = g.owner_id
            WHERE g.name LIKE ? OR g.description LIKE ? LIMIT 8`, [like, like]),
    q<any>(`SELECT version, book_id, chapter, verse, text FROM bible_verses
            WHERE version = 'cuv' AND text LIKE ? LIMIT 10`, [like]),
    q<any>(`SELECT id, username, display_name, avatar_color, city, church
            FROM users WHERE status='active' AND (username LIKE ? OR display_name LIKE ? OR church LIKE ?) LIMIT 8`,
      [like, like, like]),
  ]);

  return ok({
    keyword,
    contents: contents.map(mapContent),
    songs: songs.map(mapSong),
    activities: activities.map((a) => mapActivity({ ...a, registered: false })),
    groups: groups.map(mapGroup),
    verses: verses.map((v) => ({
      version: v.version, bookId: v.book_id, bookName: bookById(v.book_id)?.name || v.book_id,
      chapter: v.chapter, verse: v.verse, text: v.text,
    })),
    users: users.map((u) => ({
      id: u.id, username: u.username, displayName: u.display_name,
      avatarColor: u.avatar_color, city: u.city, church: u.church,
    })),
  });
});
