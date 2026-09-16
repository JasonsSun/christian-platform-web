'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
