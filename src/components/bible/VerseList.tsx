'use client';

/**
 * 读经页「经文正文」纯展示组件 —— 从 BibleReader.tsx(单函数 1040 行)中剥离。
 *
 * 只吃 props(经文数组、书签映射、主题、对照译本信息、笔记回调),不持有任何状态,
 * 因此可被独立测试、独立维护,也让 BibleReader 主组件回到「编排」职责。
 */
interface Verse {
  verse: number;
  text: string;
}

interface VerseListProps {
  verses: Verse[];
  /** 已被标记高亮 / 有笔记的节号映射(只读) */
  bmMap: Record<number, { note?: string }>;
  darkMode: boolean;
  /** 当前对照译本 id;为空表示不对照 */
  compareVersion: string;
  /** 主译本名称(对照条左侧展示) */
  currentVersionName: string;
  compareVersionName?: string;
  /** 对照译本按节文本索引 */
  compareMap: Record<number, string>;
  compareLoading: boolean;
  /** 点击节号侧的小按钮 → 打开笔记 / 标记高亮 */
  onOpenNote: (verse: number) => void;
}

export default function VerseList({
  verses,
  bmMap,
  darkMode,
  compareVersion,
  currentVersionName,
  compareVersionName,
  compareMap,
  compareLoading,
  onOpenNote,
}: VerseListProps) {
  const body =
    verses && verses.length > 0 ? (
      <div className="space-y-4 md:space-y-5 font-serif leading-[2] md:leading-[2.2]">
        {verses.map((v, i) => {
          const verseNo = i + 1;
          const marked = !!bmMap[verseNo];
          const cmp = compareVersion ? compareMap[verseNo] : undefined;
          const numCol = (
            <span className="flex-shrink-0 mt-1 flex items-center gap-0.5">
              <sup
                className={`text-xs font-bold w-5 text-center transition-colors ${
                  marked
                    ? darkMode
                      ? 'text-gold-300'
                      : 'text-gold-600'
                    : darkMode
                      ? 'text-primary-400 group-hover:text-primary-300'
                      : 'text-primary-600 group-hover:text-primary-700'
                }`}
              >
                {verseNo}
              </sup>
              <button
                type="button"
                onClick={() => onOpenNote(verseNo)}
                title={marked ? '查看 / 编辑笔记' : '标记高亮并加笔记'}
                className={`opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity w-5 h-5 inline-flex items-center justify-center rounded text-[12px] ${
                  marked
                    ? darkMode
                      ? 'text-gold-300'
                      : 'text-gold-600'
                    : darkMode
                      ? 'text-ink-400 hover:text-primary-300'
                      : 'text-ink-400 hover:text-primary-600'
                }`}
              >
                {marked ? '✎' : '＋'}
              </button>
            </span>
          );
          const mainText = (
            <span className={`${darkMode ? 'text-ink-100' : 'text-ink-800'} antialiased`}>{v.text}</span>
          );
          if (cmp !== undefined) {
            return (
              <div
                key={i}
                id={`verse-${verseNo}`}
                className={`group rounded-lg transition-colors ${
                  marked ? (darkMode ? 'bg-gold-500/10 -mx-2 px-2' : 'bg-gold-50 -mx-2 px-2') : ''
                }`}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 py-1.5">
                  <p className="flex gap-2 md:gap-3 items-start leading-[2] md:leading-[2.2]">
                    {numCol}
                    {mainText}
                  </p>
                  <p
                    className={`flex gap-2 md:gap-3 items-start leading-[2] md:leading-[2.2] ${
                      darkMode ? 'text-ink-300' : 'text-ink-500'
                    }`}
                  >
                    <span className="flex-shrink-0 mt-1 w-5" />
                    <span className="antialiased">{cmp || '—'}</span>
                  </p>
                </div>
              </div>
            );
          }
          return (
            <p
              key={i}
              id={`verse-${verseNo}`}
              className={`group flex gap-2 md:gap-3 items-start rounded-lg transition-colors ${
                marked ? (darkMode ? 'bg-gold-500/10 -mx-2 px-2' : 'bg-gold-50 -mx-2 px-2') : ''
              }`}
            >
              {numCol}
              {mainText}
            </p>
          );
        })}
      </div>
    ) : (
      <div className="py-20 text-center">
        <div
          className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${
            darkMode ? 'bg-white/5' : 'bg-ink-50'
          }`}
        >
          <svg
            className={`w-8 h-8 ${darkMode ? 'text-ink-500' : 'text-ink-300'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
        <p className={`font-serif text-lg ${darkMode ? 'text-ink-400' : 'text-ink-500'}`}>暂无经文内容</p>
        <p className={`text-sm mt-1 ${darkMode ? 'text-ink-600' : 'text-ink-400'}`}>该章节内容正在筹备中，敬请期待</p>
      </div>
    );

  return (
    <>
      {compareVersion && (
        <div
          className={`mb-4 flex items-center gap-2 text-xs font-medium ${
            darkMode ? 'text-ink-400' : 'text-ink-500'
          }`}
        >
          <span className={`px-2 py-1 rounded-full ${darkMode ? 'bg-white/10' : 'bg-ink-100'}`}>
            {currentVersionName}
          </span>
          <span>对照</span>
          <span className={`px-2 py-1 rounded-full ${darkMode ? 'bg-white/10' : 'bg-ink-100'}`}>
            {compareVersionName}
          </span>
          {compareLoading && <span className="text-amber-500">（加载中…）</span>}
        </div>
      )}
      {body}
    </>
  );
}
