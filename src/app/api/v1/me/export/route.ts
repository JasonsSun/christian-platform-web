import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/server/db';
import { withApi } from '@/server/http';
import { requireUser, publicUser, UserRow } from '@/server/auth';
import { ensureDevotionalsTable } from '@/server/devotionals';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/export -> 导出本人全部数据(GDPR 数据可携带性) */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  // 灵修日记表是运行时幂等补建的，先确保存在，否则老库上导出会整体失败
  await ensureDevotionalsTable();
  const [
    contents, contentFavs, songFavs, prayers, regs, following, followers, notifications, comments,
    bookmarks, devotionals, checkins, pushSubs,
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
    // 读经高亮与笔记（自建的灵修数据，属于用户最在意的部分）
    q<any>(`SELECT id, version, book_id, chapter, verse, note, created_at FROM bible_bookmarks WHERE user_id = ? ORDER BY created_at DESC`, [user.id]),
    // 灵修日记
    q<any>(`SELECT id, title, body, ref, mood, created_at, updated_at FROM devotionals WHERE user_id = ? ORDER BY created_at DESC`, [user.id]),
    // 读经打卡记录
    q<any>(`SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, streak, created_at FROM user_daily_checkins WHERE user_id = ? ORDER BY day DESC`, [user.id]),
    // 浏览器推送订阅：表按需建(未配推送凭证时压根不存在)，查不到按空算，
    // 不能让一张可选表把整个导出拖成 500
    q<any>(`SELECT endpoint, user_agent, created_at FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC`, [user.id]).catch(() => [] as any[]),
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
      bibleBookmarks: bookmarks.length,
      devotionals: devotionals.length,
      checkins: checkins.length,
      pushSubscriptions: pushSubs.length,
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
    bibleBookmarks: bookmarks,
    devotionals,
    checkins,
    pushSubscriptions: pushSubs,
  };

  const res = NextResponse.json(payload);
  res.headers.set('Content-Disposition', `attachment; filename="my-data-${user.id}.json"`);
  return res;
});
