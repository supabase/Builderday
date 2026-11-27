/* motion.ts (client): the few motions that need script (the wire's new line, finalists landing, the pick) read
   their timing from the tokens on <html>, so the saved config and reduced motion reach them the same way they
   reach the CSS. Everything else moves in CSS. */
import { useSyncExternalStore } from 'react';

/* whether the visitor asks for reduced motion, kept in step with the setting; false on the server's first paint. One
   subscribe for every caller, so a component that renders each frame does not resubscribe each frame. */
const REDUCE = '(prefers-reduced-motion: reduce)';
const subReduce = (fn: () => void) => { const m = window.matchMedia(REDUCE); m.addEventListener('change', fn); return () => m.removeEventListener('change', fn); };
export const useReduced = () => useSyncExternalStore(subReduce, () => window.matchMedia(REDUCE).matches, () => false);

/* a token's value in ms ("280ms" or "0.28s"); 0 when it is missing, or when reduced motion is asked for */
export function tokMs(name: string): number {
  if (typeof window === 'undefined' || stillPage()) return 0;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  if (!isFinite(n)) return 0;
  return /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n;
}
export function tokEase(name: string, fallback = 'ease-out'): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
export function stillPage(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
/* a one-shot animation that leaves nothing behind (fill: backwards holds the first frame through the delay) */
export function play(el: Element, frames: Keyframe[], dur: number, opts: { delay?: number; ease?: string; pseudo?: string } = {}): Animation | null {
  if (dur <= 0 || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(frames, { duration: dur, delay: opts.delay || 0, easing: opts.ease || 'linear', fill: 'backwards', pseudoElement: opts.pseudo });
}
/* a line drawing itself from the left, as a pen would along a line that runs left to right. A wipe, not a dash
   offset: the lines have non-scaling strokes and some are dashed, and a wipe draws both the same way. The inset
   reaches 4px past the box so the stroke's own width is never cut. */
export function wipe(el: Element, dur: number, delay: number, ease: string): Animation | null {
  return play(el, [{ clipPath: 'inset(-4px 100% -4px -4px)' }, { clipPath: 'inset(-4px -4px -4px -4px)' }], dur, { delay, ease });
}
