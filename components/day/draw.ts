/* What every drawing shares: the colours, the seeded numbers, and the helpers that hand lines to the pen (pen.ts).
   The old scenes (scope.ts) and the directions (acts.ts) both draw through these, so either pen can draw any scene. */

import type { Align, Pen, Poly, Pt } from './pen';
import type { ScopeCfg } from './scope';
import type { LineMo, Press } from './line';
import { plen } from './pen';

export type { Pt, Poly } from './pen';

/* One city as the drawings need it: where it is, its session in UTC minutes, and its seven leading entries with each
   one's final votes, curve and arrival, from the day model (lib/day-data.ts), so a drawing's numbers are the model's. */
export type Seven = { name: string; v: number; e: number; af: number };
export type CityFact = { id: string; code: string; lat: number; lon: number; off: number; start: number; buildEnd: number; end: number; entries: number; seven: Seven[] };
/* finalists: how many made the final; empty: the cells (city x top + place) no finalist fills; pick: the picked cell
   (city x top + place) once the pick is made, so the drawing never lights a different one from the page; cities: the
   ten, east to west, for the directions; pickAt: when the pick is made, in UTC minutes */
export type Facts = {
  buildMin: number; voteAfter: number; startHour: number; codes: string[]; top: number; finalists?: number; pick?: number; empty?: number[];
  cities?: CityFact[]; pickAt?: number; seedPick?: number;
  /* city: the page's own city (a city page), so the drawing follows a project there; prize: the pick's prize as words */
  city?: string; prize?: string;
  /* who picks the one from the finalists, in the event's own words */
  pickers?: string;
  /* what first place in each city wins, as words ("a MacBook Neo") */
  cityPrize?: string;
};
export const finN = (f: Facts) => f.finalists ?? f.codes.length * f.top;
export const VW = 320, VH = 180;

export const INK = '#f4f4f2', BLUE = '#4d6bff', ORANGE = '#ff7a1a', GREEN = '#3ecf8e', GREY = '#6b6c6b', LABEL = '#a3a39f', DIM = '#2b2c2c', FLASH = '#e4e9ff', FACE = '#151616';

/* later: decorations wait here and are drawn after everything else, while the beam budget lasts (rule 4) */
/* from: when a step was jumped to, the moment of the day the jump left (t, 0 to 3); the act's opening move starts
   there instead of at the end of the act before it */
/* small: the tube is drawn small (under 480px wide: the sheet, a phone), so its words are fewer and larger */
/* press: a press on a step in the line direction (line.ts), in flight; mo: the site's motion values it plays to */
export type X = { pen: Pen; cfg: ScopeCfg; f: Facts; boost: number; frame: number; ph: number; later?: (() => void)[]; from?: number; small?: boolean; press?: Press; mo?: Partial<LineMo> };

/* the accent: green by our rule (now, the leader, the cut, the pick, you); the lab can still show the old orange */
export const acc = (x: X) => (x.cfg.accent === 'orange' ? ORANGE : GREEN);

/* seeded numbers: the same seed and index always give the same value */
export function hash(...n: number[]): number {
  let h = 2166136261 >>> 0;
  for (const v of n) { h ^= Math.floor(v * 1000) | 0; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; }
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
export const cl = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const eio = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const eo = (t: number) => 1 - Math.pow(1 - t, 3);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (m: number) => pad(Math.floor((((m / 60) % 24) + 24) % 24)) + ':' + pad(Math.floor(((m % 60) + 60) % 60));
export const ordOf = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'ST' : n % 10 === 2 && n % 100 !== 12 ? 'ND' : n % 10 === 3 && n % 100 !== 13 ? 'RD' : 'TH');
export const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
/* the share of the loop before the hold */
export const act = (x: X, ph = x.ph) => cl(ph / Math.max(0.05, 1 - x.cfg.hold));

/* --- drawing --- */
function jit(x: X, p: Pt, i: number): Pt {
  const j = x.cfg.jitter; if (!j) return p;
  return [p[0] + (hash(x.cfg.seed, x.frame, i, 1) - 0.5) * j, p[1] + (hash(x.cfg.seed, x.frame, i, 2) - 0.5) * j];
}
export function stroke(x: X, polys: Poly[], col: string, a = 1, w = 1, more = 1) {
  if (!polys.length || a <= 0) return;
  let i = 0; const q = x.cfg.jitter ? polys.map((p) => p.map((pt) => jit(x, pt, i++))) : polys;
  x.pen.stroke(q, col, Math.min(1, a), w, more * x.boost);
}
/* a line that can be dropped: past the beam budget it is not drawn (rule 4). Draw what matters first. */
export function strokeOpt(x: X, polys: Poly[], col: string, a = 1, w = 1, more = 1) {
  const L = polys.reduce((s, p) => s + plen(p), 0);
  if (x.pen.len + L > x.cfg.budget) return false;
  stroke(x, polys, col, a, w, more); return true;
}
/* a decoration (a frame, a ground line, an unlit lamp): drawn last, and the first thing dropped past the budget */
export function deco(x: X, polys: Poly[], col: string, a = 1, w = 1, more = 1) {
  if (x.later) x.later.push(() => strokeOpt(x, polys, col, a, w, more)); else strokeOpt(x, polys, col, a, w, more);
}
export function dot(x: X, p: Pt, r: number, col: string, a = 1, more = 1.4) { x.pen.dot(p, r, col, Math.min(1, a), more * x.boost); }
export function text(x: X, s: string, px: number, py: number, size: number, col: string, a = 1, align: Align = 'left', face: 'mono' | 'sans' = 'mono') {
  if (x.pen.ghost) return;
  if (col === GREY) col = LABEL; if (size < 10) size = 10;
  x.pen.text(s, px, py, size, col, Math.min(1, a), align, face);
}
export function fill(x: X, poly: Poly, col: string, a = 1) { x.pen.fill(poly, col, a); }
export function rect(x0: number, y0: number, x1: number, y1: number): Poly { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]; }
export function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 24): Poly {
  const p: Poly = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return p;
}
export { plen };
/* the first share t of a drawing, by length, and where the beam is */
export function cut(polys: Poly[], t: number): { out: Poly[]; head: Pt | null } {
  const total = polys.reduce((s, p) => s + plen(p), 0); let left = total * cl(t); const out: Poly[] = []; let head: Pt | null = null;
  for (const p of polys) {
    if (left <= 0) break; const q: Poly = [p[0]];
    for (let i = 1; i < p.length; i++) {
      const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (d <= left) { q.push(p[i]); left -= d; head = p[i]; } else { const r = left / d; head = [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * r, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * r]; q.push(head); left = 0; break; }
    }
    out.push(q);
  }
  return { out, head: t >= 1 ? null : head };
}
/* a beam drawing on: the drawn part in ink, the head a hot dot */
export function drawOn(x: X, polys: Poly[], t: number, col = INK, a = 0.9) {
  const { out, head } = cut(polys, t); stroke(x, out, col, a); if (head) dot(x, head, 1.6 * x.cfg.lw, FLASH, 1);
}

/* segment digits, drawn as the home's countdown is (components/board/segment.tsx): seven strokes per digit with a
   small gap where they meet, the digit slanted 6 degrees, every digit the same advance (1.3 of its width), a colon
   half a digit; the strokes that are off are kept (off) so they can be drawn faintly, as on the countdown */
const SEG: Record<string, [number, number, number, number]> = { a: [0.12, 0, 0.88, 0], b: [1, 0.06, 1, 0.47], c: [1, 0.53, 1, 0.94], d: [0.12, 1, 0.88, 1], e: [0, 0.53, 0, 0.94], f: [0, 0.06, 0, 0.47], g: [0.12, 0.5, 0.88, 0.5] };
const DIG: Record<string, string> = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', $: 'afgcd', '-': 'g' };
const SLANT = Math.tan((6 * Math.PI) / 180);
export function segText(s: string, x0: number, y0: number, w: number, h: number): { polys: Poly[]; off: Poly[]; width: number } {
  const polys: Poly[] = [], off: Poly[] = []; let x = x0; const adv = w * 1.3, sk = (px: number, py: number): Pt => [px + (y0 + h - py) * SLANT, py];
  for (const ch of s) {
    if (ch === ':') { const d = Math.max(0.6, w * 0.12); for (const fy of [0.3, 0.72]) polys.push([sk(x + d, y0 + h * fy), sk(x + d, y0 + h * fy + d * 1.2)]); x += w * 0.5; continue; }
    if (ch === ',') { polys.push([sk(x + 2, y0 + h * 0.92), sk(x, y0 + h * 1.12)]); x += w * 0.5; continue; }
    if (ch === ' ') { x += w * 0.6; continue; }
    const segs = DIG[ch]; if (!segs) { x += adv; continue; }
    /* a 1 stands in the middle of its space, so "51" never reads as "5 1"; it keeps no faint strokes beside it */
    if (ch === '1') { for (const sg of ['b', 'c']) { const [, b1, , d1] = SEG[sg]; polys.push([sk(x + w / 2, y0 + b1 * h), sk(x + w / 2, y0 + d1 * h)]); } x += adv; continue; }
    for (const [sg, [a, b, c, d]] of Object.entries(SEG)) (segs.includes(sg) ? polys : off).push([sk(x + a * w, y0 + b * h), sk(x + c * w, y0 + d * h)]);
    if (ch === '$') polys.push([sk(x + w / 2, y0 - h * 0.14), sk(x + w / 2, y0 + h * 1.14)]);
    x += adv;
  }
  return { polys, off, width: x - (adv - w) - x0 };
}
/* segment digits, drawn like words: not in an afterglow pass, a crisp core and little halo */
export function digits(x: X, polys: Poly[], col: string, a = 1, w = 1, more = 1) { if (!x.pen.ghost) stroke(x, polys, col, a, w * 1.15, more * 0.2); }
/* a number on the clock: the lit strokes, and the ones that are off faintly, as the home's countdown */
export function clock(x: X, s: string, x0: number, y0: number, w: number, h: number, col: string, a = 1, lw = 1.1) {
  if (x.pen.ghost) return 0;
  const g = segText(s, x0, y0, w, h);
  stroke(x, g.off, INK, 0.025 * a, lw, 0);
  digits(x, g.polys, col, a, lw);
  return g.width;
}
export const segWidth = (s: string, w: number, h: number) => segText(s, 0, 0, w, h).width;

/* the phosphor: a hit flashes blue-white and turns blue; with the green accent it fades to white (blue is for what
   just arrived, rule 6); with the old orange accent it fades through an orange afterglow, as the first tubes did */
export function p7(x: X, age: number): [string, number] {
  if (age < 0) return [INK, 0];
  if (age < 0.06) return [FLASH, 1];
  if (age < 0.2) return [BLUE, 1 - ((age - 0.06) / 0.14) * 0.25];
  return [x.cfg.accent === 'orange' ? ORANGE : INK, Math.max(0, 0.75 * (1 - (age - 0.2) / 0.8))];
}
export const pickOf = <T,>(x: X, list: T[], salt: number) => list[Math.floor(hash(x.cfg.seed, salt) * list.length) % list.length];
/* the picked cell: the page's own once known, else the model's sample day */
export function pickCell(x: X): number {
  const n = x.f.codes.length * x.f.top; let p = x.f.pick ?? x.f.seedPick ?? Math.floor(hash(x.cfg.seed, 80) * n);
  while (x.f.empty?.includes(p) && x.f.empty.length < n) p = (p + 1) % n;
  return p;
}
