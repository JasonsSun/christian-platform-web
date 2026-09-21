'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 全站动效运行时：滚动浮现、数字滚动、卡片指针柔光。
 *
 * 三条硬约束（都是被实测逼出来的，别改）：
 * 1. 隐藏标记 .js-reveal 只由这里加，服务端 HTML 里永远没有 —— 无 JS、爬虫、
 *    像素级对比度探针看到的都是正常可见内容，不会量到一片 opacity:0。
 * 2. 只做 opacity / transform：改 width/height/margin 的那类入场一律视为缺陷。
 * 3. 计数会改变文本宽度（"8" → "1,285"），所以动画期间先把元素实测宽度钉成内联
 *    style，结束后再放开；不钉的话统计卡会一边跳一边排，CLS 门直接红。
 */

const REVEAL_SELECTOR = 'main section, main [data-reveal], main [data-reveal-group] > *';

function motionAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.dataset.a11yReduceMotion === '1') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return typeof window.IntersectionObserver === 'function';
}

/**
 * 只有「离首屏还有一屏多」的元素才值得藏起来等浮现。
 *
 * 阈值不能贴着视口底边：首页 hero 占满 100vh，紧接着的统计卡正好落在折叠线下方几
 * 十像素，按 0.92 判定会把首屏以下整条藏成 opacity:0 —— 用户看到的就是 hero 底下
 * 一大片空白（实测 1907x1000 下统计卡 top=990、视口 1000，整块不可见）。留出一屏
 * 余量后，折叠线上第一块内容始终是画出来的，动效只在往下滚之后才登场。
 */
function belowFold(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.top > window.innerHeight * 1.5;
}

function countUp(el: HTMLElement) {
  const raw = (el.textContent || '').trim();
  const target = Number(raw.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(target) || target === 0) return;
  const grouped = /,/.test(raw);
  const decimals = (raw.split('.')[1] || '').replace(/[^\d]/g, '').length;
  // 钉宽度：动画从 0 数到 1285 时位数在变，不钉住的话整行会左右抽动。
  const w = el.getBoundingClientRect().width;
  const wasInline = w > 0 && getComputedStyle(el).display === 'inline';
  if (w > 0) el.style.width = `${Math.round(w)}px`;
  if (wasInline) el.style.display = 'inline-block';
  const release = () => {
    el.style.width = '';
    if (wasInline) el.style.display = '';
  };
  const started = performance.now();
  const dur = 900 + Math.min(600, target / 20);
  const paint = (v: number) => {
    const s = v.toFixed(decimals);
    el.textContent = grouped ? Number(s).toLocaleString('en-US') : s;
  };
  const step = (now: number) => {
    const p = Math.min(1, (now - started) / dur);
    // ease-out：先快后慢，最后 15% 走完剩下的零头，读起来不像匀速滚轮
    paint(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
    else {
      el.textContent = grouped ? Number(target.toFixed(decimals)).toLocaleString('en-US') : target.toFixed(decimals);
      release();
    }
  };
  requestAnimationFrame(step);
}

export default function MotionLayer() {
  const pathname = usePathname();

  useEffect(() => {
    if (!motionAllowed()) return;
    const show = (el: HTMLElement) => {
      el.classList.add('js-reveal-in');
      // 计数可以落在被观察元素自己身上，也可以藏在它里面（统计卡：格子浮现、数字跑）
      if (el.hasAttribute('data-count')) countUp(el);
      else el.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          show(el);
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.01 },
    );

    // 交错：同一组里第 n 个晚 45ms，最多叠到 270ms，再长就变成「等页面加载完」
    const stagger = (host: Element) => {
      Array.from(host.children).forEach((child, i) => {
        (child as HTMLElement).style.transitionDelay = `${Math.min(i * 45, 270)}ms`;
      });
    };

    const scan = () => {
      document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((el) => {
        if (el.dataset.motionDone || el.classList.contains('js-reveal')) return;
        const host = el.closest('[data-reveal-group]');
        if (host) stagger(host);
        if (el.hasAttribute('data-reveal') || el.tagName === 'SECTION' || host) {
          el.dataset.motionDone = '1';
          if (belowFold(el)) {
            el.classList.add('js-reveal');
            io.observe(el);
          }
        }
      });
    };

    scan();
    // 绝大多数页面是挂载后再拉数据重渲染的，只扫一次等于什么都没动效。
    let pending = 0;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        scan();
      });
    });
    const main = document.getElementById('main-content');
    if (main) mo.observe(main, { childList: true, subtree: true });

    // 兜底：IntersectionObserver 的回调由渲染帧驱动，后台标签页、帧被卡住或元素被
    // 换掉时可能一次都不派发。滚到底还是一片 opacity:0 是不可接受的失效模式，所以
    // 滚动时自己扫一遍；没有藏起来的元素时只是一次空查询。
    let sweepRaf = 0;
    const sweep = () => {
      if (sweepRaf) return;
      sweepRaf = requestAnimationFrame(() => {
        sweepRaf = 0;
        document
          .querySelectorAll<HTMLElement>('.js-reveal:not(.js-reveal-in)')
          .forEach((el) => {
            if (el.getBoundingClientRect().top < window.innerHeight) {
              io.unobserve(el);
              show(el);
            }
          });
      });
    };
    window.addEventListener('scroll', sweep, { passive: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      window.removeEventListener('scroll', sweep);
      if (pending) cancelAnimationFrame(pending);
      if (sweepRaf) cancelAnimationFrame(sweepRaf);
    };
  }, [pathname]);

  // 指针柔光只在精确指针（鼠标）上开：触屏上 pointermove 只会白烧帧。
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    let raf = 0;
    const onMove = (ev: PointerEvent) => {
      const card = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-spot]');
      if (!card) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${((ev.clientX - r.left) / r.width) * 100}%`);
        card.style.setProperty('--my', `${((ev.clientY - r.top) / r.height) * 100}%`);
      });
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
