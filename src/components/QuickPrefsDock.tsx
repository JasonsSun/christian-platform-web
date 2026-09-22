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
 * 「要瞄准才点得到」的小控件（见 AIM_W / AIM_H）。用户拖过之后完全听他的。
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

type Side = 'left' | 'right';
type Pos = { side: Side; y: number };

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

/** 圆点这一格压到了哪颗要瞄准的控件，返回它的下沿（没有则 null）。
 *  圆点自己 z-60 盖在最上面，所以要从命中栈往下找到第一个不是它的东西。 */
function aimBottom(root: HTMLElement | null, side: Side, top: number): number | null {
  const cx = side === 'right' ? innerWidth - EDGE - DOT / 2 : EDGE + DOT / 2;
  let bottom: number | null = null;
  for (const [dx, dy] of [[0, 0], [-14, -14], [14, -14], [-14, 14], [14, 14]]) {
    const x = cx + dx;
    const y = top + DOT / 2 + dy;
    if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) continue;
    const stack = document.elementsFromPoint(x, y);
    const hit = stack.find((e) => !(root && root.contains(e)));
    const host = hit?.closest?.(AIM_SEL) as HTMLElement | null;
    if (!host) continue;
    const r = host.getBoundingClientRect();
    if (r.width < AIM_W || r.height < AIM_H) bottom = Math.max(bottom ?? 0, r.bottom);
  }
  return bottom;
}

/** 从起点往下让开每一颗要瞄准的控件，最多让 6 次（一屏页头不会超过这个数）。 */
function parkY(root: HTMLElement | null, side: Side): number {
  const max = Math.max(TOP_MIN, innerHeight - TABBAR - DOT - EDGE);
  let y = clampY(Y_DEFAULT);
  for (let i = 0; i < 6; i += 1) {
    const b = aimBottom(root, side, y);
    if (b === null) break;
    const next = clampY(b + EDGE);
    if (next <= y || next >= max) break;
    y = next;
  }
  return y;
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
