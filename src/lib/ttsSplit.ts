/**
 * 长文本按句末标点切分 —— 服务端 TTS 分段合成与前端直连兜底共用。
 *
 * 放在 lib 而非 server 下，是因为浏览器侧也要用同一套切分逻辑；
 * 若两处各写一份，很容易漂移成「服务端能合成、前端兜底却切错段」。
 */

/** 按句末标点切分长文本，再累积到不超过 max 字（保持语义完整） */
export function splitBySentence(text: string, max: number): string[] {
  const t = (text || '').trim();
  if (!t) return [];
  if (t.length <= max) return [t];
  const sents = t.split(/(?<=[。！？!?；;\n])/).filter((s) => s.length > 0);
  const out: string[] = [];
  let buf = '';
  for (const s of sents) {
    if (buf && buf.length + s.length > max) {
      out.push(buf);
      buf = '';
    }
    buf += s;
    // 单句本身超长（如无标点的长串）→ 硬切
    while (buf.length > max) {
      out.push(buf.slice(0, max));
      buf = buf.slice(max);
    }
  }
  if (buf.trim()) out.push(buf);
  return out.map((x) => x.trim()).filter(Boolean);
}

/**
 * 百度翻译 TTS 免密钥直链。
 *
 * 服务端与浏览器都能用：浏览器把它交给 `<audio src>` 直连播放时，
 * 请求来自**用户自己的网络**（家宽/4G），能绕开云机房 IP 被风控的问题——
 * 这是服务端合成全部失败后最可靠的一层保底。
 */
export function baiduTtsUrl(text: string, speed = 5): string {
  return (
    'https://fanyi.baidu.com/gettts?lan=zh&spd=' +
    speed +
    '&source=web&text=' +
    encodeURIComponent(text)
  );
}
