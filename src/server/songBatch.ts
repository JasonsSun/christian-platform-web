import { str } from './sanitize';

export interface ParsedSong {
  title: string;
  author: string;
  category: string;
  tags: string;
  lyrics: string;
  chords: string;
  originalKey: string;
  /** 原始块在文本中的起始行（1-based），用于报错定位 */
  line: number;
}

const KEY_RE =
  /^(作者|author|分类|category|原调|key|original[_-]?key|标签|tags|和弦|chords)\s*[:：]\s*(.*)$/i;
const TITLE_HASH_RE = /^#\s+(.+?)\s*$/;

/**
 * 解析批量诗歌文本。
 * 分段方式（任选其一）：
 *  - 独立的 `---` 行分隔每首；
 *  - 或以 `# 标题` 开头的新段落（无 `---` 时自动按此分段）。
 * 每首字段（键值对，中英文皆可）：作者/author、分类/category、原调/key、标签/tags、和弦/chords。
 * 头部区域的其余非空行归为歌词（lyrics）；歌词里出现的 `副歌：` 等不会被误判为字段。
 * `和弦` 段可为多行，直到遇见空行结束（与歌词之间需空行分隔）。
 */
export function parseSongBatch(raw: string): ParsedSong[] {
  const text = str(raw);
  if (!text.trim()) return [];
  const rawLines = text.split(/\r?\n/);

  // 1) 优先按 `---` 分隔
  const sepBlocks: { lines: string[]; start: number }[] = [];
  let cur: string[] = [];
  let curStart = 1;
  let hasSeparator = false;
  rawLines.forEach((ln, i) => {
    const lineNo = i + 1;
    if (/^\s*---\s*$/.test(ln)) {
      hasSeparator = true;
      if (cur.length) sepBlocks.push({ lines: cur, start: curStart });
      cur = [];
      curStart = lineNo + 1;
      return;
    }
    cur.push(ln);
  });
  if (cur.length) sepBlocks.push({ lines: cur, start: curStart });

  if (hasSeparator) {
    return sepBlocks.map((b) => parseBlock(b.lines, b.start));
  }

  // 2) 无 `---`：按 `# 标题` 分段
  const hashBlocks: { lines: string[]; start: number }[] = [];
  let hc: string[] = [];
  let hcs = 1;
  rawLines.forEach((ln, i) => {
    if (TITLE_HASH_RE.test(ln) && hc.length) {
      hashBlocks.push({ lines: hc, start: hcs });
      hc = [];
      hcs = i + 1;
    }
    hc.push(ln);
  });
  if (hc.length) hashBlocks.push({ lines: hc, start: hcs });
  if (hashBlocks.length > 1) {
    return hashBlocks.map((b) => parseBlock(b.lines, b.start));
  }
  // 只有一段就原样解析
  return [parseBlock(rawLines, 1)];
}

function parseBlock(lines: string[], start: number): ParsedSong {
  let title = '';
  let author = '';
  let category = '';
  let tags = '';
  let originalKey = '';
  let chords = '';
  const lyricsLines: string[] = [];
  let inChords = false;
  let head = true;

  for (const ln of lines) {
    const hash = ln.match(TITLE_HASH_RE);
    if (hash) {
      title = hash[1].trim();
      inChords = false;
      continue;
    }
    const kv = ln.match(KEY_RE);
    if (kv) {
      const key = kv[1].toLowerCase();
      const val = kv[2].trim();
      if (key === '作者' || key === 'author') author = val;
      else if (key === '分类' || key === 'category') category = val;
      else if (key === '标签' || key === 'tags') tags = val;
      else if (key === '原调' || key === 'key' || key.startsWith('original')) originalKey = val.slice(0, 8);
      else if (key === '和弦' || key === 'chords') {
        inChords = true;
        if (val) chords = chords ? `${chords}\n${val}` : val;
        continue;
      }
      inChords = false;
      continue;
    }
    if (inChords) {
      if (ln.trim() === '') {
        inChords = false;
        continue;
      }
      chords = chords ? `${chords}\n${ln}` : ln;
      continue;
    }
    if (head) {
      if (ln.trim() === '') continue; // 头部空行跳过，不退出头部
      head = false;
      lyricsLines.push(ln);
      continue;
    }
    lyricsLines.push(ln);
  }

  return {
    title: title.trim(),
    author: author.trim(),
    category: category.trim() || '赞美',
    tags: tags.trim(),
    originalKey: originalKey.trim(),
    chords: chords.trim(),
    lyrics: lyricsLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    line: start,
  };
}
