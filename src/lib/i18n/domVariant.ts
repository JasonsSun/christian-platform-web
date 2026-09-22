import { convert } from './variant';

/**
 * 繁体模式下的正文补转。
 *
 * 为什么不在各页面逐个 convert()：全站约 3559 处写死的中文字面量（181 个组件），
 * 逐页包裹既补不完也会一直漏。词典文案走 t() 已经转过了，剩下的都是这里要处理的。
 *
 * 只在 variant==='t' 时挂载，简体模式一行代码都不跑。
 */

/** 这些属性的文字也会显示给用户 */
const CONV_ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

/** 转换这些节点的文字没有意义，甚至会把脚本改坏 */
const SKIP = 'script,style,textarea,title,meta,noscript,code,pre';

/** 一次改写：from 是动它之前 DOM 里的样子，to 是写进去的繁体 */
type Undo = { from: string; to: string };

export function startTraditionalDomText(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => undefined;
  }

  // 写回会再抛一个 mutation 回来。记下「我写进去的那份文字」，下一批回调里认出来就跳过；
  // 用 WeakSet 永久拉黑不行 —— React 之后真的改了这个节点时会连改都不再转。
  const selfText = new Map<Node, string>();
  const selfAttr = new Map<Element, Map<string, string>>();

  // 每一份改写都要留还原的余地。切回简体时观察器只是断开，文字还留在繁体上：
  // React 的 props 里自始至终是简体原文，它比对虚拟 DOM 觉得「没变」，就不会再去碰那个
  // 文本节点 —— 所以这一页要刷到重载才回得来。只能自己记、自己还。
  const textUndo = new Map<Text, Undo>();
  const attrUndo = new Map<Element, Map<string, Undo>>();
  let titleUndo: Undo | null = null;

  const fixText = (node: Text) => {
    const host = node.parentElement;
    if (!host || host.closest(SKIP)) return;
    const next = convert(node.data, 't');
    if (next === node.data) return;
    // 每次都记「我替换掉的那一份」：React 中途换过文字的话，这里存的就是它的新内容，
    // 还原时还给它的也是新的，不会把用户的操作覆盖掉。
    textUndo.set(node, { from: node.data, to: next });
    selfText.set(node, next);
    node.data = next;
  };

  const fixElement = (el: Element) => {
    for (const name of CONV_ATTRS) {
      const v = el.getAttribute(name);
      if (!v) continue;
      const next = convert(v, 't');
      if (next === v) continue;
      let map = attrUndo.get(el);
      if (!map) attrUndo.set(el, (map = new Map()));
      map.set(name, { from: v, to: next });
      let mine = selfAttr.get(el);
      if (!mine) selfAttr.set(el, (mine = new Map()));
      mine.set(name, next);
      el.setAttribute(name, next);
    }
  };

  const scanSubtree = (root: Node) => {
    if (root.nodeType === 3) {
      fixText(root as Text);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    const walker = document.createTreeWalker(root as ParentNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n = walker.currentNode as Node | null;
    while (n) {
      if (n.nodeType === 3) fixText(n as Text);
      else if (n.nodeType === 1) fixElement(n as Element);
      n = walker.nextNode();
    }
  };

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') {
        const node = r.target as Text;
        const mine = selfText.get(node);
        if (mine !== undefined) {
          selfText.delete(node);
          if (node.data === mine) continue;
        }
        fixText(node);
      } else if (r.type === 'attributes') {
        const el = r.target as Element;
        const name = r.attributeName as string;
        const mine = selfAttr.get(el)?.get(name);
        if (mine !== undefined) {
          if (el.getAttribute(name) === mine) continue;
        }
        fixElement(el);
      } else {
        r.addedNodes.forEach((node) => scanSubtree(node));
      }
    }
  });

  // 标题在 <head> 里，正文观察器看不到；Next 还会在数据回来之后重写一次 title，
  // 所以必须单独盯着 head，而不是只在正文变更时顺手带上。
  let selfTitle: string | null = null;
  const syncTitle = () => {
    const now = document.title;
    if (selfTitle !== null && now === selfTitle) return;
    selfTitle = null;
    const next = convert(now, 't');
    if (next === now) return;
    titleUndo = { from: now, to: next };
    selfTitle = next;
    document.title = next;
  };
  const titleObserver = new MutationObserver(syncTitle);

  scanSubtree(document.body);
  syncTitle();
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: CONV_ATTRS,
  });
  titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });

  return () => {
    observer.disconnect();
    titleObserver.disconnect();
    // 还原只认「还是我写进去的那一份」。中途被 React 换过的节点，现在挂的是新的简体
    // 原文，硬塞回旧文字等于把用户的操作吞掉，所以那种一律不动。
    for (const [node, u] of textUndo) {
      if (node.isConnected && node.data === u.to) node.data = u.from;
    }
    textUndo.clear();
    for (const [el, attrs] of attrUndo) {
      if (!el.isConnected) continue;
      for (const [name, u] of attrs) {
        if (el.getAttribute(name) === u.to) el.setAttribute(name, u.from);
      }
    }
    attrUndo.clear();
    selfText.clear();
    selfAttr.clear();
    if (titleUndo && document.title === titleUndo.to) document.title = titleUndo.from;
    titleUndo = null;
  };
}
