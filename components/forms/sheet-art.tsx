'use client';
import { createContext, useContext, useEffect, useRef } from 'react';
import saved from '@/saved/sheet.config.json';
import { loadLand, type LandMap } from '@/components/wheel/text-globe';
import { clampArt, type ArtLook, type ArtSubject } from './art-config';
import { paintArt, planArt, type ArtAssets, type ArtPlan } from './art';

/* The sheets' picture on the page: a canvas that fills its box (the band over the sheet, or the column beside it) and
   prints once when the sheet opens. The look is saved/sheet.config.json, unless a page (the lab) gives its own through
   ArtLookProvider. The picture is decoration: aria-hidden, and every word it shows is also in the sheet as text. */

const SAVED = clampArt(saved as Partial<ArtLook>);
/* the subjects already printed in this visit */
const PRINTED = new Set<string>();
/* the lab's Print again: every picture prints anew */
export function forgetPrints() { PRINTED.clear(); }
const ArtLookContext = createContext<ArtLook>(SAVED);
export const ArtLookProvider = ArtLookContext.Provider;
export function useArtLook(): ArtLook { return useContext(ArtLookContext); }

function cssVar(n: string, fb: string): string { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb; }
/* the canvas cannot read a CSS colour function it does not know: a colour is resolved through a probe element */
function resolved(color: string): string {
  const el = document.createElement('i'); el.style.color = color; el.style.display = 'none'; document.body.appendChild(el);
  const v = getComputedStyle(el).color; el.remove(); return v || color;
}

export function SheetArt({ subject, className, still }: { subject: ArtSubject; className?: string; still?: boolean }) {
  const look = useArtLook(), cv = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  const land = useRef<LandMap | null>(null), p = useRef(still ? 1 : 0), drawRef = useRef<() => void>(() => {});
  /* the subject by value: a parent that builds a new object each render does not redraw the picture */
  const key = subject.word + '|' + (subject.city || '') + '|' + (subject.lines || []).join('/');
  const subRef = useRef(subject);
  useEffect(() => { subRef.current = subject; });
  const assets = useRef<Omit<ArtAssets, 'land'> | null>(null), plan = useRef<{ id: string; plan: ArtPlan } | null>(null);

  /* draws the current step. The plan (the word read into cells, the globe, the order) is made once per size,
     subject, look and land; a step only paints it. Colours and fonts are read once, the first time. */
  useEffect(() => {
    plan.current = null;
    drawRef.current = () => {
      const c = cv.current, b = box.current; if (!c || !b) return;
      /* always drawn at 2x: on a 1x screen the browser scales it down, so the letters keep their shape as a halftone
         and the globe keeps the geometry it is tuned at */
      const w = b.clientWidth, h = b.clientHeight, dpr = 2;
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const ctx = c.getContext('2d'); if (!ctx) return;
      assets.current ??= {
        frames: null, ground: resolved(cssVar('--c-ground', '#000')), green: resolved(cssVar('--c-accent', '#3ecf8e')), ink2: resolved(cssVar('--c-ink-2', '#a3a39f')),
        sans: cssVar('--font-sans', 'system-ui, sans-serif'), mono: cssVar('--font-mono', 'ui-monospace, monospace'),
      };
      const id = w + 'x' + h + '@' + dpr + (land.current ? 'L' : '');
      if (!plan.current || plan.current.id !== id) plan.current = { id, plan: planArt(ctx, look, subRef.current, { w, h, dpr }, { ...assets.current, land: land.current }) };
      paintArt(ctx, plan.current.plan, look, p.current);
    };
    drawRef.current();
  }, [look, key]);

  /* the land map (for the globe) and the web fonts once; a resize draws again */
  useEffect(() => {
    let off = false;
    const again = () => { if (off) return; plan.current = null; drawRef.current(); };
    loadLand().then((m) => { if (off) return; land.current = m; again(); });
    document.fonts?.ready.then(again);
    const ro = new ResizeObserver(() => drawRef.current()); if (box.current) ro.observe(box.current);
    return () => { off = true; ro.disconnect(); };
  }, []);

  /* the print, once per subject in a visit: from revealDelay over revealMs, in 24 whole steps, painted only when the
     step changes. Sheets open and close often, so a picture already printed in this visit is simply there. Reduced
     motion, a still lab frame or no reveal: at once. A timer finishes it too, so a background tab (where frames stall)
     never leaves it half printed. */
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches, seen = PRINTED.has(key);
    PRINTED.add(key);
    if (still || reduced || seen || look.reveal === 'none' || look.revealMs === 0) { p.current = 1; drawRef.current(); return; }
    p.current = 0; drawRef.current();
    const t0 = performance.now() + look.revealDelay, dur = look.revealMs;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.max(0, Math.min(1, (t - t0) / dur)), step = k >= 1 ? 1 : Math.floor(k * 24) / 24;
      if (step !== p.current) { p.current = step; drawRef.current(); }
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const tm = window.setTimeout(() => { cancelAnimationFrame(raf); if (p.current !== 1) { p.current = 1; drawRef.current(); } }, look.revealDelay + dur + 200);
    return () => { cancelAnimationFrame(raf); clearTimeout(tm); };
  }, [key, still, look.reveal, look.revealMs, look.revealDelay]);

  return <div ref={box} className={'fm-art' + (className ? ' ' + className : '')} aria-hidden="true"><canvas ref={cv} /></div>;
}
