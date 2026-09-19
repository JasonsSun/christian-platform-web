'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type FontScale = 'normal' | 'lg' | 'xl';
export type Contrast = 'normal' | 'high';

const FONT_KEY = 'a11y_font';
const CONTRAST_KEY = 'a11y_contrast';
const MOTION_KEY = 'a11y_reduce_motion';

type A11yState = {
  fontScale: FontScale;
  contrast: Contrast;
  reduceMotion: boolean;
  setFontScale: (v: FontScale) => void;
  setContrast: (v: Contrast) => void;
  setReduceMotion: (v: boolean) => void;
};

const A11yContext = createContext<A11yState | null>(null);

function apply(fontScale: FontScale, contrast: Contrast, reduceMotion: boolean) {
  const el = document.documentElement;
  el.setAttribute('data-a11y-font', fontScale);
  el.setAttribute('data-a11y-contrast', contrast);
  el.setAttribute('data-a11y-reduce-motion', reduceMotion ? '1' : '0');
}

// 首屏前无闪烁应用无障碍偏好（放在 <body> 顶部先于内容绘制）
export const a11yNoFlashScript = `(function(){try{
  var f=localStorage.getItem('${FONT_KEY}'); if(f!=='lg'&&f!=='xl')f='normal';
  var c=localStorage.getItem('${CONTRAST_KEY}'); if(c!=='high')c='normal';
  var m=localStorage.getItem('${MOTION_KEY}'); var mr=m==='1';
  var el=document.documentElement;
  el.setAttribute('data-a11y-font',f);
  el.setAttribute('data-a11y-contrast',c);
  el.setAttribute('data-a11y-reduce-motion',mr?'1':'0');
}catch(e){}})();`;

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [fontScale, setFontScaleState] = useState<FontScale>('normal');
  const [contrast, setContrastState] = useState<Contrast>('normal');
  const [reduceMotion, setReduceMotionState] = useState(false);

  useEffect(() => {
    try {
      const f = localStorage.getItem(FONT_KEY);
      if (f === 'lg' || f === 'xl') setFontScaleState(f);
      const c = localStorage.getItem(CONTRAST_KEY);
      if (c === 'high') setContrastState('high');
      if (localStorage.getItem(MOTION_KEY) === '1') setReduceMotionState(true);
    } catch {
      /* ignore */
    }
  }, []);

  const setFontScale = useCallback((v: FontScale) => {
    setFontScaleState(v);
    try {
      localStorage.setItem(FONT_KEY, v);
    } catch {
      /* ignore */
    }
    apply(v, contrast, reduceMotion);
  }, [contrast, reduceMotion]);

  const setContrast = useCallback((v: Contrast) => {
    setContrastState(v);
    try {
      localStorage.setItem(CONTRAST_KEY, v);
    } catch {
      /* ignore */
    }
    apply(fontScale, v, reduceMotion);
  }, [fontScale, reduceMotion]);

  const setReduceMotion = useCallback((v: boolean) => {
    setReduceMotionState(v);
    try {
      localStorage.setItem(MOTION_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
    apply(fontScale, contrast, v);
  }, [fontScale, contrast]);

  useEffect(() => {
    apply(fontScale, contrast, reduceMotion);
  }, [fontScale, contrast, reduceMotion]);

  return (
    <A11yContext.Provider value={{ fontScale, contrast, reduceMotion, setFontScale, setContrast, setReduceMotion }}>
      {children}
    </A11yContext.Provider>
  );
}

export function useA11y(): A11yState {
  const ctx = useContext(A11yContext);
  if (!ctx) throw new Error('useA11y must be used within <AccessibilityProvider>');
  return ctx;
}

/**
 * Esc 关闭弹层。站里所有遮罩层都支持点空白处关闭，键盘用户却没有等价出口，
 * 这里补上：active=false 时不挂监听，回调走 ref 以免 onClose 内联箭头导致反复重订阅。
 */
export function useEscape(active: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const isReachable = (el: HTMLElement) =>
  !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

/**
 * 弹层焦点管理：打开时把焦点移进弹层，Tab 在内部循环，关闭后还给原来的触发按钮。
 *
 * 站里 14 处 role="dialog" + aria-modal="true" 此前一处都没做这件事：
 * aria-modal 告诉读屏"背景不存在"，而 Tab 照样走进背景页，键盘用户既看不见弹层
 * 也回不来。返回的 ref 挂到弹层根节点上即可，active=false 时完全不挂监听。
 *
 * 非模态的下拉面板（没有遮罩、Tab 本来就该继续走页面）传 trap:false / autofocus:false，
 * 只借用它「关闭后把焦点还给触发按钮」这一段。
 */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  opts: { trap?: boolean; autofocus?: boolean } = {},
) {
  const { trap = true, autofocus = true } = opts;
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    let node: T | null = null;
    let raf = 0;
    let watching = true;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isReachable);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const now = document.activeElement;
      if (e.shiftKey && (now === first || now === node || !node.contains(now))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (now === last || !node.contains(now))) {
        e.preventDefault();
        first.focus();
      }
    };

    // Portal 首帧渲染 null、挂载后的下一个 commit 才把浮层搬进 body，
    // 所以这里要等 ref 真正拿到节点，否则监听器挂在一个不存在的节点上（既不自动聚焦也拦不住 Tab）。
    let tries = 0;
    const attach = () => {
      if (!watching) return;
      node = ref.current;
      if (!node) {
        if (++tries > 30) return;
        raf = requestAnimationFrame(attach);
        return;
      }
      // 捕获阶段：抢在页面自己的空格/方向键全局监听之前拿到 Tab
      if (trap) document.addEventListener('keydown', onKey, true);
      if (autofocus) {
        const first = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isReachable)[0];
        (first || node).focus({ preventScroll: true });
      }
    };
    attach();

    return () => {
      watching = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      if (opener && isReachable(opener)) opener.focus({ preventScroll: true });
    };
  }, [active, trap, autofocus]);
  return ref;
}

