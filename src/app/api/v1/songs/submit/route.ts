import { NextRequest } from 'next/server';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { once } from 'events';
import path from 'path';
import { promises as fs } from 'fs';
import { exec, newId, ts } from '@/server/db';
import { ok, withApi, HttpError, clientIp } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { audit, notifyRole, notify } from '@/server/services';
import { extOf, guessMime, validateUpload } from '@/server/media';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 30 * 1024 * 1024; // 投稿音频上限 30MB

/** 流式落盘音频文件，返回可公开访问的 URL */
async function saveAudioFile(file: File): Promise<{ url: string; size: number }> {
  const now = new Date();
  const dir = `uploads/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const absDir = path.join(process.cwd(), 'public', dir);
  await fs.mkdir(absDir, { recursive: true });
  const name = `${newId('sng')}.${extOf(file.name) || 'mp3'}`;
  const abs = path.join(absDir, name);
  let size = 0;
  const ws = createWriteStream(abs);
  const rs = Readable.fromWeb(file.stream() as any);
  for await (const chunk of rs) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_AUDIO_BYTES) {
      ws.destroy();
      await fs.unlink(abs).catch(() => {});
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', '音频文件超过 30MB 上限');
    }
    if (!ws.write(buf)) await once(ws, 'drain');
  }
  ws.end();
  await once(ws, 'finish');
  return { url: `/uploads/${dir}/${name}`, size };
}

/** 用户投稿赞美诗歌：可只填歌词，或附带音频文件。收录为歌曲(非媒体文件)，待管理员审核。 */
export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;

  const form = await req.formData();

  const title = String(form.get('title') || '').trim();
  const author = String(form.get('author') || '').trim();
  const category = String(form.get('category') || '赞美').trim();
  const tags = String(form.get('tags') || '').trim();
  const lyrics = String(form.get('lyrics') || '').trim();
  const chords = String(form.get('chords') || '').trim();
  const originalKey = String(form.get('originalKey') || '').trim().slice(0, 8);
  const credit = String(form.get('audioCredit') || '').trim();
  const rawType = String(form.get('audioType') || '').trim();
  // 可选：不提供音频、但提供一个“这首歌在哪儿能听到人声版”的外部链接
  const listenUrl = String(form.get('listenUrl') || '').trim();
  const listenSource = String(form.get('listenSource') || '').trim();

  if (!title) throw new HttpError(422, 'VALIDATION_FAILED', '请填写诗歌标题');
  if (!lyrics) throw new HttpError(422, 'VALIDATION_FAILED', '请填写歌词内容');
  if (listenUrl && !/^https?:\/\//i.test(listenUrl)) {
    throw new HttpError(422, 'VALIDATION_FAILED', '外部试听链接必须是 http(s) 开头的地址');
  }
  if (listenUrl.length > 500) throw new HttpError(422, 'VALIDATION_FAILED', '外部试听链接过长（上限 500 字符）');
  if (listenSource.length > 40) throw new HttpError(422, 'VALIDATION_FAILED', '外部试听来源名过长（上限 40 字符）');

  // 可选音频文件
  const file = form.get('audio');
  let audioUrl = '';
  let audioSize = 0;
  if (file instanceof File && file.size > 0) {
    const ext = extOf(file.name);
    const mime = file.type || guessMime(ext);
    const v = await validateUpload(file.name, mime, file.size);
    if (!v.ok) throw new HttpError(422, 'VALIDATION_FAILED', v.reason || '音频文件校验未通过');
    if (v.kind !== 'audio') throw new HttpError(422, 'VALIDATION_FAILED', '仅支持上传音频文件(mp3/wav/m4a/aac/ogg/flac)');
    const saved = await saveAudioFile(file);
    audioUrl = saved.url;
    audioSize = saved.size;
  }

  // 音频类型：上传了音频必须明确是"真人演唱"还是"伴奏"，不允许含糊地默认成人声
  let audioType: 'vocal' | 'instrumental' | 'none' = 'none';
  if (audioUrl) {
    if (rawType === 'vocal' || rawType === 'instrumental') audioType = rawType;
    else if (!rawType) audioType = 'instrumental';
    else throw new HttpError(422, 'VALIDATION_FAILED', '音频类型只能是 vocal(真人演唱) 或 instrumental(伴奏)');
    if (!credit) {
      throw new HttpError(422, 'VALIDATION_FAILED', '附带音频时必须填写演唱者与授权说明，例如"演唱：光盐诗班 / 已获教会授权"');
    }
  }

  const id = newId('sng');
  await exec(
    `INSERT INTO songs
       (id, title, author, category, tags, lyrics, chords, original_key, audio_url, audio_type, audio_credit,
        listen_url, listen_source, play_count, source, submitter_id, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,'upload',?,'pending',?)`,
    [id, title, author || '佚名', category, tags, lyrics, chords, originalKey, audioUrl, audioType,
     audioUrl ? credit : '', listenUrl, listenUrl ? listenSource : '', user.id, ts()]
  );

  const typeLabel = audioType === 'vocal' ? '真人演唱' : audioType === 'instrumental' ? '伴奏' : '无音频';
  await audit(user.id, 'SONG_SUBMIT', 'songs', id,
    `投稿赞美诗歌「${title}」${audioUrl ? `(含${typeLabel}音频 ${(audioSize / 1024 / 1024).toFixed(1)}MB / ${credit})` : '(纯歌词)'}` +
      (listenUrl ? `，附外部人声试听链接 ${listenUrl}` : ''), clientIp(req));
  await notifyRole(['moderator', 'admin'], 'song_pending', '新的诗歌投稿待审核',
    `${user.display_name} 投稿了诗歌「${title}」${audioUrl ? `（${typeLabel}）` : ''}`, '/admin/songs?tab=pending');
  await notify(user.id, 'song_submitted', '投稿已收到',
    `你的诗歌「${title}」已提交，审核通过后即可被大家搜索到`, '/songs');

  return ok({
    id, title, author, category, tags, lyrics, audioUrl, audioType,
    audioCredit: audioUrl ? credit : '',
    listenUrl, listenSource: listenUrl ? listenSource : '',
    source: 'upload', status: 'pending',
    message: '投稿成功，审核通过后即可被大家看到',
  }, 201);
});