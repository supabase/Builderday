/* The pen: what a drawing asks of a tube. A scene says "a line here, this bright, this colour"; the pen decides how
   light gets there. Two pens draw the same scenes:
   - the canvas pen (2D canvas, a blur for the glow): the fallback where WebGL is missing, and today's look;
   - the beam pen (records lines for beam.ts, which works out the beam's light along each one).
   Coordinates are the drawing's 320 x 180 space. */

import { strokeText } from './font';

export type Pt = [number, number];
export type Poly = Pt[];
export type Align = 'left' | 'center' | 'right';
/* a word's extras: k names it (so a test can follow one number as it moves), keep sets it in the case given (a
   terminal line) instead of the labels' capitals, clip shows only the part of it inside a box (typing) */
export type WordOpt = { k?: string; keep?: boolean; clip?: [number, number, number, number] };

export interface Pen {
  readonly kind: 'canvas' | 'beam';
  /** beam length drawn so far in this frame, in drawing units (the budget counts it) */
  len: number;
  /** beam time drawn so far: length times brightness. A real beam crosses a dim line faster than a bright one, so this
      is what a beam's frame budget limits (the line direction's meter counts it) */
  time: number;
  /** true while drawing an afterglow pass (an earlier moment, dimmer): words and digits are not drawn then, so a
      number that changes never smears into the one before it */
  readonly ghost?: boolean;
  /** dwell: false for a line with no ends of its own (a closed shape, a grid line), so no bright dot sits on it */
  stroke(polys: Poly[], col: string, a: number, w: number, more: number, dwell?: boolean): void;
  /** one line whose brightness changes along it: a at each point (depth on the globe). No dwell at its ends */
  shade(p: Poly, a: ArrayLike<number>, col: string, w: number, more: number): void;
  dot(p: Pt, r: number, col: string, a: number, more: number): void;
  text(s: string, x: number, y: number, size: number, col: string, a: number, align: Align, face: 'mono' | 'sans', o?: WordOpt): void;
  /** a fill: only a flap face, a lit cell or a lit screen (rule 5) */
  fill(poly: Poly, col: string, a: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  /** an axis-aligned box that later lines are cut to (until restore) */
  clipRect(x0: number, y0: number, x1: number, y1: number): void;
}

export const plen = (p: Poly) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };

/* ---------- the canvas pen ---------- */
export type Fonts = { mono: string; sans: string };
export class CanvasPen implements Pen {
  readonly kind = 'canvas' as const;
  len = 0;
  time = 0;
  constructor(private c: CanvasRenderingContext2D, private k: number, private lw: number, private glowPx: number, private fo: Fonts) {
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
    c.setTransform(k, 0, 0, k, 0, 0);
  }
  private glow(col: string, more: number) { this.c.shadowColor = col; this.c.shadowBlur = this.glowPx * this.k * more; }
  stroke(polys: Poly[], col: string, a: number, w: number, more: number) {
    if (!polys.length || a <= 0) return;
    const c = this.c; c.save(); c.globalAlpha = Math.min(1, a); c.strokeStyle = col; c.lineWidth = this.lw * w; c.lineJoin = 'round'; c.lineCap = 'round'; this.glow(col, more);
    c.beginPath();
    for (const p of polys) { p.forEach((q, n) => (n ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); const L = plen(p); this.len += L; this.time += L * Math.min(1, a); }
    c.stroke(); c.restore();
  }
  shade(p: Poly, a: ArrayLike<number>, col: string, w: number, more: number) {
    /* the canvas has one alpha per path: the segments go into sixteen levels, one path each */
    const lv: Poly[][] = Array.from({ length: 16 }, () => []);
    for (let i = 1; i < p.length; i++) { const m = (a[i - 1] + a[i]) / 2; if (m <= 0.002) continue; lv[Math.min(15, Math.round(Math.min(1, m) * 15))].push([p[i - 1], p[i]]); }
    lv.forEach((segs, k) => { if (segs.length && k) this.stroke(segs, col, k / 15, w, more); });
  }
  dot(p: Pt, r: number, col: string, a: number, more: number) {
    if (a <= 0) return;
    const c = this.c; c.save(); c.globalAlpha = Math.min(1, a); c.fillStyle = col; this.glow(col, more); c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fill(); c.restore();
  }
  text(s: string, x: number, y: number, size: number, col: string, a: number, align: Align, face: 'mono' | 'sans', o?: WordOpt) {
    if (a <= 0) return;
    const c = this.c; c.save(); if (o?.clip) { c.beginPath(); c.rect(o.clip[0], o.clip[1], o.clip[2] - o.clip[0], o.clip[3] - o.clip[1]); c.clip(); } c.globalAlpha = Math.min(1, a); c.fillStyle = col; this.glow(col, 0.6); c.font = '500 ' + size + 'px ' + this.fo[face]; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(s, x, y); c.restore();
  }
  fill(poly: Poly, col: string, a: number) {
    if (a <= 0 || poly.length < 3) return;
    const c = this.c; c.save(); c.globalAlpha = Math.min(1, a); c.fillStyle = col; c.beginPath(); poly.forEach((q, n) => (n ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill(); c.restore();
  }
  save() { this.c.save(); }
  restore() { this.c.restore(); }
  translate(x: number, y: number) { this.c.translate(x, y); }
  scale(x: number, y: number) { this.c.scale(x, y); }
  clipRect(x0: number, y0: number, x1: number, y1: number) { const c = this.c; c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip(); }
}

/* ---------- the beam pen ---------- */
/* One record per straight piece of beam: x0 y0 x1 y1, r g b, line light (per unit of length), dwell light at each end,
   halo share, width. A point is a piece with no length and only dwell. */
export const REC = 12;
/* view: the screen in drawing units; a beam never leaves it, so what is off it is neither drawn nor counted */
/* words: keep each word to be set in the site's mono over the frame (paintWords), in place of stroke letters */
export type BeamOpts = { dwell: number; speed: number; gain: number; view?: [number, number]; words?: boolean };
/* a word to set over the beam frame: where (in the drawing's units, through the pen's transform m), how big, and the
   box it is cut to */
export type Word = { s: string; x: number; y: number; size: number; col: string; a: number; align: Align; m: number[]; clip: [number, number, number, number] | null; k?: string; keep?: boolean };
type M = [number, number, number, number, number, number];
const hexCache = new Map<string, [number, number, number]>();
export function rgb(col: string): [number, number, number] {
  let v = hexCache.get(col); if (v) return v;
  const h = col.replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  v = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; hexCache.set(col, v); return v;
}

export class BeamPen implements Pen {
  readonly kind = 'beam' as const;
  len = 0;
  time = 0;
  segs: number[] = [];
  tris: number[] = [];
  words: Word[] = [];
  get ghost() { return this.gain < 1; }
  private m: M = [1, 0, 0, 1, 0, 0];
  private clip: [number, number, number, number] | null = null;
  private stack: { m: M; clip: [number, number, number, number] | null }[] = [];
  /** every light this pen writes is multiplied by this (the afterglow passes turn it down) */
  gain = 1;
  constructor(private o: BeamOpts) { if (o.view) this.clip = [-2, -2, o.view[0] + 2, o.view[1] + 2]; }
  private tp(p: Pt): Pt { const m = this.m; return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }
  /* Liang-Barsky against the clip box */
  private cut(a: Pt, b: Pt): [Pt, Pt] | null {
    const c = this.clip; if (!c) return [a, b];
    let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
    const test = (p: number, q: number) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
    if (!test(-dx, a[0] - c[0]) || !test(dx, c[2] - a[0]) || !test(-dy, a[1] - c[1]) || !test(dy, c[3] - a[1])) return null;
    return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]];
  }
  private push(a: Pt, b: Pt, col: [number, number, number], lam: number, e0: number, e1: number, halo: number, w: number) {
    this.segs.push(a[0], a[1], b[0], b[1], col[0], col[1], col[2], lam, e0, e1, halo, w);
  }
  stroke(polys: Poly[], col: string, a: number, w: number, more: number, dwell = true) {
    if (a <= 0) return;
    const c = rgb(col), g = a * this.gain, o = this.o;
    for (const p of polys) {
      if (p.length < 2) continue;
      const q = p.map((x) => this.tp(x));
      for (let i = 1; i < q.length; i++) {
        const s = this.cut(q[i - 1], q[i]); if (!s) continue;
        const L = Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]); this.len += L; this.time += L * Math.min(1, a);
        /* a long, fast stroke is dimmer: the beam crosses it in the same time as a short one */
        const lam = g * Math.pow(Math.min(1, 14 / Math.max(L, 0.5)), o.speed * 0.5);
        /* the beam waits at the two ends of a line: they come out brighter */
        const e0 = dwell && i === 1 ? g * o.dwell * 0.35 : 0, e1 = dwell && i === q.length - 1 ? g * o.dwell * 0.35 : 0;
        this.push(s[0], s[1], c, lam, e0, e1, more, Math.sqrt(w));
      }
    }
  }
  shade(p: Poly, a: ArrayLike<number>, col: string, w: number, more: number) {
    const c = rgb(col), sw = Math.sqrt(w);
    let prev = this.tp(p[0]);
    for (let i = 1; i < p.length; i++) {
      const cur = this.tp(p[i]), m = Math.min(1, (a[i - 1] + a[i]) / 2) * this.gain, a0 = prev; prev = cur;
      if (m <= 0.002) continue;
      const s = this.cut(a0, cur); if (!s) continue;
      const L = Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]); this.len += L; this.time += L * m;
      this.push(s[0], s[1], c, m * Math.pow(Math.min(1, 14 / Math.max(L, 0.5)), this.o.speed * 0.5), 0, 0, more, sw);
    }
  }
  dot(p: Pt, r: number, col: string, a: number, more: number) {
    if (a <= 0) return;
    const q = this.tp(p), c = this.clip; if (c && (q[0] < c[0] || q[0] > c[2] || q[1] < c[1] || q[1] > c[3])) return;
    /* a point is all dwell: the brightest thing a beam draws */
    this.push(q, q, rgb(col), 0, a * this.gain * this.o.dwell * (0.6 + r * 0.35), 0, more, Math.max(0.7, Math.sqrt(r)));
  }
  text(s: string, x: number, y: number, size: number, col: string, a: number, align: Align, _face?: 'mono' | 'sans', o?: WordOpt) {
    if (a <= 0) return;
    /* the site's mono, set over the frame; or the stroke letters a vector display wrote in */
    if (this.o.words) {
      let clip = this.clip;
      if (o?.clip) { const p0 = this.tp([o.clip[0], o.clip[1]]), p1 = this.tp([o.clip[2], o.clip[3]]), b: [number, number, number, number] = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])]; clip = clip ? [Math.max(clip[0], b[0]), Math.max(clip[1], b[1]), Math.min(clip[2], b[2]), Math.min(clip[3], b[3])] : b; }
      this.words.push({ s, x, y, size, col, a: Math.min(1, a * this.gain), align, m: [...this.m], clip, k: o?.k, keep: o?.keep }); return;
    }
    this.stroke(strokeText(s, x, y, size, align), col, a * 0.95, 0.8, 0.6);
  }
  fill(poly: Poly, col: string, a: number) {
    if (a <= 0 || poly.length < 3) return;
    const c = rgb(col), q = poly.map((x) => this.tp(x)), g = a * this.gain;
    for (let i = 1; i < q.length - 1; i++) for (const p of [q[0], q[i], q[i + 1]]) this.tris.push(p[0], p[1], c[0] * g, c[1] * g, c[2] * g);
  }
  save() { this.stack.push({ m: [...this.m] as M, clip: this.clip }); }
  restore() { const s = this.stack.pop(); if (s) { this.m = s.m; this.clip = s.clip; } }
  translate(x: number, y: number) { const m = this.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
  scale(x: number, y: number) { const m = this.m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; }
  clipRect(x0: number, y0: number, x1: number, y1: number) {
    const a = this.tp([x0, y0]), b = this.tp([x1, y1]);
    const box: [number, number, number, number] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
    const c = this.clip; this.clip = c ? [Math.max(c[0], box[0]), Math.max(c[1], box[1]), Math.min(c[2], box[2]), Math.min(c[3], box[3])] : box;
  }
}

/* the words of a beam frame, set in the site's mono on the tube's canvas after the beam is drawn: capitals, as the
   site's small labels are, with half the glow the canvas pen gives text, so the words read as the site's labels lit, not as lines */
export function paintWords(c: CanvasRenderingContext2D, words: Word[], k: number, mono: string, glowPx: number) {
  for (const w of words) {
    if (w.a <= 0) continue;
    c.save(); c.setTransform(k, 0, 0, k, 0, 0);
    if (w.clip) { c.beginPath(); c.rect(w.clip[0], w.clip[1], w.clip[2] - w.clip[0], w.clip[3] - w.clip[1]); c.clip(); }
    c.transform(w.m[0], w.m[1], w.m[2], w.m[3], w.m[4], w.m[5]);
    c.globalAlpha = w.a * 0.92; c.fillStyle = w.col; c.shadowColor = w.col; c.shadowBlur = glowPx * k * 0.3;
    c.font = '500 ' + w.size + 'px ' + mono; c.textAlign = w.align; c.textBaseline = 'alphabetic';
    if ('letterSpacing' in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = (w.size * 0.02).toFixed(2) + 'px';
    c.fillText(w.s.toUpperCase(), w.x, w.y);
    c.restore();
  }
}

/* The words of a beam frame, each set once: a word (its text, size, colour and glow) is drawn the first time into a
   small canvas of its own, and every frame after only copies that canvas to a whole device pixel at the word's alpha.
   So no blur is set per word per frame, a word that stands still is the same pixels every frame (no shimmer), and a
   word that moves steps by whole pixels. Words under a turned or scaled pen fall back to paintWords. */
type Sprite = { cv: HTMLCanvasElement; ox: number; oy: number; w: number };
const SPRITES = new Map<string, Sprite>();
export function paintWordsCached(c: CanvasRenderingContext2D, words: Word[], k: number, mono: string, glowPx: number) {
  for (const w of words) {
    if (w.a <= 0.004) continue;
    if (w.m[0] !== 1 || w.m[1] !== 0 || w.m[2] !== 0 || w.m[3] !== 1) { paintWords(c, [w], k, mono, glowPx); continue; }
    const s = w.keep ? w.s : w.s.toUpperCase(), px = w.size * k, blur = glowPx * k * 0.3, key = s + '|' + px.toFixed(2) + '|' + w.col + '|' + blur.toFixed(2) + '|' + mono;
    let sp = SPRITES.get(key);
    if (!sp) {
      const cv = document.createElement('canvas'), g = cv.getContext('2d'); if (!g) continue;
      const font = '500 ' + px + 'px ' + mono, ls = (px * 0.02).toFixed(2) + 'px';
      g.font = font; if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = ls;
      const tw = Math.ceil(g.measureText(s).width), pad = Math.ceil(blur * 2 + 2);
      cv.width = tw + pad * 2; cv.height = Math.ceil(px * 1.5) + pad * 2;
      g.font = font; if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = ls;
      g.fillStyle = w.col; g.shadowColor = w.col; g.shadowBlur = blur; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
      g.fillText(s, pad, pad + Math.ceil(px * 1.1));
      sp = { cv, ox: pad, oy: pad + Math.ceil(px * 1.1), w: tw };
      if (SPRITES.size > 600) SPRITES.delete(SPRITES.keys().next().value as string);
      SPRITES.set(key, sp);
    }
    const ax = (w.x + w.m[4]) * k, ay = (w.y + w.m[5]) * k, left = w.align === 'left' ? ax : w.align === 'center' ? ax - sp.w / 2 : ax - sp.w;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    if (w.clip) { c.beginPath(); c.rect(w.clip[0] * k, w.clip[1] * k, (w.clip[2] - w.clip[0]) * k, (w.clip[3] - w.clip[1]) * k); c.clip(); }
    c.globalAlpha = Math.min(1, w.a * 0.92); c.drawImage(sp.cv, Math.round(left - sp.ox), Math.round(ay - sp.oy));
    c.restore();
  }
}
