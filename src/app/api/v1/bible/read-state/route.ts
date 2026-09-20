import { NextRequest } from 'next/server';
import { exec, one, q, newId, ts } from '@/server/db';
import { ok, withApi, badRequest, readJson } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';

export const dynamic = 'force-dynamic';

// 一卷里最长的章也只有百余节，留出十倍余量只为挡住伪造的超长数组
const MAX_VERSE_NO = 2000;

function parseVerses(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<number>();
  for (const v of raw) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isInteger(n) && n > 0 && n <= MAX_VERSE_NO) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

const splitStored = (s: string | null | undefined) =>
  parseVerses((s || '').split(',').map((x) => Number(x)).filter(Boolean));

/** GET /api/v1/bible/read-state?version=cuv&bookId=john&chapter=3 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const sp = req.nextUrl.searchParams;
  const version = sp.get('version') || 'cuv';
  const bookId = sp.get('bookId') || '';
  const chapter = Number(sp.get('chapter'));
  if (!bookId || !Number.isInteger(chapter) || chapter <= 0) throw badRequest('缺少书卷或章节');

  const [row, hist] = await Promise.all([
    one<any>(
      `SELECT verses FROM bible_verse_read WHERE user_id=? AND version=? AND book_id=? AND chapter=?`,
      [user.id, version, bookId, chapter]
    ),
    q<any>(
      `SELECT 1 FROM bible_reading_history WHERE user_id=? AND version=? AND book_id=? AND chapter=? LIMIT 1`,
      [user.id, version, bookId, chapter]
    ),
  ]);
  return ok({ chapterRead: hist.length > 0, verses: splitStored(row?.verses) });
});

/** POST {version,bookId,chapter,verses:number[]} —— 与已存的取并集，重复读不会丢掉旧记录 */
export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const b = await readJson<{ version?: string; bookId: string; chapter: number; verses: unknown }>(req);
  const version = b.version || 'cuv';
  const chapter = Number(b.chapter);
  if (!b.bookId || !Number.isInteger(chapter) || chapter <= 0) throw badRequest('缺少书卷或章节');
  const incoming = parseVerses(b.verses);
  if (!incoming.length) return ok({ ok: true, verses: [] });

  const cur = await one<any>(
    `SELECT verses FROM bible_verse_read WHERE user_id=? AND version=? AND book_id=? AND chapter=?`,
    [user.id, version, b.bookId, chapter]
  );
  const merged = parseVerses([...splitStored(cur?.verses), ...incoming]);
  await exec(
    `INSERT INTO bible_verse_read (id, user_id, version, book_id, chapter, verses, updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE verses = VALUES(verses), updated_at = VALUES(updated_at)`,
    [newId('vr'), user.id, version, b.bookId, chapter, merged.join(','), ts()]
  );
  return ok({ ok: true, verses: merged });
});
