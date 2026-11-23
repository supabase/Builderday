'use client';
import { useEffect, type RefObject } from 'react';
import { reducedMotion } from './flap';

/* The page's arrivals and its jumps. Every one runs once, uses transform, opacity or the colour edges only, and is a
   cut under reduced motion.
   - once(el, share, f): f the first time `share` of el is in view.
   - write(rows, step): rows appear one a step apart, with no curve (a flip-disc sign written row by row).
   - converge(el): a big heading's red and blue start apart and settle to the screen's 1.2px; it never fades.
   - jumpTo(id, mode): a header cell's press. roll: the sections roll up (or down) behind a black bar onto the part;
     smooth: the browser's smooth scroll; cut: straight there. A key press is always a cut. Focus goes to the part's
     heading after. */

export function once(el: Element | null, share: number, f: () => void): () => void {
  if (!el) return () => {};
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); f(); } }, { threshold: share });
  io.observe(el);
  return () => io.disconnect();
}

/* elements under root marked [data-pf-wait] are written in when root arrives (CSS keeps them hidden until then) */
export function useWrite(root: RefObject<HTMLElement | null>, step: number, share = 0.15, on = true) {
  useEffect(() => {
    const el = root.current; if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-pf-wait]'));
    if (!on || reducedMotion() || step <= 0) { rows.forEach((r) => r.removeAttribute('data-pf-wait')); return; }
    const timers: number[] = [];
    const stop = once(el, share, () => rows.forEach((r, i) => timers.push(window.setTimeout(() => r.removeAttribute('data-pf-wait'), i * step))));
    /* the rows still waiting keep waiting: an effect run again (new settings, or React's second run in development)
       writes them when the board is in view, so they are never shown early */
    return () => { stop(); timers.forEach((t) => window.clearTimeout(t)); };
  }, [root, step, share, on]);
}

/* the sections' headings (every h2 under root) converge when 30% of each is in view */
export function useConverge(root: RefObject<HTMLElement | null>, on: boolean, key: unknown) {
  useEffect(() => {
    const el = root.current; if (!el) return;
    const hs = Array.from(el.querySelectorAll<HTMLElement>('h2'));
    if (!on || reducedMotion()) return;
    /* a heading already on screen when the page starts (the first part's, in the peek) is left as it is: splitting it
       then would show it sharp, split, and settling, all before anyone scrolled */
    const vh = window.innerHeight;
    const stops = hs.map((h) => {
      const r = h.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) return () => {};
      h.setAttribute('data-pf-conv', 'wait'); return once(h, 0.3, () => { if (h.getAttribute('data-pf-conv') === 'wait') h.setAttribute('data-pf-conv', 'in'); });
    });
    return () => { stops.forEach((s) => s()); hs.forEach((h) => h.removeAttribute('data-pf-conv')); };
  }, [root, on, key]);
}

export type JumpMode = 'roll' | 'smooth' | 'cut';
/* the roll or glide running now, if any: a new jump stops it first */
let rolling: (() => void) | null = null;

/* The glide's curves. The page is already on screen and only moves, so every one speeds up and brakes; they differ in
   how soon the page answers the press. */
export const GLIDE_EASES = { brake: [0.3, 0.1, 0.1, 1], ease: [0.25, 0.1, 0.25, 1], 'in-out': [0.65, 0, 0.35, 1] } as const;
export type GlideEase = keyof typeof GLIDE_EASES;
/* a cubic-bezier as a function of time: x(u) solved for u by Newton, bisection where Newton stalls */
function bezier([x1, y1, x2, y2]: readonly number[]) {
  const at = (a: number, b: number, u: number) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
  const dx = (u: number) => 3 * x1 * (1 - u) ** 2 + 6 * (x2 - x1) * u * (1 - u) + 3 * (1 - x2) * u * u;
  return (t: number) => {
    if (t <= 0) return 0; if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 6; i++) { const e = at(x1, x2, u) - t, d = dx(u); if (Math.abs(e) < 1e-5) break; if (Math.abs(d) < 1e-6) { u = NaN; break; } u -= e / d; }
    if (!(u >= 0 && u <= 1)) { let lo = 0, hi = 1; u = t; for (let i = 0; i < 30; i++) { u = (lo + hi) / 2; if (at(x1, x2, u) < t) lo = u; else hi = u; } }
    return at(y1, y2, u);
  };
}

/* The glide: the page itself scrolls to the target. The target is measured again every frame (parts above can still
   settle), the time grows with the distance between min and max, and the reader's own wheel, touch, press or key
   stops it where it is. Returns how long it will take (0 when it went straight there). */
function glide(target: () => number, o: { min: number; max: number; ease?: GlideEase }, end: () => void): number {
  const from = window.scrollY, max = () => document.documentElement.scrollHeight - window.innerHeight;
  const to0 = Math.max(0, Math.min(max(), target())), d = Math.abs(to0 - from);
  if (d < 2) { end(); return 0; }
  /* one screen takes about the minimum; four screens or more take the maximum */
  const ms = Math.round(o.min + (o.max - o.min) * Math.min(1, d / (window.innerHeight * 4)));
  const curve = bezier(GLIDE_EASES[o.ease ?? 'brake'] ?? GLIDE_EASES.brake);
  const t0 = performance.now(); let raf = 0, over = false;
  const off = () => { for (const t of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) window.removeEventListener(t, stop, true); };
  const finish = (landed: boolean) => { if (over) return; over = true; cancelAnimationFrame(raf); off(); if (rolling === stop) rolling = null; if (landed) end(); };
  function stop() { finish(false); }
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms), to = Math.max(0, Math.min(max(), target()));
    window.scrollTo(0, from + (to - from) * curve(t));
    if (t < 1) raf = requestAnimationFrame(step); else finish(true);
  };
  for (const t of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) window.addEventListener(t, stop, { capture: true, passive: true });
  rolling = stop;
  raf = requestAnimationFrame(step);
  return ms;
}

/* the top of the page, by the same glide (or at once by key or with reduced motion) */
export function jumpTop(mode: JumpMode, o: { min: number; max: number; ease?: GlideEase; byKey: boolean }): number {
  rolling?.(); rolling = null;
  if (mode !== 'smooth' || o.byKey || reducedMotion() || o.max <= 0) { window.scrollTo(0, 0); return 0; }
  return glide(() => 0, o, () => {});
}

export function jumpTo(id: string, mode: JumpMode, o: { ms: number; bar: number; ease: string; byKey: boolean; scroller: HTMLElement | null; min?: number; max?: number; glide?: GlideEase }): number {
  const el = document.getElementById(id); if (!el) return 0;
  const head = el.matches('h2, h3') ? el : el.querySelector<HTMLElement>('h2, h3') ?? el;
  const land = () => { if (!head.hasAttribute('tabindex')) head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); };
  /* the address stays the page's own: a part's name in it would open the page part way down the next time */
  const up = el.getBoundingClientRect().top < 0;
  rolling?.(); rolling = null;
  if (mode === 'smooth' && !o.byKey && !reducedMotion() && (o.max ?? 0) > 0) {
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    return glide(() => el.getBoundingClientRect().top + window.scrollY - margin, { min: o.min ?? 0, max: o.max ?? 0, ease: o.glide }, land);
  }
  el.scrollIntoView({ block: 'start' });
  land();
  const box = o.scroller;
  if (mode !== 'roll' || o.byKey || reducedMotion() || o.ms <= 0 || !box) return 0;
  /* the roll: the new frame comes up (or down) from the window's edge with the black blanking bar on its leading edge */
  const H = window.innerHeight, dir = up ? -1 : 1, from = dir * (H + o.bar);
  const bar = document.createElement('div'); bar.className = 'pf-roll'; bar.setAttribute('aria-hidden', 'true'); bar.style.height = o.bar + 'px';
  document.body.appendChild(bar);
  /* the screen kit's small globes are drawn from where their elements were: hidden while the frame rolls, drawn again
     where it lands */
  const root = document.documentElement; root.setAttribute('data-pf-rolling', '');
  let a: Animation | null = null, b: Animation | null = null;
  let ended = false;
  const done = () => {
    if (ended) return; ended = true; bar.remove();
    if (rolling === stop || rolling === null) { rolling = null; root.removeAttribute('data-pf-rolling'); }
    window.dispatchEvent(new Event('scroll'));
  };
  /* a second jump during a roll ends this one where it is: one bar, never two */
  const stop = () => { a?.cancel(); b?.cancel(); done(); };
  rolling = stop;
  try {
    const opt = { duration: o.ms, easing: o.ease, fill: 'both' as const };
    a = box.animate([{ transform: `translateY(${from}px)` }, { transform: 'translateY(0)' }], opt);
    b = bar.animate(dir > 0 ? [{ transform: `translateY(${H}px)` }, { transform: `translateY(${-o.bar}px)` }] : [{ transform: `translateY(${-o.bar}px)` }, { transform: `translateY(${H}px)` }], opt);
    const run = a; run.finished.then(() => run.cancel(), () => {}).finally(done);
  } catch { done(); }
  return o.ms;
}
