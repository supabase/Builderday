'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MONO } from '@/components/wheel/config';
import { LOOK_DEF, STUDY, drawTextGlobe, loadFrames, loadLand, type Frames, type LandMap, type TextGlobeDraw } from '@/components/wheel/text-globe';
import { PLACE } from '@/lib/places';
import type { StageCfg, StageDir } from '@/lib/stage/config';
import type { SceneKind } from '@/lib/stage/types';

/* The cover's globe, behind every scene: the study's text globe from the merch, turning one whole frame at a time, its
   own city marked in green. It is drawn once per step into a canvas the size of the globe (the sphere and its dotted
   lines, about 1760 by 1760 of the wall's 1920 by 1080), and placed by a transform, so a move to the next scene's
   place is the compositor's: smooth, and never a redraw. While it moves it holds its frame (a picture that steps is
   never slid at the same time); it turns on once it has landed. Off screen, in a hidden tab, or under reduced motion it
   holds still. */

/* where the globe sits on each scene: its middle (wall px) and its size against the cover's */
type Pose = { x: number; y: number; s: number };
const MID: Pose = { x: 960, y: 540, s: 1 };
/* Orbit: the globe goes where the scene leaves room. Big and central where a scene is one line; to the side of a
   column of words; low, as a horizon, under a line that runs across; small in a corner on the live boards. */
const ORBIT: Partial<Record<SceneKind, Pose>> = {
  doors: { x: 1500, y: 470, s: 0.72 },
  welcome: MID,
  speaker: { x: 1480, y: 540, s: 0.8 },
  words: { x: 1560, y: 560, s: 0.78 },
  product: { x: 1560, y: 560, s: 0.78 },
  link: MID,
  question: { x: 960, y: 1160, s: 1.12 },
  needs: { x: 1920, y: 560, s: 0.86 },
  tour: { x: 960, y: 1160, s: 1.12 },
  say: { x: 960, y: 540, s: 1.22 },
  line: { x: 960, y: 1240, s: 1.3 },
  deadline: { x: 1560, y: 540, s: 0.86 },
  rules: { x: 1780, y: 900, s: 0.66 },
  prizes: { x: 960, y: 540, s: 0.92 },
  submit: { x: 1640, y: 560, s: 0.7 },
  questions: { x: 960, y: 1160, s: 1.12 },
  building: { x: 1840, y: 1040, s: 0.5 },
  voting: { x: 1840, y: 60, s: 0.42 },
  showcase: { x: 1840, y: 1040, s: 0.5 },
  top3: { x: 960, y: 1300, s: 1.3 },
  tombola: MID,
  final: { x: 1840, y: 60, s: 0.42 },
};
/* Print: the globe stays one size in the corner, and the scene's words are the picture */
const PRINT: Pose = { x: 1560, y: 860, s: 0.5 };
export function poseOf(dir: StageDir, kind: SceneKind | undefined): Pose {
  if (dir === 'orbit') return (kind && ORBIT[kind]) || MID;
  if (dir === 'print') return kind === 'welcome' ? MID : PRINT;
  return MID;
}

/* the canvas covers the globe at its cover size: the sphere is 2 x 24 cells of 32.6 wall px across */
const BOX = 1760, R = 782;
const cssVar = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const monoFont = () => MONO.geist.replace(/var\((--[\w-]+)\)/g, (_m, v: string) => cssVar(v) || 'monospace');

export function StageGlobe({ cfg, kind, city, reduced }: { cfg: StageCfg; kind: SceneKind | undefined; city: string; reduced: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [art, setArt] = useState<{ frames: Frames | null; land: LandMap | null } | null>(null);
  useEffect(() => { let live = true; Promise.all([loadFrames(), loadLand()]).then(([frames, land]) => { if (live) setArt({ frames, land }); }); return () => { live = false; }; }, []);
  const pose = poseOf(cfg.dir, kind), s = pose.s * cfg.globeSize;
  /* the move: the frame holds from the change of place until the move has had its time (the place is kept in state
     and compared during render, so the hold starts in the same paint as the move) */
  const k = pose.x + ',' + pose.y + ',' + s;
  const [place, setPlace] = useState(k), [movedAt, setMovedAt] = useState(0), [settled, setSettled] = useState(0);
  if (place !== k) { setPlace(k); if (!reduced && cfg.globeMove > 0) setMovedAt((n) => n + 1); }
  const moving = movedAt !== settled;
  useEffect(() => {
    if (movedAt === settled) return;
    const t = window.setTimeout(() => setSettled(movedAt), cfg.globeMove + 60); return () => window.clearTimeout(t);
  }, [movedAt, settled, cfg.globeMove]);

  const [lat, lon] = PLACE[city] ?? [0, 0];
  /* the turn starts with the city facing the room and goes on from there in whole frames, across moves */
  const facingRef = useRef<{ city: string; f: number } | null>(null);
  useEffect(() => {
    const el = cv.current; if (!el || !art) return;
    const ctx = el.getContext('2d'); if (!ctx) return;
    const look = { ...LOOK_DEF, ink: cfg.globeInk, dim: 0.62, grid: 0.6, markInk: 0.7, green: '#3ecf8e', ground: '#151515', font: monoFont(), marks: 'one' as const, study: true, wake: 0, night: 0 };
    if (!facingRef.current || facingRef.current.city !== city) facingRef.current = { city, f: lon };
    const turn = facingRef.current;
    let drawn = '', raf = 0, last = 0, visible = true;
    const draw = () => {
      /* the backing store: the canvas's own size on screen times the screen's ratio, at most 1.5 (a wall is far away) */
      const ratio = Math.min(devicePixelRatio || 1, 1.5), w = Math.round(el.clientWidth * ratio), h = Math.round(el.clientHeight * ratio);
      if (!w || !h) return;
      const key = w + ':' + Math.round(turn.f * 10);
      if (key === drawn) return; drawn = key;
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
      ctx.clearRect(0, 0, w, h);
      const d: TextGlobeDraw = { x: w / 2, y: h / 2, r: (R / BOX) * w, ratio, facing: turn.f, cities: [{ lat, lon }], active: 0, bracket: true, frames: art.frames, land: art.land, look, size: 'large', sun: null };
      drawTextGlobe(ctx, d);
    };
    draw();
    const still = reduced || moving || cfg.globeStep <= 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      if (!last) last = now;
      /* west to east, one study frame per step */
      if (now - last >= cfg.globeStep) { last = now; turn.f = ((turn.f - STUDY.step + 540) % 360) - 180; draw(); }
    };
    if (!still) raf = requestAnimationFrame(frame);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(el);
    /* a new size draws again (the key carries the backing size); the observer's first call is the same size */
    const ro = new ResizeObserver(() => draw()); ro.observe(el);
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); };
  }, [art, cfg.globeInk, cfg.globeStep, city, lat, lon, reduced, moving]);

  const style = { '--g-x': pose.x, '--g-y': pose.y, '--g-s': s } as CSSProperties;
  return <canvas ref={cv} className="sw-globe" style={style} aria-hidden="true" data-moving={moving ? '' : undefined} />;
}
