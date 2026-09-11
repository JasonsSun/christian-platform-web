export type Role = 'member' | 'moderator' | 'admin';

export interface User {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  role: Role;
  status: string;
  avatarColor: string;
  bio?: string;
  city?: string;
  church?: string;
  createdAt: string;
  stats?: {
    contents: number;
    followers: number;
    following: number;
    activities: number;
    groups?: number;
    unread?: number;
  };
}

export interface Author {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
}

export interface ContentItem {
  id: string;
  title: string;
  body: string;
  excerpt: string;
  contentType: string;
  status: string;
  tags: string[];
  cover: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  publishedAt: string | null;
  liked: boolean;
  author: Author;
  media?: MediaItem[];
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  user: Author;
}

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  city: string;
  startAt: string;
  endAt: string | null;
  capacity: number;
  cover: string;
  confirmedCount: number;
  waitlistCount: number;
  registered: boolean;
  myStatus: string | null;
  organizer: Author;
}

export interface GroupItem {
  id: string;
  name: string;
  description: string;
  category: string;
  city: string;
  cover: string;
  createdAt: string;
  memberCount: number;
  joined: boolean;
  owner: Author;
}

export interface SongItem {
  id: string;
  title: string;
  author: string;
  category: string;
  tags: string[];
  lyrics: string;
  audioUrl?: string;
  /** vocal=真人演唱 | instrumental=纯伴奏/合成 | none=暂无音频 */
  audioType?: AudioType;
  /** 演唱者与授权来源说明 */
  audioCredit?: string;
  /** 外部人声试听页地址（平台方核实后登记；留空则前台降级为按歌名搜索） */
  listenUrl?: string;
  /** 外部试听来源名，如 B站 / 网易云 / 教会授权 */
  listenSource?: string;
  durationSec?: number;
  playCount: number;
  createdAt: string;
}

export type AudioType = 'vocal' | 'instrumental' | 'none';

export interface PrayerItem {
  id: string;
  body: string;
  amenCount: number;
  answered: boolean;
  createdAt: string;
  amened: boolean;
  user: Author;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface Verse {
  version: string;
  bookId: string;
  bookName?: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface ReviewTask {
  id: string;
  status: string;
  reason: string;
  createdAt: string;
  decidedAt: string | null;
  content: {
    id: string;
    title: string;
    body: string;
    contentType: string;
    status: string;
    createdAt: string;
    author: Author;
  };
}

export interface MessageItem {
  id: string;
  body: string;
  read: boolean;
  createdAt: string;
  fromId: string;
  toId: string;
}

export interface Conversation {
  peer: Author & { city?: string };
  lastMessage: string;
  lastAt: string;
  unread: number;
}

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BibleBook {
  id: string;
  name: string;
  abbr: string;
  chapters: number;
  testament: 'old' | 'new';
  category: string;
}

export interface BibleMeta {
  versions: { id: string; name: string; fullName: string; language: string }[];
  books: BibleBook[];
  available: Record<string, Record<string, number[]>>;
}

export type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

export interface FriendRequestItem {
  id: string;
  message: string;
  status: string;
  createdAt: string;
  direction: 'incoming' | 'outgoing';
  peer: {
    id: string;
    displayName: string;
    username: string;
    avatarColor: string;
    city: string;
    church: string;
    bio: string;
  };
}

export interface FriendItem {
  id: string;
  username: string;
  displayName: string;
  role: string;
  avatarColor: string;
  bio: string;
  city: string;
  church: string;
  status: string;
  friendSince: string;
  followers: number;
  contents: number;
}

/* ---------------- 媒体 / 资料 ---------------- */

export interface MediaItem {
  id: string;
  kind: 'image' | 'audio' | 'video' | 'score' | 'doc';
  kindLabel: string;
  title: string;
  fileName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  url: string;
  posterUrl?: string;
  durationSec?: number;
  playCount?: number;
  status: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewReason?: string;
  refCount?: number;
  taskCount?: number;
  taskFailed?: number;
  /** 来源：upload（普通上传）/ live（直播回放） */
  source?: 'upload' | 'live' | null;
  /** 来源关联 id（如直播回放对应的 live_rooms.id） */
  sourceRef?: string | null;
  createdAt: string;
  owner?: string;
  ownerId?: string;
}

export interface MediaDetail extends MediaItem {
  description: string;
  tasks: {
    id: string; taskType: string; status: string; attempts: number;
    error: string; output: string; createdAt: string;
  }[];
  references: { contentId: string; title: string }[];
  related: MediaItem[];
}

/* ---------------- 直播 ---------------- */

export interface LiveChatMessage {
  id: string;
  roomId: string;
  userId: string | null;
  displayName: string;
  avatarColor: string | null;
  content: string;
  createdAt: string;
}

export interface LiveRoom {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  status: 'created' | 'live' | 'ended';
  reviewStatus?: 'pending' | 'approved' | 'rejected';
  reviewNote?: string | null;
  reviewVideoId?: string | null;
  scheduledAt?: string | null;
  cancelled?: boolean;
  cancelReason?: string | null;
  expired?: boolean;
  startedAt: string | null;
  endedAt: string | null;
  viewerPeak: number;
  owner?: { id: string; displayName: string; avatarColor: string | null };
  viewerCount: number;
  messages: LiveChatMessage[];
  live: boolean;
  hlsUrl?: string;
  streamKey?: string;
  publishSecret?: string;
  rtmpUrl?: string;
}

export interface LiveRoomListItem {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  status: 'created' | 'live' | 'ended';
  reviewStatus?: 'pending' | 'approved' | 'rejected';
  reviewNote?: string | null;
  reviewVideoId?: string | null;
  scheduledAt?: string | null;
  cancelled?: boolean;
  cancelReason?: string | null;
  expired?: boolean;
  startedAt: string | null;
  endedAt: string | null;
  viewerPeak: number;
  owner?: { id: string; displayName: string; avatarColor: string | null };
  viewerCount: number;
  live: boolean;
  hlsUrl?: string;
}

/* ---------------- 捐赠专区 ---------------- */

/**
 * 公开名录条目。
 * 安全约束:非管理员拿到的响应里 amountCents 字段不存在,金额只有 ****。
 */
export interface DonationItem {
  id: string;
  /** 已格式化的展示名:个人=昵称;教会=「xx教会」;匿名=爱心弟兄姊妹 */
  displayName: string;
  donorType: 'personal' | 'church';
  /** 金额文案:非管理员恒为 "****";管理员为真实数字 */
  amountText: string;
  /** 当前访问者是否可见真实金额(仅管理员 true) */
  amountVisible: boolean;
  /** 真实金额(分)。仅管理员返回,其余为 undefined */
  amountCents?: number;
  message: string;
  createdAt: string;
  /** 是否本条记录的捐赠者本人 */
  mine?: boolean;
}

export interface DonationListResult {
  items: DonationItem[];
  total: number;
  page: number;
  pageSize: number;
  /** 累计金额文案:非管理员为 "****" */
  totalAmountText: string;
  /** 累计笔数(对所有人可见) */
  totalCount: number;
  /** 贡献过的捐赠人/团体数 */
  donorCount: number;
  /** 当前访问者是否管理员 */
  viewerIsAdmin: boolean;
}

/** 后台管理条目:含真实金额与全部状态 */
export interface AdminDonation {
  id: string;
  displayName: string;
  donorType: 'personal' | 'church';
  churchName: string;
  anonymous: boolean;
  amountCents: number;
  amountText: string;
  message: string;
  status: 'pending' | 'confirmed' | 'rejected';
  note: string;
  donor: { id: string; username: string; displayName: string } | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AdminDonationResult {
  items: AdminDonation[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    totalCents: number;
    totalAmountText: string;
    count: number;
    confirmedCount: number;
    pendingCount: number;
    rejectedCount: number;
    monthCents: number;
    monthAmountText: string;
  };
}

/* ---------------- 支出公示 ---------------- */

/**
 * 公开支出条目 —— 金额全额公开(这正是公示的意义),
 * 与捐赠的脱敏规则方向相反。
 */
export interface ExpenseItem {
  id: string;
  category: string;
  categoryLabel: string;
  title: string;
  note: string;
  amountCents: number;
  amountText: string;
  period: string;
  createdAt: string;
}

export interface ExpenseCategoryStat {
  category: string;
  label: string;
  count: number;
  amountCents: number;
  amountText: string;
}

export interface ExpensePeriodStat {
  period: string;
  count: number;
  amountCents: number;
  amountText: string;
}

export interface ExpenseListResult {
  items: ExpenseItem[];
  byCategory: ExpenseCategoryStat[];
  byPeriod: ExpensePeriodStat[];
  totalCents: number;
  totalAmountText: string;
  categories: { id: string; label: string }[];
}

/** 管理端支出条目:含 hidden 状态 */
export interface AdminExpense {
  id: string;
  category: string;
  title: string;
  note: string;
  amountCents: number;
  amountText: string;
  period: string;
  status: 'published' | 'hidden';
  createdAt: string;
}

export interface AdminExpenseResult {
  items: AdminExpense[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    count: number;
    publishedCount: number;
    hiddenCount: number;
    publishedCents: number;
    publishedAmountText: string;
    /** 已确认捐赠收入(仅管理员可见口径) */
    incomeConfirmedCents: number;
    incomeConfirmedText: string;
    /** 收入 - 已公示支出 */
    balanceCents: number;
    balanceText: string;
  };
}
