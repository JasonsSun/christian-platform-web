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

/**
 * 还原记录挂在节点自己身上，不放 Map。
 *
 * 原来是 `Map<Text, Undo>`：节点当强引用键，SPA 换页时 React 把整棵子树摘掉，
 * 表里的键还连着那个 Text 和它的 parentElement 链，一整段早就看不见的 DOM 就此常驻。
 * 实测 20 页走完之后：简体档游离文本节点 0 个，繁体档 1962 个，堆多 23.9 MB，
 * 而且随会话时长一直涨（probe-detached.mjs）。记在节点上就跟着节点一起生死，
 * 不需要额外销账；节点被摘走又插回来（列表重排就是先 remove 再 insert）时，
 * 记录也还跟着它，切回简体照样还得回去。
 */
const UNDO_TEXT = Symbol('variantUndoText');
const UNDO_ATTR = Symbol('variantUndoAttr');
type Tagged = { [UNDO_TEXT]?: Undo; [UNDO_ATTR]?: Record<string, Undo> };

export function startTraditionalDomText(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => undefined;
  }

  // 写回会再抛一个 mutation 回来。记下「我写进去的那份文字」，下一批回调里认出来就跳过；
  // 用 WeakSet 永久拉黑不行 —— React 之后真的改了这个节点时会连改都不再转。
  // 这两张只是「认一下自己的笔迹」的缓存，从不整表遍历，所以用 WeakMap：
  // 强引用在这里换不来任何东西，只会把摘掉的节点留在内存里。
  const selfText = new WeakMap<Node, string>();
  const selfAttr = new WeakMap<Element, Map<string, string>>();
  let titleUndo: Undo | null = null;

  const fixText = (node: Text) => {
    const host = node.parentElement;
    if (!host || host.closest(SKIP)) return;
    const next = convert(node.data, 't');
    if (next === node.data) return;
    // 每次都记「我替换掉的那一份」：React 中途换过文字的话，这里存的就是它的新内容，
    // 还原时还给它的也是新的，不会把用户的操作覆盖掉。
    (node as Node & Tagged)[UNDO_TEXT] = { from: node.data, to: next };
    selfText.set(node, next);
    node.data = next;
  };

  const fixElement = (el: Element) => {
    for (const name of CONV_ATTRS) {
      const v = el.getAttribute(name);
      if (!v) continue;
      const next = convert(v, 't');
      if (next === v) continue;
      const tagged = el as Element & Tagged;
      const undo = tagged[UNDO_ATTR] || {};
      undo[name] = { from: v, to: next };
      tagged[UNDO_ATTR] = undo;
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

  // 还原只认「还是我写进去的那一份」。中途被 React 换过的节点，现在挂的是新的简体
  // 原文，硬塞回旧文字等于把用户的操作吞掉，所以那种一律不动。
  const restoreSubtree = (root: ParentNode) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n = walker.currentNode as Node | null;
    while (n) {
      if (n.nodeType === 3) {
        const tagged = n as Text & Tagged;
        const u = tagged[UNDO_TEXT];
        if (u && (n as Text).data === u.to) (n as Text).data = u.from;
      } else if (n.nodeType === 1) {
        const el = n as Element;
        const attrs = (el as Element & Tagged)[UNDO_ATTR];
        if (attrs) {
          for (const name of Object.keys(attrs)) {
            if (el.getAttribute(name) === attrs[name].to) el.setAttribute(name, attrs[name].from);
          }
        }
      }
      n = walker.nextNode();
    }
  };

  const observer = new MutationObserver((records) => {    for (const r of records) {
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
    // 切回简体时观察器只是断开，文字还留在繁体上：React 的 props 里自始至终是简体原文，
    // 它比对虚拟 DOM 觉得「没变」，就不会再去碰那个文本节点 —— 所以这一页要刷到重载才回得来。
    // 只能自己记、自己还。记录挂在节点上，那就顺着 body 走一遍把它们收回来；
    // 摘掉的节点不在这一趟里，也早就从界面上消失了，React 重新挂上去时用的是它自己的简体原文。
    restoreSubtree(document.body);
    if (titleUndo && document.title === titleUndo.to) document.title = titleUndo.from;
    titleUndo = null;
  };
}
