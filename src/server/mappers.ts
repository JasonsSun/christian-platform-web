/** 数据库行 -> API 输出(camelCase) */

/** 音频类型白名单。老数据/内置 mock 没有 audio_type 时,按有无 audio_url 兜底推断。 */
export const AUDIO_TYPES = ['vocal', 'instrumental', 'none'] as const;
export type AudioType = (typeof AUDIO_TYPES)[number];

export function normalizeAudioType(raw: unknown, audioUrl?: unknown): AudioType {
  const v = String(raw ?? '');
  if ((AUDIO_TYPES as readonly string[]).includes(v)) return v as AudioType;
  return audioUrl ? 'instrumental' : 'none';
}

export const mapUser = (r: any) => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name ?? r.displayName,
  role: r.role,
  status: r.status,
  avatarColor: r.avatar_color ?? r.author_color ?? '#4f6df5',
  bio: r.bio || '',
  city: r.city || '',
  church: r.church || '',
  createdAt: r.created_at ?? r.createdAt,
});

export const mapAuthor = (r: any) => ({
  id: r.author_id,
  username: r.author_username,
  displayName: r.author_name,
  avatarColor: r.author_color,
});

export const mapContent = (r: any) => ({
  id: r.id,
  title: r.title,
  body: r.body,
  excerpt: (r.body || '').replace(/\s+/g, ' ').slice(0, 120),
  contentType: r.content_type,
  status: r.status,
  scope: r.scope,
  tags: r.tags ? String(r.tags).split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [],
  cover: r.cover,
  likeCount: r.like_count,
  commentCount: r.comment_count,
  viewCount: r.view_count,
  createdAt: r.created_at,
  publishedAt: r.published_at,
  liked: !!r.liked,
  author: mapAuthor(r),
});

export const mapComment = (r: any) => ({
  id: r.id,
  body: r.body,
  createdAt: r.created_at,
  /** 图片附件地址，无图为空串 */
  attachment: r.attachment || '',
  user: {
    id: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarColor: r.avatar_color,
  },
});

export const mapActivity = (r: any) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  category: r.category,
  location: r.location,
  city: r.city,
  lat: r.lat != null ? Number(r.lat) : null,
  lng: r.lng != null ? Number(r.lng) : null,
  startAt: r.start_at,
  endAt: r.end_at,
  capacity: r.capacity,
  cover: r.cover,
  status: r.status,
  createdAt: r.created_at,
  confirmedCount: Number(r.confirmed_count || 0),
  waitlistCount: Number(r.waitlist_count || 0),
  registered: !!r.registered,
  myStatus: r.my_status || null,
  organizer: {
    id: r.organizer_id,
    username: r.organizer_username,
    displayName: r.organizer_name,
    avatarColor: r.organizer_color,
  },
});

export const mapGroup = (r: any) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  category: r.category,
  city: r.city,
  cover: r.cover,
  announcement: r.announcement || '',
  announcedAt: r.announced_at || null,
  createdAt: r.created_at,
  memberCount: Number(r.member_count || 0),
  joined: !!r.joined,
  owner: {
    id: r.owner_id,
    username: r.owner_username,
    displayName: r.owner_name,
    avatarColor: r.owner_color,
  },
});

export const mapPrayer = (r: any) => ({
  id: r.id,
  body: r.body,
  amenCount: r.amen_count,
  answered: !!r.answered,
  createdAt: r.created_at,
  amened: !!r.amened,
  user: {
    id: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarColor: r.avatar_color,
  },
});

export const mapNotification = (r: any) => ({
  id: r.id,
  type: r.type,
  title: r.title,
  body: r.body,
  link: r.link,
  read: !!r.read,
  createdAt: r.created_at,
});

export const mapSong = (r: any) => ({
  id: r.id,
  title: r.title,
  author: r.author,
  category: r.category,
  tags: r.tags ? String(r.tags).split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [],
  lyrics: r.lyrics,
  audioUrl: r.audio_url,
  audioType: normalizeAudioType(r.audio_type, r.audio_url),
  audioCredit: r.audio_credit || '',
  listenUrl: r.listen_url || '',
  listenSource: r.listen_source || '',
  playCount: r.play_count,
  source: r.source || 'internal',
  status: r.status || 'published',
  chords: r.chords || '',
  originalKey: r.original_key || '',
  createdAt: r.created_at,
});

export const mapReviewTask = (r: any) => ({
  id: r.id,
  status: r.status,
  reason: r.reason,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
  content: {
    id: r.content_id,
    title: r.title,
    body: r.body,
    contentType: r.content_type,
    status: r.content_status,
    createdAt: r.content_created_at,
    author: {
      id: r.author_id,
      username: r.username,
      displayName: r.display_name,
      avatarColor: r.avatar_color,
    },
  },
});

export const mapMessage = (r: any) => ({
  id: r.id,
  body: r.body,
  read: !!r.read,
  createdAt: r.created_at,
  fromId: r.from_id,
  toId: r.to_id,
  /** 图片附件地址，无图为空串 */
  attachment: r.attachment || '',
  /** 发送方撤回时间：非空表示该条已撤回 */
  recalledAt: r.recalled_at || null,
  /** 已读时间：配合 read 布尔，让发送方知道对方何时读过 */
  readAt: r.read_at || null,
  /**
   * 该条是否仍可撤回（由服务端用 UTC_TIMESTAMP() 判定）。
   * 不放在前端算：列里存的是 UTC 字面量，前端拿到的字符串时区语义不可靠。
   */
  canRecall: !!r.can_recall,
});
