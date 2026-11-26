'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MONO, type WheelCfg } from '@/components/wheel/config';
import { globeLook } from '@/components/wheel/globe-look';
import { drawTextGlobe, layoutOf, loadFrames, loadLand, markAt, subsolar, type Frames, type LandMap, type TextGlobeDraw } from '@/components/wheel/text-globe';
import { EPOCH } from '@/lib/day-data';
import { at } from '@/lib/routes';

/* The home's globe: the preview's text globe, turning, every city a mark you can press.
   - tour: it turns to each city in the order given (the live ones first), holds there with the city captioned under
     it, then turns on to the next.
   - spin: it turns at one speed, west to east, with no bracket and no caption until a pointer finds a city.
   - face: it faces the first city and stays.
   A pointer on a mark holds the turn and captions that city; a press opens it. It draws only when the facing it shows
   (whole steps of the frames), the bracket or the pointer changes. Off screen, in a hidden tab, or under reduced
   motion it does not turn. */

export type SpinCity = { lat: number; lon: number; code: string; name: string; href: string; mark: string; said: string };
export type SpinCfg = { mode: 'tour' | 'spin' | 'face'; speed: number; dwell: number; turn: number; wake: number;
  /* the globe's size as a share of the screen's height, and how much of it runs off the right edge (a share of its width) */
  size: number; bleed: number };

/* the day globes keep the land hatched on the night side (`: :`), never dots alone, so the world reads at every hour */
const NIGHT = 2;
const cssVar = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const monoFont = () => MONO.geist.replace(/var\((--[\w-]+)\)/g, (_m, v: string) => cssVar(v) || 'monospace');
const RM = '(prefers-reduced-motion: reduce)';
const useReduced = () => useSyncExternalStore((f) => { const m = window.matchMedia(RM); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, () => window.matchMedia(RM).matches, () => false);
const wrap = (a: number) => ((a + 540) % 360) - 180;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function SpinGlobe({ wheel, cities, order, minute, cfg, label }: {
  wheel: WheelCfg; cities: SpinCity[];
  /* the cities to visit, in order (indexes into cities); the first is faced first */
  order: number[]; minute: number; cfg: SpinCfg; label: string;
}) {
  const cv = useRef<HTMLCanvasElement>(null), reduced = useReduced();
  const [art, setArt] = useState<{ frames: Frames | null; land: LandMap | null } | null>(null);
  useEffect(() => { let live = true; Promise.all([loadFrames(), loadLand()]).then(([frames, land]) => { if (live) setArt({ frames, land }); }); return () => { live = false; }; }, []);
  const [shown, setShown] = useState(order[0] ?? 0), [hover, setHover] = useState(-1), [capI, setCapI] = useState(-1);
  const hoverRef = useRef(-1), last = useRef<TextGlobeDraw | null>(null), facingRef = useRef(cities[order[0] ?? 0]?.lon ?? 0);
  const min = Math.floor(minute), orderKey = order.join(',');

  useEffect(() => {
    const el = cv.current; if (!el || !art || !cities.length) return;
    const ctx = el.getContext('2d'); if (!ctx) return;
    const look = { ...globeLook(wheel, monoFont(), cssVar('--green') || '#3ecf8e'), marks: 'all' as const, wake: cfg.wake, night: NIGHT };
    const sun = subsolar(EPOCH + min * 60000), seq = orderKey ? orderKey.split(',').map(Number) : [0];
    let active = seq[0], drawnKey = '', trail: number[] = [], lastSnap = NaN;
    const draw = (force = false) => {
      const ratio = Math.min(devicePixelRatio || 1, 2), w = Math.round(el.clientWidth * ratio), h = Math.round(el.clientHeight * ratio);
      if (!w || !h) return;
      const hv = hoverRef.current, d: TextGlobeDraw = { x: w / 2, y: h / 2, r: Math.min(w, h) * 0.46, ratio, facing: facingRef.current, cities, active: hv >= 0 ? hv : cfg.mode === 'spin' && !reduced ? -1 : active, bracket: true, frames: art.frames, land: art.land, look, sun, hover: hv, trail };
      const lay = layoutOf(d), snap = lay ? lay.facing : Math.round(d.facing);
      const key = w + 'x' + h + ':' + snap + ':' + d.active + ':' + hv;
      if (!force && key === drawnKey) return;
      if (snap !== lastSnap && !Number.isNaN(lastSnap)) trail = [lastSnap, ...trail].slice(0, cfg.wake);
      lastSnap = snap; d.trail = trail; drawnKey = key;
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
      ctx.clearRect(0, 0, w, h);
      drawTextGlobe(ctx, d); last.current = d;
    };
    /* the city nearest the middle of the face */
    const nearest = () => { let b = active, bd = 999; cities.forEach((c, i) => { const dd = Math.abs(wrap(c.lon - facingRef.current)) + Math.abs(c.lat) * 0.3; if (dd < bd) { bd = dd; b = i; } }); return b; };

    let raf = 0, t0 = 0, prev = 0, visible = true, k = 0, from = facingRef.current, leg = 0;
    const still = reduced || cfg.mode === 'face';
    if (still) { facingRef.current = cities[seq[0]].lon; active = seq[0]; setShown(active); draw(true); }
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) { prev = now; return; }
      const dt = prev ? Math.min(0.1, (now - prev) / 1000) : 0; prev = now;
      if (hoverRef.current >= 0) { draw(); t0 += dt * 1000; return; }
      if (cfg.mode === 'spin') {
        facingRef.current = wrap(facingRef.current + cfg.speed * dt);
        active = nearest();
      } else {
        /* tour: turn (ease in-out over `turn` ms), then hold `dwell` s */
        t0 ||= now;
        const target = cities[seq[k % seq.length]].lon, el2 = now - t0;
        if (leg === 0) {
          const p = cfg.turn > 0 ? Math.min(1, el2 / cfg.turn) : 1;
          facingRef.current = wrap(from + wrap(target - from) * ease(p));
          if (p >= 1) { leg = 1; t0 = now; active = seq[k % seq.length]; setShown(active); }
        } else if (el2 >= cfg.dwell * 1000 && seq.length > 1) { leg = 0; t0 = now; from = facingRef.current; k++; }
      }
      draw();
    };
    if (!still) {
      if (cfg.mode === 'tour') { facingRef.current = cities[seq[0]].lon; active = seq[0]; leg = 1; setShown(active); }
      draw(true); raf = requestAnimationFrame(frame);
    }
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(el);
    const ro = new ResizeObserver(() => draw(true)); ro.observe(el);
    const repaint = () => draw(true);
    el.addEventListener('repaint', repaint);
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); el.removeEventListener('repaint', repaint); };
  }, [art, wheel, cities, orderKey, min, cfg.mode, cfg.speed, cfg.dwell, cfg.turn, cfg.wake, reduced]);

  const pick = (e: { clientX: number; clientY: number }) => {
    const d = last.current, el = cv.current; if (!d || !el) return -1;
    const r = el.getBoundingClientRect(), ratio = d.ratio;
    return markAt(d, (e.clientX - r.left) * ratio, (e.clientY - r.top) * ratio, 22 * ratio);
  };
  const setH = (i: number) => { if (i >= 0) setCapI(i); if (hoverRef.current === i) return; hoverRef.current = i; setHover(i); cv.current?.dispatchEvent(new Event('repaint')); };
  /* spin: the caption is the last city pointed at, kept while the pointer is over the globe or its caption (so it can
     be reached), gone when the pointer leaves; tour and face: the city held */
  const spin = cfg.mode === 'spin' && !reduced, ci = spin ? capI : hover >= 0 ? hover : shown, cap = cities[ci >= 0 ? ci : shown];
  return (
    <div className="oa-spin" onPointerLeave={() => setCapI(-1)}>
      <canvas ref={cv} className="oa-globe" role="img" aria-label={label} data-press={hover >= 0 ? '' : undefined}
        onPointerMove={(e) => { if (e.pointerType === 'mouse') setH(pick(e)); }} onPointerLeave={() => setH(-1)}
        onClick={(e) => { const i = pick(e); if (i >= 0) window.location.href = at(cities[i].href); }} />
      {cap ? (
        <a className="oa-spin-cap" href={at(cap.href)} data-off={spin && ci < 0 ? '' : undefined} aria-hidden={spin && ci < 0 ? true : undefined} tabIndex={spin && ci < 0 ? -1 : undefined}>
          <span className="oa-spin-m" aria-hidden="true">{cap.mark}</span>
          <span className="oa-code">{cap.code}</span> <b>{cap.name}</b> <span className="oa-spin-s">{cap.said}</span>
          <span className="oa-spin-go" aria-hidden="true">→</span>
        </a>
      ) : null}
    </div>
  );
}
