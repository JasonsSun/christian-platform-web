import { NextRequest } from 'next/server';
import { one, exec } from '@/server/db';
import { ok, withApi, HttpError } from '@/server/http';
import { requireModeratorModule } from '@/server/moderation';
import { audit, notify } from '@/server/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 管理员审核用户投稿的诗歌：通过(published) / 拒绝(rejected) */
export const POST = withApi(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const admin = await requireModeratorModule(req, 'songs');
  const id = params.id;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || ''); // approve | reject
  const reason = String(body.reason || '').trim();
  if (action !== 'approve' && action !== 'reject') {
    throw new HttpError(422, 'VALIDATION_FAILED', 'action 必须为 approve 或 reject');
  }

  const song = await one<any>(`SELECT id, title, submitter_id, status FROM songs WHERE id = ?`, [id]);
  if (!song) throw new HttpError(404, 'NOT_FOUND', '诗歌不存在');
  if (song.status !== 'pending') throw new HttpError(409, 'CONFLICT', '该投稿已审核过');

  const status = action === 'approve' ? 'published' : 'rejected';
  await exec(`UPDATE songs SET status = ? WHERE id = ?`, [status, id]);

  await audit(admin.id, 'SONG_REVIEW', 'songs', id,
    `${action === 'approve' ? '通过' : '拒绝'}诗歌投稿「${song.title}」${reason ? `：${reason}` : ''}`, '');

  if (song.submitter_id) {
    if (action === 'approve') {
      await notify(song.submitter_id, 'song_approved', '投稿已通过',
        `你的诗歌「${song.title}」已通过审核，现在可以被大家搜索和试听了`, `/songs/${id}`);
    } else {
      await notify(song.submitter_id, 'song_rejected', '投稿未通过',
        `你的诗歌「${song.title}」未通过审核${reason ? `：${reason}` : ''}`, `/songs`);
    }
  }

  return ok({ id, status, action });
});