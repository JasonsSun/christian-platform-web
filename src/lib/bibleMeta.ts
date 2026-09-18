/**
 * 圣经书卷元数据（66 卷）+ 书卷 ID 映射 —— 纯数据模块，无服务端依赖。
 *
 * 早先这些内容放在 src/server/bible.ts，客户端组件（BibleReader）一引用就会把
 * 同文件里给播种用的 VERSES 经文段一起打进浏览器 bundle。这里下沉到 lib，
 * 让「纯元数据」和「服务端种子数据」分家：
 *   - 客户端/服务端共用  -> @/lib/bibleMeta
 *   - 仅服务端播种       -> @/server/bible（从此处再导出，旧引用无需改动）
 */
/** 圣经书卷元数据(66 卷) */
export type Book = {
  id: string;
  name: string;
  abbr: string;
  chapters: number;
  testament: 'old' | 'new';
  category: string;
  dbId: string; // 数据库中的 book_id（缩写格式）
};

// book_id 映射：前端友好名称 -> 数据库 ID
const BOOK_ID_MAP: Record<string, string> = {
  // 摩西五经
  'genesis': 'Gen',
  'exodus': 'Exo',
  'leviticus': 'Lev',
  'numbers': 'Num',
  'deuteronomy': 'Deut',
  // 历史书
  'joshua': 'Josh',
  'judges': 'Judg',
  'ruth': 'Ruth',
  '1samuel': 'H1Sam',
  '2samuel': 'H2Sam',
  '1kings': 'H1Kings',
  '2kings': 'H2Kings',
  '1chronicles': 'H1Chron',
  '2chronicles': 'H2Chron',
  'ezra': 'Ezra',
  'nehemiah': 'Neh',
  'esther': 'Esth',
  // 诗歌书
  'job': 'Job',
  'psalms': 'Psa',
  'proverbs': 'Prov',
  'ecclesiastes': 'Eccl',
  'songofsolomon': 'SS',
  // 先知书
  'isaiah': 'Isa',
  'jeremiah': 'Jer',
  'lamentations': 'Lam',
  'ezekiel': 'Ezek',
  'daniel': 'Dan',
  'hosea': 'Hosea',
  'joel': 'Joel',
  'amos': 'Amos',
  'obadiah': 'Obad',
  'jonah': 'Jonah',
  'micah': 'Micah',
  'nahum': 'Nahum',
  'habakkuk': 'Hab',
  'zephaniah': 'Zeph',
  'haggai': 'Hag',
  'zechariah': 'Zech',
  'malachi': 'Mal',
  // 新约
  'matthew': 'Matt',
  'mark': 'Mark',
  'luke': 'Luke',
  'john': 'John',
  'acts': 'Acts',
  'romans': 'Rom',
  '1corinthians': 'H1Cor',
  '2corinthians': 'H2Cor',
  'galatians': 'Gal',
  'ephesians': 'Eph',
  'philippians': 'Phil',
  'colossians': 'Col',
  '1thessalonians': 'H1Thes',
  '2thessalonians': 'H2Thes',
  '1timothy': 'H1Tim',
  '2timothy': 'H2Tim',
  'titus': 'Titus',
  'philemon': 'Philem',
  'hebrews': 'Heb',
  'james': 'James',
  '1peter': 'H1Pet',
  '2peter': 'H2Pet',
  '1john': 'H1John',
  '2john': 'H2John',
  '3john': 'H3John',
  'jude': 'Jude',
  'revelation': 'Rev',
};

// 反向映射
const DB_ID_TO_FRONTEND: Record<string, string> = Object.fromEntries(
  Object.entries(BOOK_ID_MAP).map(([k, v]) => [v, k])
);

export const VERSIONS = [
  { id: 'cuv', name: '和合本 (CUV)', fullName: '和合本 CUV', language: 'zh-CN' },
  { id: 'cuvs', name: '和合本修订版 (CUVS)', fullName: '和合本修订版 CUVS', language: 'zh-CN' },
  { id: 'kjv', name: '英王钦定本 (KJV)', fullName: 'King James Version', language: 'en' },
];

export const BOOKS: Book[] = [
  { id: 'genesis', name: '创世记', abbr: '创', chapters: 50, testament: 'old', category: '摩西五经', dbId: 'Gen' },
  { id: 'exodus', name: '出埃及记', abbr: '出', chapters: 40, testament: 'old', category: '摩西五经', dbId: 'Exo' },
  { id: 'leviticus', name: '利未记', abbr: '利', chapters: 27, testament: 'old', category: '摩西五经', dbId: 'Lev' },
  { id: 'numbers', name: '民数记', abbr: '民', chapters: 36, testament: 'old', category: '摩西五经', dbId: 'Num' },
  { id: 'deuteronomy', name: '申命记', abbr: '申', chapters: 34, testament: 'old', category: '摩西五经', dbId: 'Deut' },
  { id: 'joshua', name: '约书亚记', abbr: '书', chapters: 24, testament: 'old', category: '历史书', dbId: 'Josh' },
  { id: 'judges', name: '士师记', abbr: '士', chapters: 21, testament: 'old', category: '历史书', dbId: 'Judg' },
  { id: 'ruth', name: '路得记', abbr: '得', chapters: 4, testament: 'old', category: '历史书', dbId: 'Ruth' },
  { id: '1samuel', name: '撒母耳记上', abbr: '撒上', chapters: 31, testament: 'old', category: '历史书', dbId: 'H1Sam' },
  { id: '2samuel', name: '撒母耳记下', abbr: '撒下', chapters: 24, testament: 'old', category: '历史书', dbId: 'H2Sam' },
  { id: '1kings', name: '列王纪上', abbr: '王上', chapters: 22, testament: 'old', category: '历史书', dbId: 'H1Kings' },
  { id: '2kings', name: '列王纪下', abbr: '王下', chapters: 25, testament: 'old', category: '历史书', dbId: 'H2Kings' },
  { id: '1chronicles', name: '历代志上', abbr: '代上', chapters: 29, testament: 'old', category: '历史书', dbId: 'H1Chron' },
  { id: '2chronicles', name: '历代志下', abbr: '代下', chapters: 36, testament: 'old', category: '历史书', dbId: 'H2Chron' },
  { id: 'ezra', name: '以斯拉记', abbr: '拉', chapters: 10, testament: 'old', category: '历史书', dbId: 'Ezra' },
  { id: 'nehemiah', name: '尼希米记', abbr: '尼', chapters: 13, testament: 'old', category: '历史书', dbId: 'Neh' },
  { id: 'esther', name: '以斯帖记', abbr: '斯', chapters: 10, testament: 'old', category: '历史书', dbId: 'Esth' },
  { id: 'job', name: '约伯记', abbr: '伯', chapters: 42, testament: 'old', category: '诗歌书', dbId: 'Job' },
  { id: 'psalms', name: '诗篇', abbr: '诗', chapters: 150, testament: 'old', category: '诗歌书', dbId: 'Psa' },
  { id: 'proverbs', name: '箴言', abbr: '箴', chapters: 31, testament: 'old', category: '诗歌书', dbId: 'Prov' },
  { id: 'ecclesiastes', name: '传道书', abbr: '传', chapters: 12, testament: 'old', category: '诗歌书', dbId: 'Eccl' },
  { id: 'songofsolomon', name: '雅歌', abbr: '歌', chapters: 8, testament: 'old', category: '诗歌书', dbId: 'SS' },
  { id: 'isaiah', name: '以赛亚书', abbr: '赛', chapters: 66, testament: 'old', category: '先知书', dbId: 'Isa' },
  { id: 'jeremiah', name: '耶利米书', abbr: '耶', chapters: 52, testament: 'old', category: '先知书', dbId: 'Jer' },
  { id: 'lamentations', name: '耶利米哀歌', abbr: '哀', chapters: 5, testament: 'old', category: '先知书', dbId: 'Lam' },
  { id: 'ezekiel', name: '以西结书', abbr: '结', chapters: 48, testament: 'old', category: '先知书', dbId: 'Ezek' },
  { id: 'daniel', name: '但以理书', abbr: '但', chapters: 12, testament: 'old', category: '先知书', dbId: 'Dan' },
  { id: 'hosea', name: '何西阿书', abbr: '何', chapters: 14, testament: 'old', category: '先知书', dbId: 'Hosea' },
  { id: 'joel', name: '约珥书', abbr: '珥', chapters: 3, testament: 'old', category: '先知书', dbId: 'Joel' },
  { id: 'amos', name: '阿摩司书', abbr: '摩', chapters: 9, testament: 'old', category: '先知书', dbId: 'Amos' },
  { id: 'obadiah', name: '俄巴底亚书', abbr: '俄', chapters: 1, testament: 'old', category: '先知书', dbId: 'Obad' },
  { id: 'jonah', name: '约拿书', abbr: '拿', chapters: 4, testament: 'old', category: '先知书', dbId: 'Jonah' },
  { id: 'micah', name: '弥迦书', abbr: '弥', chapters: 7, testament: 'old', category: '先知书', dbId: 'Micah' },
  { id: 'nahum', name: '那鸿书', abbr: '那', chapters: 3, testament: 'old', category: '先知书', dbId: 'Nahum' },
  { id: 'habakkuk', name: '哈巴谷书', abbr: '哈', chapters: 3, testament: 'old', category: '先知书', dbId: 'Hab' },
  { id: 'zephaniah', name: '西番雅书', abbr: '番', chapters: 3, testament: 'old', category: '先知书', dbId: 'Zeph' },
  { id: 'haggai', name: '哈该书', abbr: '该', chapters: 2, testament: 'old', category: '先知书', dbId: 'Hag' },
  { id: 'zechariah', name: '撒迦利亚书', abbr: '番', chapters: 14, testament: 'old', category: '先知书', dbId: 'Zech' },
  { id: 'malachi', name: '玛拉基书', abbr: '玛', chapters: 4, testament: 'old', category: '先知书', dbId: 'Mal' },
  { id: 'matthew', name: '马太福音', abbr: '太', chapters: 28, testament: 'new', category: '福音书', dbId: 'Matt' },
  { id: 'mark', name: '马可福音', abbr: '可', chapters: 16, testament: 'new', category: '福音书', dbId: 'Mark' },
  { id: 'luke', name: '路加福音', abbr: '路', chapters: 24, testament: 'new', category: '福音书', dbId: 'Luke' },
  { id: 'john', name: '约翰福音', abbr: '约', chapters: 21, testament: 'new', category: '福音书', dbId: 'John' },
  { id: 'acts', name: '使徒行传', abbr: '徒', chapters: 28, testament: 'new', category: '历史书', dbId: 'Acts' },
  { id: 'romans', name: '罗马书', abbr: '罗', chapters: 16, testament: 'new', category: '书信', dbId: 'Rom' },
  { id: '1corinthians', name: '哥林多前书', abbr: '林前', chapters: 16, testament: 'new', category: '书信', dbId: 'H1Cor' },
  { id: '2corinthians', name: '哥林多后书', abbr: '林后', chapters: 13, testament: 'new', category: '书信', dbId: 'H2Cor' },
  { id: 'galatians', name: '加拉太书', abbr: '加', chapters: 6, testament: 'new', category: '书信', dbId: 'Gal' },
  { id: 'ephesians', name: '以弗所书', abbr: '弗', chapters: 6, testament: 'new', category: '书信', dbId: 'Eph' },
  { id: 'philippians', name: '腓立比书', abbr: '腓', chapters: 4, testament: 'new', category: '书信', dbId: 'Phil' },
  { id: 'colossians', name: '歌罗西书', abbr: '西', chapters: 4, testament: 'new', category: '书信', dbId: 'Col' },
  { id: '1thessalonians', name: '帖撒罗尼迦前书', abbr: '帖前', chapters: 5, testament: 'new', category: '书信', dbId: 'H1Thes' },
  { id: '2thessalonians', name: '帖撒罗尼迦后书', abbr: '帖后', chapters: 3, testament: 'new', category: '书信', dbId: 'H2Thes' },
  { id: '1timothy', name: '提摩太前书', abbr: '提前', chapters: 6, testament: 'new', category: '书信', dbId: 'H1Tim' },
  { id: '2timothy', name: '提摩太后书', abbr: '提后', chapters: 4, testament: 'new', category: '书信', dbId: 'H2Tim' },
  { id: 'titus', name: '提多书', abbr: '多', chapters: 3, testament: 'new', category: '书信', dbId: 'Titus' },
  { id: 'philemon', name: '腓利门书', abbr: '门', chapters: 1, testament: 'new', category: '书信', dbId: 'Philem' },
  { id: 'hebrews', name: '希伯来书', abbr: '来', chapters: 13, testament: 'new', category: '书信', dbId: 'Heb' },
  { id: 'james', name: '雅各书', abbr: '雅', chapters: 5, testament: 'new', category: '书信', dbId: 'James' },
  { id: '1peter', name: '彼得前书', abbr: '彼前', chapters: 5, testament: 'new', category: '书信', dbId: 'H1Pet' },
  { id: '2peter', name: '彼得后书', abbr: '彼后', chapters: 3, testament: 'new', category: '书信', dbId: 'H2Pet' },
  { id: '1john', name: '约翰一书', abbr: '约一', chapters: 5, testament: 'new', category: '书信', dbId: 'H1John' },
  { id: '2john', name: '约翰二书', abbr: '约二', chapters: 1, testament: 'new', category: '书信', dbId: 'H2John' },
  { id: '3john', name: '约翰三书', abbr: '约三', chapters: 1, testament: 'new', category: '书信', dbId: 'H3John' },
  { id: 'jude', name: '犹大书', abbr: '犹', chapters: 1, testament: 'new', category: '书信', dbId: 'Jude' },
  { id: 'revelation', name: '启示录', abbr: '启', chapters: 22, testament: 'new', category: '启示文学', dbId: 'Rev' },
];

export function bookById(id: string): Book | undefined {
  // 尝试直接匹配（前端 ID）
  let book = BOOKS.find((b) => b.id === id);
  if (book) return book;
  // 尝试从数据库 ID 映射（如 'Gen' -> 'genesis'）
  const frontendId = DB_ID_TO_FRONTEND[id];
  if (frontendId) {
    return BOOKS.find((b) => b.id === frontendId);
  }
  return undefined;
}

/** 将前端 book ID 转换为数据库 book_id */
export function toDbBookId(frontendId: string): string | undefined {
  return BOOK_ID_MAP[frontendId];
}
