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

/**
 * DELETE /api/v1/bible/bookmarks
 * 删除书签/笔记。两种定位方式(二选一):
 *   ?id=<书签ID>
 *   ?version=cuv&book=john&chapter=3&verse=5   (verse 省略视为 0 整章)
 * 此前只能「收藏/取消收藏」或「把笔记文本清空」,用户无法真正删掉一条笔记标签。
 */
export const DELETE = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const sp = new URL(req.url).searchParams;
  const id = sp.get('id');
  let affected = 0;
  if (id) {
    const r = await exec(`DELETE FROM bible_bookmarks WHERE id=? AND user_id=?`, [id, user.id]);
    affected = (r as any).affectedRows ?? 0;
  } else {
    const bookId = sp.get('book');
    const chapter = sp.get('chapter');
    if (!bookId || !chapter) throw badRequest('缺少书签定位参数');
    const r = await exec(
      `DELETE FROM bible_bookmarks WHERE user_id=? AND version=? AND book_id=? AND chapter=? AND verse=?`,
      [user.id, sp.get('version') || 'cuv', bookId, Number(chapter), Number(sp.get('verse') || 0)]
    );
    affected = (r as any).affectedRows ?? 0;
  }
  return ok({ deleted: affected > 0 });
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
  // 显式携带 note 字段 = 笔记保存/编辑操作: upsert, 保留收藏(允许把笔记清空)
  const note = b.note === undefined ? undefined : (b.note || '').slice(0, 280);
  const existing = await one<any>(
    `SELECT id FROM bible_bookmarks WHERE user_id=? AND version=? AND book_id=? AND chapter=? AND verse=?`,
    [user.id, version, b.bookId, b.chapter, verse]
  );
  if (note !== undefined) {
    if (existing) {
      await exec(`UPDATE bible_bookmarks SET note=? WHERE id=?`, [note, existing.id]);
      return ok({ bookmarked: true, id: existing.id });
    }
    const id = newId('bm');
    await exec(
      `INSERT INTO bible_bookmarks (id, user_id, version, book_id, chapter, verse, note, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, user.id, version, b.bookId, b.chapter, verse, note, ts()]
    );
    return ok({ bookmarked: true, id });
  }
  // 不带 note = 收藏切换(原语义): 已收藏则删除, 未收藏则新增
  if (existing) {
    await exec(`DELETE FROM bible_bookmarks WHERE id=?`, [existing.id]);
    return ok({ bookmarked: false, id: existing.id });
  }
  const id = newId('bm');
  await exec(
    `INSERT INTO bible_bookmarks (id, user_id, version, book_id, chapter, verse, note, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, user.id, version, b.bookId, b.chapter, verse, '', ts()]
  );
  return ok({ bookmarked: true, id });
});
