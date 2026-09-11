'use client';

/**
 * 全局守卫（挂载在 RootLayout，作用于所有页面）
 *
 * 1) 弹框清零：本系统不使用任何模态弹框。
 *    - 覆盖 window.alert / confirm / prompt，使其不再阻塞（confirm 返回 false，prompt 返回 null 视为「已关闭」）
 *    - 拦截非用户手势触发的 window.open 弹窗
 *    - 持续扫描 DOM，自动移除外部注入的 dialog / 遮罩层（当作广告弹窗无感关闭），
 *      并恢复被锁定的页面滚动
 *    - 携带 data-guard 标记的元素为本站合法元素，永不移除
 *
 * 2) 禁止查看源码：屏蔽 F12 / Ctrl+Shift+I(J,C,K) / Ctrl+U / Ctrl+S / 右键菜单 / 拖拽，
 *    并在检测到开发者工具打开时覆盖整页提示（关闭后自动恢复）。
 *
 * 3) 紧急开关：URL 带 ?__guard=off 或 localStorage['platform_guard']='off' 时全部关闭，
 *    便于开发调试与自动化巡检。
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useNotice } from '@/lib/notice';
import { pruneStaleConfirms } from '@/lib/confirm';

/** 外部弹窗特征选择器 */
const POPUP_SELECTOR = [
  'dialog[open]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  '.modal.show',
  '.swal2-container',
  '.ant-modal-root',
  '.el-overlay',
  '.mfp-wrap',
].join(',');

/** 需要保留的合法类名/属性（本站组件） */
const KEEP_ATTR = 'data-guard';

function guardEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('__guard') === 'off') return false;
    if (window.sessionStorage.getItem('platform_guard') === 'off') return false;
    if (window.localStorage.getItem('platform_guard') === 'off') return false;
  } catch {
    /* ignore */
  }
  return true;
}

/** 永不移除的元素（本站点/框架自身合法元素） */
const KEEP_TAGS = new Set(['NEXTJS-PORTAL', 'NEXT-ROUTE-ANNOUNCER', 'SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE']);

function isKeepable(el: Element): boolean {
  if (KEEP_TAGS.has(el.tagName)) return true;
  if (el.hasAttribute(KEEP_ATTR)) return true;
  let p: Element | null = el;
  for (let i = 0; i < 6 && p; i++) {
    if (p.hasAttribute && p.hasAttribute(KEEP_ATTR)) return true;
    p = p.parentElement;
  }
  return false;
}

export default function Guards() {
  const notice = useNotice();
  const pathname = usePathname();

  // ---------- 1. 覆盖原生弹框 ----------
  useEffect(() => {
    if (!guardEnabled()) return;

    const nativeAlert = window.alert.bind(window);
    const nativeConfirm = window.confirm.bind(window);
    const nativePrompt = window.prompt.bind(window);
    const nativeOpen = window.open.bind(window);

    // alert：不阻塞，转为顶部内联提示
    window.alert = ((message?: unknown) => {
      const text = typeof message === 'string' ? message : message == null ? '' : String(message);
      if (text) notice.info(text);
    }) as typeof window.alert;

    // confirm：无感关闭 = 视为「取消」
    window.confirm = ((message?: string) => {
      if (message) notice.info(String(message));
      return false;
    }) as typeof window.confirm;

    // prompt：无感关闭 = 视为「取消」
    window.prompt = (() => null) as typeof window.prompt;

    // window.open：仅允许用户主动手势触发的跳转，拦截自动弹窗
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      try {
        const act = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
        if (act && typeof act.isActive === 'boolean' && !act.isActive) {
          return null;
        }
      } catch {
        /* ignore */
      }
      return nativeOpen(url as string, target, features);
    }) as typeof window.open;

    return () => {
      window.alert = nativeAlert as typeof window.alert;
      window.confirm = nativeConfirm as typeof window.confirm;
      window.prompt = nativePrompt as typeof window.prompt;
      window.open = nativeOpen as typeof window.open;
    };
  }, [notice]);

  // ---------- 2. 自动清理外部注入的弹窗 / 遮罩 ----------
  useEffect(() => {
    if (!guardEnabled()) return;

    let raf = 0;

    const sweep = () => {
      raf = 0;
      const doc = document;
      if (!doc || !doc.body) return;

      // a) 明确的 dialog 类元素
      doc.querySelectorAll(POPUP_SELECTOR).forEach((el) => {
        if (isKeepable(el)) return;
        el.remove();
        unlockScroll();
      });

      // b) 全屏 fixed 遮罩（广告常见形态）
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      Array.from(doc.body.children).forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        if (isKeepable(el)) return;
        const cs = window.getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
        const z = parseInt(cs.zIndex || '0', 10);
        if (!Number.isFinite(z) || z < 1000) return;
        const r = el.getBoundingClientRect();
        if (r.width < vw * 0.9 || r.height < vh * 0.9) return;
        el.remove();
        unlockScroll();
      });

      // c) 非同源隐藏 iframe（广告位）
      doc.querySelectorAll('iframe').forEach((f) => {
        if (isKeepable(f)) return;
        const cs = window.getComputedStyle(f);
        if (cs.display === 'none' || cs.visibility === 'hidden') {
          f.remove();
          return;
        }
        const src = f.getAttribute('src') || '';
        if (src && /^https?:/i.test(src)) {
          try {
            if (new URL(src, window.location.href).origin !== window.location.origin) {
              const w = f.getBoundingClientRect().width;
              const h = f.getBoundingClientRect().height;
              if (w < 200 || h < 150) f.remove();
            }
          } catch {
            f.remove();
          }
        }
      });
    };

    const schedule = () => {
      if (raf) return;
      raf = window.setTimeout(sweep, 60);
    };

    const unlockScroll = () => {
      const s = document.body.style;
      if (s.overflow === 'hidden' || s.overflowY === 'hidden' || s.position === 'fixed') {
        s.overflow = '';
        s.overflowY = '';
        s.position = '';
        s.paddingRight = '';
      }
      const hs = document.documentElement.style;
      if (hs.overflow === 'hidden') hs.overflow = '';
    };

    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    const timer = window.setInterval(sweep, 1200);
    sweep();

    return () => {
      mo.disconnect();
      window.clearInterval(timer);
      if (raf) window.clearTimeout(raf);
    };
  }, []);

  // ---------- 3. 禁止查看源码 / 开发者工具 ----------
  useEffect(() => {
    if (!guardEnabled()) return;

    const blocked = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      // F12
      if (e.key === 'F12' || key === 'f12') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      if (ctrl && e.shiftKey && ['i', 'j', 'c', 'k', 's'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Ctrl+U 查看源码 / Ctrl+S 保存
      if (ctrl && !e.shiftKey && ['u', 's', 'p'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Cmd+Option+I/J/C (macOS)
      if (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      return true;
    };

    const onContextMenu = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      // 输入框保留原生右键（粘贴等），其余屏蔽
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      return false;
    };

    const onDragStart = (e: DragEvent) => e.preventDefault();

    window.addEventListener('keydown', blocked, true);
    window.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('dragstart', onDragStart, true);

    return () => {
      window.removeEventListener('keydown', blocked, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('dragstart', onDragStart, true);
    };
  }, []);

  // ---------- 4. 开发者工具打开检测 ----------
  useEffect(() => {
    if (!guardEnabled()) return;

    let overlay: HTMLDivElement | null = null;
    let shown = false;

    const ensureOverlay = () => {
      if (overlay && document.body.contains(overlay)) return overlay;
      const el = document.createElement('div');
      el.setAttribute(KEEP_ATTR, 'devtools');
      el.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;background:#0f1533;color:#e8ecff;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;';
      el.innerHTML = `
        <div style="max-width:520px">
          <div style="font-size:44px;margin-bottom:14px">🛡️</div>
          <div style="font-size:20px;font-weight:700;margin-bottom:10px">已启用内容保护</div>
          <div style="font-size:14px;line-height:1.8;opacity:.85">
            为保障平台内容与隐私安全，本站点不支持通过开发者工具查看源码。<br/>
            请关闭开发者工具（或按 F12 退出）后，页面将自动恢复。
          </div>
        </div>`;
      document.body.appendChild(el);
      overlay = el;
      return el;
    };

    const removeOverlay = () => {
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
      shown = false;
    };

    const isDevToolsOpen = () => {
      // 仅在桌面视口检测：移动端 outerHeight 与 innerHeight 天然存在较大差值（地址栏/工具栏）
      if (window.innerWidth < 900) return false;
      const threshold = 200;
      const dw = window.outerWidth - window.innerWidth;
      const dh = window.outerHeight - window.innerHeight;
      return dw > threshold || dh > threshold;
    };

    const tick = () => {
      const open = isDevToolsOpen();
      if (open && !shown) {
        shown = true;
        ensureOverlay();
      } else if (!open && shown) {
        removeOverlay();
      }
    };

    const timer = window.setInterval(tick, 900);

    return () => {
      window.clearInterval(timer);
      removeOverlay();
    };
  }, []);

  // ---------- 5. 清理超期的确认态 ----------
  // 注意：不可在「路由切换时」清空全部待确认回调——跳转式确认（/confirm）本身
  // 就是一次路由跳转，清空会把正在进行的操作一并抹掉，表现为确认页提示
  // 「操作链接已失效」。改为仅按有效期惰性清理。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    pruneStaleConfirms();
  }, [pathname]);

  return null;
}
