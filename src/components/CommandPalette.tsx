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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api';
import {
  MagnifyingGlassIcon,
  ArrowRightIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

export const COMMAND_PALETTE_EVENT = 'open-command-palette';

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

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
  const results = useMemo<Item[]>(() => {
    const q = query.trim();
    const local = STATIC_ITEMS.map((it) => ({ it, s: scoreItem(it, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it);
    if (!q) return local.slice(0, 12);
    return [...remote, ...local].slice(0, 40);
  }, [query, remote]);

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
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  let lastGroup = '';

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4">
      <div
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm animate-fade-in"
        onClick={close}
        aria-hidden
      />
      <div className="relative w-full max-w-xl animate-slide-up">
        <div className="glass-tech rounded-3xl shadow-2xl overflow-hidden border border-white/15">
          {/* 顶部辉光线 */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary-400 to-transparent" />

          <div className="flex items-center gap-3 px-5 py-4 border-b border-ink-200/60">
            <MagnifyingGlassIcon className="w-5 h-5 text-primary-500 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="搜索页面、经文、诗歌、讲道、团契…"
              className="flex-1 bg-transparent outline-none text-base text-ink-900 placeholder:text-ink-400"
              aria-label="全站搜索"
            />
            {loading && (
              <span className="w-4 h-4 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin shrink-0" />
            )}
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] rounded-md bg-ink-100 text-ink-500 border border-ink-200">
              Esc
            </kbd>
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
            {results.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-ink-500">
                {loading ? '搜索中…' : '没有找到匹配项'}
              </div>
            ) : (
              results.map((item, idx) => {
                const showGroup = item.group !== lastGroup;
                lastGroup = item.group;
                const isActive = idx === active;
                return (
                  <div key={item.id}>
                    {showGroup && (
                      <div className="px-5 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">
                        {item.group}
                      </div>
                    )}
                    <button
                      type="button"
                      data-idx={idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(item.href)}
                      className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors ${
                        isActive ? 'bg-primary-50' : 'hover:bg-ink-50'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isActive ? 'bg-primary-500 shadow-glow' : 'bg-ink-300'
                        }`}
                      />
                      <span className="flex-1 min-w-0">
                        <span
                          className={`block truncate text-sm ${
                            isActive ? 'text-primary-700 font-medium' : 'text-ink-800'
                          }`}
                        >
                          {item.label}
                        </span>
                        {item.hint && (
                          <span className="block truncate text-xs text-ink-400">{item.hint}</span>
                        )}
                      </span>
                      {isActive && <ArrowRightIcon className="w-4 h-4 text-primary-500 shrink-0" />}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-t border-ink-200/60 text-[11px] text-ink-400">
            <span className="inline-flex items-center gap-1">
              <SparklesIcon className="w-3.5 h-3.5 text-gold-500" />
              ↑↓ 选择 · Enter 打开
            </span>
            <span className="hidden sm:inline">⌘K / Ctrl+K 唤起</span>
          </div>
        </div>
      </div>
    </div>
  );
}
