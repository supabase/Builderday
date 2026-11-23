'use client';
import { useEffect, useRef } from 'react';
import { BeamPen, CanvasPen, type Pen } from '@/components/day/pen';
import { beamReady, drawBeam } from '@/components/day/beam';
import { clampScope, type ScopeCfg } from '@/components/day/scope';
import savedScope from '@/saved/explain.config.json';
import { useWall } from './use';

/* The beam on the wall: lines drawn the way the How it works tubes draw them (beam.ts works out the light along each
   line in the page's one WebGL context), in the wall's own space, 1920 by 1080, so a line meets the words it joins.
   The beam's look is the tubes' (saved/explain.config.json); its spot and brightness on a wall are the stage's.
   It draws only while something moves: draw() says whether it is still moving, and the loop stops when it is not.
   Without WebGL2 the canvas pen draws the same lines. Decoration: what it shows is also words on the wall. */

export const SW = 1920, SH = 1080;
const SCOPE: ScopeCfg = clampScope(savedScope as Partial<ScopeCfg>);

/* draw(pen, now): draw the frame at performance time `now`; return true while anything still moves */
export type Draw = (pen: Pen, now: number) => boolean;

export function BeamLayer({ draw, k }: { draw: Draw; k: string }) {
  const ref = useRef<HTMLCanvasElement>(null), fn = useRef(draw), { cfg } = useWall();
  useEffect(() => { fn.current = draw; }, [draw]);
  useEffect(() => {
    const cv = ref.current, c = cv?.getContext('2d'); if (!cv || !c) return;
    let raf = 0;
    const size = () => { const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr)); };
    const fonts = () => { const cs = getComputedStyle(document.documentElement); return { mono: cs.getPropertyValue('--font-geist-mono').trim() || 'monospace', sans: cs.getPropertyValue('--font-geist').trim() || 'sans-serif' }; };
    const frame = (now: number) => {
      raf = 0;
      let moving: boolean;
      if (beamReady()) {
        const pen = new BeamPen({ dwell: SCOPE.dwell, speed: SCOPE.speed, gain: cfg.bright, view: [SW, SH] });
        moving = fn.current(pen, now);
        if (!drawBeam(c, new Float32Array(pen.segs), new Float32Array(pen.tris), { sigma: cfg.beam, halo: SCOPE.halo, haloW: SCOPE.haloW, expo: SCOPE.expo, hot: SCOPE.hot }, SW, SH)) {
          moving = fn.current(new CanvasPen(c, cv.width / SW, cfg.beam * 1.4, SCOPE.glow * 2.5, fonts()), now);
        }
      } else moving = fn.current(new CanvasPen(c, cv.width / SW, cfg.beam * 1.4, SCOPE.glow * 2.5, fonts()), now);
      if (moving && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const run = () => { if (!raf) raf = requestAnimationFrame(frame); };
    size(); run();
    const ro = new ResizeObserver(() => { size(); run(); }); ro.observe(cv);
    const vis = () => { if (!document.hidden) run(); };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, [k, cfg.beam, cfg.bright]);
  return <canvas ref={ref} className="st-beam" aria-hidden="true" />;
}

/* the drawings' easing, as the tubes ease: out for a line arriving, in-out for things on screen moving */
export const eo = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const eio = (t: number) => { t = Math.min(1, Math.max(0, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
