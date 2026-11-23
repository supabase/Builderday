/* The morning line: How it works as one globe that turns at one speed under a fixed line where it is 09:00, and one
   project, "yours", followed in a panel beside it. Build: your city reaches the line, you build for 90 minutes and
   submit. Vote: your project climbs your city's ranking and makes the top three. Final: three from each city fly to
   the line-up of thirty, and one is picked. Then the panel empties and your city comes round to the line again.

   The globe keeps the order and the places of the day, not its minutes: a city lights when it crosses the line, which
   is within an hour of its real 09:00 and in the same order (east to west), but the turn is the same speed all day.

   Rules this file keeps:
   - the globe's angle is start + rate x time; a press adds a difference that decays to zero along a smootherstep, so
     the speed never steps (lineAngle);
   - every mark has an age and comes in over at least cfg.fadeIn and out over at least cfg.fadeOut (env);
   - no randomness: the drawing is a pure function of (time in the loop, press, config, facts);
   - the far side is dimmer along a smooth ramp across the horizon; no line is cut, gapped or hidden (depth);
   - words have fixed places (the panel and the caption); a word changes by a 150 ms cross-fade; a number changes at
     most once a beat (700 ms or more);
   - green is you: your city, your row, your cell, and at the end the pick, which is the same project. Blue is only the
     newest arrival and fades to white. Everything else is white.
   Drawn in the 320 x 180 space; every number with a taste in it is a knob in /lab/explain. */

import { LAND_DOTS } from './land-dots';
import motionSaved from '@/saved/motion.config.json';
import { clampMotion, type MotionCfg } from '@/lib/motion';
import { BLUE, DIM, FLASH, GREEN, INK, LABEL, VH, VW, cl, cut, lerp, type CityFact, type Facts, type Poly, type Pt, type X } from './draw';
import type { ScopeCfg } from './scope';
import type { WordOpt } from './pen';

/* ---------- time ---------- */
export type LineMo = Pick<MotionCfg, 'tourTurn' | 'tourHold' | 'pickHold' | 'durFlight' | 'durCross'>;
const SAVED_MO = clampMotion(motionSaved as Partial<MotionCfg>);
export const lineMo = (m?: Partial<LineMo>): LineMo => ({
  tourTurn: m?.tourTurn ?? SAVED_MO.tourTurn, tourHold: m?.tourHold ?? SAVED_MO.tourHold, pickHold: m?.pickHold ?? SAVED_MO.pickHold,
  durFlight: m?.durFlight ?? SAVED_MO.durFlight, durCross: m?.durCross ?? SAVED_MO.durCross,
});

/* A press on a step, in flight (seconds): the moment it left (old), the act's opening it goes to (target), the turn
   still owed to the globe when it started (dLon, degrees), how long the turn takes (T, 0 for a cut) and how long ago
   the press was (age). The clock (line-clock.ts) makes it; the scene only reads it. */
export type Press = { old: number; target: number; dLon: number; T: number; age: number; /** from a click on the bar: the playhead stays where it was put */ bar?: boolean };
export const FADE_OLD = 0.15, FADE_NEW = 0.35;
/* when the arc from your city reaches the panel: the frame and its header come in then */
const ARRIVE = 1.6;
export const pressEnd = (p: Press) => Math.max(p.T, FADE_NEW);

/* the curves: out for anything arriving, in-out for anything travelling across the tube (the motion lab's own) */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const N = 1024, xs = new Float64Array(N + 1), ys = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { const t = i / N, u = 1 - t; xs[i] = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t; ys[i] = 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t; }
  return (v: number) => {
    if (v <= 0) return 0; if (v >= 1) return 1;
    let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < v) lo = m; else hi = m; }
    return ys[lo] + ((ys[hi] - ys[lo]) * (v - xs[lo])) / (xs[hi] - xs[lo] || 1);
  };
}
export const OUT = bezier(0.23, 1, 0.32, 1), INOUT = bezier(0.77, 0, 0.175, 1);
export const smoother = (t: number) => { const u = cl(t); return u * u * u * (u * (u * 6 - 15) + 10); };
const mod = (a: number, n: number) => ((a % n) + n) % n;
export const wrap180 = (d: number) => mod(d + 180, 360) - 180;

/* ---------- who "you" are ---------- */
export type Hero = { ci: number; place: number; cell: number; name: string; real: boolean };
/* a city's seven in their final order (the model's: most votes first, the earlier arrival on a tie) */
const finalOrder = (c: CityFact) => c.seven.map((r, i) => i).sort((p, q) => c.seven[q].v - c.seven[p].v || c.seven[p].af - c.seven[q].af);
export function heroOf(f: Facts): Hero {
  const cs = f.cities ?? [], top = f.top, n = cs.length * top, ok = (i: number) => i >= 0 && i < n && !f.empty?.includes(i);
  let cell = -1, real = false;
  if (f.pick !== undefined && ok(f.pick)) { cell = f.pick; real = true; }
  else if (f.city) { const ci = cs.findIndex((c) => c.id === f.city); if (ci >= 0) { cell = ci * top + top - 1; while (cell > ci * top && !ok(cell)) cell--; if (!ok(cell)) cell = -1; } }
  if (cell < 0) cell = f.seedPick !== undefined && ok(f.seedPick) ? f.seedPick : 0;
  while (!ok(cell) && cell < n - 1) cell++;
  const ci = Math.floor(cell / top), place = cell % top, c = cs[ci];
  return { ci, place, cell, real, name: real && c ? c.seven[finalOrder(c)[place]]?.name ?? 'Your project' : 'Your project' };
}
/* a city's votes for one of its seven at minute m: the model's curve (votesAtMin in lib/day-data.ts), as a smooth number */
function votesAt(c: CityFact, i: number, m: number) {
  const r = c.seven[i], a = c.start + r.af * (c.buildEnd - c.start);
  if (m >= c.end) return r.v; if (m <= a) return 0;
  return r.v * Math.pow((m - a) / (c.end - a), r.e);
}

/* ---------- the score ---------- */
export type Typed = { s: string; t0: number; t1: number; green: boolean };
export type Score = {
  loop: number; turn: number; rate: number; turns: number; theta0: number;
  B: number; V: number; Fs: number; acts: [number, number, number]; small: boolean;
  /** where a press on a step lands: just after the act has taken over from the one before (its card and caption in) */
  pressAt: [number, number, number];
  cross: number[]; hero: Hero;
  build: { lines: Typed[]; submit: string; mergeY: number };
  vote: { rows: number[]; beats: number[]; m: number[]; rank: number[][]; counts: number[][]; hit: number[]; cut: number };
  final: { fly: number[]; lastLand: number; city: number; p1: number; p2: number; p3: number; holdAt: number; seamAt: number };
  stills: [number, number, number]; beats: number[];
};
const CACHE = new Map<string, Score>();
const cityKey = (f: Facts) => (f.cities ?? []).map((c) => c.id + c.lon + ':' + c.seven.map((r) => r.v + '/' + r.af).join(',')).join(';');

/* the panel's rows in Vote sit at these heights; Build's submit line ends on the one its row starts Vote in */
/* the cut has a gap of its own under the last place that goes on, so its label never sits on a count */
const rowY = (r: number, L: Lay, n: number, top: number) => {
  const sp = Math.min(L.rs, (L.py1 - L.py0 - L.rb - L.cg - 6) / Math.max(1, n - 1));
  return L.rb + r * sp + (r >= top ? L.cg : 0);
};

export function lineScore(cfg: ScopeCfg, f: Facts, mo: LineMo, small = false): Score {
  const key = [cfg.smallLayout, cfg.lineAt, cfg.typeRate, cfg.cardLines, cfg.rankRows, cfg.beats, cfg.beatGap, cfg.flyStagger, cfg.seam, cfg.turnMode, small, f.pick, f.city, f.pickers, f.cityPrize, f.seedPick, (f.empty ?? []).join(','), f.top, f.startHour, f.buildMin, mo.tourTurn, mo.tourHold, mo.pickHold, mo.durFlight, mo.durCross, cityKey(f)].join('|');
  const hit = CACHE.get(key); if (hit) return hit;
  const turn = mo.tourTurn / 1000, rate = 360 / turn, hold = mo.tourHold / 1000, cs = f.cities ?? [], hero = heroOf(f), hc = cs[hero.ci];
  /* the hero's city crosses the line one second in: theta (the longitude at the centre) = lon - lineAt there */
  const theta0 = (hc ? hc.lon : 0) - cfg.lineAt + rate * 1.0;
  const cross = cs.map((c) => mod((cfg.lineAt - c.lon + theta0) / rate, turn));
  const firstAfter = (ci: number, t0: number) => cross[ci] + Math.ceil((t0 - cross[ci]) / turn - 1e-9) * turn;

  /* Build: the card types the visitor's own steps, the last the submit, done at the hero's own arrival (the model's) */
  const all = ['$ supabase start', '$ supabase db push', '$ git push'], pickL = cfg.cardLines >= 4 ? all : cfg.cardLines === 3 ? [all[0], all[2]] : [all[0]];
  const af = hc ? hc.seven[finalOrder(hc)[hero.place]]?.af ?? 0.9 : 0.9, sub = Math.round(af * f.buildMin) + ' MIN';
  const submit = '✓ submitted', rateC = cfg.typeRate, lines: Typed[] = [];
  let t = 1.9;
  for (const s of pickL) { lines.push({ s, t0: t, t1: t + s.length / rateC, green: false }); t += s.length / rateC + 0.25; }
  const subEnd = Math.min(6.0, Math.max(t + submit.length / rateC, 1.9 + 4.1 * cl(af, 0.6, 0.97)));
  lines.push({ s: submit, t0: subEnd - submit.length / rateC, t1: subEnd, green: true });
  /* Vote: the top rows by the model's final count; the samples start where yours stands lowest with every row in */
  const order = hc ? finalOrder(hc) : [], N = Math.min(cfg.rankRows, order.length), rows = order.slice(0, N), heroRow = order[hero.place];
  if (hc && !rows.includes(heroRow)) rows[N - 1] = heroRow;
  const rankAt = (m: number) => rows.slice().sort((p, q) => votesAt(hc!, q, m) - votesAt(hc!, p, m) || hc!.seven[p].af - hc!.seven[q].af);
  let m0 = hc ? hc.buildEnd : 0, worst = -1;
  if (hc) for (let m = Math.ceil(hc.start + 1); m < hc.end - 10; m++) {
    if (rows.some((i) => votesAt(hc, i, m) < 1)) continue;
    const r = rankAt(m).indexOf(heroRow); if (r > worst) { worst = r; m0 = m; }
  }
  const nb = cfg.beats, gap = Math.max(0.7, cfg.beatGap / 1000), ms: number[] = [m0];
  for (let k = 0; k < nb; k++) ms.push(lerp(m0, hc ? hc.end : m0, (k + 1) / nb));
  const rank = ms.map((m) => (hc ? rankAt(m) : [])), counts = ms.map((m) => rows.map((i) => (hc ? Math.round(votesAt(hc, i, m)) : 0)));
  /* the hit in each beat lands on the row that gained most (yours on a tie) */
  const hitRow = ms.slice(1).map((_, k) => { let best = -1, g = -1; rows.forEach((i, j) => { const d = counts[k + 1][j] - counts[k][j] + (i === heroRow ? 0.5 : 0); if (d > g) { g = d; best = i; } }); return best; });
  const st = cfg.flyStagger / 1000, fl = mo.durFlight / 1000, n = cs.length * f.top, seam = cfg.seam / 1000;

  /* the acts' times for a given rest after Build and Vote. Final: each city's three fly at its first crossing after
     the line-up has formed, so the flights take one turn; then the pick, its rest and the seam */
  const timing = (h: number) => {
    const B = Math.max(6.5 + h, turn + 0.6), beats = ms.slice(1).map((_, k) => B + 1.5 + k * gap), cutT = beats[nb - 1] + 0.5;
    const V = Math.max(cutT - B + 0.4 + h, turn + 0.6), Fs = B + V;
    const fly = cs.map((_, ci) => firstAfter(ci, Fs + 0.6)), lastLand = Math.max(Fs + 0.6, ...fly.map((t0) => t0 + (f.top - 1) * st + fl));
    /* the city prize: its own beat once the thirty are in, before the pick (marks from 0.4 s, the words at 0.95 s) */
    const city = lastLand + 0.4, p1 = city + 1.3, p2 = p1 + Math.max(0, n - 2) * 0.02 + 0.2, p3 = p2 + 0.4, holdAt = p3 + 0.8;
    return { B, V, Fs, beats, cutT, fly, lastLand, city, p1, p2, p3, holdAt, need: holdAt + mo.pickHold / 1000 + seam };
  };
  /* The loop is a whole number of turns. The rest after Build and Vote is the knob's, unless taking it down by up to
     a third saves a whole turn (else the rest on the pick would swallow most of a turn); what is left over goes to the
     rest on the pick. */
  let T = timing(hold), turns = Math.max(1, Math.ceil(T.need / turn - 1e-9));
  for (let k = 1; k <= 20 && turns > 1; k++) {
    const c = timing(hold * (1 - k / 60)), ct = Math.ceil(c.need / turn - 1e-9);
    if (ct < turns) { T = c; turns = ct; break; }
  }
  const { B, V, Fs, beats, cutT, fly, lastLand, city, p1, p2, p3, holdAt } = T, loop = turns * turn, seamAt = loop - seam;

  const S: Score = {
    loop, turn, rate, turns, theta0, B, V, Fs, acts: [0, B, Fs], small, pressAt: [ARRIVE + 0.1, B + 0.6, Fs + 0.65], cross, hero,
    build: { lines, submit: sub, mergeY: rowY(hc ? Math.max(0, rank[0].indexOf(heroRow)) : 0, layOf(cfg, small), rows.length, f.top) },
    vote: { rows, beats, m: ms, rank: rank.map((r) => r.map((i) => rows.indexOf(i))), counts, hit: hitRow.map((i) => rows.indexOf(i)), cut: cutT },
    final: { fly, lastLand, city, p1, p2, p3, holdAt, seamAt },
    stills: [Math.max(7, B - 1.5), Math.max(cutT + 0.6, Fs - 1.2), holdAt + (seamAt - holdAt) * 0.5],
    beats: [1.0, 1.1, 1.6, 1.7, ...lines.map((l) => l.t0), 6.2, B, ...beats, cutT, Fs, ...fly, lastLand, city, city + 0.55, p1, p2, p3, holdAt, seamAt].sort((a, b) => a - b),
  };
  if (CACHE.size > 40) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, S);
  return S;
}

/* the act a moment of the loop is in */
export const lineAct = (S: Score, sec: number) => (sec >= S.Fs ? 2 : sec >= S.B ? 1 : 0);

/* ---------- the turn ---------- */
/* theta: the longitude at the globe's centre. Steady: start + rate x time. Stepped: the same crossings at the same
   times, but the globe rests while a city acts and turns to the next in 600 ms (in-out), as the city wheel does. */
export function lineBase(S: Score, cfg: ScopeCfg, sec: number): number {
  const steady = (t: number) => S.theta0 - S.rate * t;
  if (cfg.turnMode !== 'stepped' || !S.cross.length) return mod(steady(sec), 360);
  const ts = S.cross.slice().sort((a, b) => a - b), k = Math.floor(sec / S.turn), u = sec - k * S.turn;
  let i = ts.findIndex((v) => v > u); if (i < 0) i = ts.length;
  const t0 = (i ? ts[i - 1] : ts[ts.length - 1] - S.turn) + k * S.turn, t1 = (i < ts.length ? ts[i] : ts[0] + S.turn) + k * S.turn, d = Math.min(0.6, t1 - t0);
  return mod(steady(t0) - S.rate * (t1 - t0) * INOUT(cl((sec - (t1 - d)) / d)), 360);
}
/* the angle on screen: the timeline's, plus what a press still owes, decaying to zero with its speed matched at both
   ends (a smootherstep has no slope at 0 and 1), so a press never jolts the turn */
export function lineAngle(cfg: ScopeCfg, f: Facts, mo: LineMo, sec: number, press?: Press, small = false): number {
  const S = lineScore(cfg, f, mo, small);
  const off = press && press.T > 0 ? press.dLon * (1 - smoother(press.age / press.T)) : 0;
  return mod(lineBase(S, cfg, sec) + off, 360);
}

/* ---------- the globe, built once on the unit sphere ---------- */
type V3 = [number, number, number];
const D2R = Math.PI / 180;
const unit = (lat: number, lon: number): V3 => { const p = lat * D2R, l = lon * D2R; return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)]; };
const GRID: Float64Array[] = (() => {
  const out: Float64Array[] = [], add = (pts: V3[]) => { const a = new Float64Array(pts.length * 3); pts.forEach((v, i) => a.set(v, i * 3)); out.push(a); };
  for (let lon = 0; lon < 360; lon += 30) { const p: V3[] = []; for (let lat = -90; lat <= 90; lat += 3) p.push(unit(lat, lon)); add(p); }
  for (const lat of [-60, -30, 0, 30, 60]) { const p: V3[] = []; for (let lon = 0; lon <= 360; lon += 3) p.push(unit(lat, lon)); add(p); }
  return out;
})();

/* The layout. Side: globe left, panel right, caption under both, in the 320 x 180 space; a small tube sets its words
   a little larger. Stacked (a small tube with smallLayout 'stacked': a phone, the 400px sheet): the globe on top, the
   panel the full width under it and the caption under that, in a taller space (320 x VH_STACK), so every word is 12
   units (12px or more on a tube 320px wide) and a cell is 11.
   rb and rs: the first row's height in the panel and the most room between rows in Vote. */
export const VH_STACK = 376;
export const isStack = (cfg: Pick<ScopeCfg, 'dir' | 'smallLayout'>, small?: boolean) => !!small && cfg.dir === 'line' && cfg.smallLayout === 'stacked';
export const viewH = (cfg: Pick<ScopeCfg, 'dir' | 'smallLayout'>, small?: boolean) => (isStack(cfg, small) ? VH_STACK : VH);
type Lay = { cg: number; stack: boolean; gx: number; gy: number; r: number; px0: number; px1: number; py0: number; py1: number; cy: number; fs: number; cw: number; lh: number; ly0: number; rb: number; rs: number; vh: number };
function layOf(cfg: ScopeCfg, small?: boolean): Lay {
  const r = cfg.gR;
  if (isStack(cfg, small)) return { cg: 13, stack: true, gx: 160, gy: 90, r, px0: 16, px1: 304, py0: 166, py1: 346, cy: 364, fs: 12, cw: 11, lh: 13.8, ly0: 32, rb: 44, rs: 19, vh: VH_STACK };
  const s = !!small;
  return { cg: 9, stack: false, gx: 86, gy: 84, r, px0: 168, px1: 314, py0: 12, py1: 162, cy: 175, fs: s ? 11 : 10, cw: s ? 9 : 8, lh: s ? 11.6 : 11.4, ly0: 28, rb: s ? 41 : 39, rs: s ? 18 : 17, vh: VH };
}
type View = { th: number; ct: number; st: number; L: Lay; far: number; w: number };
const rot = (v: ArrayLike<number>, o: View, i = 0): V3 => {
  const c = Math.cos(o.th), s = Math.sin(o.th), x1 = v[i] * c - v[i + 2] * s, z1 = v[i] * s + v[i + 2] * c;
  return [x1, v[i + 1] * o.ct - z1 * o.st, v[i + 1] * o.st + z1 * o.ct];
};
const scr = (v: V3, o: View): Pt => [o.L.gx + o.L.r * v[0], o.L.gy - o.L.r * v[1]];
/* depth is brightness: a smooth ramp across the horizon, the same on both sides of the edge, never a cut */
const depth = (z: number, o: View) => { const t = cl((z + o.w) / (2 * o.w)); return o.far + (1 - o.far) * t * t * (3 - 2 * t); };
/* the point on the globe's edge nearest a point behind it */
const limbOf = (p: Pt, o: View): Pt => { const dx = p[0] - o.L.gx, dy = p[1] - o.L.gy, n = Math.hypot(dx, dy); return n < 1e-3 ? [o.L.gx, o.L.gy - o.L.r] : [o.L.gx + (o.L.r * dx) / n, o.L.gy + (o.L.r * dy) / n]; };

/* ---------- marks ---------- */
/* every mark through one envelope: 0 before t0, in over din on the out curve, then out over dout from t1 */
function env(x: X, t: number, t0: number, din: number, t1 = Infinity, dout = 0.1, outCurve: (v: number) => number = smoother) {
  if (t < t0) return 0;
  const fi = Math.max(din, x.cfg.fadeIn / 1000), a = OUT(cl((t - t0) / fi));
  if (t < t1) return a;
  return a * (1 - outCurve(cl((t - t1) / Math.max(dout, x.cfg.fadeOut / 1000))));
}
function word(x: X, s: string, px: number, py: number, size: number, col: string, a: number, align: 'left' | 'right' | 'center' = 'left', o?: WordOpt) {
  if (a <= 0.004 || x.pen.ghost) return;
  x.pen.text(s, px, py, size, col, Math.min(1, a), align, 'mono', { keep: true, ...o });
}
const charW = (size: number) => size * 0.62;
const bez2 = (a: Pt, c: Pt, b: Pt, t: number): Pt => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
function bezPart(a: Pt, c: Pt, b: Pt, s0: number, s1: number, n = 18): Poly { const p: Poly = []; for (let i = 0; i <= n; i++) p.push(bez2(a, c, b, lerp(s0, s1, i / n))); return p; }
function circle(p: Pt, r: number, n = 20): Poly { const q: Poly = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; q.push([p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r]); } return q; }
const box = (x0: number, y0: number, x1: number, y1: number): Poly => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
/* a route: points with the length run up to each, so a part of it can be taken by length (a head and a tail) */
type Route = { p: Pt[]; c: number[] };
function routeOf(p: Pt[]): Route { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return { p, c }; }
function routeAt(R: Route, s: number): Pt {
  const L = R.c[R.c.length - 1], d = cl(s) * L; let i = 1; while (i < R.c.length - 1 && R.c[i] < d) i++;
  const u = (d - R.c[i - 1]) / (R.c[i] - R.c[i - 1] || 1); return [lerp(R.p[i - 1][0], R.p[i][0], u), lerp(R.p[i - 1][1], R.p[i][1], u)];
}
function routePart(R: Route, s0: number, s1: number): Poly {
  const L = R.c[R.c.length - 1], d0 = cl(s0) * L, d1 = cl(s1) * L, out: Poly = [routeAt(R, s0)];
  for (let i = 1; i < R.p.length - 1; i++) if (R.c[i] > d0 && R.c[i] < d1) out.push(R.p[i]);
  out.push(routeAt(R, s1)); return out;
}
/* From a point on the globe to a cell of the line-up, never across a city code: it arcs to the panel's left margin at
   the cell's own row and comes in from the left, the cells' side (side layout); stacked, it arcs to the margin's top
   and runs down the margin to the row, then turns in. */
function cellRoute(L: Lay, a: Pt, to: Pt, arcH: number, gut?: number): Route {
  const mx = gut ?? L.px0 - 8, pts: Pt[] = [];
  /* a cell in the right-hand bank: over the panel's top to the gutter between the banks, down the gutter to the row,
     then in, so it never crosses a left-hand row */
  if (gut !== undefined && !L.stack) {
    const m: Pt = [mx, L.py0 - 3], c: Pt = [(a[0] + mx) / 2, Math.min(a[1], m[1]) - arcH * 0.5], r = 5, y = Math.max(m[1] + r, to[1] - r);
    for (let i = 0; i <= 18; i++) pts.push(bez2(a, c, m, i / 18));
    pts.push([mx, y]);
    for (let i = 1; i <= 4; i++) pts.push(bez2([mx, y], [mx, to[1]], [mx + r, to[1]], i / 4));
  } else if (!L.stack) {
    const m: Pt = [mx, to[1]], c: Pt = [(a[0] + mx) / 2, Math.min(a[1], to[1]) - arcH];
    for (let i = 0; i <= 18; i++) pts.push(bez2(a, c, m, i / 18));
  } else {
    const m: Pt = [mx, L.py0 - 2], c: Pt = [(a[0] + mx) / 2, Math.min(a[1], m[1]) - arcH * 0.5], r = 5, y = Math.max(m[1] + r, to[1] - r);
    for (let i = 0; i <= 18; i++) pts.push(bez2(a, c, m, i / 18));
    pts.push([mx, y]);
    for (let i = 1; i <= 4; i++) pts.push(bez2([mx, y], [mx, to[1]], [mx + r, to[1]], i / 4));
  }
  pts.push(to);
  return routeOf(pts);
}
/* a ring on the globe around a city, rDeg across, with depth on each point */
function sphereRing(x: X, o: View, c: CityFact, rDeg: number, col: string, a: number) {
  if (a <= 0.004 || rDeg <= 0.01) return;
  const ctr = unit(c.lat, c.lon), e: V3 = Math.abs(ctr[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const u1: V3 = [e[1] * ctr[2] - e[2] * ctr[1], e[2] * ctr[0] - e[0] * ctr[2], e[0] * ctr[1] - e[1] * ctr[0]], n1 = Math.hypot(...u1);
  u1[0] /= n1; u1[1] /= n1; u1[2] /= n1;
  const u2: V3 = [ctr[1] * u1[2] - ctr[2] * u1[1], ctr[2] * u1[0] - ctr[0] * u1[2], ctr[0] * u1[1] - ctr[1] * u1[0]];
  const r = rDeg * D2R, pts: Poly = [], al: number[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * Math.PI * 2, v: V3 = [0, 0, 0];
    for (let j = 0; j < 3; j++) v[j] = ctr[j] * Math.cos(r) + (u1[j] * Math.cos(t) + u2[j] * Math.sin(t)) * Math.sin(r);
    const w = rot(v, o); pts.push(scr(w, o)); al.push(a * depth(w[2], o));
  }
  x.pen.shade(pts, al, col, 0.9, 1);
}

/* ---------- the dots' state at a moment: lit, green, and the flash of a crossing ---------- */
type Dot = { lit: number; green: number };
function dotAt(x: X, S: Score, ci: number, t: number): Dot {
  const hero = ci === S.hero.ci;
  /* in Build a city lights when it first crosses the line; from Vote on all are lit; the seam puts them out */
  let lit: number;
  if (t < S.B) lit = env(x, t, S.cross[ci], 0.25);
  else lit = 1 - smoother((t - S.final.seamAt) / (x.cfg.seam / 1000)) * (t >= S.final.seamAt ? 1 : 0);
  return { lit, green: hero ? lit : 0 };
}

/* ---------- the scene ---------- */
export function lineScene(x: X, ph: number) {
  const mo = lineMo(x.mo), S = lineScore(x.cfg, x.f, mo, !!x.small), L = layOf(x.cfg, x.small), P = x.press;
  const sec = ph * S.loop, th = lineAngle(x.cfg, x.f, mo, sec, P, !!x.small) * D2R, tilt = x.cfg.lTilt * D2R;
  const o: View = { th, ct: Math.cos(tilt), st: Math.sin(tilt), L, far: x.cfg.farLevel, w: Math.sin((x.cfg.rampW / 2) * D2R) };
  const cs = x.f.cities ?? [];
  const events = x.pen.ghost;
  /* the afterglow passes: only the things that travel or flash, or nothing, or all of it (today's) */
  if (events && x.cfg.afterglow === 'off') return;
  const evOnly = !!events && x.cfg.afterglow === 'events';

  /* the press: the old act fades out where it is, the new act's opening fades in as the turn ends */
  let parts: [number, number][] = [[sec, 1]], blend = 1;
  if (P && P.age < pressEnd(P)) {
    const end = pressEnd(P), aOld = 1 - smoother(P.age / FADE_OLD), aNew = smoother((P.age - (end - FADE_NEW)) / FADE_NEW);
    parts = [[P.old, aOld], [P.age < P.T ? P.target : sec, aNew]];
    blend = smoother(P.age / end);
  }

  if (!evOnly) globeBody(x, o);
  /* the ten cities: a dot each, always */
  if (!evOnly) cs.forEach((c, ci) => {
    const w = rot(unit(c.lat, c.lon), o), p = scr(w, o), dk = depth(w[2], o);
    const d0 = dotAt(x, S, ci, parts[0][0]), d1 = parts.length > 1 ? dotAt(x, S, ci, parts[1][0]) : d0;
    const lit = lerp(d0.lit, d1.lit, parts.length > 1 ? blend : 0), green = lerp(d0.green, d1.green, parts.length > 1 ? blend : 0);
    /* the flash of the last crossing, on whichever moment is in front */
    const tNow = parts.length > 1 ? (blend < 0.5 ? parts[0][0] : parts[1][0]) : sec, age = mod(tNow - S.cross[ci], S.turn);
    const fl = P ? 0 : (1 - OUT(cl(age / 0.3))) * OUT(cl(age / 0.06 + 0.4));
    const flash = ci === S.hero.ci && tNow < S.B + 0.5 ? GREEN : BLUE;
    if (x.cfg.lMarks === 'plus') {
      /* the text globe's sign: a small + drawn by the beam; yours, lit, a green [+]; the flash of an arrival the old dot */
      if (1 - lit > 0.004) plus(x, p, 2, LABEL, 0.55 * dk * (1 - lit), 0.8);
      if (lit * (1 - green) > 0.004) plus(x, p, 2, INK, 0.9 * dk * lit * (1 - green), 0.9);
      if (green > 0.004) { plus(x, p, 2, GREEN, dk * green, 1); brackets(x, p, 2, GREEN, dk * green); }
      /* the arrival's flash stays the dot it was: a + has more light, and its fast fade would jolt the frame's total */
      if (fl > 0.01) x.pen.dot(p, 1.7, flash, dk * fl, 1.6);
      return;
    }
    x.pen.dot(p, 1.25, LABEL, 0.55 * dk * (1 - lit), 1.2);
    x.pen.dot(p, 1.35, INK, 0.9 * dk * lit * (1 - green), 1.3);
    if (green > 0) x.pen.dot(p, 1.6, GREEN, dk * green, 1.4);
    if (fl > 0.01) x.pen.dot(p, 1.7, flash, dk * fl, 1.6);
  });
  for (const [t, k] of parts) if (k > 0.004) content(x, S, o, L, t, k, evOnly);
}

/* a city's + and the brackets round yours, s from the centre to the end of an arm */
function plus(x: X, p: Pt, s: number, col: string, a: number, w: number) {
  x.pen.stroke([[[p[0] - s, p[1]], [p[0] + s, p[1]]], [[p[0], p[1] - s], [p[0], p[1] + s]]], col, a, w, 0.6, false);
}
function brackets(x: X, p: Pt, s: number, col: string, a: number) {
  const g = s + 2.2, h = s + 0.6, l = p[0] - g, r = p[0] + g;
  x.pen.stroke([[[l + 1.3, p[1] - h], [l, p[1] - h], [l, p[1] + h], [l + 1.3, p[1] + h]], [[r - 1.3, p[1] - h], [r, p[1] - h], [r, p[1] + h], [r - 1.3, p[1] + h]]], col, a, 0.9, 0.6, false);
}

/* The text globe's template (text-globe.ts): the limb, the equator, two parallels where the text globe draws them
   (rows 6 above and below the equator of 10.7, about 34 degrees) and the middle column, as dots a cell apart. The dots
   are set along the screen, not the land, so like the text globe's they stay put while the globe turns under them. */
const TEMPLATE_LAT = Math.asin(6 / 10.7) / D2R;
function templateDots(x: X, o: View) {
  const L = o.L, step = 4.5, a = 0.36, r = 0.5;
  /* under the limb's dots a faint ring, so the picture holds about the light the wire did and a word or the panel coming
     in is no larger a share of it (the smoothness test's light measure) */
  x.pen.stroke([circle([L.gx, L.gy], L.r, 96)], INK, 0.16, 0.8, 0.4, false);
  const n = Math.round((2 * Math.PI * L.r) / step);
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; x.pen.dot([L.gx + L.r * Math.cos(t), L.gy + L.r * Math.sin(t)], r, INK, a, 0.3); }
  for (const lat of [-TEMPLATE_LAT, 0, TEMPLATE_LAT]) {
    const half = L.r * Math.cos(lat * D2R), m = Math.floor(half / step);
    for (let k = -m; k <= m; k++) {
      const lon = o.th / D2R + Math.asin(Math.max(-1, Math.min(1, (k * step) / half))) / D2R, w = rot(unit(lat, lon), o);
      if (w[2] < 0) continue;
      x.pen.dot(scr(w, o), r, INK, a * depth(w[2], o), 0.3);
    }
  }
  /* the middle column: the meridian at the centre, a dot a row apart */
  const rows = Math.floor(L.r / (step * 1.4));
  for (let k = -rows; k <= rows; k++) {
    const lat = Math.asin((k * step * 1.4) / L.r) / D2R, w = rot(unit(lat, o.th / D2R), o);
    if (w[2] >= 0) x.pen.dot(scr(w, o), r, INK, a * depth(w[2], o), 0.3);
  }
}

/* the land: sparse points (land-dots.ts) turning with the globe, the far side dimmed by depth like every line */
const LAND: Float64Array = (() => { const n = LAND_DOTS.length / 2, a = new Float64Array(n * 3); for (let i = 0; i < n; i++) a.set(unit(LAND_DOTS[i * 2], LAND_DOTS[i * 2 + 1]), i * 3); return a; })();
function landDots(x: X, o: View) {
  const a = x.cfg.lLandA;
  for (let i = 0; i < LAND.length; i += 3) {
    /* every point every frame, the far side all but out by depth: a point never pops in or out at the edge */
    const w = rot(LAND, o, i);
    x.pen.dot(scr(w, o), 0.75, INK, a * depth(w[2], o) ** 2, 0.2);
  }
}

const AL = new Float64Array(200);
function globeBody(x: X, o: View) {
  const L = o.L, base = 0.2, al = AL, pts: Poly = [];
  if (x.cfg.lLand) landDots(x, o);
  if (x.cfg.lGrid === 'template') { templateDots(x, o); globeLine(x, o); return; }
  for (const g of GRID) {
    const n = g.length / 3; pts.length = 0;
    for (let i = 0; i < n; i++) { const w = rot(g, o, i * 3); pts.push(scr(w, o)); al[i] = base * depth(w[2], o); }
    x.pen.shade(pts, al.subarray(0, n), INK, 0.8, 0.5);
  }
  /* the limb: the edge, the same brightness all round */
  const limb = circle([L.gx, L.gy], L.r, 96); x.pen.stroke([limb], INK, 0.42, 0.9, 0.6, false);
  globeLine(x, o);
}
function globeLine(x: X, o: View) {
  /* the 09:00 line: one meridian that stays put, cfg.lineAt from the centre; no label */
  const lp: Poly = [], la: number[] = [], lam = x.cfg.lineAt * D2R;
  for (let lat = -90; lat <= 90; lat += 3) {
    const p = lat * D2R, v: V3 = [Math.cos(p) * Math.sin(lam), Math.sin(p), Math.cos(p) * Math.cos(lam)];
    const w: V3 = [v[0], v[1] * o.ct - v[2] * o.st, v[1] * o.st + v[2] * o.ct]; lp.push(scr(w, o)); la.push(0.9 * depth(w[2], o));
  }
  x.pen.shade(lp, la, INK, 1.25, 0.8);
}

/* how far out (in globe radii) a point above w can go and stay inside the tube's safe area (6% in from each edge) */
function reach(w: V3, L: Lay): number {
  const S = L.stack ? [VW * 0.04, VH * 0.06, VW * 0.96, L.py0 - 6] : [VW * 0.04, VH * 0.06, L.px0 - 6, VH * 0.94]; let k = 3;
  if (w[0] > 1e-3) k = Math.min(k, (S[2] - L.gx) / (L.r * w[0])); if (w[0] < -1e-3) k = Math.min(k, (S[0] - L.gx) / (L.r * w[0]));
  if (w[1] > 1e-3) k = Math.min(k, (L.gy - S[1]) / (L.r * w[1])); if (w[1] < -1e-3) k = Math.min(k, (L.gy - S[3]) / (L.r * w[1]));
  return Math.max(1, k);
}

/* everything that belongs to a moment of the day, at alpha k: the crossings, the spikes, the flights, the panel and
   the caption. Called once a frame, twice while a press crosses from one act to another. */
function content(x: X, S: Score, o: View, L: Lay, t: number, k: number, evOnly: boolean) {
  const cs = x.f.cities ?? [], cfg = x.cfg, mo = lineMo(x.mo), hero = S.hero, hc = cs[hero.ci], top = x.f.top, F = S.final;
  const seamK = t >= F.seamAt ? 1 - smoother((t - F.seamAt) / (cfg.seam / 1000)) : 1;
  const story = cfg.panel === 'story', list = cfg.panel === 'list', panel = cfg.panel !== 'off';
  const fs = L.fs, cross = mo.durCross / 1000, RY = (r: number) => rowY(r, L, S.vote.rows.length, top);

  /* the quiet event at every crossing: one ring grows from the city and fades */
  cs.forEach((c, ci) => {
    const age = mod(t - S.cross[ci], S.turn);
    if (age < cross) sphereRing(x, o, c, 9 * OUT(age / cross), ci === hero.ci && t < S.B + 0.5 ? GREEN : INK, k * 0.7 * (1 - OUT(age / cross)));
  });

  /* the spikes: each city's leader as a smooth number, rising at its first crossing in Vote, held through Final */
  const maxLead = Math.max(1, ...cs.map((c) => Math.max(...c.seven.map((r) => r.v))));
  const lastBeat = S.vote.beats[S.vote.beats.length - 1] ?? S.B + 1;
  const spikeTip = (c: CityFact, ci: number, tt: number) => {
    if (tt < S.B) return null;
    const rise = env(x, tt, S.cross[ci] + Math.ceil((S.B - S.cross[ci]) / S.turn - 1e-9) * S.turn, 0.6);
    if (rise <= 0) return null;
    const fr = cl((tt - S.B - 1.0) / Math.max(0.5, lastBeat - S.B - 1.0)), m = lerp(c.start + 0.5 * (c.buildEnd - c.start), c.end, fr);
    const lead = Math.max(...c.seven.map((_, i) => votesAt(c, i, m)));
    const w = rot(unit(c.lat, c.lon), o), full = cfg.spikeH * (lead / maxLead) * rise;
    return { w, h: Math.min(full, reach(w, L) - 1), lead };
  };
  if (!evOnly) cs.forEach((c, ci) => {
    const sp = spikeTip(c, ci, t); if (!sp || sp.h <= 0.002) return;
    const base = unit(c.lat, c.lon), pts: Poly = [], al: number[] = [];
    for (let i = 0; i <= 4; i++) { const s = 1 + (sp.h * i) / 4, w = rot([base[0] * s, base[1] * s, base[2] * s], o); pts.push(scr(w, o)); al.push((ci === hero.ci ? 0.35 : 0.12) * k * seamK * depth(w[2], o)); }
    x.pen.shade(pts, al, ci === hero.ci ? GREEN : INK, 1, 0.8);
  });

  /* ----- the caption: the act's rule, in one fixed slot ----- */
  const prize = x.f.prize ?? '$10,000', fin = cs.length * top - (x.f.empty?.length ?? 0);
  /* who votes and from when (anyone, from the first minute of building), and who picks (the event's own pickers) */
  const pickers = (x.f.pickers ?? 'the judges').toUpperCase();
  const caps: [number, string][] = [[0, x.f.buildMin + ' MINUTES TO BUILD'], [S.B, 'ANYONE CAN VOTE · MINUTE 0 TO ' + (x.f.buildMin + x.f.voteAfter)], [S.Fs, fin + ' FINALISTS · ' + pickers + ' PICK ONE'], [F.p2, 'PICKED BY ' + pickers + ' · ' + prize], [S.loop - 0.25, x.f.buildMin + ' MINUTES TO BUILD']];
  if (!evOnly) caps.forEach(([t0, s], i) => {
    const t1 = caps[i + 1]?.[0] ?? Infinity, a = (i ? cl((t - t0 - 0.1) / 0.15) : 1) * (t >= t1 ? 1 - cl((t - t1) / 0.1) : 1);
    if (t >= t0 && a > 0) word(x, s, 16, L.cy, fs, i === 3 ? GREEN : LABEL, a * k, 'left', { k: 'cap' });
  });
  if (!panel) return;

  /* ----- the panel's frame: drawn on from where the arc lands, as it lands, with the header coming in at the same
     moment and the first line typing 0.3 s later, so it is never an empty box; out at the seam ----- */
  const frame = box(L.px0, L.py0, L.px1, L.py1), fon = list ? 1 : INOUT(cl((t - ARRIVE) / 0.4));
  /* the list keeps its frame through the seam (it never draws on, so it must not go out either) */
  if (!evOnly && fon > 0) { const c = cut([frame], fon).out; x.pen.stroke(c, INK, 0.3 * k * (list ? 1 : seamK), 0.8, 0.4, false); }
  const X0 = L.px0 + 8, X1 = L.px1 - 8, head = L.py0 + 15;

  /* ----- Build ----- */
  if (story && hc && t < S.B + 0.6) {
    const hw = rot(unit(hc.lat, hc.lon), o), hp = hw[2] > 0 ? scr(hw, o) : limbOf(scr(hw, o), o);
    /* the arc from your city to the panel, drawn on and then drawn out from its tail */
    const sH = INOUT(cl((t - ARRIVE + 0.5) / 0.5)), sT = INOUT(cl((t - ARRIVE) / 0.5)), to: Pt = L.stack ? [L.px0, L.py0] : [L.px0, head - 4], c: Pt = [(hp[0] + to[0]) / 2, Math.min(hp[1], to[1]) - cfg.arcH];
    if (sH > sT + 0.002) x.pen.stroke([bezPart(hp, c, to, sT, sH)], GREEN, 0.85 * k, 1, 1);
    if (!evOnly) {
      const out = env(x, t, ARRIVE, 0.4, S.B, 0.2);
      word(x, hc.code, X0, head, fs, INK, out * k, 'left', { k: 'h0' });
      word(x, x.f.buildMin + ' MIN', X1, head, fs, LABEL, out * k * (t < S.B ? 1 : 1 - cl((t - S.B) / 0.1)), 'right', { k: 'h1' });
      /* the 90 minutes as a bar that drains: what is left is bright, what has gone is faint */
      const by = head + (L.stack ? 13 : 11), u = cl((t - 1.9) / 4.1), xu = lerp(X0, X1, u), bo = out * k;
      if (bo > 0) {
        x.pen.stroke([[[X0, by], [xu, by]]], INK, 0.16 * bo, 1, 0.3, false);
        if (xu < X1 - 0.01) x.pen.stroke([[[xu, by], [X1, by]]], INK, 0.85 * bo, 1.2, 0.6, false);
        x.pen.stroke([[[xu, by - 3], [xu, by + 3]]], INK, 0.9 * bo, 1, 0.6, false);
      }
      /* the typed lines; at 6.2 the others go and the submit line becomes your row */
      const ls = S.build.lines, y0 = by + (L.stack ? 20 : 18), gapY = fs * 1.4, merge = 6.2;
      ls.forEach((l, i) => {
        const last = i === ls.length - 1, n = Math.floor(cl((t - l.t0) / (l.t1 - l.t0)) * l.s.length + 1e-6);
        if (t < l.t0) return;
        const yLine = y0 + i * gapY;
        if (!last) {
          /* the steps stay, dimmed, through Build's rest (its still says what you did); they go as Vote opens. A
             row that comes to rest among them (you lead your city, so your row is the first) sends them all out */
          const under = S.build.mergeY + L.py0 < y0 + (ls.length - 2) * gapY + fs * 1.2;
          const a = (1 - (under ? 1 : 0.6) * INOUT(cl((t - merge) / 0.15))) * (t < S.B ? 1 : 1 - cl((t - S.B) / 0.15)) * k;
          word(x, l.s, X0, yLine, fs, INK, 0.85 * a, 'left', { k: 'ty' + i, clip: [X0 - 1, yLine - fs * 1.2, X0 + n * charW(fs) + 0.01, yLine + fs * 0.5] });
          return;
        }
        /* in turn, so no two words share a place: the steps go (150 ms), "submitted" gives way to the row in place
           (out 100 ms, in 150 ms), then the row moves to where Vote will rank it (350 ms, ease-out) */
        const mv = OUT(cl((t - merge - 0.25) / 0.35)), y = lerp(yLine, S.build.mergeY + L.py0, mv), sw = cl((t - merge - 0.1) / 0.15);
        word(x, l.s, X0, y, fs, GREEN, (1 - cl((t - merge) / 0.1)) * k, 'left', { k: 'ty' + i, clip: [X0 - 1, y - fs * 1.2, X0 + n * charW(fs) + 0.01, y + fs * 0.5] });
        /* the row: a green mark, YOUR PROJECT, how many minutes in it went in */
        const rowA = sw * k * (t < S.B ? 1 : 1 - cl((t - S.B) / 0.15));
        if (rowA > 0) {
          word(x, '✓', X0, y, fs, GREEN, rowA, 'left', { k: 'tick' });
          word(x, heroLabel(S), X0 + 12, y, fs, GREEN, rowA, 'left', { k: 'hero' });
                    /* it went in: when, if there is room ("SENT AT 82 MIN"), else just that it did */
          const room = X1 - X0 - 12 - (heroLabel(S).length + 1) * charW(fs), sent = ['SENT AT ' + S.build.submit, 'SENT'].find((w) => w.length * charW(fs) <= room);
          if (sent) word(x, sent, X1, y, fs, INK, 0.85 * rowA, 'right', { k: 'subT' });
        }
      });
      /* a cursor under the next letter while a line types */
      const typing = ls.find((l) => t >= l.t0 && t < l.t1 + 0.12);
      if (typing) {
        const i = ls.indexOf(typing), n = Math.floor(cl((t - typing.t0) / (typing.t1 - typing.t0)) * typing.s.length), cx = X0 + n * charW(fs), cy = y0 + i * gapY + 2;
        x.pen.stroke([[[cx, cy], [cx + charW(fs) - 1, cy]]], typing.green ? GREEN : INK, 0.8 * k * (1 - cl((t - typing.t1) / 0.12)), 1, 0.4, false);
      }
    }
  }

  /* ----- Vote ----- */
  const V = S.vote, nb = V.beats.length;
  const beatAt = (tt: number) => { let b = 0; while (b < nb && tt >= V.beats[b]) b++; return b; };
  if (story && hc && t >= S.B - 0.01 && t < S.Fs + 0.6 && !evOnly) {
    word(x, hc.code, X0, head, fs, INK, k * (t < S.Fs ? 1 : 1 - cl((t - S.Fs) / 0.1)), 'left', { k: 'h0' });
    word(x, 'VOTES', X1, head, fs, LABEL, k * cl((t - S.B - 0.1) / 0.15) * (t < S.Fs ? 1 : 1 - cl((t - S.Fs) / 0.15)), 'right', { k: 'h1' });
    const b = beatAt(t), heroJ = V.rows.indexOf(finalIdx(hc, hero.place));
    /* the count column is as wide as the widest count it will show, and the blue hit dot beside it */
    const countW = Math.max(...V.counts.flat().map((c) => String(c).length)) * charW(fs) + 6;
    /* the name starts one place number and a gap in: 10 units on the side panel, 11.4 stacked */
    const nameX = charW(fs) + 4;
    V.rows.forEach((_, j) => {
      /* where the row stands: its slot at the last beat, sliding from the one before as the count steps (the number changes at the middle of the slide) */
      const cur = V.rank[b].indexOf(j), was = b ? V.rank[b - 1].indexOf(j) : cur, sw = b ? INOUT(cl((t - V.beats[b - 1]) / 0.3)) : 1;
      const y = L.py0 + lerp(RY(was), RY(cur), sw);
      const isH = j === heroJ, order = Math.abs(V.rank[0].indexOf(j) - V.rank[0].indexOf(heroJ));
      const inA = isH ? cl((t - S.B) / 0.15) : env(x, t, S.B + 0.06 * (order - 1), 0.25);
      const under = cur >= top ? env(x, t, V.cut, 0.4) : 0, dim = 1 - 0.5 * under;
      /* in Final the rows under the cut fade; the top three give way to their cells */
      const gone = t >= S.Fs ? (cur >= top ? 1 - smoother((t - S.Fs) / 0.2) : 1 - cl((t - S.Fs) / 0.15)) : 1;
      const a = inA * dim * gone * k;
      if (a <= 0.004) return;
      const nm = isH ? heroLabel(S) : hc.seven[V.rows[j]].name.toUpperCase();
      word(x, fit(nm, Math.floor((X1 - X0 - nameX - countW - 2) / charW(fs))), X0 + nameX, y, fs, isH ? GREEN : INK, (isH ? 1 : 0.85) * a, 'left', { k: 'n' + j });
      /* the count: steps at a beat by a 150 ms cross-fade; the Build row's time gives way to it */
      const c0 = V.counts[Math.max(0, b - 1)][j], c1 = V.counts[b][j], xf = b ? cl((t - V.beats[b - 1] - 0.075) / 0.15) : 1;
      const fromTime = isH ? cl((t - S.B) / 0.15) : 1;
      if (b && c0 !== c1 && xf < 1) word(x, String(c0), X1, y, fs, INK, 0.85 * a * (1 - xf), 'right', { k: 'c' + j + 'o' });
      word(x, String(c1), X1, y, fs, INK, 0.85 * a * (b && c0 !== c1 ? xf : 1) * fromTime, 'right', { k: 'c' + j });
      /* the hit: blue on arrival, fading to white, beside the count */
      if (b && V.hit[b - 1] === j) {
        const age = t - V.beats[b - 1], hx = X1 - String(c1).length * charW(fs) - 5;
        const ha = (1 - smoother((age - 0.3) / 0.5)) * k * gone, col = age < 0.06 ? FLASH : age < 0.3 ? BLUE : INK;
        if (ha > 0.004) x.pen.dot([hx, y - 3.5], 1.3, col, ha, 1.4);
      }
    });
    /* the place numbers belong to the slots, not the rows */
    const swH = b ? INOUT(cl((t - V.beats[b - 1]) / 0.3)) : 1, heroSlot = (swH >= 0.5 || !b ? V.rank[b] : V.rank[b - 1]).indexOf(heroJ);
    V.rows.forEach((_, r) => {
      /* your place goes green as your row passes the middle of its slide, never before it moves */
      const isH = heroSlot === r, inA = isH ? 1 : env(x, t, S.B + 0.06 * Math.abs(r - V.rank[0].indexOf(heroJ)), 0.25);
      const under = r >= top ? env(x, t, V.cut, 0.4) : 0, gone = t >= S.Fs ? 1 - cl((t - S.Fs) / 0.15) : 1;
      word(x, String(r + 1), X0, L.py0 + RY(r), fs, isH ? GREEN : LABEL, inA * (1 - 0.5 * under) * gone * k * cl((t - S.B) / 0.15), 'left', { k: 'p' + r });
    });
    /* the cut under third place: a line that breaks for its label */
    const ca = env(x, t, V.cut, 0.4) * (t >= S.Fs ? 1 - smoother((t - S.Fs) / 0.2) : 1) * k;
    if (ca > 0.004) {
      /* the cut's label says where the top go, as fully as the panel has room for beside a line of 24 or more */
      const room = X1 - X0 - 30, lab = ['TOP ' + top + ' TO FINAL', 'TOP ' + top].find((w) => w.length * charW(fs) <= room) ?? 'TOP ' + top;
      const cy = L.py0 + (RY(top - 1) + RY(top)) / 2 - fs * 0.35, lw = lab.length * charW(fs), d = OUT(cl((t - V.cut) / 0.4));
      x.pen.stroke([[[X0, cy], [lerp(X0, X1 - lw - 6, d), cy]]], INK, 0.75 * ca, 1, 0.5, false);
      word(x, lab, X1, Math.round(cy + fs * 0.35), fs, LABEL, ca, 'right', { k: 'cut' });
    }
  }

  /* ----- Final ----- */
  const inFinal = list ? t >= 0 : t >= S.Fs - 0.01;
  if (!inFinal || !hc) return;
  /* a row of the line-up: the city's three cells first, on the side the flights come in from, then its code, then YOU.
     From nine cities (either layout) the rows go into two banks, filled down then across, the first half on the left;
     the gap inside a city's three cells is under half the space between rows, which is under half the gutter, and a
     code sits nearer its own cells than anything else. YOU then goes in the panel's head, after your city's code. */
  const cw = L.cw, two = cfg.lBanks === 'two' && cs.length >= 9, per = two ? Math.ceil(cs.length / 2) : cs.length;
  const bankOf = (ci: number) => (two && ci >= per ? 1 : 0), cg = two ? 2.5 : 5;
  const pitch = two ? Math.min(15, (L.py1 - 3 - L.py0 - L.ly0) / (per + 0.5)) : L.lh;
  const bankW = top * cw + (top - 1) * cg + 3 + 3 * charW(fs), bankX = (b: number) => (b ? X1 - bankW : X0);
  const lineY = (ci: number) => L.py0 + L.ly0 + (two ? ci % per : ci) * pitch, cellX = (pl: number, b = 0) => bankX(b) + pl * (cw + cg);
  const codeX = (ci: number) => (two ? cellX(top - 1, bankOf(ci)) + cw + 3 : cellX(top) + 2), youX = codeX(hero.ci) + 4 * charW(fs);
  const cell = (i: number): Pt => { const ci = Math.floor(i / top); return [cellX(i % top, bankOf(ci)) + cw / 2, lineY(ci) - fs * 0.35]; };
  /* every flight and the pick line take the same route to a cell: round by the panel's left margin, in from the left;
     to the right-hand bank, down the gutter */
  const gutX = X0 + bankW + (X1 - X0 - 2 * bankW) / 2;
  const routeTo = (a: Pt, i: number): Route => { const [cx, cy] = cell(i); return cellRoute(L, a, [cx, cy], cfg.arcH, bankOf(Math.floor(i / top)) ? gutX : undefined); };
  const hcell = hero.cell, fl = mo.durFlight / 1000, st = cfg.flyStagger / 1000;
  const listStart = list ? 0 : S.Fs, seamLine = (ci: number) => (t >= F.seamAt ? 1 - smoother((t - F.seamAt - ci * 0.03) / Math.max(0.1, cfg.seam / 1000 - 0.3)) : 1);
  /* when the three of a city land, and how lit each cell is */
  const landAt = (i: number) => F.fly[Math.floor(i / top)] + (i % top) * st + fl;
  const pickK = (i: number) => (i === hcell ? 0 : env(x, t, F.p1 + i * 0.02, 0.2) ), fillK = env(x, t, F.p2, 0.4);
  if (!evOnly) {
    word(x, 'THE FINAL', X0, head, fs, INK, k * smoother((t - listStart - (list ? 0 : 0.1)) / 0.3) * seamLine(0), 'left', { k: 'hF' });
    cs.forEach((c, ci) => {
      const isH = ci === hero.ci;
      /* your row's words wait until the vote rows under the cut have gone (they share its place for 150 ms otherwise) */
      const la = (isH ? cl((t - listStart - (list ? 0 : 0.15)) / 0.15) : smoother((t - listStart - 0.1) / 0.5)) * seamLine(ci) * k;
      if (la <= 0.004) return;
      const y = lineY(ci);
      word(x, c.code, codeX(ci), y, fs, isH ? (two ? GREEN : INK) : LABEL, la, 'left', { k: 'l' + ci });
      for (let pl = 0; pl < top; pl++) {
        const i = ci * top + pl, [cx, cyy] = cell(i);
        if (x.f.empty?.includes(i)) { x.pen.stroke([[[cx - cw / 2, cyy + cw / 2], [cx + cw / 2, cyy + cw / 2]]], DIM, la, 0.8, 0, false); continue; }
        const lit = env(x, t, landAt(i), 0.2), isP = i === hcell;
        /* the hero's three come from the morph: their outlines are already there */
        const morphing = isH && t < S.Fs + 0.5 && story;
        if (morphing) continue;
        const dimP = 1 - (1 - cfg.pickDim) * pickK(i);
        const aOut = (0.28 + 0.62 * lit) * dimP * la;
        x.pen.stroke([box(cx - cw / 2, cyy - cw / 2, cx + cw / 2, cyy + cw / 2)], isP ? GREEN : INK, isP ? Math.max(aOut, 0.85 * la) : aOut, isP ? 1.2 : 0.9, isP ? 1 : 0.5, false);
        if (isP && fillK > 0) x.pen.fill(box(cx - cw / 2 + 1.6, cyy - cw / 2 + 1.6, cx + cw / 2 - 1.6, cyy + cw / 2 - 1.6), GREEN, 0.85 * fillK * la);
      }
      if (isH) {
        if (two) word(x, x.f.pick !== undefined ? '' : 'YOU · ' + c.code, X1, head, fs, GREEN, la, 'right', { k: 'you' });
        else word(x, x.f.pick !== undefined ? '' : 'YOU', youX, y, fs, GREEN, la, 'left', { k: 'you' });
      }
    });
    /* the city prize, its own beat once the thirty are in and before the pick: a white dot in each city's first cell,
       top row first (50 ms apart, 200 ms in), then one line at the panel's foot whose dot sits in the same column,
       naming what first place wins. It stays through the pick, a little quieter while the pick plays */
    const cp = x.f.cityPrize?.replace(/^(a|an|the)\s+/i, '').toUpperCase();
    if (cp) {
      const quiet = lerp(1, 0.6, env(x, t, F.p1, 0.2));
      cs.forEach((_, ci) => {
        const i = ci * top; if (x.f.empty?.includes(i)) return;
        const a = OUT(cl((t - F.city - ci * 0.05) / 0.2)) * seamLine(ci) * quiet * k;
        if (a > 0.004) x.pen.dot(cell(i), cw * 0.14, INK, 0.85 * a, 1);
      });
      /* a clear gap above it (more than a row's), so it reads as a note on the line-up, not an eleventh city */
      const fy = L.py1 - (L.stack ? 4 : 3), tx = cellX(1), room = X1 - tx;
      const say = ['1ST IN EACH CITY · ' + cp, '1ST · ' + cp, cp].find((w) => w.length * charW(fs) <= room);
      const fa = smoother((t - F.city - 0.55) / 0.3) * seamLine(cs.length - 1) * k;
      if (say && fa > 0.004) {
        x.pen.dot([cellX(0) + cw / 2, fy - fs * 0.35], cw * 0.14, INK, 0.85 * fa * quiet, 1);
        word(x, say, tx, fy, fs, INK, 0.85 * fa, 'left', { k: 'cityP' });
      }
    }
    /* the morph: the top three rows shrink into the three cells on your city's line */
    if (story && t < S.Fs + 0.5) {
      const m = INOUT(cl((t - S.Fs) / 0.5));
      for (let pl = 0; pl < top; pl++) {
        const i = hero.ci * top + pl, [cx, cyy] = cell(i), yR = L.py0 + RY(pl), isP = i === hcell;
        const r0 = [X0 - 2, yR - fs * 0.85, Math.min(X1, X0 + 122) + 2, yR + fs * 0.35], r1 = [cx - cw / 2, cyy - cw / 2, cx + cw / 2, cyy + cw / 2];
        const q = r0.map((v, j) => lerp(v, r1[j], m)), a = smoother((t - S.Fs) / 0.2) * k * (isP ? 0.85 : 0.28 + 0.62 * env(x, t, landAt(i), 0.2));
        x.pen.stroke([box(q[0], q[1], q[2], q[3])], isP ? GREEN : INK, a, isP ? 1.2 : 0.9, 0.5, false);
      }
    }
  }
  /* the flights: at each city's crossing its three lift off its spike and fly to their cells, a blue head, a line
     behind; on landing the cell lights and a ring grows and fades; the line then draws out from its tail */
  cs.forEach((c, ci) => {
    const sp = spikeTip(c, ci, Math.max(t, S.Fs)); if (!sp) return;
    const tops = finalOrder(c).slice(0, top), lead = c.seven[tops[0]]?.v || 1, base = unit(c.lat, c.lon);
    tops.forEach((ri, pl) => {
      const i = ci * top + pl; if (x.f.empty?.includes(i)) return;
      const t0 = F.fly[ci] + pl * st, u = (t - t0) / fl; if (u < 0 || u > 1 + cfg.tailLen + 0.4) return;
      const h = 1 + sp.h * (c.seven[ri].v / lead), w = rot([base[0] * h, base[1] * h, base[2] * h], o), p0 = w[2] > -0.05 ? scr(w, o) : limbOf(scr(w, o), o), to = cell(i);
      const R = routeTo(p0, i), isP = i === hcell;
      /* stacked, the route is two or three times as long: its tail is held to 100 units, so it costs what a side one does */
      const sH = INOUT(cl(u)), sT0 = INOUT(cl((u - cfg.tailLen) / 1)), lift = OUT(cl((t - t0) / 0.12)), sT = L.stack ? Math.max(sT0, sH - 100 / R.c[R.c.length - 1]) : sT0;
      if (sH > sT + 0.002) x.pen.stroke([routePart(R, sT, sH)], isP ? GREEN : INK, (isP ? 0.8 : 0.5) * k * lift, isP ? 1.1 : 0.8, isP ? 1 : 0.6);
      if (u < 1) x.pen.dot(routeAt(R, sH), 1.4, isP ? GREEN : u < 0.04 ? FLASH : BLUE, k * lift, 1.5);
      const ra = t - (t0 + fl); if (ra > 0 && ra < cross) x.pen.stroke([circle(to, cw * 0.5 + 7 * OUT(ra / cross))], isP ? GREEN : INK, 0.7 * k * (1 - OUT(ra / cross)), 0.8, 0.8, false);
    });
  });
  if (evOnly) return;
  /* the pick: one green ring from your cell, then a green line from your city's code back to your city */
  const [hx, hy] = cell(hcell), rr = t - F.p2;
  if (rr > 0 && rr < 0.6) x.pen.stroke([circle([hx, hy], cw * 0.5 + 12 * OUT(rr / 0.6))], GREEN, 0.85 * k * (1 - OUT(rr / 0.6)), 1, 1, false);
  const gl = INOUT(cl((t - F.p3) / 0.8));
  if (gl > 0) {
    /* to the city where it is, behind the globe too: the line's far end takes the city's depth, so it reads as going
       round the back, and it follows the city as the globe turns */
    const hw = rot(unit(hc.lat, hc.lon), o), hp = scr(hw, o), dk = depth(hw[2], o);
    const sK = t >= F.seamAt ? 1 - smoother((t - F.seamAt - 0.3) / Math.max(0.1, cfg.seam / 1000 - 0.3)) : 1;
    /* the cells' route, run backwards: it grows from the start of your row (never through the cells before yours) out
       by the margin and over to your city;
       its far end takes the city's depth over the last part of the way */
    const R = routeTo(hp, hcell), Ln = R.c[R.c.length - 1], s1 = Math.max(0.01, 1 - (hx - cellX(0, bankOf(hero.ci)) + 2) / Math.max(1, Ln)), s0 = s1 * (1 - gl);
    const pl = routePart(R, s0, s1), pa: number[] = []; let d = s0 * Ln;
    pl.forEach((q, i) => { if (i) d += Math.hypot(q[0] - pl[i - 1][0], q[1] - pl[i - 1][1]); pa.push(0.8 * k * sK * lerp(dk, 1, smoother(d / (s1 * Ln) / 0.45))); });
    x.pen.shade(pl, pa, GREEN, 1, 1);
  }
  if (x.f.pick !== undefined) {
    if (two) word(x, 'THE PICK · ' + hc.code, X1, head, fs, GREEN, fillK * k * seamLine(hero.ci), 'right', { k: 'you' });
    else word(x, 'THE PICK', youX, lineY(hero.ci), fs, GREEN, fillK * k * seamLine(hero.ci), 'left', { k: 'you' });
  }
}

const finalIdx = (c: CityFact, place: number) => finalOrder(c)[place];
/* on a phone the row you follow says YOU (as Final does), so its name is never cut */
function heroLabel(S: Score) { return S.hero.real ? S.hero.name.toUpperCase() : S.small ? 'YOU' : 'YOUR PROJECT'; }
/* a name in n characters: whole, or cut after the last whole word that fits, with an ellipsis (one long word: cut short) */
export function fit(s: string, n: number) {
  if (s.length <= n) return s;
  let c = s.slice(0, Math.max(1, n - 1)); const sp = c.lastIndexOf(' ');
  if (sp >= 3) c = c.slice(0, sp);
  return c.replace(/[\s·,:;&-]+$/, '') + '…';
}

/* the moments a still of each act shows (its rest), and the share of the loop each act starts at, for the clock */
export function lineStills(S: Score) { return S.stills.map((s) => s / S.loop); }
/* what the line direction sets on top of a saved config when it is tried from the command line */
export const lineDefaults: Partial<ScopeCfg> = { dir: 'line' };
