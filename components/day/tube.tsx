'use client';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { usePref } from '@/components/board/prefs';
import { beamReady, drawBeam } from './beam';
import { paintWords, paintWordsCached } from './pen';
import { lineMo, lineScore, type LineMo, type Press } from './line';
import { clampScreen } from '@/components/screen/config';
import screenSaved from '@/saved/screen.config.json';
import { VW, viewH, isStack, beamFrame, renderCanvas, spanOf, stepOf, type Facts, type Scene, type ScopeCfg } from './scope';

/* One tube: a canvas that draws a scene from scope.ts. It runs only while it is on screen and the tab is visible,
   steps at the config's frame rate, and under reduced motion draws one still (the config's "still" phase) and stops.
   Pointing at it turns the beam up. The scan lines and corners are CSS (.sc in explain.css).
   With the beam renderer the frame is drawn by the page's one WebGL context (beam.ts) and copied into this canvas;
   where WebGL2 is missing, the canvas renderer draws the same scene. */

/* what each tube's frame costs on the main thread (an average), its beam length and its renderer, for the lab */
export type TubeCost = { ms: number; len: number; renderer: 'beam' | 'canvas'; frames: number; scene: string };
const costs = new Map<string, TubeCost>();
export const tubeCosts = () => [...costs.values()];

/* Anything that moves by itself for over 5 seconds can be stopped (WCAG 2.2.2), with no key for it on the page:
   Screen off stills every drawing (the visitor's switch, remembered per browser), and pressing a drawing holds it where
   it is until it is pressed again (each tube on its own; a real button for keys and screen readers). */
export const useTubesStill = () => !usePref('screen')[0];
const subReduce = (fn: () => void) => { const m = window.matchMedia('(prefers-reduced-motion: reduce)'); m.addEventListener('change', fn); return () => m.removeEventListener('change', fn); };
export const useReduced = () => useSyncExternalStore(subReduce, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => false);

/* the page's scan lines, as the screen kit draws them on the ground (tuned in /lab/screen) */
const PAGE_LINES = clampScreen(screenSaved);

const families = () => {
  const cs = getComputedStyle(document.documentElement);
  return { mono: cs.getPropertyValue('--font-geist-mono').trim() || 'ui-monospace, monospace', sans: cs.getPropertyValue('--font-geist').trim() || 'sans-serif' };
};

/* An outside clock (the step-through): it says where the drawing is at each moment, whether it is still moving, and
   calls back when a press moves it, so the tube can sleep while nothing changes. It also owns holding and reduced
   motion: a tube on a clock draws what the clock says. */
export type TubeClock = { read: (now: number) => { ph: number; from?: number; moving: boolean; press?: Press; mo?: Partial<LineMo> }; listen: (fn: () => void) => () => void };

export function Tube({ scene, cfg, f, onStep, className, label, at, clock, held: heldBy, onHold, what = 'drawing', onSmall }: {
  scene: Scene; cfg: ScopeCfg; f: Facts; onStep?: (i: number) => void; className?: string; label?: string;
  /** a fixed phase: the tube draws this one still and never moves */
  at?: number;
  /** the step-through's clock, in place of the tube's own */
  clock?: TubeClock;
  /** a tube on a clock is held by the clock's owner: whether it is held, and the press that asks for it */
  held?: boolean; onHold?: (held: boolean) => void;
  /** what the drawing is, for its button's name ("Hold the day drawing"), so each one on a page is told apart */
  what?: string;
  /** told when the tube becomes small or large (the morning line lays its panel out by it) */
  onSmall?: (small: boolean) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null), stepRef = useRef(onStep), clockRef = useRef(clock), smallRef = useRef(onSmall), hold = useTubesStill(), id = useId();
  /* a press holds this drawing where it is; the effect below gives the toggle (it knows the phase on screen) */
  const [own, setOwn] = useState(false), [tall, setTall] = useState(false), holdRef = useRef<(v: boolean) => void>(() => {});
  const reduced = useReduced();
  /* a press is only offered where the drawing moves: not a still, not under reduced motion or with Screen off */
  const pressable = at === undefined && !hold && !reduced;
  const mine = clock ? !!heldBy : own;
  const toggle = () => { const v = !mine; if (clock) onHold?.(v); else { setOwn(v); holdRef.current(v); } };
  const onKey = (e: KeyboardEvent<HTMLSpanElement>) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) toggle(); } };
  /* Screen off or reduced motion while held: let go (the clock's owner does the same for its own), so turning them back
     gives a moving drawing; the effect below starts afresh then too */
  if (!pressable && own) setOwn(false);
  useEffect(() => { stepRef.current = onStep; }, [onStep]);
  useEffect(() => { clockRef.current = clock; }, [clock]);
  useEffect(() => { smallRef.current = onSmall; }, [onSmall]);
  const key = JSON.stringify([scene, cfg, f, clock ? false : hold, at ?? null, !!clock]);
  useEffect(() => {
    const cv = ref.current, c = cv?.getContext('2d'); if (!cv || !c) return;
    const [sc, cf, ff, heldIn, fixed, clocked] = JSON.parse(key) as [Scene, ScopeCfg, Facts, boolean, number | null, boolean];
    const ctl = clocked ? clockRef.current : undefined;
    const held = !ctl && (heldIn || fixed !== null), stillAt = fixed ?? cf.still;
    const line = sc === 'day' && cf.dir === 'line';
    const period = line ? lineScore(cf, ff, lineMo()).loop : cf.loop * spanOf(sc), reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prevNow = 0, raf = 0, vis = false, t0 = performance.now(), last = -1, step = -1, boost = 1, target = 1, fo = families(), cur = stillAt, frozen = -1;
    /* the size is read only when it changes (the resize observer), never in the frame loop; the backing store is sized
       from the device-pixel box where the browser gives it, so a line lands on the same pixels every frame */
    let small = false, cssW = 0;
    const size = (e?: ResizeObserverEntry) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1), box = e?.devicePixelContentBoxSize?.[0];
      cssW = e ? e.contentRect.width : cv.getBoundingClientRect().width;
      const w = box && dpr === (window.devicePixelRatio || 1) ? box.inlineSize : Math.round(cssW * dpr);
      /* a small tube (the sheet, a phone) draws fewer, larger words; the morning line's stacked layout is taller */
      const was = small; small = cssW < 480; if (was !== small || !e) smallRef.current?.(small);
      setTall(isStack(cf, small));
      cv.width = Math.max(1, w); cv.height = Math.max(1, Math.round((w * viewH(cf, small)) / VW));
    };
    let shown = '';
    const paint = (ph: number, from?: number, press?: Press, mo?: Partial<LineMo>) => {
      const t0 = performance.now(); let len = 0; shown = ph + ':' + from;
      if (cf.renderer === 'beam' && beamReady()) {
        const fr = beamFrame(sc, ph, cf, ff, boost, from, small, press, mo); len = line ? fr.time : fr.len;
        if (!drawBeam(c, fr.segs, fr.tris, { sigma: cf.bw, halo: cf.halo, haloW: cf.haloW, expo: cf.expo, hot: cf.hot }, VW, viewH(cf, small))) renderCanvas(c, sc, ph, cf, ff, fo, cv.width / VW, boost, from, small, press, mo);
        else if (fr.words.length) (line ? paintWordsCached : paintWords)(c, fr.words, cv.width / VW, fo.mono, cf.glow);
      } else renderCanvas(c, sc, ph, cf, ff, fo, cv.width / VW, boost, from, small, press, mo);
      cur = ph;
      const ms = performance.now() - t0, was = costs.get(id);
      costs.set(id, { ms: was ? was.ms * 0.9 + ms * 0.1 : ms, len, renderer: cf.renderer === 'beam' && beamReady() ? 'beam' : 'canvas', frames: (was?.frames ?? 0) + 1, scene: sc === 'day' ? 'day:' + cf.dir : sc });
      const s = stepOf(sc, ph, cf, ff, mo); if (s >= 0 && s !== step) { step = s; stepRef.current?.(s); }
    };
    const now0 = () => { const s = ctl!.read(performance.now()); return s; };
    const still = () => { if (ctl) { const s = now0(); paint(s.ph, s.from, s.press, s.mo); } else paint(frozen >= 0 ? frozen : stillAt); };
    const tick = (now: number) => {
      raf = 0; if (!vis || document.hidden) return;
      if (ctl) {
        /* on a clock: draw at the frame rate while it moves or the beam is still turning up, then sleep */
        boost += (target - boost) * (1 - Math.exp(-(now - (prevNow || now)) / 90)); prevNow = now;
        const s = ctl.read(now), settled = Math.abs(target - boost) < 0.01;
        if (!s.moving && settled) { if (shown !== s.ph + ':' + s.from) paint(s.ph, s.from, s.press, s.mo); prevNow = 0; return; }
        raf = requestAnimationFrame(tick);
        /* smooth: every display frame; else at the config's frame rate (the morning line always draws every frame) */
        const frame = cf.smooth || line ? now : Math.floor((now / 1000) * cf.fps);
        if (frame === last && settled) return;
        last = frame; paint(s.ph, s.from, s.press, s.mo); return;
      }
      if (reduce.matches || held || frozen >= 0) return;
      raf = requestAnimationFrame(tick);
      boost += (target - boost) * (1 - Math.exp(-(now - (prevNow || now)) / 90)); prevNow = now;
      const secs = (now - t0) / 1000, frame = cf.smooth ? now : Math.floor(secs * cf.fps);
      if (frame === last && Math.abs(target - boost) < 0.01) return;
      last = frame; paint(((cf.smooth ? secs : frame / cf.fps) / period) % 1);
    };
    const run = () => { if (!ctl && (reduce.matches || held || frozen >= 0)) { still(); return; } if (vis && !raf && !document.hidden) raf = requestAnimationFrame(tick); };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    /* a press on a tube with its own clock: hold at the phase on screen, and go on from there when pressed again */
    holdRef.current = (v: boolean) => {
      if (ctl) return;
      if (v) { frozen = cur; stop(); } else if (frozen >= 0) { t0 = performance.now() - frozen * period * 1000; frozen = -1; last = -1; run(); }
    };
    size(); still();
    /* each time a tube comes into view it starts from the top, so the reel begins with Build, beside the first step */
    const io = new IntersectionObserver(([e]) => { const was = vis; vis = e.isIntersecting; if (vis) { if (!was && !ctl && frozen < 0) { t0 = performance.now(); last = -1; } run(); } else stop(); });
    io.observe(cv);
    const ro = new ResizeObserver(([e]) => { size(e); last = -1; if (ctl || reduce.matches || held || frozen >= 0 || !vis) still(); });
    try { ro.observe(cv, { box: 'device-pixel-content-box' }); } catch { ro.observe(cv); }
    const onVis = () => { if (document.hidden) stop(); else run(); };
    const onMotion = () => { stop(); last = -1; frozen = -1; if (ctl) { run(); return; } if (reduce.matches || held) still(); else { t0 = performance.now(); run(); } };
    const unlisten = ctl ? ctl.listen(() => { last = -1; run(); }) : () => {};
    /* pointing with a mouse turns the beam up; a finger scrolling past does not */
    const on = (e: PointerEvent) => { if (cf.hover && e.pointerType === 'mouse') { target = 1.9; run(); } }, off = () => { target = 1; run(); };
    document.addEventListener('visibilitychange', onVis); reduce.addEventListener('change', onMotion);
    cv.addEventListener('pointerenter', on); cv.addEventListener('pointerleave', off);
    document.fonts?.ready.then(() => { fo = families(); last = -1; if (ctl || reduce.matches || held || frozen >= 0 || !vis) still(); });
    return () => {
      unlisten();
      costs.delete(id);
      stop(); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); reduce.removeEventListener('change', onMotion);
      cv.removeEventListener('pointerenter', on); cv.removeEventListener('pointerleave', off);
    };
  }, [key, id]);
  return (
    <span className={'sc' + (className ? ' ' + className : '')} data-lines={cfg.lines} data-tall={tall ? '' : undefined} data-hold={pressable ? '' : undefined}
      style={cfg.lines === 'page' ? { ['--sc-scan' as string]: PAGE_LINES.lineAlpha, ['--sc-pitch' as string]: PAGE_LINES.linePitch + 'px' } : { ['--sc-scan' as string]: cfg.scan }}
      {...(pressable
        ? { role: 'button', tabIndex: 0, 'aria-pressed': mine, 'aria-label': 'Hold the ' + what, 'aria-describedby': label ? id + '-d' : undefined, onClick: toggle, onKeyDown: onKey }
        : { 'aria-hidden': label ? undefined : true, role: label ? 'img' : undefined, 'aria-label': label })}>
      <canvas ref={ref} className="sc-cv" />
      {/* held: a small word says so, and how to let go (the button's pressed state says it to a screen reader) */}
      {pressable && mine ? <span className="sc-held" data-side={tall ? 'top' : cfg.dir === 'line' ? 'top-left' : undefined} aria-hidden="true">Held · press to go on</span> : null}
      {pressable && label ? <span id={id + '-d'} className="sr-only">{label}</span> : null}
    </span>
  );
}
