import { NextRequest } from 'next/server';
import { one, exec } from '@/server/db';
import { ok, withApi, HttpError, clientIp } from '@/server/http';
import { requireModeratorModule } from '@/server/moderation';
import { audit } from '@/server/services';
import { AUDIO_TYPES, normalizeAudioType } from '@/server/mappers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 管理员更正诗歌的音频类型、授权说明与外部人声试听外链。
 * 用途:投稿音频经人工试听后确认是真人演唱,由伴奏改标 vocal;
 *      或发现标错(如把合成伴奏标成了原唱)时纠正;
 *      或核实到这首歌在别处有人声演唱版时,登记 listen_url 把听众送过去。
 * 只允许改元数据:既不改音频文件本身,也不下载外部音频到本站。
 */
export const PATCH = withApi(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const admin = await requireModeratorModule(req, 'songs');
  const id = params.id;

  const song = await one<any>(
    `SELECT id, title, audio_url, audio_type, audio_credit, listen_url, listen_source, chords, original_key
       FROM songs WHERE id = ?`,
    [id]
  );
  if (!song) throw new HttpError(404, 'NOT_FOUND', '诗歌不存在');

  const body = await req.json().catch(() => ({}));
  const nextType = body.audioType === undefined ? undefined : String(body.audioType);
  const nextCredit = body.audioCredit === undefined ? undefined : String(body.audioCredit).trim();
  const nextListenUrl = body.listenUrl === undefined ? undefined : String(body.listenUrl).trim();
  const nextListenSource = body.listenSource === undefined ? undefined : String(body.listenSource).trim();
  const nextChords = body.chords === undefined ? undefined : String(body.chords);
  const nextOriginalKey = body.originalKey === undefined ? undefined : String(body.originalKey).trim().slice(0, 8);

  if (nextType !== undefined && !(AUDIO_TYPES as readonly string[]).includes(nextType)) {
    throw new HttpError(422, 'VALIDATION_FAILED', `audioType 只能是 ${AUDIO_TYPES.join(' / ')}`);
  }
  if (nextType === 'vocal' && !song.audio_url) {
    throw new HttpError(422, 'VALIDATION_FAILED', '该诗歌没有音频文件，不能标记为人声演唱');
  }
  if (nextType !== undefined && nextType !== 'none' && nextCredit === '' && !song.audio_credit) {
    throw new HttpError(422, 'VALIDATION_FAILED', '标记有音频时必须填写演唱者与授权说明');
  }
  if (nextListenUrl !== undefined && nextListenUrl !== '' && !/^https?:\/\//i.test(nextListenUrl)) {
    throw new HttpError(422, 'VALIDATION_FAILED', 'listenUrl 必须是 http(s) 开头的链接');
  }
  if (nextListenUrl !== undefined && nextListenUrl.length > 500) {
    throw new HttpError(422, 'VALIDATION_FAILED', 'listenUrl 过长（上限 500 字符）');
  }
  if (nextListenSource !== undefined && nextListenSource.length > 40) {
    throw new HttpError(422, 'VALIDATION_FAILED', 'listenSource 过长（上限 40 字符）');
  }
  if (
    nextType === undefined && nextCredit === undefined &&
    nextListenUrl === undefined && nextListenSource === undefined &&
    nextChords === undefined && nextOriginalKey === undefined
  ) {
    throw new HttpError(422, 'VALIDATION_FAILED', '没有需要更新的字段');
  }

  const fields: string[] = [];
  const args: any[] = [];
  if (nextType !== undefined) { fields.push('audio_type = ?'); args.push(nextType); }
  if (nextCredit !== undefined) { fields.push('audio_credit = ?'); args.push(nextCredit); }
  if (nextListenUrl !== undefined) { fields.push('listen_url = ?'); args.push(nextListenUrl); }
  if (nextListenSource !== undefined) { fields.push('listen_source = ?'); args.push(nextListenSource); }
  if (nextChords !== undefined) { fields.push('chords = ?'); args.push(nextChords); }
  if (nextOriginalKey !== undefined) { fields.push('original_key = ?'); args.push(nextOriginalKey); }
  await exec(`UPDATE songs SET ${fields.join(', ')} WHERE id = ?`, [...args, id]);

  const before = normalizeAudioType(song.audio_type, song.audio_url);
  const after = nextType !== undefined ? nextType : before;
  await audit(
    admin.id, 'SONG_META_UPDATE', 'songs', id,
    `诗歌「${song.title}」音频类型 ${before} -> ${after}` +
      (nextCredit !== undefined ? `，授权说明：${nextCredit || '(清空)'}` : '') +
      (nextListenUrl !== undefined ? `，外部试听：${nextListenUrl || '(清空)'}` : '') +
      (nextChords !== undefined ? `，和弦谱：${nextChords ? '已更新' : '(清空)'}` : '') +
      (nextOriginalKey !== undefined ? `，原调：${nextOriginalKey || '(清空)'}` : ''),
    clientIp(req)
  );

  return ok({
    id,
    audioType: after,
    audioCredit: nextCredit !== undefined ? nextCredit : song.audio_credit || '',
    listenUrl: nextListenUrl !== undefined ? nextListenUrl : song.listen_url || '',
    listenSource: nextListenSource !== undefined ? nextListenSource : song.listen_source || '',
    chords: nextChords !== undefined ? nextChords : song.chords || '',
    originalKey: nextOriginalKey !== undefined ? nextOriginalKey : song.original_key || '',
  });
});
