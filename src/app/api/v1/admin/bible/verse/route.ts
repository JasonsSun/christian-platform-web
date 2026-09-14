import { NextRequest } from 'next/server';
import { one, exec } from '@/server/db';
import { ok, withApi, HttpError, clientIp } from '@/server/http';
import { requireRole } from '@/server/auth';
import { audit } from '@/server/services';
import { cacheDelPrefix } from '@/server/cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 修订单节经文（错别字 / 录入错误纠正）。
 * 圣经正文属权威数据：仅 admin 可改，每次修订都写审计，便于追溯。
 * 只改文本，不改章节结构，也不允许增删经文。
 */
export const PATCH = withApi(async (req: NextRequest) => {
  const admin = await requireRole(req, ['admin']);

  const body = await req.json().catch(() => ({}));
  const version = String(body.version || '').trim();
  const book = String(body.book || '').trim();
  const chapter = Number(body.chapter);
  const verse = Number(body.verse);
  const text = String(body.text ?? '').trim();

  if (!version || !book) throw new HttpError(422, 'VALIDATION_FAILED', '版本与书卷不能为空');
  if (!Number.isInteger(chapter) || chapter < 1) throw new HttpError(422, 'VALIDATION_FAILED', '章号无效');
  if (!Number.isInteger(verse) || verse < 1) throw new HttpError(422, 'VALIDATION_FAILED', '节号无效');
  if (!text) throw new HttpError(422, 'VALIDATION_FAILED', '经文内容不能为空');
  if (text.length > 1000) throw new HttpError(422, 'VALIDATION_FAILED', '经文过长（上限 1000 字符）');

  const row = await one<any>(
    `SELECT id, text FROM bible_verses WHERE version=? AND book_id=? AND chapter=? AND verse=?`,
    [version, book, chapter, verse]
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', '该节经文不存在');
  if (String(row.text) === text) throw new HttpError(422, 'VALIDATION_FAILED', '内容没有变化');

  await exec(`UPDATE bible_verses SET text=? WHERE id=?`, [text, row.id]);
  await audit(
    admin.id, 'BIBLE_VERSE_UPDATE', 'bible_verses', String(row.id),
    `${version} ${book} ${chapter}:${verse} 修订：「${String(row.text).slice(0, 60)}」→「${text.slice(0, 60)}」`,
    clientIp(req)
  );
  // 章节接口有 1h 内存缓存，改完必须失效，否则前台仍显示旧经文
  cacheDelPrefix('bible:chapter:');

  return ok({ version, book, chapter, verse, text });
});
