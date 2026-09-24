import { exec, q, newId, ts } from './db';
import { fanout, runNotifyJobs } from './notify';
import { notifyPublish } from './notifyBus';

/* ---------------- 通知 ---------------- */
/**
 * 唯一通知入口:先落站内通知,再按用户偏好扇出到邮件/微信/短信队列。
 * fanout 内部已吞掉异常,外部通道故障不会影响主流程。
 */
export async function notify(userId: string, type: string, title: string, body: string, link = '') {
  if (!userId) return;
  await exec(
    `INSERT INTO notifications (id, user_id, type, title, body, link, \`read\`, created_at)
     VALUES (?,?,?,?,?,?,0,?)`,
    [newId('ntf'), userId, type, title, body, link, ts()]
  );
  await fanout(userId, type, title, body, link);
  // 实时推送(SSE):仅推给该用户的在线连接,无连接则静默跳过(通知已落库)
  try {
    notifyPublish(userId, { type, title, body, link, createdAt: new Date().toISOString() });
  } catch {
    /* SSE 总线异常不影响主流程 */
  }
}

export async function notifyRole(roles: string[], type: string, title: string, body: string, link = '') {
  const rows = await q<{ id: string }>(
    `SELECT id FROM users WHERE role IN (${roles.map(() => '?').join(',')}) AND status='active'`, roles
  );
  for (const r of rows) await notify(r.id, type, title, body, link);
}

/* ---------------- 审计 ---------------- */
export async function audit(
  actorId: string | null,
  action: string,
  entityType = '',
  entityId = '',
  detail = '',
  ip = ''
) {
  await exec(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, detail, ip, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [newId('aud'), actorId, action, entityType, entityId || '', detail.slice(0, 500), ip, ts()]
  );
}

/* ---------------- 事务性发件箱 ---------------- */
export async function emit(eventType: string, payload: Record<string, any>) {
  await exec(
    `INSERT INTO outbox (id, event_type, payload, status, created_at) VALUES (?,?,?,'pending',?)`,
    [newId('evn'), eventType, JSON.stringify(payload), ts()]
  );
}

/**
 * 事件派发器(演示环境同步执行;生产环境由消费者进程消费 outbox)
 * content.* / comment.* / like / activity.* / group.* / prayer.*
 */
export async function dispatchOutbox(limit = 50) {
  const rows = await q<{ id: string; event_type: string; payload: any }>(
    `SELECT id, event_type, payload FROM outbox WHERE status='pending' ORDER BY created_at LIMIT ?`,
    [limit]
  );
  for (const row of rows) {
    try {
      const p = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      await handle(row.event_type, p);
      await exec(`UPDATE outbox SET status='done', processed_at=? WHERE id=?`, [ts(), row.id]);
    } catch (e) {
      console.error('[outbox]', row.event_type, e);
      await exec(`UPDATE outbox SET status='failed', processed_at=? WHERE id=?`, [ts(), row.id]);
    }
  }

  // 事件处理完,顺带冲刷一次外部通道队列(邮件/微信/短信)
  try {
    await runNotifyJobs(50);
  } catch (e) {
    console.error('[outbox] notify dispatch failed', e);
  }
}

async function handle(type: string, p: any) {
  const c = await q<any>(`SELECT author_id, title FROM contents WHERE id=?`, [p.contentId]);
  const content = c[0];
  switch (type) {
    case 'content.submitted':
      await notifyRole(
        ['moderator', 'admin'], 'content_pending', '新的待审核内容',
        `《${p.title || content?.title || ''}》等待审核`, '/admin/reviews'
      );
      break;
    case 'content.approved':
      await notify(content?.author_id, 'content_approved', '内容已通过审核',
        `《${content?.title || ''}》已发布`, `/contents/${p.contentId}`);
      break;
    case 'content.rejected':
      await notify(content?.author_id, 'content_rejected', '内容未通过审核',
        `《${content?.title || ''}》未通过：${p.reason || '不符合社区规范'}`, '');
      break;
    case 'comment.created':
      if (content && content.author_id !== p.actorId) {
        await notify(content.author_id, 'new_comment', '收到新评论',
          `${p.actorName} 评论了《${content.title}》`, `/contents/${p.contentId}`);
      }
      break;
    case 'content.liked':
      if (content && content.author_id !== p.actorId) {
        await notify(content.author_id, 'new_like', '收到新的点赞',
          `${p.actorName} 赞了《${content.title}》`, `/contents/${p.contentId}`);
      }
      break;
    case 'activity.registered': {
      const a = await q<any>(`SELECT organizer_id, title FROM activities WHERE id=?`, [p.activityId]);
      const act = a[0];
      if (act && act.organizer_id !== p.actorId) {
        await notify(act.organizer_id, 'activity_registered', '有人报名你的活动',
          `${p.actorName} 报名了《${act.title}》${p.status === 'waitlist' ? '（候补）' : ''}`,
          `/activities/${p.activityId}`);
      }
      break;
    }
    case 'group.joined': {
      const g = await q<any>(`SELECT owner_id, name FROM \`groups\` WHERE id=?`, [p.groupId]);
      const grp = g[0];
      if (grp && grp.owner_id !== p.actorId) {
        await notify(grp.owner_id, 'group_joined', '新成员加入',
          `${p.actorName} 加入了团契《${grp.name}》`, `/groups/${p.groupId}`);
      }
      break;
    }
    case 'group.posted': {
      const g = await q<any>(`SELECT name FROM \`groups\` WHERE id=?`, [p.groupId]);
      const members = await q<{ user_id: string }>(
        `SELECT user_id FROM group_members WHERE group_id=? AND user_id<>?`, [p.groupId, p.actorId]);
      for (const m of members) {
        await notify(m.user_id, 'group_post', '团契新动态',
          `${p.actorName} 在《${g[0]?.name || ''}》发布了新内容`, `/groups/${p.groupId}`);
      }
      break;
    }
    case 'prayer.amen': {
      const pr = await q<any>(`SELECT user_id FROM prayers WHERE id=?`, [p.prayerId]);
      if (pr[0] && pr[0].user_id !== p.actorId) {
        await notify(pr[0].user_id, 'prayer_amen', '有人为你的代祷阿们',
          `${p.actorName} 为你的代祷事项按了阿们`, '/prayers');
      }
      break;
    }
    default:
      break;
  }
}
