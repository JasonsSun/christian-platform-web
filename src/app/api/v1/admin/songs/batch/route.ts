import { NextRequest } from 'next/server';
import { exec, newId, one, ts } from '@/server/db';
import { ok, withApi, HttpError, clientIp } from '@/server/http';
import { requireRole } from '@/server/auth';
import { audit } from '@/server/services';
import { parseSongBatch } from '@/server/songBatch';
import { str } from '@/server/sanitize';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 管理员批量导入诗歌：解析纯文本，逐首建库（source=batch, status=published）。同名同作者幂等跳过。 */
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireRole(req, ['admin']);
  const body = await req.json().catch(() => ({}));
  const songs = parseSongBatch(str(body?.text));
  if (!songs.length) throw new HttpError(422, 'VALIDATION_FAILED', '没有解析到任何诗歌，请检查格式');

  const created: string[] = [];
  const skipped: { title: string; reason: string }[] = [];
  const errors: { line: number; title: string; reason: string }[] = [];

  for (const s of songs) {
    if (!s.title) {
      errors.push({ line: s.line, title: '(无标题)', reason: '缺少标题' });
      continue;
    }
    if (!s.lyrics) {
      errors.push({ line: s.line, title: s.title, reason: '缺少歌词内容' });
      continue;
    }
    const authorName = s.author || '佚名';
    const dup = await one<any>(`SELECT id FROM songs WHERE title = ? AND author = ?`, [s.title, authorName]);
    if (dup) {
      skipped.push({ title: s.title, reason: '同名诗歌已存在' });
      continue;
    }
    const id = newId('sng');
    await exec(
      `INSERT INTO songs
         (id, title, author, category, tags, lyrics, chords, original_key, audio_url, audio_type, audio_credit,
          listen_url, listen_source, play_count, source, submitter_id, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,'batch',?, 'published', ?)`,
      [
        id, s.title, authorName, s.category, s.tags, s.lyrics, s.chords, s.originalKey,
        '', 'none', '', '', '', admin.id, ts(),
      ]
    );
    created.push(s.title);
  }

  await audit(
    admin.id,
    'SONG_BATCH_IMPORT',
    'songs',
    '-',
    `批量导入诗歌：新建 ${created.length} 首，跳过 ${skipped.length} 首，错误 ${errors.length} 首`,
    clientIp(req)
  );

  return ok(
    {
      total: songs.length,
      created: created.length,
      skipped: skipped.length,
      errors: errors.length,
      detail: { created, skipped: skipped.map((s) => s.title), errors },
    },
    201
  );
});
