import { NextRequest } from 'next/server';
import { exec, one, q, newId, ts } from '@/server/db';
import { ok, withApi, badRequest } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { bookById } from '@/server/bible';

export const dynamic = 'force-dynamic';

/** GET /api/v1/bible/bookmarks?version=cuv&book=john&chapter=1 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const sp = new URL(req.url).searchParams;
  const version = sp.get('version') || 'cuv';
  const bookId = sp.get('book');
  const chapter = sp.get('chapter');
  const where = ['user_id = ?', 'version = ?'];
  const args: any[] = [user.id, version];
  if (bookId) { where.push('book_id = ?'); args.push(bookId); }
  if (chapter) { where.push('chapter = ?'); args.push(Number(chapter)); }
  const rows = await q<any>(
    `SELECT id, version, book_id, chapter, verse, note,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM bible_bookmarks WHERE ${where.join(' AND ')} ORDER BY created_at DESC`,
    args
  );
  return ok({
    items: rows.map((r) => ({
      id: r.id, version: r.version, bookId: r.book_id, chapter: r.chapter,
      verse: r.verse, note: r.note, createdAt: r.created_at,
      bookName: bookById(r.book_id)?.name || r.book_id,
    })),
  });
});

/** POST /api/v1/bible/bookmarks  body:{version?,bookId,chapter,verse?,note?}  -> 切换书签 */
export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const b = await (await import('@/server/http')).readJson<{
    version?: string; bookId: string; chapter: number; verse?: number; note?: string;
  }>(req);
  if (!b.bookId || !b.chapter) throw badRequest('缺少书卷或章节');
  const version = b.version || 'cuv';
  const verse = Number(b.verse || 0);
  const existing = await one<any>(
    `SELECT id FROM bible_bookmarks WHERE user_id=? AND version=? AND book_id=? AND chapter=? AND verse=?`,
    [user.id, version, b.bookId, b.chapter, verse]
  );
  if (existing) {
    await exec(`DELETE FROM bible_bookmarks WHERE id=?`, [existing.id]);
    return ok({ bookmarked: false, id: existing.id });
  }
  const id = newId('bm');
  await exec(
    `INSERT INTO bible_bookmarks (id, user_id, version, book_id, chapter, verse, note, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, user.id, version, b.bookId, b.chapter, verse, (b.note || '').slice(0, 280), ts()]
  );
  return ok({ bookmarked: true, id });
});
