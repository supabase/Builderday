'use client';
import { useEffect, useRef, type RefObject } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import type { WheelEngine } from '@/components/wheel/engine';
import { reducedMotion } from './flap';

/* The unroll (lab only): as the wheel scrolls away, its ten names leave the glass and straighten into the board's ten
   rows. The names are one layer of text fixed to the window; each one's place, turn and size come from the scroll
   alone (no easing behind it), between where the wheel draws it and where its row's name sits. While they travel
   the wheel draws no names and the rows hide theirs, so a name is never on screen twice.
   Sizes and places are measured on resize; a frame reads only the scroll. Under reduced motion it does nothing. */

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const smooth = (v: number) => v * v * (3 - 2 * v);
const rad = (d: number) => (d * Math.PI) / 180;

type Row = { left: number; mid: number; size: number };

export function Unroll({ names, cfg, eng, board, from, spread, on, gone }: {
  names: string[]; cfg: WheelCfg; eng: RefObject<WheelEngine | null>; board: RefObject<HTMLElement | null>;
  /* set while the names have left the wheel (the wheel reads it every frame and draws none) */
  gone: RefObject<boolean>;
  /* where it starts, as a share of the window's height scrolled; how far apart the names leave (0: together) */
  from: number; spread: number; on: boolean;
}) {
  const layer = useRef<HTMLDivElement>(null), state = useRef({ u: -1 });
  const live = useRef(false);

  useEffect(() => {
    const root = layer.current, sec = board.current;
    if (!on || !root || !sec || reducedMotion()) return;
    const spans = Array.from(root.children) as HTMLElement[];
    const page = root.closest<HTMLElement>('.pf');
    const engine = eng.current;
    let rows: Row[] = [], widths: number[] = [], heights: number[] = [], H = 1, top = 0, a = 0, b = 1, raf = 0;
    const size = () => { const g = eng.current?.geometry?.(); return g ? cfg.labelSize * g.r : 0; };

    const measure = () => {
      H = window.innerHeight;
      const fs = size(); if (!fs) return;
      for (const s of spans) { s.style.fontSize = `${fs}px`; s.style.letterSpacing = `${cfg.track * fs}px`; }
      widths = spans.map((s) => s.offsetWidth); heights = spans.map((s) => s.offsetHeight);
      const y0 = window.scrollY;
      rows = Array.from(sec.querySelectorAll<HTMLElement>('.pf-board tbody .pf-city')).map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, mid: r.top + y0 + r.height / 2, size: parseFloat(getComputedStyle(el).fontSize) || fs };
      });
      /* the wheel's names show down to the top of the page's main column (the bar covers the rest) */
      const m = page?.querySelector<HTMLElement>('.pf-main'); top = m ? m.getBoundingClientRect().top + y0 : H;
      a = from * H;
      /* the end: the first row's name halfway up the window */
      b = Math.max(a + 0.3 * H, (rows[0]?.mid ?? a + H) - 0.5 * H);
      state.current.u = -1; tick();
    };

    const place = (s: number) => {
      const g = eng.current?.geometry?.(); if (!g || rows.length !== spans.length) return;
      const n = spans.length, step = rad(cfg.step), fs = cfg.labelSize * g.r;
      const reach = cfg.labelFrom * g.r, push = cfg.labelPush * g.r;
      const u = clamp01((s - a) / Math.max(1, b - a));
      const moving = u > 0 && u < 1;
      gone.current = u > 0;
      if (moving !== live.current) {
        live.current = moving;
        root.toggleAttribute('data-on', moving);
        page?.toggleAttribute('data-unrolling', moving);
      }
      if (!moving) return;
      /* the wheel clips its names at its own bottom edge; the layer starts with the same edge and lets it go */
      const edge = top - s + 1.5 * H * smooth(u);
      root.style.clipPath = `inset(0 0 ${Math.max(0, H - edge).toFixed(1)}px 0)`;
      spans.forEach((el, i) => {
        /* the copy of this city nearest the wheel's turn, where the wheel would draw it */
        const slot = i + n * Math.round((g.at - i) / n), ang = (g.at - slot) * step, near = 1 - clamp01(Math.abs(slot - g.at));
        const fade = 1 - smooth(clamp01((Math.abs(ang) - cfg.fadeFrom) / (cfg.fadeTo - cfg.fadeFrom)));
        const ox = -reach - push * smooth(near), x0 = g.x + Math.cos(ang) * ox, y0 = g.y - s + Math.sin(ang) * ox;
        const R = rows[i], k1 = R.size / fs, x1 = R.left + widths[i] * k1, y1 = R.mid - s;
        /* the lowest name leaves first and each one above a little after it, so the gaps open on the way down
           instead of closing; all arrive together */
        const lag = spread * ((n - 1 - i) / Math.max(1, n - 1)), t = smooth(clamp01((u - lag) / Math.max(0.05, 1 - lag)));
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, turn = ang * (1 - t), k = 1 + (k1 - 1) * t;
        const alpha0 = (cfg.dim + (1 - cfg.dim) * smooth(near)) * fade, alpha = alpha0 + (1 - alpha0) * t;
        el.style.transform = `translate3d(${(x - widths[i]).toFixed(2)}px, ${(y - heights[i] / 2).toFixed(2)}px, 0) rotate(${turn.toFixed(4)}rad) scale(${k.toFixed(4)})`;
        el.style.opacity = alpha.toFixed(3);
      });
    };

    function tick() { raf = 0; const s = Math.max(0, window.scrollY); if (s === state.current.u) return; state.current.u = s; place(s); }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const ro = new ResizeObserver(measure); ro.observe(sec); ro.observe(document.documentElement);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.fonts?.ready.then(measure);
    measure();
    return () => {
      ro.disconnect(); window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf);
      root.removeAttribute('data-on'); page?.removeAttribute('data-unrolling'); live.current = false; gone.current = false;
      engine?.wake?.();
    };
  }, [on, cfg, eng, board, from, spread, names.length, gone]);

  if (!on) return null;
  return (
    <div ref={layer} className="pf-unroll" aria-hidden="true">
      {names.map((nm, i) => <span key={i} className="pf-un" style={{ color: `rgb(${cfg.ink} ${cfg.ink} ${cfg.ink - 2})` }}>{nm}</span>)}
    </div>
  );
}
