'use client';

/**
 * 移动端「简繁 / 无障碍」悬浮快捷件。
 *
 * 原先是一颗常驻的 112×54 胶囊：fixed 在右上角，逐页量下来在 18 个移动页里有 10 页
 * 真实压住内容（/community 一个 chip 的中心点完全点不到，/prayers 的「8 条代祷」、
 * /topics 的 TOP 徽章被 100% 盖住）。现在默认只留一颗 44px 圆点，点开才展开成胶囊，
 * 并且圆点可拖动、松手吸附左右边、位置记进 localStorage，键盘方向键也能挪。
 *
 * 停靠位不再是一个写死的常数：挂载和换页时按当前这一页量一个出来，往下让开每一颗
 * 「要瞄准才点得到」的小控件（见 AIM_W / AIM_H），也让开铺到圆点那一列上的每一行字
 * （见 textLinesInColumn —— 副标题末尾被啃掉两三个字，按盒面积是量不出来的），
 * 并且和它们之间空出 GAP 的缝。用户拖过之后完全听他的。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import VariantSwitcher from '@/components/VariantSwitcher';
import AccessibilityMenu from '@/components/AccessibilityMenu';

const POS_KEY = 'platform:pill-pos';
const DOT = 44;
const EDGE = 8;
const TOP_MIN = 72; // 导航栏 64 + 8：圆点不再压进导航的命中区
const TABBAR = 64;
/* 停靠时与字/控件之间留的缝。0 就够躲开重叠，但 /feed 量到过 164 对 164 这种"贴着放"：
   矩形干净，看上去却是圆点顶住了句尾。和吸边的 EDGE 同宽。 */
const GAP = 8;
const SIDE_DEFAULT: Side = 'right';
/* 默认位置的起点，不是终点：真正停在哪由下面 parkY 按当前这一页量。
   读经页的「阅读排版与主题」齿轮在 y 97..141，通知中心的页签条在 y 160..200，
   每页页头那条带子高度不同 —— 上一个写死的 152 让开了齿轮，
   正好把「系统」那一格切掉 31%，文字只剩「系」。 */
const Y_DEFAULT = 152;
/* 只躲「要瞄准才点得到」的控件。通知页页签一格 85×40，压掉 24px 基本就按不到了；
   整张卡片 358×105 被压掉一角还剩九成可点，为它一路往下躲会把圆点推出首屏。 */
const AIM_W = 140;
const AIM_H = 60;
const AIM_SEL = 'a,button,input,select,summary,label';
/* 页头带子的下界（按圆点的**上沿**算，圆点底部因此最多到 HEAD_BAND + 44）：
   往上够不到时才往下让，让到这儿为止；再往下就是正文列，怎么停都会压到某一行，追下去没有终点。
   300 是量出来的：/activities 要让到 258 才躲开通栏的「发布活动」按钮（358×50，
   比 AIM_H 矮，是要瞄准的热区）。 */
const HEAD_BAND = 300;

type Side = 'left' | 'right';
type Pos = { side: Side; y: number };
/** 一行印出来的字占了哪一段纵向区间 */
type LineBox = { top: number; bottom: number };

function clampY(y: number) {
  const max = Math.max(TOP_MIN, (typeof window === 'undefined' ? 844 : window.innerHeight) - TABBAR - DOT - 8);
  return Math.min(max, Math.max(TOP_MIN, Math.round(y)));
}

function hasPos() {
  try {
    return !!localStorage.getItem(POS_KEY);
  } catch {
    return false;
  }
}

function readPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return { side: SIDE_DEFAULT, y: Y_DEFAULT };
    const p = JSON.parse(raw);
    if ((p.side !== 'left' && p.side !== 'right') || typeof p.y !== 'number') return { side: SIDE_DEFAULT, y: Y_DEFAULT };
    return { side: p.side, y: clampY(p.y) };
  } catch {
    return { side: SIDE_DEFAULT, y: Y_DEFAULT };
  }
}

/** 圆点那一列里所有「要瞄准才点得到」的控件盒。
 *
 * 和字形行盒一样不能打点采样：/groups 的「创建团契」占 y 117..161，圆点停在 80..124 只擦着
 * 它 7px 的上沿，五个采样点（圆心 ±14）全在它上面，量出来是「干净」—— 圆点就那么把按钮切掉一角。
 * 命中测试还另有一层漏子：页头那层科技感网格是盖在内容上的兄弟节点，elementsFromPoint 第一个
 * 捞到的是它，closest 往上找不到按钮，整颗控件就这么没了。所以直接量控件自己的矩形。
 */
function aimBoxesInColumn(root: HTMLElement | null, side: Side): LineBox[] {
  const cx = side === 'right' ? innerWidth - EDGE - DOT / 2 : EDGE + DOT / 2;
  const out: LineBox[] = [];
  for (const el of Array.from(document.querySelectorAll(AIM_SEL))) {
    if (el === root || (root && (root.contains(el) || el.contains(root)))) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (r.right <= cx - DOT / 2 || r.left >= cx + DOT / 2) continue;
    // 整张卡片 358×105 压掉一角还剩九成可点，不必躲；小方块才是要瞄准的
    if (r.width >= AIM_W && r.height >= AIM_H) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
    out.push({ top: r.top, bottom: r.bottom });
  }
  return out;
}

/** 圆点压住了哪一行**印出来的字**：先把这一列里的字形行盒一次性量出来。
 *
 * 让开控件的老规则管不到这里：/feed 的副标题铺到 x=366，圆点停在 y 152 只啃掉末尾 8%
 * 的盒面积，按「整盒被压两成」判什么都算不上缺陷，可屏幕上确实看不见「呈现」两个字。
 * /activities 的副标题被啃 9%，/calendar 与 /community 页脚那句经文被啃掉一角。
 * 所以量的是 Range.getClientRects 的每一个行盒，压着几个字算几个。
 */
function textLinesInColumn(root: HTMLElement | null, side: Side): LineBox[] {
  const cx = side === 'right' ? innerWidth - EDGE - DOT / 2 : EDGE + DOT / 2;
  const out: LineBox[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!el || !(node.textContent || '').trim()) continue;
    if (el === root || root?.contains(el) || el.closest('script,style,[hidden]')) continue;
    // 停靠位只在页头那一带里挑，正文列的字犯不着一个个量
    const host = el.getBoundingClientRect();
    if (host.bottom < TOP_MIN || host.top > HEAD_BAND + DOT) continue;
    const cs = getComputedStyle(el);
    // 窄屏抽屉收起来时是 invisible + max-h-0：visibility 会继承，量子元素自己就够
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
    range.selectNodeContents(node);
    for (const lr of Array.from(range.getClientRects())) {
      if (lr.width < 1 || lr.height < 1) continue;
      if (lr.right <= cx - DOT / 2 || lr.left >= cx + DOT / 2) continue;
      out.push({ top: lr.top, bottom: lr.bottom });
    }
  }
  return out;
}

/** 圆点占的这 44px 压到了哪一格，返回它的下沿（没有则 null）。传进来的矩形已经筛过列了。 */
function boxBottom(boxes: LineBox[], top: number): number | null {
  let bottom: number | null = null;
  for (const b of boxes) {
    if (b.bottom <= top || b.top >= top + DOT) continue;
    bottom = Math.max(bottom ?? 0, b.bottom);
  }
  return bottom;
}

/** 让路：从起点往两边等距外扩，取第一个「既不压控件也不压字」的停靠位，挪得越少越好。
 *
 * 为什么往上优先得靠距离说话：/calendar 往上 7px 就落进页头右侧那片空白，往下要挪 65px
 * 才干净，可那儿正好压住「全部」下拉右侧的原生箭头（它 326 宽，按 AIM 规则算不用瞄准的，
 * 量具看不见那枚箭头），看着就像个 bug。
 * 只在页头带子 [TOP_MIN, HEAD_BAND] 里找，再往下就是正文列，怎么停都会压到某一行，追下去
 * 没有终点。找不到就退回起点 —— 停在一个挪了一半的位置比停在原地更糟。 */
function parkY(root: HTMLElement | null, side: Side): number {
  const start = clampY(Y_DEFAULT);
  const lowest = Math.min(HEAD_BAND, Math.max(TOP_MIN, innerHeight - TABBAR - DOT - EDGE));
  const boxes = aimBoxesInColumn(root, side).concat(textLinesInColumn(root, side));
  /* 先按「留缝」找，找不到再按「不压上」找，最后才回起点。
     留缝这一步是量出来的：/feed 的圆点停在 y=120，下沿 164 正好压在副标题那一行的上沿 164 上——
     按矩形是零重叠，看上去却是圆点把句尾顶住了。 */
  const find = (gap: number) => {
    const list = gap ? boxes.map((b) => ({ top: b.top - gap, bottom: b.bottom + gap })) : boxes;
    const blockedAt = (y: number) => boxBottom(list, y) !== null;
    if (!blockedAt(start)) return start;
    for (let d = 1; d <= HEAD_BAND; d += 1) {
      if (start - d >= TOP_MIN && !blockedAt(start - d)) return start - d;
      if (start + d <= lowest && !blockedAt(start + d)) return start + d;
    }
    return null;
  };
  return find(GAP) ?? find(0) ?? start;
}

export default function QuickPrefsDock() {
  const pathname = usePathname();
  // 首帧必须和服务端一致，所以持久位置在挂载后才读；展开态不持久，每次进页面都是圆点。
  const [pos, setPos] = useState<Pos>({ side: SIDE_DEFAULT, y: Y_DEFAULT });
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const dotRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const movedRef = useRef(0);

  // 挂载后（以及换页后）重新挑一个停靠位：这一页的页头带子落在哪，量了才知道。
  // 用户自己拖过就完全听他的，不再自动挪。
  // 页头常常是数据回来才画出来的 —— /notifications 那一排页签就是，
  // 挂载那一刻量一次会量到空气，所以隔 350 / 900 / 1600ms 再各量一次。
  // parkY 每次都从 Y_DEFAULT 重新量，所以补量是幂等的，不会越挪越远。
  useEffect(() => {
    if (hasPos()) {
      setPos(readPos());
      setReady(true);
      return;
    }
    const tick = () => {
      setPos({ side: SIDE_DEFAULT, y: parkY(wrapRef.current, SIDE_DEFAULT) });
      setReady(true);
    };
    tick();
    const ts = [350, 900, 1600].map((ms) => window.setTimeout(tick, ms));
    return () => ts.forEach(clearTimeout);
  }, [pathname]);

  useEffect(() => {
    const onResize = () => setPos((p) => ({ ...p, y: clampY(p.y) }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const save = useCallback((next: Pos) => {
    setPos(next);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式下写不进去，下次进页面回到默认位 */
    }
  }, []);

  // 展开时：点外面收起；Esc 收起；但子菜单自己开着时先让给它。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-guard="a11y-menu"]')) return;
      setOpen(false);
      dotRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = dotRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const start = { x: r.left, y: r.top };
    const p0 = { x: e.clientX, y: e.clientY };
    movedRef.current = 0;
    el.setPointerCapture(e.pointerId);
    let dragging = false;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - p0.x;
      const dy = ev.clientY - p0.y;
      movedRef.current = Math.max(movedRef.current, Math.abs(dx), Math.abs(dy));
      if (!dragging && movedRef.current < 6) return;
      dragging = true;
      // 横向不夹住的话能把圆点拖出屏幕外，松手前那一瞬它是找不回来的
      setDrag({ x: Math.min(window.innerWidth - DOT, Math.max(0, start.x + dx)), y: clampY(start.y + dy) });
    };
    const release = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
      if (!dragging) return;
      // 用圆点自己的中心判边，不是手指落点：从右下角抓住拖到中线左侧时，手指位置会算错边。
      const cx = start.x + (ev.clientX - p0.x) + DOT / 2;
      save({ side: cx < window.innerWidth / 2 ? 'left' : 'right', y: clampY(start.y + (ev.clientY - p0.y)) });
      setDrag(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  };

  // 展开/收起。真实指针点一下（mouse/touch 的 click.detail 都是 1）和键盘 Enter/Space（detail 0）都要能开，
  // 只有「刚拖完那一下」要吞掉 —— 拖动松手时浏览器同样会在圆点上补一个 click。
  const onClick = () => {
    if (movedRef.current >= 6) {
      movedRef.current = 0;
      return;
    }
    setOpen((v) => !v);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 48 : 24;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      save({ ...pos, y: clampY(pos.y + (e.key === 'ArrowUp' ? -step : step)) });
    } else if (e.key === 'ArrowLeft' && pos.side !== 'left') {
      e.preventDefault();
      save({ side: 'left', y: pos.y });
    } else if (e.key === 'ArrowRight' && pos.side !== 'right') {
      e.preventDefault();
      save({ side: 'right', y: pos.y });
    }
  };

  const style: React.CSSProperties = drag
    ? { left: drag.x, top: drag.y }
    : {
        top: pos.y,
        [pos.side]: EDGE,
      };
  // 圆点拖到下半屏后，往下开的无障碍面板（≈250px）会顶出屏幕，这时改成往上开。
  // open 在服务端恒为 false，所以这里不会在 SSR 阶段读到 window。
  const up = open && typeof window !== 'undefined' && pos.y + 300 > window.innerHeight - TABBAR;
  // 量好停靠位之前先不画：否则第一帧停在猜的 152，下一帧才滑到该待的地方，
  // 每进一页都能看到圆点跳一下。
  if (!ready) return null;

  return (
    <div
      ref={wrapRef}
      data-nav-pill="1"
      data-nav-pill-side={pos.side}
      className={`nav-quick-pill md:hidden fixed z-[60] flex items-center gap-1 ${
        drag ? '' : 'transition-[top,left,right] duration-300 ease-out'
      }`}
      style={style}
      role="group"
      aria-label="快捷偏好"
    >
      {open && (
        <div className={`${pos.side === 'left' ? 'order-2' : 'order-1'} flex items-center gap-1 rounded-full bg-primary-950/90 px-1 py-1 shadow-lg backdrop-blur`}>
          {/* 停靠边决定弹层朝哪边开：靠左时用默认的 right-0 会把 256px 的面板甩出屏幕外。 */}
          <VariantSwitcher tone="light" align={pos.side} up={up} />
          <AccessibilityMenu tone="light" align={pos.side} up={up} />
        </div>
      )}
      <button
        ref={dotRef}
        type="button"
        onPointerDown={onPointerDown}
        onClick={onClick}
        onKeyDown={onKeyDown}
        aria-expanded={open}
        aria-label={open ? '收起快捷偏好入口' : '展开简繁与无障碍快捷入口，可拖动改变位置'}
        title="简繁 / 无障碍（可拖动）"
        style={{ touchAction: 'none', width: DOT, height: DOT }}
        className={`${open && pos.side === 'right' ? 'order-2' : 'order-1'} grid shrink-0 place-items-center rounded-full bg-primary-950/90 border border-white/15 text-white/85 shadow-lg backdrop-blur transition-transform duration-200 active:scale-90`}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M4 6h10m4 0h2M4 12h4m4 0h8M4 18h9m4 0h3M14 4v4M8 10v4M13 16v4"
          />
        </svg>
      </button>
    </div>
  );
}
