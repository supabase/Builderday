/* seal.ts: the city seals. Line work cut the way a rose engine or geometric lathe cuts guilloche on a banknote.
   Every seal is a pure function of (config, city id): all variation comes from mulberry32 seeded by cfg.seed and the
   city id, so the saved JSON (saved/seal.config.json) reproduces the exact drawing. No dependencies, no DOM.

   Rules (fixed, never knobs): line work only (no fills, gradients, glow, shadow); one stroke weight per seal; closed
   curves only; monochrome ink (currentColor), green (--c-accent) only as the merged winner's stroke; fewer lines at
   small sizes, never thinner ones; all shape comes from the maths below, nothing is laid on top.

   Modes (one line of maths each):
     rosette    rose-engine envelope: families of r(t) = rm + a*W(L*t + psi) + offset, phase-stepped so they cross into a lattice
     band       braided bands: prolate trochoids wrapped on a circle (radial sin, tangential cos), F strands half a period apart
     medallion  a hypotrochoid core (R/r = L/q, closes after q turns) rotated into an envelope, framed by a rosette band and a band

   forCity(cfg, id, opts) and merged(cfg, ids, opts) return a SealSvg: the <svg> attributes and its paths, which
   components/seal/seal.tsx draws as JSX and toSvgString() writes out as a file.
   opts: { size (px, default 600), detail (0..1, default from size), stroke (px, overrides cfg.weight), cfg (partial
   overrides), draw (adds pathLength and --k for the stroke-dashoffset replay), plot (export: paths only, black, mm) } */

export type SealMode = 'rosette' | 'band' | 'medallion';
export const MODES: SealMode[] = ['rosette', 'band', 'medallion'];
export const KNOBS = ['lobes', 'rings', 'amp', 'inner', 'drift', 'density', 'interlace', 'harmonic', 'loop', 'gap', 'rails'] as const;
export type Knob = typeof KNOBS[number];
export type ModeKnobs = Record<Knob, number>;
export type SealCfg = { seed: number; mode: SealMode; weight: number; startMark: boolean; continuous: boolean } & Record<SealMode, ModeKnobs>;
/* a saved or partial config, as read from JSON */
export type SealCfgInput = Partial<Omit<SealCfg, SealMode>> & Partial<Record<SealMode, Partial<ModeKnobs>>> & Record<string, unknown>;

export const DEF: SealCfg = {
  seed: 1207, mode: 'rosette', weight: 1, startMark: true, continuous: false,
  rosette: { lobes: 13, rings: 2, amp: 45, inner: 30, drift: 55, density: 16, interlace: 2, harmonic: 20, loop: 40, gap: 14, rails: 2 },
  band: { lobes: 17, rings: 2, amp: 55, inner: 46, drift: 8, density: 8, interlace: 2, harmonic: 0, loop: 62, gap: 18, rails: 2 },
  medallion: { lobes: 11, rings: 2, amp: 50, inner: 44, drift: 45, density: 12, interlace: 2, harmonic: 15, loop: 40, gap: 14, rails: 2 },
};
/* [min, max, step]. Each bound was rendered alone and all-min / all-max together at 200 and 440px in all three modes. */
export const BOUNDS: Record<'seed' | 'weight' | Knob, [number, number, number]> = {
  seed: [1, 99999, 1], weight: [0.5, 1.5, 0.25],
  lobes: [8, 28, 1], rings: [1, 4, 1], amp: [15, 85, 1], inner: [16, 60, 1], drift: [0, 100, 1], density: [6, 28, 1],
  interlace: [1, 4, 1], harmonic: [0, 60, 1], loop: [0, 100, 1], gap: [0, 30, 1], rails: [0, 3, 1],
};
export const SEAL_CITIES = ['seoul', 'singapore', 'peshawar', 'nouakchott', 'london', 'rosario', 'santiago', 'manta', 'new-york', 'toronto', 'san-salvador', 'austin', 'mexico-city', 'san-francisco'];
const TAU = Math.PI * 2;

export function mulberry32(a: number): () => number { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function fnv(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function gcd(a: number, b: number): number { while (b) { const t = b; b = a % b; a = t; } return a; }
function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }

function num(v: unknown, k: keyof typeof BOUNDS, d: number): number { const b = BOUNDS[k]; let n = +(v as number); if (v === '' || v == null || !isFinite(n)) n = d; n = Math.round(n / b[2]) * b[2]; return clamp(+n.toFixed(4), b[0], b[1]); }
export function clampCfg(c?: SealCfgInput | SealCfg | null): SealCfg {
  const s = (c || {}) as SealCfgInput;
  const o = { seed: num(s.seed, 'seed', DEF.seed), mode: MODES.indexOf(s.mode as SealMode) < 0 ? DEF.mode : s.mode as SealMode, weight: num(s.weight, 'weight', DEF.weight),
    startMark: s.startMark == null ? DEF.startMark : !!s.startMark, continuous: s.continuous == null ? DEF.continuous : !!s.continuous } as SealCfg;
  MODES.forEach((m) => { const src = (s[m] || {}) as Partial<ModeKnobs>, d = DEF[m]; const out = {} as ModeKnobs; KNOBS.forEach((k) => { out[k] = num(src[k], k, d[k]); }); o[m] = out; });
  return o;
}
function mergeCfg(base: SealCfg, over?: SealCfgInput): SealCfg {
  const o = JSON.parse(JSON.stringify(base)) as Record<string, unknown>; if (!over) return clampCfg(o as SealCfgInput);
  Object.keys(over).forEach((k) => { const v = over[k]; if (MODES.indexOf(k as SealMode) >= 0 && v && typeof v === 'object') Object.assign((o[k] = o[k] || {}) as object, v); else o[k] = v; });
  return clampCfg(o as SealCfgInput);
}

/* ---- path writing: sampled closed curves become Catmull-Rom cubics ---- */
type Pt = [number, number];
type Curve = { pts: Pt[]; k: number };
class Pen {
  p: number; paths: Curve[] = [];
  constructor(dec: number) { this.p = Math.pow(10, dec); }
  f(n: number): string { return String(Math.round(n * this.p) / this.p); }
  curve(pts: Pt[], k: number) { this.paths.push({ pts, k }); }
}
function cubic(pen: Pen, pts: Pt[], join: boolean): string {
  const n = pts.length, f = (v: number) => pen.f(v); let s = (join ? 'L' : 'M') + f(pts[0][0]) + ' ' + f(pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    s += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
  }
  return join ? s : s + 'Z';
}
const START = -Math.PI / 2;   /* every curve starts at 12 o'clock, so a continuous pen only steps radially between curves */
function circle(r: number, n: number): Pt[] { const pts: Pt[] = []; for (let i = 0; i < n; i++) { const t = START + TAU * i / n; pts.push([r * Math.cos(t), r * Math.sin(t)]); } return pts; }

type Base = { amp: number; drift: number; h: number; hp: number; lean: number; loop: number };
type BandSpec = Base & { r0: number; r1: number; L: number; F: number; kind: 'loop' | 'mesh'; guard: number; psi: number; c: number; px: number };
/* one annulus [r0, r1] cut with F interlaced families of c curves each */
function band(pen: Pen, b: BandSpec, kbase: number, kspan: number) {
  const rm = (b.r0 + b.r1) / 2, hw = (b.r1 - b.r0) / 2, L = b.L, F = b.F; let c = b.c;
  let a = Math.min(hw * b.amp, (b.guard || 0.8) * rm / L);   /* slope guard: a wave never steeper than 0.8 (1.3 for the few lines of a row marker), so no knob makes a hairball */
  let spread = Math.max(0, hw - a); const rho = b.loop * 2.1, S = b.kind === 'loop' ? 13 : 7, N = L * S; let total = F * c, idx = 0;
  if (b.kind === 'loop') { a = Math.min(hw * 0.92, a + spread * 0.5); spread = hw - a; }
  if (b.px) c = Math.min(c, 1 + Math.floor(2 * spread * (b.kind === 'loop' ? 0.55 : 1) * b.px / 3));   /* parallel lines in a strand at least ~3px apart */
  total = F * c;
  for (let f = 0; f < F; f++) for (let j = 0; j < c; j++) {
    const t = c > 1 ? j / (c - 1) - 0.5 : 0, off = t * 2 * spread * (b.kind === 'loop' ? 0.55 : 1);
    const psi = b.psi + f * TAU / F + b.drift * Math.PI * t * 2 * b.lean, pts: Pt[] = [];
    for (let i = 0; i < N; i++) {
      const th = START + TAU * i / N, x = L * (th - START) + psi; let r: number, tt: number;
      if (b.kind === 'loop') { r = rm + off + a * Math.sin(x); tt = th + b.lean * (rho / L) * Math.cos(x); }
      else { r = rm + off + a * (Math.sin(x) + b.h * Math.sin(2 * x + b.hp)) / (1 + b.h); tt = th; }
      pts.push([r * Math.cos(tt), r * Math.sin(tt)]);
    }
    pen.curve(pts, kbase + kspan * (idx++ / Math.max(1, total)));
  }
}
type CoreSpec = Base & { r: number; L: number; q: number; F: number; c: number; psi: number };
/* hypotrochoid core: R/r = L/q in lowest terms, so it closes after q turns with L lobes; rotated copies make the envelope */
function core(pen: Pen, b: CoreSpec, kbase: number, kspan: number) {
  let q = Math.max(1, b.q); const L = Math.min(b.L, Math.floor(56 / q)); while (q > 1 && gcd(L, q) !== 1) q--;   /* lobes x turns capped, or the core fills in */
  const Rr = L - q, d = q * (0.35 + b.amp * 1.1), sc = b.r / (Rr + d), w = Rr / q, N = Math.round(L * 12 * Math.min(q, 3) + 60); let idx = 0;
  const cc = Math.max(1, Math.min(b.c, Math.floor(10 / (q * b.F)))), total = b.F * cc;
  for (let f = 0; f < b.F; f++) for (let j = 0; j < cc; j++) {
    const rot = b.psi / L + f * TAU / (L * b.F) + (cc > 1 ? (j / (cc - 1) - 0.5) : 0) * b.drift * (TAU / L) * b.lean, pts: Pt[] = [];
    const shrink = cc > 1 ? 1 - 0.18 * j / (cc - 1) * (1 - b.drift) : 1;
    for (let i = 0; i < N; i++) {
      const t = TAU * q * i / N, x = Rr * Math.cos(t) + d * Math.cos(w * t), y = Rr * Math.sin(t) - d * Math.sin(w * t);
      const ang = Math.atan2(y, x) + rot + START, rad = Math.sqrt(x * x + y * y) * sc * shrink;
      pts.push([rad * Math.cos(ang), rad * Math.sin(ang)]);
    }
    pen.curve(pts, kbase + kspan * (idx++ / Math.max(1, total)));
  }
}

/* the city's genes: lobe count (distinct for each of the ten under one seed), phase, lean, harmonic phase, ring multipliers */
function genes(seed: number, city: string | null) {
  const i = city == null ? -1 : SEAL_CITIES.indexOf(city), R = mulberry32((seed * 2654435761) ^ (city == null ? 0 : fnv(city))), P = mulberry32(seed * 7919 + 13);
  const offs = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5]; for (let k = offs.length - 1; k > 0; k--) { const s = Math.floor(P() * (k + 1)), tmp = offs[k]; offs[k] = offs[s]; offs[s] = tmp; }
  const dl = city == null ? 0 : i >= 0 ? offs[i] : (fnv(city) % 10) - 4;
  return { dl, psi: R() * TAU, lean: R() < 0.5 ? -1 : 1, hp: R() * TAU, mult: [1, R() < 0.5 ? 2 : 1, R() < 0.4 ? 0.5 : 1, R() < 0.5 ? 2 : 1], fShift: R() < 0.5 ? 0 : 1, qShift: Math.floor(R() * 2) };
}

export type SealOpts = { size?: number; detail?: number | null; stroke?: number; cfg?: SealCfgInput; draw?: boolean; plot?: boolean; city?: string; only?: string };
type Levels = { size: number; d: number; tiny: boolean; dec: number };
function levels(o: SealOpts): Levels {
  const size = o.size || 600, d = o.detail != null ? clamp(+o.detail, 0, 1) : clamp((size - 16) / 480, 0, 1);
  return { size, d, tiny: d < 0.06, dec: o.plot || o.draw ? 2 : 1 };
}
function lines(c: number, F: number, L: Levels): number { const per = Math.max(1, Math.round(c / F)); return L.tiny ? 1 : Math.max(1, Math.round(per * (0.22 + 0.78 * L.d))); }

/* lay out one seal into the pen. k is the replay order (0 = first stroke). */
function draw(pen: Pen, cfg: SealCfg, city: string | null, L: Levels) {
  const m = cfg[cfg.mode], g = genes(cfg.seed, city), RO = 94; let i: number;
  const rails = L.tiny ? Math.min(1, m.rails) : m.rails, railGap = 2.2, Rb = RO - (rails ? rails * railGap + 1.6 : 0);
  for (i = 0; i < rails; i++) pen.curve(circle(RO - i * railGap, 96), 0);
  const sigL = L.tiny ? Math.max(4, Math.round((m.lobes + g.dl) / 2.2)) : m.lobes + g.dl, base: Base = { amp: m.amp / 100, drift: m.drift / 100, h: m.harmonic / 100, hp: g.hp, lean: g.lean, loop: m.loop / 100 };
  let F = Math.max(1, Math.min(4, m.interlace + (L.tiny ? 0 : g.fShift * (m.interlace < 4 && m.interlace > 1 ? 1 : 0))));
  if (L.tiny) F = Math.min(F, 2);
  let Ri = Rb * m.inner / 100; const n = L.tiny ? 1 : Math.max(1, Math.min(m.rings, Math.round(m.rings * (0.45 + 0.55 * L.d) + 0.2)));
  if (cfg.mode === 'medallion') {
    const ringsM = L.tiny ? 0 : n, gapU = (Rb - Ri) * m.gap / 100 / Math.max(1, ringsM);
    core(pen, { ...base, r: L.tiny ? Rb * 0.9 : Ri - gapU * 0.5, L: sigL, q: 1 + Math.round(m.loop / 50) + g.qShift, F: L.tiny ? 1 : F, c: L.tiny ? 1 : Math.max(1, Math.min(Math.round(lines(m.density, F, L) * 0.6), Math.floor((6 + 14 * L.d) / F))), psi: g.psi }, 0.55, 0.45);
    if (!ringsM) return;
    Ri += gapU * 0.5;
  }
  let cB = lines(m.density, F, L); const budget = Math.round(10 + 40 * L.d);   /* line budget: the whole seal never holds more curves than its size can carry */
  if (n * F * cB > budget) cB = Math.max(1, Math.floor(budget / (n * F)));
  const span = Rb - Ri, wn = span / n, gp = wn * m.gap / 100, w = wn - gp * (n - 1) / n;
  cB = Math.min(cB, Math.max(1, Math.floor(Math.min(w, Rb * 0.42) * L.size / 200 / 2.6 / F)));   /* and never closer than about 2.6px apart on average */
  for (let k = 0; k < n; k++) {
    const r1 = Rb - k * (w + gp); let r0 = r1 - Math.min(w, Rb * 0.42), r1b = r1;   /* a band wider than this stops reading as a band */
    const rmk = (r0 + r1) / 2, mult = g.mult[k % 4], Lk = k === 0 ? sigL : Math.max(5, Math.round(sigL * mult * Math.pow(rmk / (Rb - w / 2), 0.85)));
    const kind = cfg.mode === 'band' ? 'loop' : cfg.mode === 'medallion' ? (k % 2 ? 'loop' : 'mesh') : 'mesh';
    if (L.tiny && cfg.mode === 'band') { r0 = Rb * 0.42; r1b = Rb; }
    if (L.tiny && cfg.mode === 'rosette') { r0 = Rb * 0.3; r1b = Rb; }
    if (k > 0 && gp > 3.2 && rails && !L.tiny) pen.curve(circle(r1b + gp / 2, 96), 0.02 + k * 0.05);
    band(pen, { ...base, r0, r1: r1b, L: Lk, F, kind, guard: L.tiny ? 1.3 : 0.8 + 0.5 * (1 - L.d), psi: g.psi + k * Math.PI / Lk, c: cB, px: L.size / 200 }, 0.05 + k * 0.5 / n, 0.5);
  }
}

export type SealPath = { d: string; k?: string; start?: boolean };
export type SealSvg = {
  size: number; plot: boolean; strokeWidth: string; nonScaling: boolean; pathLength: boolean; paths: SealPath[];
  className: string; city?: string; label: string; accent?: boolean;
};
function out(pen: Pen, cfg: SealCfg, L: Levels, o: SealOpts, meta: { className: string; city?: string; label: string; accent?: boolean }): SealSvg {
  const size = L.size, wpx = o.stroke != null ? +o.stroke : cfg.weight, cont = !!cfg.continuous, plot = !!o.plot, body: SealPath[] = [];
  pen.paths.sort((a, b) => a.k - b.k);
  /* weight is in px at the rendered size. Drawable seals carry it in user units instead of non-scaling-stroke, because
     Chrome measures dashes in screen space under non-scaling-stroke and the replay would break up. */
  const user = plot || !!o.draw, sw = user ? pen.f(wpx * 200 / (plot ? 600 : size)) : String(wpx);
  if (cont) {
    let d = ''; for (let i = 0; i < pen.paths.length; i++) d += cubic(pen, pen.paths[i].pts, i > 0);
    body.push({ d, k: o.draw ? '0' : undefined });
  } else for (let i = 0; i < pen.paths.length; i++) body.push({ d: cubic(pen, pen.paths[i].pts, false), k: o.draw ? pen.f(pen.paths[i].k) : undefined });
  if (cfg.startMark && !L.tiny && size >= 200 && pen.paths.length) {   /* the pen's start: a small closed circle around the first point */
    const p = pen.paths[0].pts[0], rr = 5 * 200 / size;
    const mk = circle(rr, 24).map((q): Pt => [q[0] + p[0], q[1] + p[1]]);
    body.push({ d: cubic(pen, mk, false), start: true, k: o.draw ? '0' : undefined });
  }
  return { size, plot, strokeWidth: sw, nonScaling: !user, pathLength: !!o.draw, paths: body, ...meta };
}

function baseCfg(saved: SealCfg | null, o?: SealOpts): SealCfg { return mergeCfg(saved || DEF, o && o.cfg); }
export function render(cfg: SealCfg | SealCfgInput, o: SealOpts = {}): SealSvg {
  const c = clampCfg(cfg as SealCfgInput), L = levels(o), pen = new Pen(L.dec); draw(pen, c, o.city == null ? null : o.city, L);
  return out(pen, c, L, o, o.city ? { className: 'seal', city: o.city, label: 'Seal of ' + o.city } : { className: 'seal', label: 'Seal' });
}
/* saved: the saved config (or null for the defaults) */
export function forCity(saved: SealCfg | null, id: string, o: SealOpts = {}): SealSvg { const cfg = baseCfg(saved, o); return render(cfg, { ...o, city: String(id) }); }

/* the winner: the ten city seals interlaced. Each city's own seal (the same genes, cut at the smaller size it gets here)
   sits on a ring in the given order, clockwise from 12 o'clock, turned to face out, overlapping its neighbours the way
   a geometric lathe repeats one rosette around a centre. Shared rails hold the ring. Green, stroke only.
   opts.only = a city id keeps that city's seal and the rails only (for hover or a reveal). */
export function merged(saved: SealCfg | null, idsIn: string[] | null, o: SealOpts = {}): SealSvg {
  const ids = (idsIn && idsIn.length ? idsIn : SEAL_CITIES).slice(0, 12).map(String);
  const cfg = baseCfg(saved, o), L = levels(o), pen = new Pen(L.dec), RO = 94, n = ids.length;
  const sub = Math.min(0.36, 2.75 / n) * RO, rho = RO - 3.4 - sub, subL = levels({ size: Math.max(8, L.size * sub / 100), detail: o.detail != null ? o.detail * 0.3 : null });
  const bare = L.size < 48;   /* at row-marker size each city keeps one wave line, no rail, or the ten fill in */
  pen.curve(circle(RO, 120), 0); if (!L.tiny) pen.curve(circle(RO - 2, 120), 0);
  if (!bare) pen.curve(circle(rho - sub - 2.2, 96), 0.02);
  for (let i = 0; i < n; i++) {
    if (o.only && o.only !== ids[i]) continue;
    const sp = new Pen(L.dec); let sc = cfg; if (bare) { sc = JSON.parse(JSON.stringify(cfg)); sc[cfg.mode].rails = 0; sc[cfg.mode].interlace = 1; }
    draw(sp, sc, ids[i], subL);
    const phi = START + TAU * i / n, cx = rho * Math.cos(phi), cy = rho * Math.sin(phi), rot = phi - START, cs = Math.cos(rot), sn = Math.sin(rot), s = sub / RO;
    sp.paths.forEach((p) => {
      pen.curve(p.pts.map((q): Pt => { const x = q[0] * s, y = q[1] * s; return [cx + x * cs - y * sn, cy + x * sn + y * cs]; }), 0.05 + 0.95 * (i + p.k * 0.9) / n);
    });
  }
  return out(pen, cfg, L, o, { className: 'seal seal-merged', label: 'Winner seal: ' + n + ' city seals interlaced', accent: true });
}

/* the same drawing as one standalone SVG document (the share card, the plotter export) */
export function toSvgString(s: SealSvg): string {
  const ve = s.nonScaling ? ' vector-effect="non-scaling-stroke"' : '', pl = s.pathLength ? ' pathLength="1"' : '';
  const body = s.paths.map((p) => '<path' + (p.start ? ' class="seal-start"' : '') + ' d="' + p.d + '"' + ve + pl + (p.k != null ? ' style="--k:' + p.k + '"' : '') + '/>').join('');
  const color = s.plot ? 'stroke="#000"' : 'stroke="currentColor"', dim = s.plot ? 'width="150mm" height="150mm"' : 'width="' + s.size + '" height="' + s.size + '"';
  const extra = s.accent ? ' class="' + s.className + '" style="color: var(--c-accent)" role="img" aria-label="' + s.label + '"' : ' class="' + s.className + '"' + (s.city ? ' data-city="' + s.city + '"' : '') + ' role="img" aria-label="' + s.label + '"';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" ' + dim + ' fill="none" ' + color + ' stroke-width="' + s.strokeWidth + '" stroke-linecap="round" stroke-linejoin="round"' + extra + '>' + body + '</svg>';
}
