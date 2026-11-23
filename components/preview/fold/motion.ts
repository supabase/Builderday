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
/* the roll running now, if any: a new jump stops it first */
let rolling: (() => void) | null = null;

export function jumpTo(id: string, mode: JumpMode, o: { ms: number; bar: number; ease: string; byKey: boolean; scroller: HTMLElement | null }) {
  const el = document.getElementById(id); if (!el) return;
  const head = el.matches('h2, h3') ? el : el.querySelector<HTMLElement>('h2, h3') ?? el;
  const land = () => { if (!head.hasAttribute('tabindex')) head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); };
  /* the address stays the page's own: a part's name in it would open the page part way down the next time */
  const up = el.getBoundingClientRect().top < 0;
  if (mode === 'smooth' && !o.byKey && !reducedMotion()) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); window.setTimeout(land, 600); return; }
  el.scrollIntoView({ block: 'start' });
  land();
  const box = o.scroller;
  rolling?.(); rolling = null;
  if (mode !== 'roll' || o.byKey || reducedMotion() || o.ms <= 0 || !box) return;
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
}
