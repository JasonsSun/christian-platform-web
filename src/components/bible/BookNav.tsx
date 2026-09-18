'use client';

import { useState } from 'react';
import { BOOKS, VERSIONS } from '@/lib/bibleMeta';
import Portal from '@/components/Portal';

/**
 * 读经页的「书卷导航」部件：桌面端侧边栏 + 移动端抽屉。
 *
 * 从 BibleReader.tsx 拆出（原文件 1376 行）：这两个是纯展示组件，只吃静态书卷数据
 * 和「选中回调」，与朗读 / 书签 / 高亮等主组件状态完全无关，独立成模块更好维护。
 */
export type Testament = 'old' | 'new';

// 圣经静态数据：书卷按约分组 + 版本列表（基于静态导入，供主组件及侧栏子组件共用）
export const bibleData = {
  books: {
    old: BOOKS.filter((b) => b.testament === 'old'),
    new: BOOKS.filter((b) => b.testament === 'new'),
  },
  versions: VERSIONS,
};
export function BookSidebar({
  currentBookId,
  currentChapter,
  darkMode,
  onSelect,
}: {
  currentBookId: string;
  currentChapter: number;
  darkMode: boolean;
  onSelect: (bookId: string, chapter: number) => void;
}) {
  const [testament, setTestament] = useState<Testament>(() =>
    bibleData.books.old.some((b) => b.id === currentBookId) ? 'old' : 'new'
  );
  const groups = testament === 'old' ? bibleData.books.old : bibleData.books.new;

  return (
    <div>
      {/* 旧约 / 新约 切换 */}
      <div
        className={`flex rounded-xl p-1 mb-4 ${
          darkMode ? 'bg-white/5' : 'bg-ink-100'
        }`}
      >
        <button
          onClick={() => setTestament('old')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            testament === 'old'
              ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/30'
              : darkMode
              ? 'text-ink-300 hover:text-white'
              : 'text-ink-600 hover:text-primary-700'
          }`}
        >
          旧约
        </button>
        <button
          onClick={() => setTestament('new')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            testament === 'new'
              ? 'bg-gradient-to-r from-gold-500 to-gold-400 text-white shadow-lg shadow-gold-500/30'
              : darkMode
              ? 'text-ink-300 hover:text-white'
              : 'text-ink-600 hover:text-primary-700'
          }`}
        >
          新约
        </button>
      </div>

      {/* 书卷列表 */}
      <div className="space-y-1">
        {groups.map((b) => {
          const active = b.id === currentBookId;
          return (
            <details
              key={b.id}
              open={active}
              className={`group rounded-xl overflow-hidden transition-colors ${
                darkMode ? 'bg-white/[0.02] hover:bg-white/[0.05]' : 'bg-ink-50/50 hover:bg-ink-50'
              }`}
            >
              <summary
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer list-none select-none ${
                  active
                    ? darkMode
                      ? 'text-primary-300'
                      : 'text-primary-700'
                    : darkMode
                    ? 'text-ink-200'
                    : 'text-ink-800'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    active
                      ? testament === 'old'
                        ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white'
                        : 'bg-gradient-to-br from-gold-500 to-gold-600 text-white'
                      : darkMode
                      ? 'bg-white/10 text-ink-400'
                      : 'bg-white border border-ink-200 text-ink-500'
                  }`}
                >
                  {b.abbr}
                </span>
                <span className="flex-1 text-sm font-medium">{b.name}</span>
                <span className={`text-xs ${darkMode ? 'text-ink-500' : 'text-ink-400'}`}>
                  {b.chapters}章
                </span>
                <svg
                  className={`w-4 h-4 transition-transform group-open:rotate-180 ${
                    darkMode ? 'text-ink-500' : 'text-ink-400'
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              {active && (
                <div className="px-3 pb-3">
                  <div className="grid grid-cols-6 gap-1.5">
                    {Array.from({ length: b.chapters }, (_, i) => i + 1).map((ch) => {
                      const isCurrent = ch === currentChapter;
                      return (
                        <button
                          key={ch}
                          onClick={() => onSelect(b.id, ch)}
                          className={`h-8 rounded-lg text-xs font-medium transition-all ${
                            isCurrent
                              ? testament === 'old'
                                ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-md shadow-primary-500/30'
                                : 'bg-gradient-to-br from-gold-500 to-gold-600 text-white shadow-md shadow-gold-500/30'
                              : darkMode
                              ? 'bg-white/5 text-ink-300 hover:bg-white/15 hover:text-white'
                              : 'bg-white border border-ink-200 text-ink-700 hover:border-primary-300 hover:text-primary-700'
                          }`}
                        >
                          {ch}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}

/* ===================== 移动端底部 Sheet ===================== */

export function MobileBookSheet({
  currentBookId,
  currentChapter,
  darkMode,
  onClose,
  onSelect,
}: {
  currentBookId: string;
  currentChapter: number;
  darkMode: boolean;
  onClose: () => void;
  onSelect: (bookId: string, chapter: number) => void;
}) {
  const [testament, setTestament] = useState<Testament>(() =>
    bibleData.books.old.some((b) => b.id === currentBookId) ? 'old' : 'new'
  );
  const [expanded, setExpanded] = useState<string | null>(currentBookId);
  const groups = testament === 'old' ? bibleData.books.old : bibleData.books.new;

  return (
    <Portal>
    <div className="fixed inset-0 z-50 md:hidden" data-guard="bible-drawer">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 rounded-t-3xl animate-slide-up max-h-[85vh] overflow-hidden ${
          darkMode ? 'bg-ink-900 text-white' : 'bg-white'
        }`}
      >
        {/* 拖拽条 */}
        <div className="flex justify-center pt-3 pb-2">
          <div
            className={`w-10 h-1.5 rounded-full ${
              darkMode ? 'bg-white/20' : 'bg-ink-200'
            }`}
          />
        </div>

        <div className="px-5 pb-5 overflow-y-auto max-h-[calc(85vh-2rem)]">
          {/* 旧约 / 新约 */}
          <div className="flex rounded-xl p-1 mb-4 bg-ink-100/60">
            <button
              onClick={() => {
                setTestament('old');
                setExpanded(null);
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                testament === 'old'
                  ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/30'
                  : darkMode
                  ? 'text-ink-300'
                  : 'text-ink-600'
              }`}
            >
              旧约
            </button>
            <button
              onClick={() => {
                setTestament('new');
                setExpanded(null);
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                testament === 'new'
                  ? 'bg-gradient-to-r from-gold-500 to-gold-400 text-white shadow-lg shadow-gold-500/30'
                  : darkMode
                  ? 'text-ink-300'
                  : 'text-ink-600'
              }`}
            >
              新约
            </button>
          </div>

          {/* 书卷 */}
          <div className="space-y-2 pb-4">
            {groups.map((b) => {
              const active = b.id === currentBookId;
              const isOpen = expanded === b.id;
              return (
                <div
                  key={b.id}
                  className={`rounded-2xl overflow-hidden ${
                    darkMode ? 'bg-white/[0.04]' : 'bg-ink-50'
                  }`}
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : b.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left ${
                      active && !isOpen
                        ? testament === 'old'
                          ? 'bg-primary-500/10'
                          : 'bg-gold-500/10'
                        : ''
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        active
                          ? testament === 'old'
                            ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-glow'
                            : 'bg-gradient-to-br from-gold-500 to-gold-600 text-white shadow-gold'
                          : darkMode
                          ? 'bg-white/10 text-ink-300'
                          : 'bg-white border border-ink-200 text-ink-600'
                      }`}
                    >
                      {b.abbr}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`font-semibold ${
                          active
                            ? testament === 'old'
                              ? 'text-primary-700'
                              : 'text-gold-700'
                            : darkMode
                            ? 'text-white'
                            : 'text-ink-900'
                        }`}
                      >
                        {b.name}
                      </div>
                      <div
                        className={`text-xs ${
                          darkMode ? 'text-ink-400' : 'text-ink-500'
                        }`}
                      >
                        {b.category} · {b.chapters}章
                      </div>
                    </div>
                    <svg
                      className={`w-5 h-5 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      } ${darkMode ? 'text-ink-400' : 'text-ink-400'}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className={`px-4 pb-4 ${darkMode ? 'bg-black/20' : 'bg-white/50'}`}>
                      <div className="grid grid-cols-7 gap-2 pt-2">
                        {Array.from({ length: b.chapters }, (_, i) => i + 1).map((ch) => {
                          const isCurrent = ch === currentChapter && active;
                          return (
                            <button
                              key={ch}
                              onClick={() => {
                                onSelect(b.id, ch);
                                onClose();
                              }}
                              className={`h-9 rounded-lg text-sm font-semibold transition-all ${
                                isCurrent
                                  ? testament === 'old'
                                    ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-md shadow-primary-500/30'
                                    : 'bg-gradient-to-br from-gold-500 to-gold-600 text-white shadow-md shadow-gold-500/30'
                                  : darkMode
                                  ? 'bg-white/10 text-ink-200 hover:bg-white/20'
                                  : 'bg-ink-50 text-ink-700 hover:bg-primary-100 hover:text-primary-700'
                              }`}
                            >
                              {ch}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}
