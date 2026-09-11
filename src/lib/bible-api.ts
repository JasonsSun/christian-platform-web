/**
 * Bible API hooks
 * 从数据库获取圣经数据
 */

export interface BibleBook {
  id: string;
  name: string;
  abbr: string;
  chapters: number;
  testament: 'old' | 'new';
  category: string;
  dbId: string;
}

export interface BibleVersion {
  id: string;
  name: string;
  fullName: string;
  language: string;
}

export interface BibleChapterResponse {
  version: string;
  book: {
    id: string;
    name: string;
    abbr: string;
    chapters: number;
    testament: 'old' | 'new';
  };
  chapter: number;
  verses: Array<{ verse: number; text: string }>;
  availableChapters: number[];
  hasContent: boolean;
}

export interface BibleBooksResponse {
  versions: BibleVersion[];
  books: BibleBook[];
  available: Record<string, Record<string, number[]>>;
}

export async function fetchBibleBooks(version: string): Promise<BibleBooksResponse> {
  const res = await fetch(`/api/v1/bible?version=${version}`);
  if (!res.ok) throw new Error('Failed to fetch books');
  return res.json() as Promise<BibleBooksResponse>;
}

export async function fetchBibleChapter(
  version: string,
  bookId: string,
  chapter: number
): Promise<BibleChapterResponse> {
  const res = await fetch(
    `/api/v1/bible/chapter?version=${version}&book=${bookId}&chapter=${chapter}`
  );
  if (!res.ok) throw new Error('Failed to fetch chapter');
  return res.json() as Promise<BibleChapterResponse>;
}
