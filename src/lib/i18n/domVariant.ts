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

export function startTraditionalDomText(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => undefined;
  }

  // 写回会再抛一个 mutation 回来。记下「我写进去的那份文字」，下一批回调里认出来就跳过；
  // 用 WeakSet 永久拉黑不行 —— React 之后真的改了这个节点时会连改都不再转。
  const selfText = new Map<Node, string>();
  const selfAttr = new Map<Element, Map<string, string>>();

  const fixText = (node: Text) => {
    const host = node.parentElement;
    if (!host || host.closest(SKIP)) return;
    const next = convert(node.data, 't');
    if (next === node.data) return;
    selfText.set(node, next);
    node.data = next;
  };

  const fixElement = (el: Element) => {
    for (const name of CONV_ATTRS) {
      const v = el.getAttribute(name);
      if (!v) continue;
      const next = convert(v, 't');
      if (next === v) continue;
      let map = selfAttr.get(el);
      if (!map) selfAttr.set(el, (map = new Map()));
      map.set(name, next);
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
  };
}
