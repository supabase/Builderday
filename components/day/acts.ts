/* The directions: one object carries all three steps (rule 1). Each is one function of the day, t from 0 to 3 (Build,
   Vote, Final), so a jump from Build to Final is a move of the same picture, never a cut, and a still at any t is the
   same picture every time (rule 8). Every number drawn is the model's at that moment (draw.ts CityFact).

   - globe: one line globe (the mark's), turned by the day. Build: 09:00 reaches each city, its ring drains for the
     build. Vote: the globe tips, votes arrive at each city as blue hits on a spike, three ticks for its top three.
     Final: the thirty ticks lift off and run as arcs to the thirty cells; one turns green, the pick.
   - rack: three instruments in one frame; the step's own lights up, the others hold what they last showed.
   - plans: one line drawing in depth, flown through: the clock, the votes stacking up, thirty lanes into one gate.
   - board: the day board, small: rows flap in, counts run, the top three lift out, the pick lights. */

import { countAt } from '@/lib/day-data';
import {
  BLUE, DIM, FLASH, GREY, INK, LABEL, VH, VW,
  acc, arc, cl, clock, deco, digits, dot, eio, eo, fill, hash, hhmm, lerp, ordOf, pad, pickCell, rect, segText, segWidth, stroke, text,
  type CityFact, type Poly, type Pt, type Seven, type X,
} from './draw';

export type Dir = 'globe' | 'rack' | 'plans' | 'board';
export const dayStep = (ph: number) => Math.min(2, Math.floor(ph * 3));

/* ---------- shared ---------- */
const D2R = Math.PI / 180;
/* the share of each act spent moving from the last act's pose */
export const MOVE = 0.16;
const split = (t: number) => { const a = Math.min(2, Math.max(0, Math.floor(t))); return { a, u: cl(t - a) }; };
/* readings change with the step without a flash: they fade in as a step opens and out as it ends, so the loop runs
   from Final into Build with no wipe on the right. The box is kept for the callers (it was the erase's area). */
function clearFlash(x: X, u: number, box: [number, number, number, number]) {
  void x; void box;
  return Math.min(1, cl(u / 0.03), cl((1 - u) / 0.025));
}
/* a city's votes for one of its seven at minute m: the model's curve (votesAtMin in lib/day-data.ts) */
function votesOf(r: Seven, c: CityFact, m: number) {
  const a = c.start + r.af * (c.buildEnd - c.start);
  if (m >= c.end) return r.v; if (m <= a) return 0;
  return Math.round(r.v * Math.pow((m - a) / (c.end - a), r.e));
}
function topAt(c: CityFact, m: number, n = 3): { i: number; v: number }[] {
  return c.seven.map((r, i) => ({ i, v: votesOf(r, c, m) })).sort((p, q) => q.v - p.v || c.seven[p.i].af - c.seven[q.i].af).slice(0, n);
}
const citiesOf = (x: X) => x.f.cities ?? [];
const focusOf = (x: X) => { const cs = citiesOf(x); const i = cs.findIndex((c) => c.id === 'london'); return cs[i < 0 ? 0 : i]; };

/* ---------- depth: far lines dimmer, and broken where a near line crosses them (rule 5) ---------- */
function crossT(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1], den = r0 * s1 - r1 * s0;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den, w = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
  return t >= 0 && t <= 1 && w >= 0 && w <= 1 ? t : -1;
}
export function haloCut(far: Poly[], near: Poly[], gap: number): Poly[] {
  if (gap <= 0 || !near.length) return far;
  const CELL = 12, grid = new Map<number, [Pt, Pt][]>();
  const key = (i: number, j: number) => i * 4096 + j;
  for (const p of near) for (let k = 1; k < p.length; k++) {
    const a = p[k - 1], b = p[k];
    for (let i = Math.floor(Math.min(a[0], b[0]) / CELL); i <= Math.floor(Math.max(a[0], b[0]) / CELL); i++)
      for (let j = Math.floor(Math.min(a[1], b[1]) / CELL); j <= Math.floor(Math.max(a[1], b[1]) / CELL); j++) {
        const kk = key(i, j); let l = grid.get(kk); if (!l) grid.set(kk, (l = [])); l.push([a, b]);
      }
  }
  const out: Poly[] = [];
  for (const p of far) {
    let run: Poly = [p[0]];
    for (let k = 1; k < p.length; k++) {
      const a = p[k - 1], b = p[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, cuts: [number, number][] = [];
      const seen = new Set<[Pt, Pt]>();
      for (let i = Math.floor(Math.min(a[0], b[0]) / CELL); i <= Math.floor(Math.max(a[0], b[0]) / CELL); i++)
        for (let j = Math.floor(Math.min(a[1], b[1]) / CELL); j <= Math.floor(Math.max(a[1], b[1]) / CELL); j++)
          for (const s of grid.get(key(i, j)) ?? []) { if (seen.has(s)) continue; seen.add(s); const t = crossT(a, b, s[0], s[1]); if (t >= 0) cuts.push([t - gap / L, t + gap / L]); }
      if (!cuts.length) { run.push(b); continue; }
      cuts.sort((m, n) => m[0] - n[0]);
      let t0 = 0;
      for (const [c0, c1] of cuts) {
        if (c0 > t0) run.push([a[0] + (b[0] - a[0]) * c0, a[1] + (b[1] - a[1]) * c0]);
        if (run.length > 1) out.push(run);
        t0 = Math.max(t0, c1); run = [[a[0] + (b[0] - a[0]) * Math.min(1, t0), a[1] + (b[1] - a[1]) * Math.min(1, t0)]];
      }
      if (t0 < 1) run.push(b);
    }
    if (run.length > 1) out.push(run);
  }
  return out;
}

/* =====================================================================================================
   One globe, three acts
   ===================================================================================================== */
type V3 = [number, number, number];
type Pose = { lon: number; lat: number };
const GX = 104, GY = 94, GR = 66;
const unit = (lat: number, lon: number): V3 => { const p = lat * D2R, l = lon * D2R; return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)]; };
function view(v: V3, o: Pose): V3 {
  const l = o.lon * D2R, p = o.lat * D2R;
  const x1 = v[0] * Math.cos(l) - v[2] * Math.sin(l), z1 = v[0] * Math.sin(l) + v[2] * Math.cos(l);
  return [x1, v[1] * Math.cos(p) - z1 * Math.sin(p), v[1] * Math.sin(p) + z1 * Math.cos(p)];
}
const scr = (v: V3): Pt => [GX + GR * v[0], GY - GR * v[1]];
const seen3 = (v: V3) => v[2] > 0 || v[0] * v[0] + v[1] * v[1] > 1.0004;
const smooth = (a: number, b: number, k: number) => lerp(a, b, eio(cl(k)));
const lonLerp = (a: number, b: number, k: number) => { let d = ((b - a + 540) % 360) - 180; if (Math.abs(d) < 1e-6) d = 0; return a + d * eio(cl(k)); };

/* the day's minutes each act plays, and the globe's pose at each moment of it */
function span(x: X) {
  const cs = citiesOf(x), first = Math.min(...cs.map((c) => c.start)), last = Math.max(...cs.map((c) => c.start));
  return { first, last, build: [first - 30, last + x.f.buildMin + 15] as const, vote: [first, last + x.f.buildMin + x.f.voteAfter + 10] as const };
}
/* the act's clock: minutes when a city is in the step pass at full weight, quiet minutes (between the time zones)
   at a seventh, so every still of the act lands on something happening */
const WARP = new Map<string, number[]>();
function clockOf(x: X, step: 0 | 1, lo: number, hi: number, u: number) {
  const cs = citiesOf(x), key = step + ':' + lo + ':' + hi + ':' + cs.map((c) => c.start + '-' + c.end).join(',');
  let cum = WARP.get(key);
  if (!cum) {
    cum = [0]; const N = 240;
    for (let i = 0; i < N; i++) { const m = lerp(lo, hi, (i + 0.5) / N), busy = cs.some((c) => m >= c.start && m < (step === 0 ? c.buildEnd : c.end)); cum.push(cum[i] + (busy ? 1 : 0.15)); }
    WARP.set(key, cum);
  }
  const N = cum.length - 1, want = cl(u) * cum[N]; let i = 0;
  while (i < N - 1 && cum[i + 1] < want) i++;
  return lerp(lo, hi, (i + (want - cum[i]) / (cum[i + 1] - cum[i] || 1)) / N);
}
/* where local mean time is h:mm, as a longitude */
const solarLon = (m: number, localMin: number) => (localMin - m) / 4;
function globePose(x: X, a: number, u: number): Pose {
  const S = span(x), turn = x.cfg.turn;
  if (a === 0) { const m = clockOf(x, 0, S.build[0], S.build[1], u / 0.94); return { lon: solarLon(m, 9 * 60 + 40) * turn, lat: 18 }; }
  if (a === 1) { const m = clockOf(x, 1, S.vote[0], S.vote[1], u / 0.94); return { lon: solarLon(m, 10 * 60 + 20) * turn, lat: x.cfg.tilt }; }
  const cs = citiesOf(x), pc = cs[Math.floor(pickCell(x) / x.f.top)] ?? cs[0];
  return { lon: (pc?.lon ?? 0) + 30 + 18 * u, lat: 10 };
}
export function poseAt(x: X, t: number): Pose {
  const { a, u } = split(t), here = globePose(x, a, u);
  if (u >= MOVE) return here;
  const prev = x.from !== undefined ? poseAt({ ...x, from: undefined }, x.from) : globePose(x, (a + 2) % 3, 1), k = u / MOVE;
  return { lon: lonLerp(prev.lon, here.lon, k), lat: smooth(prev.lat, here.lat, k) };
}

function graticule(x: X, o: Pose) {
  const front: Poly[] = [], back: Poly[] = [];
  const add = (pts: V3[]) => {
    let run: Poly = [], side = 0;
    for (const v of pts) {
      const w = view(v, o), s = w[2] >= 0 ? 1 : -1;
      if (side && s !== side) { run.push(scr(w)); (side > 0 ? front : back).push(run); run = []; }
      run.push(scr(w)); side = s;
    }
    if (run.length > 1) (side > 0 ? front : back).push(run);
  };
  for (let lon = 0; lon < 360; lon += 30) { const p: V3[] = []; for (let lat = -90; lat <= 90; lat += 6) p.push(unit(lat, lon)); add(p); }
  for (const lat of [-60, -30, 0, 30, 60]) { const p: V3[] = []; for (let lon = 0; lon <= 360; lon += 6) p.push(unit(lat, lon)); add(p); }
  return { front, back };
}
function drawGlobeBody(x: X, o: Pose, extraNear: Poly[]) {
  const g = graticule(x, o), limb = arc(GX, GY, GR, GR, 0, Math.PI * 2, 72);
  /* the limb always; the lines on the globe only as the budget allows (data is drawn first) */
  stroke(x, [limb], INK, 0.5, 0.9, 0.6);
  deco(x, g.front, INK, 0.22, 0.75, 0.4);
  /* the far side: dimmer, and broken where a near line crosses it */
  if (x.cfg.depth < 1) deco(x, haloCut(g.back, [...g.front, limb, ...extraNear], x.cfg.gap), INK, 0.3 * (1 - x.cfg.depth) * 0.7, 0.7, 0.2);
}
/* a small circle on the globe around a point, the share k of it left (the ring that drains) */
function ring(lat: number, lon: number, rDeg: number, k: number, o: Pose): Poly[] {
  const c = unit(lat, lon), e: V3 = Math.abs(c[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const u1: V3 = [e[1] * c[2] - e[2] * c[1], e[2] * c[0] - e[0] * c[2], e[0] * c[1] - e[1] * c[0]], n1 = Math.hypot(...u1); u1[0] /= n1; u1[1] /= n1; u1[2] /= n1;
  const u2: V3 = [c[1] * u1[2] - c[2] * u1[1], c[2] * u1[0] - c[0] * u1[2], c[0] * u1[1] - c[1] * u1[0]];
  const r = rDeg * D2R, out: Poly[] = []; let run: Poly = []; const N = 28;
  for (let i = 0; i <= Math.ceil(N * k); i++) {
    const a = -Math.PI / 2 + (Math.min(i, N * k) / N) * Math.PI * 2, v: V3 = [0, 0, 0];
    for (let j = 0; j < 3; j++) v[j] = c[j] * Math.cos(r) + (u1[j] * Math.cos(a) + u2[j] * Math.sin(a)) * Math.sin(r);
    const w = view(v, o); if (w[2] > 0) run.push(scr(w)); else if (run.length) { out.push(run); run = []; }
  }
  if (run.length > 1) out.push(run);
  return out;
}
/* the visible parts of a straight line in space */
function line3(a: V3, b: V3, o: Pose, n = 10): Poly[] {
  const out: Poly[] = []; let run: Poly = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, v: V3 = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)], w = view(v, o);
    if (seen3(w)) run.push(scr(w)); else if (run.length) { if (run.length > 1) out.push(run); run = []; }
  }
  if (run.length > 1) out.push(run);
  return out;
}
const scale3 = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];

/* the readings, right of the globe, in the site's order: the state, the city, then each label over its value. In a
   small tube (the sheet, a phone) only the state, the city and the one number, each 12px or more; the rest is in the
   words beside the tube. */
const PX = 196, PR = 304;
function readings(x: X, u: number, rows: { k: string; big?: string; label?: string; seg?: string; col?: string; small?: string }) {
  const b = clearFlash(x, u, [PX - 6, 14, PR + 4, 168]), S = !!x.small;
  let y = 30;
  /* the drawings play a sample day, so the state says it is a replay: its clock is never read as the page's own */
  text(x, S ? rows.k : rows.k + ' · REPLAY', PX, y, S ? 12 : 7.5, GREY, b); y += S ? 10 : 8;
  if (rows.big) { text(x, rows.big, PX, y + (S ? 20 : 17), S ? 20 : 16, rows.col ?? INK, 0.95 * b); y += S ? 30 : 26; }
  if (rows.label && !S) { text(x, rows.label, PX, y + 4, 7.5, LABEL, b); y += 12; }
  if (rows.seg) { const h = S ? 20 : 17; clock(x, rows.seg, PX, y, h / 1.8, h, rows.col ?? INK, 0.95 * b); y += h + 9; }
  if (rows.small && !S) rows.small.split('\n').forEach((l, i) => text(x, l, PX, y + 6 + i * 12, 7.5, GREY, b));
  /* a small tube has no room beside the state: the word gets its own line under the number */
  if (S) text(x, 'REPLAY', PX, y + 8, 10, LABEL, b);
}
/* the safe area: nothing a drawing moves runs closer than 6% to the tube's edge */
const SAFE = [VW * 0.06, VH * 0.06, VW * 0.94, VH * 0.94];
/* how far out from the centre (in globe radii) a point above w (a city, seen) can go and stay in the safe area */
function reach(w: V3): number {
  let k = 3;
  if (w[0] > 1e-3) k = Math.min(k, (SAFE[2] - GX) / (GR * w[0])); if (w[0] < -1e-3) k = Math.min(k, (SAFE[0] - GX) / (GR * w[0]));
  if (w[1] > 1e-3) k = Math.min(k, (GY - SAFE[1]) / (GR * w[1])); if (w[1] < -1e-3) k = Math.min(k, (GY - SAFE[3]) / (GR * w[1]));
  return Math.max(1, k);
}
/* the point on the globe's edge nearest a point behind it, where a hidden city's path comes into view */
function limbOf(p: Pt): Pt { const dx = p[0] - GX, dy = p[1] - GY, n = Math.hypot(dx, dy); return n < 1e-3 ? [GX, GY - GR] : [GX + (GR * dx) / n, GY + (GR * dy) / n]; }

function globe(x: X, t: number) {
  const { a, u } = split(t), o = poseAt(x, t), cs = citiesOf(x), S = span(x), A = acc(x), near: Poly[] = [];
  if (!cs.length) { drawGlobeBody(x, o, []); return; }
  const z = (c: CityFact) => view(unit(c.lat, c.lon), o)[2];

  if (a === 0) {
    /* Build: the day turns the globe; at 09:00 a city lights and its ring drains for the build */
    const m = clockOf(x, 0, S.build[0], S.build[1], u / 0.94);
    const building = cs.filter((c) => m >= c.start && m < c.buildEnd), next = cs.filter((c) => c.start > m).sort((p, q) => p.start - q.start)[0];
    const front = building.length ? building.reduce((p, q) => (z(q) > z(p) ? q : p)) : null;
    /* the 09:00 line: where it is nine in the morning now */
    const nine: V3[] = []; for (let lat = -66; lat <= 66; lat += 6) nine.push(unit(lat, solarLon(m, 9 * 60)));
    let run: Poly = []; const nineP: Poly[] = [];
    for (const v of nine) { const w = view(v, o); if (w[2] > 0) run.push(scr(w)); else if (run.length) { nineP.push(run); run = []; } }
    if (run.length > 1) nineP.push(run);
    for (const c of cs) {
      const w = view(unit(c.lat, c.lon), o), p = scr(w), vis = w[2] > 0, dim = vis ? 1 : 0;
      if (!vis) continue;
      if (m < c.start) { dot(x, p, 1.1, LABEL, 0.6 * dim); continue; }
      const age = (m - c.start) / 24;
      if (m < c.buildEnd) {
        const k = 1 - (m - c.start) / x.f.buildMin, isF = front === c;
        const rp = ring(c.lat, c.lon, 9, k, o); near.push(...rp);
        stroke(x, rp, isF ? A : INK, isF ? 1 : 0.8, isF ? 1.4 : 1, 1.2);
        dot(x, p, 1.8, age < 0.3 ? (age < 0.08 ? FLASH : BLUE) : INK, 1);
      } else dot(x, p, 1.4, INK, 0.85);
    }
    stroke(x, nineP, INK, 0.55, 1, 0.6); near.push(...nineP);
    drawGlobeBody(x, o, near);
    const c = front ?? next;
    if (c) {
      const left = Math.max(0, (c.buildEnd - m) * 60), seg = front ? Math.floor(left / 3600) + ':' + pad(Math.floor((left % 3600) / 60)) + ':' + pad(Math.floor(left % 60)) : hhmm(m + c.off);
      readings(x, u, { k: front ? 'BUILDING' : 'NEXT', big: c.code, label: front ? 'LEFT TO BUILD' : 'LOCAL TIME', seg, col: front ? INK : LABEL, small: (front ? '' : 'OPENS ' + hhmm(c.start + c.off) + '\n') + building.length + ' OF ' + cs.length + ' BUILDING\n' + hhmm(m) + ' UTC' });
    }
    return;
  }

  if (a === 1) {
    /* Vote: the globe tips; votes arrive as blue hits, a spike grows from each city, three ticks for its top three */
    const m = clockOf(x, 1, S.vote[0], S.vote[1], u / 0.94), maxV = Math.max(...cs.map((c) => Math.max(...c.seven.map((r) => r.v))));
    /* the readout's city is one on the near side, so its spike (and its one green tick) is drawn */
    let front: CityFact | null = null, fz = 0;
    const spikes: { c: CityFact; top: { i: number; v: number }[]; hit: number; w: V3 }[] = [];
    for (const c of cs) {
      if (m < c.start) continue;
      const top = topAt(c, m), was = topAt(c, m - 4, 1)[0]?.v ?? 0, w = view(unit(c.lat, c.lon), o);
      spikes.push({ c, top, hit: Math.min(1, ((top[0]?.v ?? 0) - was) / 6), w });
      if (w[2] > fz && m < c.end && (top[0]?.v ?? 0) > 0) { fz = w[2]; front = c; }
    }
    /* the readings follow the open city in front; when none has votes yet, the one that closed last. Its leader's tick
       is the one green thing; every other tick is white */
    const shown = spikes.filter((s) => s.w[2] > 0), c = front ?? shown.filter((s) => (s.top[0]?.v ?? 0) > 0).sort((p, q) => q.c.end - p.c.end)[0]?.c ?? shown[shown.length - 1]?.c ?? spikes[spikes.length - 1]?.c;
    /* three bars always mean one city's top three: where two cities stand close on screen their spikes run together,
       so only one of them (the readout's city, else the one with more votes) carries ticks */
    const ticked = new Set<(typeof spikes)[number]>();
    for (const s of shown.slice().sort((p, q) => Number(q.c === c) - Number(p.c === c) || (q.top[0]?.v ?? 0) - (p.top[0]?.v ?? 0))) {
      const b = scr(s.w); if ([...ticked].every((t) => { const d = scr(t.w); return Math.hypot(b[0] - d[0], b[1] - d[1]) >= 16; })) ticked.add(s);
    }
    for (const s of spikes) {
      /* a spike stands on its city, so only a city on the near side has one */
      if (s.w[2] <= 0) continue;
      const base = unit(s.c.lat, s.c.lon), tipV = s.top[0]?.v ?? 0, full = 0.62 * (tipV / maxV);
      /* kept in the safe area: a spike that would run off the tube is scaled down, its ticks with it */
      const f = full > 0 ? Math.min(1, (reach(s.w) - 1) / full) : 1, H = (v: number) => 1 + 0.62 * (v / maxV) * f;
      const sp = line3(base, scale3(base, H(tipV)), o, 12), closed = m >= s.c.end;
      stroke(x, sp, INK, closed ? 0.55 : 0.75, 0.9, 0.8); near.push(...sp);
      dot(x, scr(s.w), 0.9, INK, 0.8);
      /* the top three as three ticks, evenly spaced down from the tip */
      const gap = Math.min(0.07, (H(tipV) - 1) / 3.2), lead = s.c === c;
      /* the ticks are readings, as numbers are: no afterglow, so a tick that moves leaves no ladder behind it */
      if (!x.pen.ghost && ticked.has(s)) s.top.forEach((r, k) => {
        if (!r.v) return;
        const h = H(tipV) - k * gap, at = view(scale3(base, h), o), lo = view(scale3(base, h - 0.02), o);
        const d = [at[0] - lo[0], at[1] - lo[1]], n = Math.hypot(d[0], d[1]) || 1, nx = -d[1] / n, ny = d[0] / n, p = scr(at), L = k ? 2.6 : 3.6;
        stroke(x, [[[p[0] - nx * L, p[1] + ny * L], [p[0] + nx * L, p[1] - ny * L]]], !k && lead ? A : INK, k ? 0.75 : 1, k ? 0.9 : 1.2, !k && lead ? 1.2 : 0.6);
      });
      /* a vote arriving: a blue hit above the tip, drawn as a small ring so it never reads as a fourth bar, and with no
         afterglow (a hit that rides up with a growing tip would leave a streak) */
      if (s.hit > 0 && !x.pen.ghost) { const q = scr(view(scale3(base, H(tipV) + 0.07), o)), ring: Poly = []; for (let t = 0; t <= 12; t++) ring.push([q[0] + 2 * Math.cos((t / 12) * Math.PI * 2), q[1] + 2 * Math.sin((t / 12) * Math.PI * 2)]); stroke(x, [ring], BLUE, s.hit, 0.9, 1); }
    }
    drawGlobeBody(x, o, near);
    if (c) {
      const top = topAt(c, m), lead = top[0]?.v ?? 0, closed = m >= c.end;
      readings(x, u, { k: closed ? 'CLOSED' : 'VOTING', big: c.code, label: 'LEADER · VOTES', seg: String(lead), small: top.slice(1).map((r, k) => ordOf(k + 2) + ' ' + r.v).join('  ') + '\n' + hhmm(m) + ' UTC' });
    }
    return;
  }

  /* Final: each city's three ticks lift off as thirty points, run as arcs to the thirty cells, and one turns green */
  const top = x.f.top, pk = pickCell(x), maxV = Math.max(...cs.map((c) => Math.max(...c.seven.map((r) => r.v))));
  const cw = 8, cg = 2, gx0 = PR - cs.length * (cw + cg) + cg, gy0 = 64;
  const cell = (i: number): Pt => [gx0 + Math.floor(i / top) * (cw + cg) + cw / 2, gy0 + (i % top) * (cw + cg) + cw / 2];
  const landed = u >= 0.78, lk = cl((u - 0.78) / 0.1);
  let pickFrom: Pt | null = null;
  cs.forEach((c, ci) => {
    const base = unit(c.lat, c.lon), tops = topAt(c, c.end), w0 = view(base, o);
    /* the lift stays in the safe area, as the spikes do */
    const lead = tops[0]?.v ?? 0, top0 = 0.62 * (lead / maxV) + 0.18, fk = top0 > 0 && w0[2] > 0 ? Math.min(1, (reach(w0) - 1) / top0) : 1;
    if (w0[2] > 0) dot(x, scr(w0), 0.9, landed && Math.floor(pk / top) === ci ? A : INK, 0.8);
    tops.forEach((r, k) => {
      const i = ci * top + k; if (x.f.empty?.includes(i) || !r.v) return;
      const lift = eo(cl((u - ci * 0.012) / 0.2)), h0 = 1 + (0.62 * (r.v / maxV) + 0.18 * lift) * fk, from = view(scale3(base, h0), o);
      /* a city on the far side: its path comes into view at the globe's edge, never out of empty space */
      const p0 = seen3(from) ? scr(from) : limbOf(scr(from));
      const run = cl((u - 0.2 - ci * 0.02 - k * 0.006) / 0.34), to = cell(i);
      const ctl: Pt = [to[0] - 6, gy0 - 22];
      const bez = (s: number): Pt => [(1 - s) * (1 - s) * p0[0] + 2 * (1 - s) * s * ctl[0] + s * s * to[0], (1 - s) * (1 - s) * p0[1] + 2 * (1 - s) * s * ctl[1] + s * s * to[1]];
      const isP = i === pk;
      if (isP) pickFrom = p0;
      if (run <= 0) { if (seen3(from)) dot(x, p0, 1.4, lift < 1 ? INK : FLASH, 0.9); return; }
      /* in flight, a short tail behind the point; once landed only the pick's path stays, in green */
      if (run >= 1 && !(isP && landed)) return;
      const e = eio(run), s0 = isP && landed ? 0 : Math.max(0, e - 0.3), path: Poly = [];
      if (isP && landed) {
        /* once landed, the pick's path is one curve from its city (or the globe's edge if it is behind) to its cell: it
           leaves the city along the lift, through the lifted point, and comes in as the flight did, with no corner */
        const c0 = w0[2] > 0 ? scr(w0) : limbOf(scr(w0)), c1: Pt = [p0[0] + (p0[0] - c0[0]) * 0.6, p0[1] + (p0[1] - c0[1]) * 0.6];
        for (let s = 0; s <= 24; s++) { const t = s / 24, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, cc = 3 * (1 - t) * t * t, d = t ** 3; path.push([a * c0[0] + b * c1[0] + cc * ctl[0] + d * to[0], a * c0[1] + b * c1[1] + cc * ctl[1] + d * to[1]]); }
      } else for (let s = 0; s <= 12; s++) path.push(bez(lerp(s0, e, s / 12)));
      stroke(x, [path], isP && landed ? A : INK, isP && landed ? 0.8 : 0.45, isP && landed ? 1 : 0.7, isP && landed ? 0.8 : 0.4);
      if (run < 1) dot(x, path[path.length - 1], 1.4, FLASH, 1);
    });
  });
  drawGlobeBody(x, o, []);
  /* the thirty cells */
  for (let i = 0; i < cs.length * top; i++) {
    const [cx, cy] = cell(i), box = rect(cx - cw / 2, cy - cw / 2, cx + cw / 2, cy + cw / 2);
    if (x.f.empty?.includes(i)) { stroke(x, [[[cx - cw / 2, cy + cw / 2], [cx - 1, cy + cw / 2]], [[cx + 1, cy + cw / 2], [cx + cw / 2, cy + cw / 2]]], DIM, 1, 0.8, 0); continue; }
    const arrived = u > 0.2 + Math.floor(i / top) * 0.02 + (i % top) * 0.006 + 0.34;
    if (!arrived) { stroke(x, [box], DIM, 1, 0.7, 0); continue; }
    const isP = i === pk, scan = !landed && u > 0.62 && Math.floor(hash(x.cfg.seed, 81, Math.floor(u * 40)) * cs.length * top) === i;
    stroke(x, [box], isP && landed ? A : scan ? BLUE : INK, landed && !isP ? 0.3 : 0.85, isP && landed ? 1.3 : 0.8, isP && landed ? 2 - lk : 0.6);
    if (isP && landed) fill(x, rect(cx - cw / 2 + 2, cy - cw / 2 + 2, cx + cw / 2 - 2, cy + cw / 2 - 2), A, 0.85);
  }
  void pickFrom;
  const pc = cs[Math.floor(pk / top)], b = clearFlash(x, u, [PX - 6, 14, PR + 4, 168]);
  const sm = !!x.small;
  /* the words sit under the thirty cells, out of the paths that come in to them from above */
  const ly = gy0 + top * (cw + cg) + 14;
  text(x, cs.length * top - (x.f.empty?.length ?? 0) + ' FINALISTS', PX, ly, sm ? 12 : 7.5, GREY, b);
  if (!landed) text(x, 'ONE PICK', PX, ly + 18, sm ? 12 : 7.5, GREY, b);
  if (landed && pc) { text(x, 'THE PICK', PX, ly + 18, sm ? 12 : 7.5, A, b); text(x, pc.code + ' ' + ordOf((pk % top) + 1), PX, ly + (sm ? 40 : 36), sm ? 18 : 14, INK, b); }
}

/* =====================================================================================================
   The rack: three instruments, one frame
   ===================================================================================================== */
const BAYS: [number, number][] = [[10, 106], [112, 208], [214, 310]];
function rack(x: X, t: number) {
  const { a, u } = split(t), c = focusOf(x), A = acc(x);
  if (!c) return;
  /* a bay holds what it last showed: before its step it shows its start, after it its end */
  const at = (bay: number) => (bay < a ? 1 : bay > a ? 0 : u), lit = (bay: number) => (bay === a ? 1 : 0.32);
  BAYS.forEach(([x0, x1], i) => {
    (i === a ? stroke : deco)(x, [rect(x0, 14, x1, 150)], i === a ? INK : DIM, i === a ? 0.45 : 1, 0.8, 0);
    text(x, ['BUILD', 'VOTE', 'FINAL'][i], x0, 164, 7.5, i === a ? INK : GREY, 1);
  });
  /* Build: the countdown, and a storage tube where each entry writes a mark that stays */
  {
    const [x0, x1] = BAYS[0], k = at(0), L = lit(0), m = c.start + k * x.f.buildMin, left = Math.round((1 - k) * x.f.buildMin * 60);
    const s = Math.floor(left / 3600) + ':' + pad(Math.floor((left % 3600) / 60)) + ':' + pad(left % 60), sw = segWidth(s, 6, 12);
    digits(x, segText(s, (x0 + x1 - sw) / 2, 24, 6, 12).polys, INK, 0.95 * L, 1.1);
    const n = k <= 0 ? 0 : countAt(c.entries, k), nPrev = k <= 0 ? 0 : countAt(c.entries, Math.max(0, k - 0.02)), per = 16;
    for (let e = 0; e < n; e++) {
      const col = e % per, row = Math.floor(e / per), px = x0 + 8 + col * 5, py = 52 + row * 7;
      if (py > 132) break;
      stroke(x, [[[px, py], [px, py + 4]]], e >= nPrev && a === 0 ? BLUE : INK, (e >= nPrev && a === 0 ? 1 : 0.6) * L, 0.8, 0.4);
    }
    /* the write-through cursor */
    if (a === 0 && n < c.entries) { const col = n % per, row = Math.floor(n / per); dot(x, [x0 + 8 + col * 5, 54 + row * 7], 1, FLASH, 0.9); }
    text(x, n + ' IN', x1 - 6, 144, 7.5, LABEL, L, 'right');
    void m;
  }
  /* Vote: a sweep; each vote for the seven lands as a hit and fades */
  {
    const [x0, x1] = BAYS[1], k = at(1), L = lit(1), m = lerp(c.start, c.end, k), cx = (x0 + x1) / 2, cy = 74, R = 36;
    for (const r of [R / 2, R]) deco(x, [arc(cx, cy, r, r, 0, Math.PI * 2, 40)], INK, 0.22 * L, 0.7, 0);
    const ang = k * Math.PI * 2 * 6 - Math.PI / 2;
    if (a === 1) for (let j = 6; j >= 0; j--) { const aa = ang - j * 0.05; stroke(x, [[[cx, cy], [cx + Math.cos(aa) * R, cy + Math.sin(aa) * R]]], j < 1 ? FLASH : BLUE, Math.pow(0.6, j) * 0.8, 0.8, j < 1 ? 1 : 0); }
    let tot = 0;
    c.seven.forEach((r, i) => {
      const v = votesOf(r, c, m), prev = votesOf(r, c, m - 5); tot += v;
      const th = hash(x.cfg.seed, 300, i) * Math.PI * 2, rr = R * (0.3 + 0.65 * (i / 7));
      const p: Pt = [cx + Math.cos(th) * rr, cy + Math.sin(th) * rr];
      if (v > 0) dot(x, p, 1.2 + Math.min(1.4, v / 200), v > prev && a === 1 ? BLUE : INK, (v > prev && a === 1 ? 1 : 0.55) * L);
    });
    const ts = String(tot), tw = segWidth(ts, 6, 12);
    digits(x, segText(ts, (x0 + x1 - tw) / 2, 122, 6, 12).polys, INK, 0.95 * L, 1.1);
    text(x, 'VOTES', x1 - 6, 144, 7.5, LABEL, L, 'right');
  }
  /* Final: thirty lamps; one by one they go out until the pick stays */
  {
    const [x0] = BAYS[2], k = at(2), L = lit(2), top = x.f.top, n = x.f.codes.length, pk = pickCell(x);
    const order = Array.from({ length: n * top }, (_, i) => i).filter((i) => i !== pk && !x.f.empty?.includes(i)).sort((p, q) => hash(x.cfg.seed, 310, p) - hash(x.cfg.seed, 310, q));
    const out = Math.floor(cl((k - 0.25) / 0.55) * order.length), off = new Set(order.slice(0, out)), picked = k >= 0.84;
    let on = 0;
    for (let i = 0; i < n * top; i++) {
      const cx = x0 + 12 + Math.floor(i / top) * 8.2, cy = 34 + (i % top) * 10;
      const litNow = k > (Math.floor(i / top) * 0.012 + 0.02);
      if (x.f.empty?.includes(i)) { deco(x, [arc(cx, cy, 2.6, 2.6, 0, Math.PI * 2, 10)], DIM, 1, 0.6, 0); continue; }
      const isP = i === pk, gone = off.has(i);
      if (!litNow || gone) { deco(x, [arc(cx, cy, 2.6, 2.6, 0, Math.PI * 2, 10)], DIM, 1, 0.6, 0); continue; }
      on++;
      dot(x, [cx, cy], 1.6, isP && picked ? A : INK, (isP && picked ? 1 : 0.85) * L);
    }
    const s = String(picked ? 1 : on), sw = segWidth(s, 9, 18);
    digits(x, segText(s, x0 + 48 - sw / 2, 84, 9, 18).polys, INK, 0.95 * L, 1.2);
    text(x, picked ? 'THE PICK' : 'FINALISTS', x0 + 92, 144, 7.5, picked ? A : LABEL, L, 'right');
  }
  clearFlash(x, u, [BAYS[a][0], 14, BAYS[a][1], 150]);
}

/* =====================================================================================================
   The plans: one long line drawing, flown through
   ===================================================================================================== */
type W3 = [number, number, number];
function plans(x: X, t: number) {
  const { a, u } = split(t), c = focusOf(x), A = acc(x), top = x.f.top, n = x.f.codes.length, pk = pickCell(x);
  if (!c) return;
  /* the camera: each act flies through its own stretch; the first share of an act moves on from the last */
  const camAt = (aa: number, uu: number) => [[-6, 3], [7, 10], [16, 21]][aa].reduce((p, q) => lerp(p, q, eio(uu)));
  const camOf = (tt: number, prev: number) => { const s = split(tt); return s.u < MOVE ? lerp(prev, camAt(s.a, 0), eio(s.u / MOVE)) : camAt(s.a, (s.u - MOVE) / (1 - MOVE)); };
  const camZ = camOf(t, x.from !== undefined ? camOf(x.from, camAt((split(x.from).a + 2) % 3, 1)) : camAt((a + 2) % 3, 1));
  const camX = 0.6 * Math.sin(t * 1.3), camY = 1.7, F = 150;
  const P = (w: W3): Pt | null => { const dz = w[2] - camZ; if (dz < 0.4) return null; return [VW / 2 + (F * (w[0] - camX)) / dz, 78 - (F * (w[1] - camY)) / dz]; };
  /* far lines dim (rule 5); lines about to pass the camera fade out rather than fill the frame */
  const far = (w: W3) => Math.exp(-Math.max(0, w[2] - camZ - 3) * x.cfg.depth * 0.16) * Math.pow(cl((w[2] - camZ - 1) / 4), 1.5);
  const L3 = (pts: W3[], col: string, al: number, wd = 0.9, more = 0.6, opt = false) => {
    let run: Poly = [], fz = 1; const out: Poly[] = [];
    for (const w of pts) { const p = P(w); if (p) { run.push(p); fz = Math.min(fz, far(w)); } else if (run.length) { out.push(run); run = []; } }
    if (run.length) out.push(run);
    const vis = out.filter((r) => r.length > 1); if (vis.length) (opt ? deco : stroke)(x, vis, col, al * fz, wd, more);
  };
  /* the ground: two rails and a tie every two units, as far as the eye goes */
  for (const rx of [-3.2, 3.2]) L3([[rx, 0, camZ + 0.5], [rx, 0, camZ + 26]], INK, 0.4);
  for (let z = Math.ceil(camZ / 2) * 2; z < camZ + 26; z += 2) L3([[-3.2, 0, z], [3.2, 0, z]], INK, 0.16, 0.7, 0.2, true);
  /* Build: the doors open at 09:00, the clock runs, the doors close at 10:30 */
  const gate = (z: number, lab: string, al: number, col = INK) => { L3([[-2.6, 0, z], [-2.6, 3.4, z], [2.6, 3.4, z], [2.6, 0, z]], col, al, 1); const p = P([-2.4, 3.8, z]); if (p) text(x, lab, p[0], p[1], 7.5, GREY, far([0, 0, z])); };
  gate(4, hhmm(x.f.startHour * 60) + ' LOCAL', 0.7); gate(12, hhmm(x.f.startHour * 60 + x.f.buildMin), 0.7);
  {
    const k = a === 0 ? u : a > 0 ? 1 : 0, left = Math.round((1 - k) * x.f.buildMin * 60);
    const s = Math.floor(left / 3600) + ':' + pad(Math.floor((left % 3600) / 60)) + ':' + pad(left % 60), sw = segWidth(s, 10, 20), z = 8;
    const polys = segText(s, -sw / 2, 0, 10, 20).polys.map((p) => p.map(([px, py]) => [px * 0.05, 1.5 - py * 0.05, z] as W3));
    if (!x.pen.ghost) for (const p of polys) L3(p, INK, 0.95, 1.2, 1);
    L3([[-2.1, 0.5, z], [2.1, 0.5, z]], INK, 0.5);
    L3([[-2.1, 0.5, z], [lerp(-2.1, 2.1, k), 0.5, z]], A, 0.9, 1.4, 1);
  }
  /* Vote: the seven's votes stack up as towers, the leader's top in green */
  {
    const k = a === 1 ? u : a > 1 ? 1 : 0, m = lerp(c.start, c.end, k), maxV = Math.max(...c.seven.map((r) => r.v));
    const vs = c.seven.map((r) => votesOf(r, c, m)), lead = vs.indexOf(Math.max(...vs));
    c.seven.forEach((r, i) => {
      const z = 15, w = 0.62, x0 = -3 + i * 0.88, h = 3.2 * (vs[i] / maxV);
      if (h <= 0.01) { L3([[x0, 0, z], [x0 + w, 0, z]], DIM, 1); return; }
      L3([[x0, 0, z], [x0, h, z], [x0 + w, h, z], [x0 + w, 0, z]], INK, 0.7);
      for (let s = 0.4; s < h; s += 0.4) L3([[x0, s, z], [x0 + w, s, z]], INK, 0.14, 0.6, 0.2, true);
      L3([[x0, h, z], [x0 + w, h, z]], i === lead ? A : INK, i === lead ? 1 : 0.8, i === lead ? 1.4 : 1, i === lead ? 1.2 : 0.6);
      const was = votesOf(r, c, m - 5); if (vs[i] > was && a === 1) { const p = P([x0 + w / 2, h, z]); if (p) dot(x, p, 1.4, BLUE, 1); }
      const lp = P([x0, -0.5, z]); if (lp && a === 1 && i === lead) text(x, String(vs[i]), lp[0], lp[1], 7.5, INK, far([0, 0, z]));
    });
  }
  /* Final: thirty lanes from thirty gates narrow into one gate; the pick's lane turns green */
  {
    const k = a === 2 ? u : 0, z0 = 27, z1 = 35, J: W3 = [0, 1.2, z1], landed = k > 0.78;
    for (let i = 0; i < n * top; i++) {
      if (x.f.empty?.includes(i)) continue;
      const gx = -3 + (6 * (i + 0.5)) / (n * top), lane = cl((k - (i / (n * top)) * 0.3) / 0.35), isP = i === pk;
      L3([[gx - 0.08, 0, z0], [gx - 0.08, 0.5, z0], [gx + 0.08, 0.5, z0], [gx + 0.08, 0, z0]], isP && landed ? A : INK, a === 2 ? 0.7 : 0.35, 0.7, 0.4);
      if (lane > 0) {
        const pts: W3[] = []; for (let s = 0; s <= 10; s++) { const q = (s / 10) * lane; pts.push([lerp(gx, J[0], q), lerp(0.25, J[1], q * q), lerp(z0, z1, q)]); }
        L3(pts, isP && landed ? A : INK, isP && landed ? 0.75 : 0.3, isP && landed ? 1 : 0.7, isP && landed ? 0.8 : 0.3);
      }
    }
    L3([[-1, 0, z1], [-1, 2.6, z1], [1, 2.6, z1], [1, 0, z1]], INK, landed ? 0.9 : 0.6, 1.2, 0.6);
    const lp = a ? P([-1, 3, z1]) : null; if (lp) text(x, landed ? 'THE PICK' : 'ONE PICK', lp[0], lp[1], 7.5, landed ? A : GREY, far([0, 0, z1]));
  }
  clearFlash(x, u, [0, 0, VW, VH]);
  text(x, ['BUILD', 'VOTE', 'FINAL'][a], 14, 168, 7.5, INK, 0.9);
}

/* =====================================================================================================
   The board, small
   ===================================================================================================== */
const DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function board(x: X, t: number) {
  const { a, u } = split(t), c = focusOf(x), A = acc(x), top = x.f.top;
  if (!c) return;
  const m = a === 0 ? lerp(c.start, c.buildEnd, cl(u / 0.94)) : a === 1 ? lerp(c.buildEnd, c.end, cl(u / 0.94)) : c.end;
  const rank = (mm: number) => c.seven.map((r, i) => ({ i, v: votesOf(r, c, mm), a: c.start + r.af * (c.buildEnd - c.start) })).filter((r) => r.a <= mm).sort((p, q) => q.v - p.v || p.a - q.a);
  /* the board refreshes every few minutes, the way a results board does, and the rows that changed flap */
  const Q = 5, mq = Math.floor(m / Q) * Q, now = rank(mq);
  /* the head */
  text(x, c.code + ' · ' + 'ENTRIES ' + countAt(c.entries, cl((m - c.start) / (c.buildEnd - c.start))), 14, 22, 7.5, GREY);
  const clk = hhmm(m + c.off), cw = segWidth(clk, 5, 10);
  digits(x, segText(clk, 306 - cw, 13, 5, 10).polys, INK, 0.9, 1);
  deco(x, [[[14, 28], [306, 28]]], DIM, 1, 0.8, 0);
  /* each slot flaps when what it shows changes: when did slot r last change? */
  const since = (r: number) => { const cur = now[r]?.i; for (let b = 1; b <= 4; b++) { const p = rank(mq - b * Q); if (p[r]?.i !== cur) return (b - 1) * Q + (m - mq); } return 99; };
  const lift = a === 2 ? eo(cl((u - 0.12) / 0.3)) : 0;
  for (let r = 0; r < 7; r++) {
    const y = 42 + r * 16, row = now[r];
    if (!row) { deco(x, [[[30, y], [200, y]]], DIM, 1, 0.6, 0); continue; }
    const name = c.seven[row.i].name.toUpperCase().slice(0, 16), age = since(r), dx = r < top ? lift * 10 : 0, fadeOut = r >= top && a === 2 ? 1 - lift * 0.7 : 1;
    const lead = r === 0 && a === 1;
    text(x, String(r + 1), 14 + dx, y, 7.5, lead ? A : GREY, fadeOut);
    /* the flap cycle: each letter turns through the drum before it lands */
    const shown = [...name].map((ch, k) => { const turn = (age / Q) * 3 - k * 0.08; return turn >= 1 ? ch : DRUM[Math.floor(hash(x.cfg.seed, Math.floor(age * 8), r, k) * DRUM.length)]; }).join('');
    text(x, shown, 30 + dx, y, 8.5, INK, 0.9 * fadeOut);
    const vs = String(row.v), vw = segWidth(vs, 4, 8);
    digits(x, segText(vs, 214 - vw + dx, y - 8, 4, 8).polys, lead ? A : INK, 0.9 * fadeOut, 0.9);
    const was = votesOf(c.seven[row.i], c, mq - Q); if (row.v > was && a < 2 && m - mq < Q * 0.6) dot(x, [220 + dx, y - 4], 1.2, BLUE, 1);
    if (r === top - 1 && a >= 1) { stroke(x, [[[14, y + 5], [226, y + 5]]], A, 0.55, 0.8, 0.6); if (a === 1) { text(x, 'TOP ' + top, 306, y + 2, 7.5, GREY, 1, 'right'); text(x, 'TO THE FINAL', 306, y + 14, 7.5, GREY, 1, 'right'); } }
  }
  /* Final: ten cities' top three as thirty lamps; the pick lights */
  if (a === 2) {
    const n = x.f.codes.length, pk = pickCell(x), picked = u > 0.7, ci = citiesOf(x).indexOf(c);
    for (let i = 0; i < n * top; i++) {
      const cx = 244 + Math.floor(i / top) * 6.4, cy = 52 + (i % top) * 9, on = u > 0.3 + Math.floor(i / top) * 0.02;
      if (x.f.empty?.includes(i) || !on) { deco(x, [rect(cx - 2, cy - 2, cx + 2, cy + 2)], DIM, 1, 0.6, 0); continue; }
      const isP = i === pk, mine = Math.floor(i / top) === ci;
      stroke(x, [rect(cx - 2, cy - 2, cx + 2, cy + 2)], isP && picked ? A : mine ? INK : LABEL, picked && !isP ? 0.35 : 0.9, isP && picked ? 1.3 : 0.8, isP && picked ? 1.6 : 0.4);
      if (isP && picked) fill(x, rect(cx - 1.2, cy - 1.2, cx + 1.2, cy + 1.2), A, 0.9);
    }
    text(x, picked ? 'THE PICK' : n * top + ' FINALISTS', 306, 92, 7.5, picked ? A : GREY, 1, 'right');
    const pc = citiesOf(x)[Math.floor(pk / top)];
    if (picked && pc) text(x, pc.code + ' ' + ordOf((pk % top) + 1), 306, 112, 11, INK, 1, 'right');
  }
  clearFlash(x, u, [0, 0, VW, VH]);
  text(x, ['BUILD', 'VOTE', 'FINAL'][a], 14, 168, 7.5, INK, 0.9);
}

export const DIRS: Record<Dir, (x: X, t: number) => void> = { globe, rack, plans, board };
