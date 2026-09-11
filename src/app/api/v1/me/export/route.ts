import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/server/db';
import { withApi } from '@/server/http';
import { requireUser, publicUser, UserRow } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/export -> 导出本人全部数据(GDPR 数据可携带性) */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const [
    contents, contentFavs, songFavs, prayers, regs, following, followers, notifications, comments,
  ] = await Promise.all([
    q<any>(`SELECT id, title, content_type, status, tags, created_at FROM contents WHERE author_id = ? ORDER BY created_at DESC`, [user.id]),
    q<any>(`SELECT content_id, created_at FROM content_favorites WHERE user_id = ? ORDER BY created_at DESC`, [user.id]),
    q<any>(`SELECT song_id, created_at FROM song_favorites WHERE user_id = ? ORDER BY created_at DESC`, [user.id]),
    q<any>(`SELECT id, body, amen_count, answered, created_at FROM prayers WHERE user_id = ? ORDER BY created_at DESC`, [user.id]),
    q<any>(`SELECT activity_id, status, created_at FROM activity_registrations WHERE user_id = ? ORDER BY created_at DESC`, [user.id]),
    q<any>(`SELECT followee_id, created_at FROM follows WHERE follower_id = ? ORDER BY created_at DESC`, [user.id]),
    q<any>(`SELECT follower_id, created_at FROM follows WHERE followee_id = ? ORDER BY created_at DESC`, [user.id]),
    q<any>(`SELECT id, type, title, body, link, \`read\`, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC`, [user.id]),
    q<any>(`SELECT id, content_id, body, created_at FROM comments WHERE user_id = ? ORDER BY created_at DESC`, [user.id]),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    profile: publicUser(user),
    stats: {
      contents: contents.length,
      contentFavorites: contentFavs.length,
      songFavorites: songFavs.length,
      prayers: prayers.length,
      activityRegistrations: regs.length,
      following: following.length,
      followers: followers.length,
      notifications: notifications.length,
      comments: comments.length,
    },
    contents,
    contentFavorites: contentFavs,
    songFavorites: songFavs,
    prayers,
    activityRegistrations: regs,
    following,
    followers,
    notifications,
    comments,
  };

  const res = NextResponse.json(payload);
  res.headers.set('Content-Disposition', `attachment; filename="my-data-${user.id}.json"`);
  return res;
});
