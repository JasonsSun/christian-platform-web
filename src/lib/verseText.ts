/** 经文括号注释处理
 *
 * 和合本 / KJV 等译本里,部分括号内容是译注、异文说明或原文补注,例如:
 *   「所多玛王…和比拉王(比拉就是琐珥)都出来」
 *   「the king of Bela (that is, Zoar)」
 * 朗读时这些内容应跳过(TTS 把括号读出来很突兀),阅读时也允许读者选择
 * 「隐藏注释」以得到更纯净的读经体验。
 *
 * 匹配策略(保守,避免吞掉正文):
 *   - 只认成对的中英文括号:() （）
 *   - 内容里不得再出现括号(不成对/跨节的括号不匹配)
 *   - 长度限制 80 字以内,避免异常数据把整节吞掉
 */

const MAX_NOTE_LEN = 80;

function noteRegex(): RegExp {
  return new RegExp('[(（][^()（）]{1,' + MAX_NOTE_LEN + '}[)）]', 'g');
}

export type VerseToken = {
  text: string;
  /** true = 括号注释(不朗读、可隐藏) */
  note: boolean;
};

/** 把一节经文切成「正文段 / 注释段」序列 */
export function splitVerse(text: string): VerseToken[] {
  const s = text ?? '';
  const re = noteRegex();
  const out: VerseToken[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), note: false });
    out.push({ text: m[0], note: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), note: false });
  return out;
}

/** 本节是否含括号注释 */
export function hasNotes(text: string): boolean {
  return new RegExp(noteRegex().source).test(text ?? '');
}

/** 去掉括号注释后的纯经文(用于朗读;朗读始终跳过注释) */
export function stripNotes(text: string): string {
  const s = (text ?? '').replace(noteRegex(), '');
  return s.replace(/[ \t]{2,}/g, ' ').replace(/\s+([，。；、？！])/g, '$1').trim();
}
