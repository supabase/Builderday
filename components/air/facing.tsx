'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MONO, type WheelCfg } from '@/components/wheel/config';
import { globeLook } from '@/components/wheel/globe-look';
import { drawTextGlobe, loadFrames, loadLand, subsolar, type Frames, type GlobeCity, type LandMap } from '@/components/wheel/text-globe';
import { EPOCH } from '@/lib/day-data';

/* A city page's globe: the text globe turned to face its city, as the wheel draws it, the city's [+] in green and the
   night side thinner. It does not turn: it faces its city all day. It draws when its city, its size or the minute
   (the sun) changes, and never between. Its first paint prints once per visit, row by row behind the cursor (the
   preview's print); under reduced motion it is simply there. */

/* the day globes keep the land hatched on the night side (`: :`), never dots alone, so the world reads at every hour */
const NIGHT = 2;
const cssVar = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const monoFont = () => MONO.geist.replace(/var\((--[\w-]+)\)/g, (_m, v: string) => cssVar(v) || 'monospace');
const RM = '(prefers-reduced-motion: reduce)';
const useReduced = () => useSyncExternalStore((f) => { const m = window.matchMedia(RM); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, () => window.matchMedia(RM).matches, () => false);

export function FacingGlobe({ wheel, cities, active, minute, label, print = 0 }: {
  wheel: WheelCfg; cities: GlobeCity[]; active: number; minute: number; label: string;
  /* the print's length, ms (0: none) */
  print?: number;
}) {
  const cv = useRef<HTMLCanvasElement>(null), reduced = useReduced();
  const [art, setArt] = useState<{ frames: Frames | null; land: LandMap | null } | null>(null);
  useEffect(() => { let live = true; Promise.all([loadFrames(), loadLand()]).then(([frames, land]) => { if (live) setArt({ frames, land }); }); return () => { live = false; }; }, []);
  const min = Math.floor(minute), c = cities[active];
  const step = useRef(Infinity);
  useEffect(() => {
    const el = cv.current; if (!el || !art || !c) return;
    const ctx = el.getContext('2d'); if (!ctx) return;
    const look = { ...globeLook(wheel, monoFont(), cssVar('--green') || '#3ecf8e'), marks: 'all' as const, night: NIGHT };
    const sun = subsolar(EPOCH + min * 60000);
    const draw = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2), w = Math.round(el.clientWidth * ratio), h = Math.round(el.clientHeight * ratio);
      if (!w || !h) return;
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.46;
      drawTextGlobe(ctx, { x: w / 2, y: h / 2, r: R, ratio, facing: c.lon, cities, active, bracket: true, frames: art.frames, land: art.land, look, sun, reveal: step.current < Infinity ? { mode: 'print', step: step.current, steps: 100 } : null });
    };
    let raf = 0;
    const key = 'hackday-air-globe-' + c.lat + ',' + c.lon;
    let seen = false; try { seen = sessionStorage.getItem(key) === '1'; } catch { /* print */ }
    if (print > 0 && !reduced && !seen) {
      try { sessionStorage.setItem(key, '1'); } catch { /* fine */ }
      let t0 = 0;
      const tick = (now: number) => { t0 ||= now; const p = Math.min(1, (now - t0) / print); step.current = p < 1 ? Math.floor(p * 100) : Infinity; draw(); if (p < 1) raf = requestAnimationFrame(tick); };
      step.current = 0; draw(); raf = requestAnimationFrame(tick);
    } else { step.current = Infinity; draw(); }
    const ro = new ResizeObserver(draw); ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); step.current = Infinity; };
  }, [art, wheel, cities, active, min, c, print, reduced]);
  return <canvas ref={cv} className="oa-globe" role="img" aria-label={label} />;
}
