/**
 * JS 触发的滚动也要听"减少动效"的话。
 *
 * globals.css 里的 prefers-reduced-motion 兜底只管 CSS 动画，
 * `el.scrollTo({ behavior: 'smooth' })` 是 JS 参数，CSS 盖不住它；
 * 站内的无障碍开关还会额外写 html[data-a11y-reduce-motion]，两个都要认。
 */
export function reduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true ||
    document.documentElement.getAttribute('data-a11y-reduce-motion') === '1'
  );
}

/** 直接当 scrollTo / scrollIntoView 的第二个参数用 */
export function scrollBehavior(): ScrollBehavior {
  return reduceMotion() ? 'auto' : 'smooth';
}
