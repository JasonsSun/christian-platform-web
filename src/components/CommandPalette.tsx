'use client';

/**
 * 全局命令面板（⌘K / Ctrl+K）。
 *
 * - 静态项：站内页面 / 常用圣经书卷 / 快捷操作，本地即时模糊匹配
 * - 动态项：输入 ≥2 字时异步请求 /api/v1/search，把真实内容（动态·诗歌·讲道·
 *   团契·活动·媒体·经文·用户）混排进结果
 * - 键盘：↑↓ 移动、Enter 跳转、Esc 关闭；点击遮罩关闭
 * - 任意组件可 `window.dispatchEvent(new Event('open-command-palette'))` 唤起
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { scrollBehavior } from '@/lib/motion';
import { useDialogFocus } from '@/lib/a11y';
import {
  MagnifyingGlassIcon,
  ArrowRightIcon,
  HomeIcon,
  BookOpenIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  MusicalNoteIcon,
  HeartIcon,
  Squares2X2Icon,
  PresentationChartBarIcon,
  FilmIcon,
  RadioIcon,
  UsersIcon,
  HashtagIcon,
  CalendarDaysIcon,
  RssIcon,
  ChatBubbleLeftRightIcon,
  MegaphoneIcon,
  HandRaisedIcon,
  CurrencyDollarIcon,
  MapPinIcon,
  EnvelopeIcon,
  BellIcon,
  UserIcon,
  UserCircleIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  NoSymbolIcon,
  ClockIcon,
  KeyIcon,
  PuzzlePieceIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  BoltIcon,
  NewspaperIcon,
  ChartBarIcon,
  ServerIcon,
  ArchiveBoxIcon,
  BuildingOfficeIcon,
  CloudArrowUpIcon,
} from '@heroicons/react/24/outline';

export const COMMAND_PALETTE_EVENT = 'open-command-palette';

type IconCmp = React.ComponentType<{ className?: string }>;

/** 按入口给图标：结果里 40 多行如果共用一个「分组图标」，就又是一排一模一样的方框，
 *  比纯文字好不了多少。静态入口逐个映射，动态结果（书卷 / 诗歌 / 用户…）按分组兜底。 */
const HREF_ICON: Record<string, IconCmp> = {
  '/': HomeIcon,
  '/bible': BookOpenIcon,
  '/plans': ClipboardDocumentListIcon,
  '/devotions': DocumentTextIcon,
  '/songs': MusicalNoteIcon,
  '/songs/favorites': HeartIcon,
  '/songs/collections': Squares2X2Icon,
  '/sermons': PresentationChartBarIcon,
  '/media': FilmIcon,
  '/live': RadioIcon,
  '/community': ChatBubbleLeftRightIcon,
  '/topics': HashtagIcon,
  '/calendar': CalendarDaysIcon,
  '/feed': RssIcon,
  '/groups': UsersIcon,
  '/activities': MegaphoneIcon,
  '/prayers': HandRaisedIcon,
  '/donate': CurrencyDollarIcon,
  '/nearby': MapPinIcon,
  '/search': MagnifyingGlassIcon,
  '/messages': EnvelopeIcon,
  '/notifications': BellIcon,
  '/friends': UserCircleIcon,
  '/me': UserIcon,
  '/feedback': PencilSquareIcon,
  '/settings/privacy': ShieldCheckIcon,
  '/settings/notifications': BellIcon,
  '/settings/blocked': NoSymbolIcon,
  '/settings/sessions': ClockIcon,
  '/settings/two-factor': KeyIcon,
  '/settings/oauth': PuzzlePieceIcon,
  '/community/create': PencilSquareIcon,
  '/activities/new': CalendarDaysIcon,
  '/upload': CloudArrowUpIcon,
  '/donate/new': CurrencyDollarIcon,
  '/bible/notes': DocumentTextIcon,
  '/admin': CommandLineIcon,
  '/admin/contents': NewspaperIcon,
  '/admin/users': UsersIcon,
  '/admin/audit': ShieldCheckIcon,
  '/admin/songs': MusicalNoteIcon,
  '/admin/sermons': PresentationChartBarIcon,
  '/admin/activities': MegaphoneIcon,
  '/admin/media': FilmIcon,
  '/admin/live': RadioIcon,
  '/admin/groups': BuildingOfficeIcon,
  '/admin/prayers': HandRaisedIcon,
  '/admin/donations': CurrencyDollarIcon,
  '/admin/expenses': ChartBarIcon,
  '/admin/system': ServerIcon,
  '/admin/backups': ArchiveBoxIcon,
  '/admin/settings': Cog6ToothIcon,
};

const GROUP_ICON: Record<string, IconCmp> = {
  导航: Squares2X2Icon,
  我的: UserIcon,
  设置: Cog6ToothIcon,
  快捷操作: BoltIcon,
  管理后台: ShieldCheckIcon,
  圣经书卷: BookOpenIcon,
  经文: BookOpenIcon,
  社区内容: ChatBubbleLeftRightIcon,
  诗歌: MusicalNoteIcon,
  讲道: PresentationChartBarIcon,
  团契: UsersIcon,
  活动: CalendarDaysIcon,
  媒体: FilmIcon,
  用户: UserCircleIcon,
};
const itemIcon = (item: Item): IconCmp => HREF_ICON[item.href] || GROUP_ICON[item.group] || MagnifyingGlassIcon;

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-ui-border bg-ui-rail px-1.5 py-0.5 font-sans text-[10px] leading-none text-ui-muted">
      {children}
    </kbd>
  );
}

type Item = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  href: string;
  keywords?: string;
};

/** 常用圣经书卷（跳转和合本第 1 章） */
const BOOKS: Array<[string, string]> = [
  ['genesis', '创世记'],
  ['exodus', '出埃及记'],
  ['psalms', '诗篇'],
  ['proverbs', '箴言'],
  ['ecclesiastes', '传道书'],
  ['songofsolomon', '雅歌'],
  ['isaiah', '以赛亚书'],
  ['jeremiah', '耶利米书'],
  ['daniel', '但以理书'],
  ['jonah', '约拿书'],
  ['matthew', '马太福音'],
  ['mark', '马可福音'],
  ['luke', '路加福音'],
  ['john', '约翰福音'],
  ['acts', '使徒行传'],
  ['romans', '罗马书'],
  ['1corinthians', '哥林多前书'],
  ['2corinthians', '哥林多后书'],
  ['galatians', '加拉太书'],
  ['ephesians', '以弗所书'],
  ['philippians', '腓立比书'],
  ['colossians', '歌罗西书'],
  ['1thessalonians', '帖撒罗尼迦前书'],
  ['1timothy', '提摩太前书'],
  ['hebrews', '希伯来书'],
  ['james', '雅各书'],
  ['1peter', '彼得前书'],
  ['1john', '约翰一书'],
  ['revelation', '启示录'],
];

const PAGES: Item[] = [
  { id: 'p-home', group: '导航', label: '首页', href: '/', keywords: 'home index shouye 主页' },
  { id: 'p-bible', group: '导航', label: '圣经阅读', href: '/bible', keywords: 'bible shengjing 读经 和合本' },
  { id: 'p-plans', group: '导航', label: '读经计划', href: '/plans', keywords: 'plan dujing jihua' },
  { id: 'p-devotions', group: '导航', label: '灵修记录', href: '/devotions', keywords: 'devotional lingxiu' },
  { id: 'p-songs', group: '导航', label: '诗歌库', href: '/songs', keywords: 'song hymn shige zanmeishi 赞美诗' },
  { id: 'p-songs-fav', group: '导航', label: '我的诗歌收藏', href: '/songs/favorites', keywords: 'favorite shoucang' },
  { id: 'p-songs-col', group: '导航', label: '诗歌合集', href: '/songs/collections', keywords: 'collection heji' },
  { id: 'p-sermons', group: '导航', label: '讲道', href: '/sermons', keywords: 'sermon jiangdao' },
  { id: 'p-media', group: '导航', label: '媒体资源', href: '/media', keywords: 'media meiti 音频 视频' },
  { id: 'p-live', group: '导航', label: '直播', href: '/live', keywords: 'live zhibo' },
  { id: 'p-community', group: '导航', label: '社区', href: '/community', keywords: 'community shequ' },
  { id: 'p-topics', group: '导航', label: '话题广场', href: '/topics', keywords: 'topics huati tag biaoqian 标签 话题' },
  { id: 'p-calendar', group: '导航', label: '聚会日历', href: '/calendar', keywords: 'calendar rili 日历 月历 活动 打卡' },
  { id: 'p-feed', group: '导航', label: '动态流', href: '/feed', keywords: 'feed dongtai' },
  { id: 'p-groups', group: '导航', label: '团契小组', href: '/groups', keywords: 'group tuanqi xiaozu' },
  { id: 'p-activities', group: '导航', label: '活动', href: '/activities', keywords: 'activity huodong' },
  { id: 'p-prayers', group: '导航', label: '祷告墙', href: '/prayers', keywords: 'prayer daogao' },
  { id: 'p-donate', group: '导航', label: '奉献捐赠', href: '/donate', keywords: 'donate fengxian juanzeng' },
  { id: 'p-nearby', group: '导航', label: '附近的肢体', href: '/nearby', keywords: 'nearby fujin' },
  { id: 'p-search', group: '导航', label: '全站搜索', href: '/search', keywords: 'search sousuo' },
  { id: 'p-messages', group: '我的', label: '私信', href: '/messages', keywords: 'message sixin chat' },
  { id: 'p-notifications', group: '我的', label: '通知', href: '/notifications', keywords: 'notification tongzhi' },
  { id: 'p-friends', group: '我的', label: '好友', href: '/friends', keywords: 'friend haoyou' },
  { id: 'p-me', group: '我的', label: '个人中心', href: '/me', keywords: 'me profile geren' },
  { id: 'p-feedback', group: '我的', label: '意见反馈', href: '/feedback', keywords: 'feedback yijian' },
  { id: 's-privacy', group: '设置', label: '隐私设置', href: '/settings/privacy', keywords: 'privacy yinsi' },
  { id: 's-notify', group: '设置', label: '通知设置', href: '/settings/notifications', keywords: 'notification tongzhi' },
  { id: 's-blocked', group: '设置', label: '屏蔽管理', href: '/settings/blocked', keywords: 'block pingbi' },
  { id: 's-sessions', group: '设置', label: '登录会话', href: '/settings/sessions', keywords: 'session denglu' },
  { id: 's-2fa', group: '设置', label: '两步验证', href: '/settings/two-factor', keywords: '2fa two factor mfa' },
  { id: 's-oauth', group: '设置', label: '第三方账号', href: '/settings/oauth', keywords: 'oauth third party disanfang bangding' },
  { id: 'a-overview', group: '管理后台', label: '后台概览', href: '/admin', keywords: 'admin houtai' },
  { id: 'a-contents', group: '管理后台', label: '内容管理', href: '/admin/contents', keywords: 'content neirong' },
  { id: 'a-users', group: '管理后台', label: '用户管理', href: '/admin/users', keywords: 'user yonghu' },
  { id: 'a-audit', group: '管理后台', label: '审核队列', href: '/admin/audit', keywords: 'audit shenhe' },
  { id: 'a-songs', group: '管理后台', label: '诗歌管理', href: '/admin/songs', keywords: 'song shige' },
  { id: 'a-sermons', group: '管理后台', label: '讲道管理', href: '/admin/sermons', keywords: 'sermon jiangdao' },
  { id: 'a-activities', group: '管理后台', label: '活动管理', href: '/admin/activities', keywords: 'activity huodong' },
  { id: 'a-media', group: '管理后台', label: '媒体管理', href: '/admin/media', keywords: 'media meiti' },
  { id: 'a-live', group: '管理后台', label: '直播管理', href: '/admin/live', keywords: 'live zhibo' },
  { id: 'a-groups', group: '管理后台', label: '团契管理', href: '/admin/groups', keywords: 'group tuanqi' },
  { id: 'a-prayers', group: '管理后台', label: '代祷管理', href: '/admin/prayers', keywords: 'prayer daogao' },
  { id: 'a-donations', group: '管理后台', label: '捐赠管理', href: '/admin/donations', keywords: 'donate juanzeng' },
  { id: 'a-expenses', group: '管理后台', label: '财务管理', href: '/admin/expenses', keywords: 'expense caiwu' },
  { id: 'a-stats', group: '管理后台', label: '数据统计', href: '/admin/system', keywords: 'stat tongji system' },
  { id: 'a-backups', group: '管理后台', label: '备份管理', href: '/admin/backups', keywords: 'backup beifen' },
  { id: 'a-settings', group: '管理后台', label: '站点设置', href: '/admin/settings', keywords: 'setting peizhi' },
];

const ACTIONS: Item[] = [
  { id: 'ac-create', group: '快捷操作', label: '发布内容', href: '/community/create', keywords: 'create publish fabu xiezuo 写文章' },
  { id: 'ac-activity', group: '快捷操作', label: '发起活动', href: '/activities/new', keywords: 'activity new faqi huodong' },
  { id: 'ac-upload', group: '快捷操作', label: '上传媒体', href: '/upload', keywords: 'upload media shangchuan' },
  { id: 'ac-donate-new', group: '快捷操作', label: '发起奉献', href: '/donate/new', keywords: 'donate fengxian' },
  { id: 'ac-notes', group: '快捷操作', label: '我的笔记', href: '/bible/notes', keywords: 'note biji' },
];

const STATIC_ITEMS: Item[] = [
  ...PAGES,
  ...ACTIONS,
  ...BOOKS.map(([id, name]) => ({
    id: `b-${id}`,
    group: '圣经书卷',
    label: name,
    hint: '和合本 · 第 1 章',
    href: `/bible/cuv/${id}/1`,
    keywords: `${id} bible`,
  })),
];

/** 模糊打分：0 表示不匹配 */
function scoreItem(item: Item, q: string): number {
  if (!q) return 1;
  const label = item.label.toLowerCase();
  const lq = q.toLowerCase();
  if (label === lq) return 1000;
  if (label.startsWith(lq)) return 500;
  if (label.includes(lq)) return 300;
  const hay = `${item.label} ${item.hint || ''} ${item.keywords || ''}`.toLowerCase();
  if (hay.includes(lq)) return 120;
  // 逐字符子序列匹配（支持 "ygh" 命中 "约翰福音" 的关键词场景）
  let i = 0;
  for (const ch of lq) {
    if (ch === ' ') continue;
    const p = hay.indexOf(ch, i);
    if (p < 0) return 0;
    i = p + 1;
  }
  return 20;
}

/** 把同组结果并到一起：按分数排序会把「诗歌库 / 诗歌管理 / 诗篇 / 我的诗歌收藏」打散，
 *  分组标题于是重复出现（实测「导航」出现两次）。组按首次出现排序，组内保持分数序。 */
function regroupByScore(items: Item[]): Item[] {
  const buckets = new Map<string, Item[]>();
  for (const it of items) {
    const b = buckets.get(it.group);
    if (b) b.push(it);
    else buckets.set(it.group, [it]);
  }
  return [...buckets.values()].flat();
}

export default function CommandPalette() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dlgRef = useDialogFocus<HTMLDivElement>(open);
  // aria-activedescendant 要在整棵文档里指向唯一一行，id 不能手拼
  const listId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
    setRemote([]);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  // 快捷键唤起 / Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        close();
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(COMMAND_PALETTE_EVENT, onOpen);
    };
  }, [open, close]);

  // 打开时锁滚动 + 聚焦
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [open]);

  // 远程搜索（防抖 280ms）
  useEffect(() => {
    if (!open) return;
    const kw = query.trim();
    if (kw.length < 2) {
      setRemote([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await apiGet<any>(`/search?q=${encodeURIComponent(kw)}`);
        if (cancelled || !data) return;
        const items: Item[] = [];
        (data.verses || []).slice(0, 5).forEach((v: any, i: number) =>
          items.push({
            id: `sv-${v.bookId}-${v.chapter}-${v.verse}-${i}`,
            group: '经文',
            label: `${v.bookName} ${v.chapter}:${v.verse}`,
            hint: String(v.text || '').slice(0, 40),
            href: `/bible/${v.version}/${v.bookId}/${v.chapter}`,
          })
        );
        (data.contents || []).slice(0, 5).forEach((c: any) =>
          items.push({ id: `sc-${c.id}`, group: '社区内容', label: c.title || '未命名', href: `/contents/${c.id}` })
        );
        (data.songs || []).slice(0, 5).forEach((s: any) =>
          items.push({
            id: `ss-${s.id}`,
            group: '诗歌',
            label: s.title || '未命名诗歌',
            hint: s.author || undefined,
            href: `/songs/${s.id}`,
          })
        );
        (data.sermons || []).slice(0, 4).forEach((s: any) =>
          items.push({
            id: `sr-${s.id}`,
            group: '讲道',
            label: s.title || '未命名讲道',
            hint: s.speaker || undefined,
            href: `/sermons/${s.id}`,
          })
        );
        (data.groups || []).slice(0, 4).forEach((g: any) =>
          items.push({ id: `sg-${g.id}`, group: '团契', label: g.name || '未命名团契', href: `/groups/${g.id}` })
        );
        (data.activities || []).slice(0, 4).forEach((a: any) =>
          items.push({ id: `sa-${a.id}`, group: '活动', label: a.title || '未命名活动', href: `/activities/${a.id}` })
        );
        (data.media || []).slice(0, 3).forEach((m: any) =>
          items.push({ id: `sm-${m.id}`, group: '媒体', label: m.title || '未命名媒体', href: `/media/${m.id}` })
        );
        (data.users || []).slice(0, 4).forEach((u: any) =>
          items.push({
            id: `su-${u.id}`,
            group: '用户',
            label: u.displayName || u.username || '用户',
            hint: u.church || u.city || undefined,
            href: `/users/${u.id}`,
          })
        );
        setRemote(items);
      } catch {
        if (!cancelled) setRemote([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  // 结果计算：静态命中 + 远程结果
  const isStaff = !!user && (user.role === 'admin' || user.role === 'moderator');
  const results = useMemo<Item[]>(() => {
    const q = query.trim();
    /* 「管理后台」16 条对非管理员是死路：/admin/* 自己会挡「无权限访问」（只有 /admin/settings
       连页面级判断都没有，靠接口的 requireRole 403）。命令面板全站挂，匿名访客按 ⌘K 敲
       「管理」就能把这 16 条全翻出来。 */
    const pool = isStaff ? STATIC_ITEMS : STATIC_ITEMS.filter((it) => it.group !== '管理后台');
    const local = pool.map((it) => ({ it, s: scoreItem(it, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it);
    if (!q) return local.slice(0, 12);
    return regroupByScore([...remote, ...local]).slice(0, 40);
  }, [query, remote, isStaff]);

  useEffect(() => {
    setActive(0);
  }, [query, remote]);

  // 键盘导航（输入框内）
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[active];
      if (item) go(item.href);
    }
  };

  // 选中项滚动到可视区
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  }, [active]);

  if (!open) return null;

  let lastGroup = '';
  // 结果刚变化、active 还没归位时不要指向不存在的行
  const activeOptionId = results[active] ? `${listId}-opt-${active}` : undefined;

  return (
    <div ref={dlgRef} className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4" role="dialog" aria-modal="true" aria-label="全站搜索">
      <div
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm animate-fade-in"
        onClick={close}
        aria-hidden
      />
      <div className="relative w-full max-w-xl animate-slide-up">
        {/* 实色浮层而非 .glass-tech：12% 白玻璃压在深色导航上会被冲淡成一块灰紫，
            面板等于没有面板（用户原话「太难看」）。浮层一律走 --ui-* 令牌，三主题换值。 */}
        <div className="overflow-hidden rounded-2xl border border-ui-border bg-ui-surface shadow-pop">
          {/* 顶部辉光线 */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary-400 to-transparent" />

          {/* 输入框自带 .input-styled：面板一打开就聚焦，全局 3px 琥珀 :focus-visible
              会在面板里再套一个金框，这个类的 focus:outline-none + 主题色光环正好替掉它。 */}
          <div className="relative px-3 pt-3 pb-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-ui-muted" />
            <input
              aria-label="搜索关键词"
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="搜索页面、经文、诗歌、讲道、团契…"
              className="input-styled input-field input-icon input-suffix"
              role="combobox"
              aria-expanded
              aria-autocomplete="list"
              aria-controls={listId}
              aria-activedescendant={activeOptionId}
            />
            {loading ? (
              <span className="absolute right-5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin" />
            ) : (
              <span className="absolute right-5 top-1/2 z-10 -translate-y-1/2">
                <Kbd>Esc</Kbd>
              </span>
            )}
          </div>

          <div ref={listRef} id={listId} role="listbox" aria-label="搜索结果" className="max-h-[52vh] overflow-y-auto px-2 pb-2 pt-1">
            {results.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-5 py-12 text-center">
                <span className="mb-1 grid h-11 w-11 place-items-center rounded-full bg-ui-hover">
                  <MagnifyingGlassIcon className="h-5 w-5 text-ui-muted" />
                </span>
                <p className="text-sm font-medium text-ui-text">{loading ? '搜索中…' : `没有找到「${query.trim()}」`}</p>
                {!loading && (
                  <p className="text-xs text-ui-muted">换个说法试试：页面名、圣经书卷、诗歌或团契名称</p>
                )}
              </div>
            ) : (
              results.map((item, idx) => {
                const showGroup = item.group !== lastGroup;
                lastGroup = item.group;
                const isActive = idx === active;
                const Icon = itemIcon(item);
                return (
                  <div key={item.id}>
                    {showGroup && (
                      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
                        {/* 不用 .eyebrow：那 0.14em 字距是给拉丁字母的，中文「导航」被拉开反而散 */}
                        <span className="text-[11px] font-semibold text-ui-muted">{item.group}</span>
                        <span className="h-px flex-1 bg-ui-border" />
                      </div>
                    )}
                    <button
                      type="button"
                      // 高亮此前只是画上去的：DOM 焦点一直停在输入框，读屏完全不知道选中了谁
                      role="option"
                      id={`${listId}-opt-${idx}`}
                      aria-selected={isActive}
                      data-idx={idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(item.href)}
                      className={`flex w-full min-h-[44px] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${
                        isActive ? 'bg-ui-accent-soft text-ui-accent' : 'text-ui-text hover:bg-ui-hover'
                      }`}
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                        isActive ? 'bg-ui-surface shadow-[0_2px_8px_-2px_rgba(19,22,37,0.22)]' : 'bg-ui-hover text-ui-muted'
                      }`}>
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block truncate text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}>
                          {item.label}
                        </span>
                        {item.hint && (
                          <span className="block truncate text-xs text-ui-muted">{item.hint}</span>
                        )}
                      </span>
                      {isActive && <ArrowRightIcon className="h-4 w-4 shrink-0" />}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-ui-border px-4 py-2.5 text-[11px] text-ui-muted">
            <span className="inline-flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              选择
              <Kbd>Enter</Kbd>
              打开
            </span>
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <Kbd>⌘K</Kbd>
              /
              <Kbd>Ctrl K</Kbd>
              唤起
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
