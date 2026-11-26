/* The prize photos in the site's print. The press photo is keyed off its ground (its own alpha, or a flood from the
   border by colour), cropped to the product, set on the night ground at the bottom of its box, and printed as
   1-bit dither (Atkinson), halftone dots, characters, a grey duotone, or the photo itself. Every value comes from the
   look; the same look and the same photo draw the same picture. The drawing takes a 2D context and nothing else. */

export const PHOTOS = ['pro', 'mini', 'neo', 'quest'] as const;
export type Photo = (typeof PHOTOS)[number];
export const PHOTO_SRC: Record<Photo, string> = { pro: '/prizes/pro.jpg', mini: '/prizes/mini.jpg', neo: '/prizes/neo.jpg', quest: '/prizes/quest.png' };

/* each laptop's screen in its photo (source px), measured: the press photo's own picture there is replaced */
export const SCREEN: Partial<Record<Photo, { x: number; y: number; w: number; h: number }>> = {
  pro: { x: 50, y: 70, w: 883, h: 553 }, neo: { x: 150, y: 91, w: 680, h: 428 },
};
export const SCREENS = ['code', 'dark', 'photo'] as const;
export type Screen = (typeof SCREENS)[number];

export const MODES = ['dither', 'halftone', 'ascii', 'duotone', 'photo'] as const;
export type Mode = (typeof MODES)[number];
export const INKS = { ink: '#f4f4f2', soft: '#c9c9c5', muted: '#8a8a86' } as const;
export type Ink = keyof typeof INKS;
const PAPER = [11, 12, 12], GREEN = '#3ecf8e';
const RAMP = ' .·:;|+=#';

export type PhotoLook = {
  mode: Mode;
  /* what a laptop's screen shows: a Builder Day terminal, dark glass, or the press photo's own picture */
  screen: Screen;
  /* stretch each photo's own darkest and lightest to the same range first, so silver and black print alike */
  auto: boolean;
  /* a cell, in css px, and how much of it the dot leaves empty */
  cell: number; gap: number; round: boolean;
  /* dither by a fixed 4 x 4 pattern (calm, like a screen print) or by spreading the error (finer, but it worms on flat metal) */
  ordered: boolean;
  /* tone: contrast round the middle, a lift, the curve, and outlines from the change in light */
  contrast: number; lift: number; gamma: number; edge: number;
  /* the brightest share of the dots in green (0 = none) */
  accent: number;
  ink: Ink;
  /* the key: how far from the ground's colour still counts as ground (0..1), and the soft edge in source px */
  tol: number; feather: number;
  /* space round the product inside its box, as a share of the box */
  pad: number;
  /* duotone: every third line darker; photo: colour kept */
  lines: number; sat: number;
  /* the real photo under the print, shown on hover */
  reveal: boolean;
  /* each photo's own exposure */
  expPro: number; expMini: number; expNeo: number; expQuest: number;
};

export const PHOTO_DEFAULT: PhotoLook = {
  mode: 'dither', screen: 'code', auto: true, cell: 3, gap: 0.15, round: false, ordered: true, contrast: 1.15, lift: 0, gamma: 1.1, edge: 0.6, accent: 0, ink: 'soft',
  tol: 0.03, feather: 1.5, pad: 0.04, lines: 0.35, sat: 0.15, reveal: true, expPro: 0.08, expMini: 0, expNeo: 0, expQuest: 0,
};

export const PHOTO_BOUNDS: Record<string, [number, number, number]> = {
  cell: [2, 10, 0.5], gap: [0, 0.6, 0.05], contrast: [0.6, 2.5, 0.05], lift: [-0.3, 0.3, 0.01], gamma: [0.5, 2.5, 0.05], edge: [0, 2.5, 0.05],
  accent: [0, 0.3, 0.01], tol: [0.02, 0.3, 0.01], feather: [0, 6, 0.5], pad: [0, 0.2, 0.01], lines: [0, 1, 0.05], sat: [0, 1, 0.05],
  expPro: [-0.4, 0.4, 0.01], expMini: [-0.4, 0.4, 0.01], expNeo: [-0.4, 0.4, 0.01], expQuest: [-0.4, 0.4, 0.01],
};

export function clampPhoto(c: Partial<PhotoLook> | undefined): PhotoLook {
  const o = { ...PHOTO_DEFAULT, ...(c || {}) } as PhotoLook & Record<string, unknown>;
  for (const k of Object.keys(PHOTO_BOUNDS)) {
    const [lo, hi, st] = PHOTO_BOUNDS[k], v = Number(o[k]);
    o[k] = Number.isFinite(v) ? Number(Math.min(hi, Math.max(lo, Math.round(v / st) * st)).toFixed(2)) : (PHOTO_DEFAULT as Record<string, unknown>)[k];
  }
  if (!(MODES as readonly string[]).includes(o.mode)) o.mode = PHOTO_DEFAULT.mode;
  if (!(o.ink in INKS)) o.ink = PHOTO_DEFAULT.ink;
  if (!(SCREENS as readonly string[]).includes(o.screen)) o.screen = PHOTO_DEFAULT.screen;
  for (const k of ['round', 'reveal', 'auto', 'ordered'] as const) o[k] = !!o[k];
  for (const k of Object.keys(o)) if (!(k in PHOTO_DEFAULT)) delete o[k];
  return o;
}

export const expOf = (l: PhotoLook, p: Photo) => ({ pro: l.expPro, mini: l.expMini, neo: l.expNeo, quest: l.expQuest })[p];

/* ---------- the key ---------- */

/* Sets the alpha of an RGBA buffer to the product: an image that has its own alpha keeps it; otherwise the ground is
   the border's median colour, and everything reachable from the border within `tol` of it goes. Returns the
   product's bounds. */
export function keyOut(d: Uint8ClampedArray, w: number, h: number, tol: number, feather: number) {
  let own = false;
  for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) { own = true; break; }
  const a = new Float32Array(w * h);
  if (own) for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] / 255;
  else {
    const border: number[][] = [];
    for (let x = 0; x < w; x += 2) border.push(px(d, w, x, 0), px(d, w, x, h - 1));
    for (let y = 0; y < h; y += 2) border.push(px(d, w, 0, y), px(d, w, w - 1, y));
    const g = [0, 1, 2].map((c) => median(border.map((b) => b[c])));
    const lim = (tol * 441.7) ** 2, ground = new Uint8Array(w * h), q = new Int32Array(w * h);
    let qh = 0, qt = 0;
    const near = (i: number) => { const r = d[i * 4] - g[0], gg = d[i * 4 + 1] - g[1], b = d[i * 4 + 2] - g[2]; return r * r + gg * gg + b * b <= lim; };
    const push = (i: number) => { if (!ground[i] && near(i)) { ground[i] = 1; q[qt++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (qh < qt) {
      const i = q[qh++], x = i % w, y = (i / w) | 0;
      if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
    }
    for (let i = 0; i < w * h; i++) a[i] = ground[i] ? 0 : 1;
  }
  const s = feather > 0 ? blur(a, w, h, Math.round(feather)) : a;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = s[y * w + x]; d[(y * w + x) * 4 + 3] = Math.round(v * 255);
    if (v > 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w, h };
}
const px = (d: Uint8ClampedArray, w: number, x: number, y: number) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
const median = (v: number[]) => { const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
function blur(a: Float32Array, w: number, h: number, r: number) {
  const t = new Float32Array(w * h), o = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[y * w + x] = s / n; s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { o[y * w + x] = s / n; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  return o;
}

/* how wide each product is beside a 14-inch laptop (31 cm): the Mac mini is 20 cm, so it never prints as big as 1st */
export const SIZE: Record<Photo, number> = { pro: 1, neo: 0.95, mini: 0.64, quest: 1 };
/* where the product sits in a box W x H: as large as fits inside the padding (times its size), centred, standing on
   the bottom */
export function place(b: { w: number; h: number }, W: number, H: number, pad: number, size = 1) {
  const pw = W * (1 - 2 * pad) * size, ph = H * (1 - pad), k = Math.min(pw / b.w, ph / b.h);
  const w = b.w * k, h = b.h * k;
  return { x: (W - w) / 2, y: H - h, w, h };
}

/* ---------- the tone of a cell ---------- */

const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
export type Levels = { lo: number; hi: number };
/* the product's own 2nd and 98th percentile of light (pixels at least half covered), every `step`th pixel */
export function levels(d: Uint8ClampedArray, step = 1): Levels {
  const v: number[] = [];
  for (let i = 0; i < d.length; i += 4 * step) if (d[i + 3] > 127) v.push(lum(d[i], d[i + 1], d[i + 2]));
  if (v.length < 8) return { lo: 0, hi: 1 };
  v.sort((a, b) => a - b);
  const lo = v[Math.floor(v.length * 0.02)], hi = v[Math.floor(v.length * 0.98)];
  return hi - lo > 0.05 ? { lo, hi } : { lo: 0, hi: 1 };
}
/* light to tone: levels into 0.05..0.72 (when on: silver prints as a light grey, not a white slab), then contrast round the middle, lift, exposure and the curve */
export function tone(l: number, look: PhotoLook, exp: number, lv?: Levels) {
  if (look.auto && lv) l = 0.05 + 0.67 * Math.min(1, Math.max(0, (l - lv.lo) / (lv.hi - lv.lo)));
  const v = Math.min(1, Math.max(0, (l - 0.5) * look.contrast + 0.5 + look.lift + exp));
  return Math.pow(v, look.gamma);
}

/* A grid of tones from a cell-sized sample (RGBA, one pixel a cell): tone times cover, plus the outline (the change
   in light, and the edge of the cover) times `edge`. */
export function grid(s: Uint8ClampedArray, cols: number, rows: number, look: PhotoLook, exp: number) {
  const L = new Float32Array(cols * rows), A = new Float32Array(cols * rows), V = new Float32Array(cols * rows), lv = levels(s);
  for (let i = 0; i < cols * rows; i++) { A[i] = s[i * 4 + 3] / 255; L[i] = tone(lum(s[i * 4], s[i * 4 + 1], s[i * 4 + 2]), look, exp, lv) * A[i]; }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x; let e = 0;
    if (look.edge > 0 && x > 0 && y > 0 && x < cols - 1 && y < rows - 1) {
      const gx = L[i + 1] - L[i - 1], gy = L[i + cols] - L[i - cols], ga = A[i + 1] - A[i - 1], gb = A[i + cols] - A[i - cols];
      e = Math.min(1, Math.hypot(gx, gy) * 1.2 + Math.hypot(ga, gb) * 0.6) * look.edge;
    }
    V[i] = Math.min(1, L[i] + e * Math.max(A[i], 0.5));
  }
  return { V, A };
}

/* Atkinson: a sixth of the error to six neighbours, a quarter lost, which keeps the lights open and the print crisp */
export function atkinson(V: Float32Array, cols: number, rows: number) {
  const v = Float32Array.from(V), out = new Uint8Array(cols * rows);
  const add = (x: number, y: number, e: number) => { if (x >= 0 && x < cols && y < rows) v[y * cols + x] += e; };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x, o = v[i] >= 0.5 ? 1 : 0; out[i] = o;
    const e = (v[i] - o) / 8;
    add(x + 1, y, e); add(x + 2, y, e); add(x - 1, y + 1, e); add(x, y + 1, e); add(x + 1, y + 1, e); add(x, y + 2, e);
  }
  return out;
}

/* Bayer 4 x 4: each cell compared with its place in the pattern */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function ordered(V: Float32Array, cols: number, rows: number) {
  const out = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out[y * cols + x] = V[y * cols + x] > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0;
  return out;
}

/* the share of the brightest cells drawn green: the tone above which a cell is green */
function accentAt(V: Float32Array, share: number) {
  if (share <= 0) return 2;
  const s = Array.from(V).filter((x) => x > 0.05).sort((a, b) => b - a);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * share))] : 2;
}

/* ---------- drawing ---------- */

/* the placed photo at one pixel a cell, for a grid of cols x rows cells of cw x ch device px starting at ox, oy */
export type Sampler = (cols: number, rows: number, cw: number, ch: number, ox: number, oy: number) => Uint8ClampedArray;

/* Prints onto ctx (already cleared, in device px). `sample` gives the placed photo at one pixel a cell;
   `full()` gives it at the canvas's own size, for the duotone and the photo. */
export function draw(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, look: PhotoLook, exp: number, sample: Sampler, full: () => ImageData, mode: Mode = look.mode) {
  const ink = INKS[look.ink];
  if (mode === 'duotone' || mode === 'photo') {
    const im = full(), d = im.data, lv = levels(d, 5), inkRgb = hex(ink);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const a = d[i + 3] / 255; if (a <= 0) continue;
      const y = Math.floor(p / W);
      if (mode === 'duotone') {
        let t = tone(lum(d[i], d[i + 1], d[i + 2]), look, exp, lv);
        if (look.lines > 0 && Math.floor(y / dpr) % 3 === 0) t *= 1 - look.lines;
        for (let c = 0; c < 3; c++) d[i + c] = PAPER[c] + (inkRgb[c] - PAPER[c]) * t;
      } else {
        const g = lum(d[i], d[i + 1], d[i + 2]) * 255;
        for (let c = 0; c < 3; c++) d[i + c] = g + (d[i + c] - g) * look.sat;
      }
    }
    ctx.putImageData(im, 0, 0);
    return;
  }
  const cw = look.cell * dpr, ch = mode === 'ascii' ? cw * 1.7 : cw;
  const cols = Math.max(1, Math.floor(W / cw)), rows = Math.max(1, Math.floor(H / ch));
  const ox = (W - cols * cw) / 2, oy = H - rows * ch;
  const { V } = grid(sample(cols, rows, cw, ch, ox, oy), cols, rows, look, exp), green = accentAt(V, look.accent);
  if (mode === 'dither') {
    const on = look.ordered ? ordered(V, cols, rows) : atkinson(V, cols, rows), s = cw * (1 - look.gap), r = s / 2;
    for (const col of [ink, GREEN]) {
      ctx.fillStyle = col; ctx.beginPath();
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x; if (!on[i] || (V[i] >= green) !== (col === GREEN)) continue;
        const cx = ox + x * cw + cw / 2, cy = oy + y * ch + ch / 2;
        if (look.round) { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2); } else ctx.rect(cx - r, cy - r, s, s);
      }
      ctx.fill();
    }
  } else if (mode === 'halftone') {
    const R = (cw / 2) * (1 - look.gap * 0.5);
    for (const col of [ink, GREEN]) {
      ctx.fillStyle = col; ctx.beginPath();
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x, v = V[i]; if (v < 0.04 || (v >= green) !== (col === GREEN)) continue;
        const r = R * Math.sqrt(v), cx = ox + x * cw + cw / 2 + (y % 2 ? cw / 2 : 0), cy = oy + y * ch + ch / 2;
        if (cx - r > W) continue;
        ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  } else {
    ctx.font = `${ch * 0.82}px ui-monospace, SFMono-Regular, Menlo, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x, v = V[i], k = Math.min(RAMP.length - 1, Math.floor(v * RAMP.length)); if (k <= 0) continue;
      ctx.fillStyle = v >= green ? GREEN : ink;
      ctx.fillText(RAMP[k], ox + x * cw + cw / 2, oy + y * ch + ch / 2);
    }
  }
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/* A laptop's screen, drawn over the press photo's picture: dark glass, and with `code` a short
   Builder Day session in the terminal (fixed words, so every print is the same). Sizes follow the screen's height. */
const SESSION: [string, 0 | 1 | 2][] = [
  ['$ npx builder-day check', 1], ['  signed in with Supabase', 0], ['  editor connected', 2], ['', 0],
  ['$ git push', 1], ['  entry live · 0h 41m left', 0], ['  votes open from minute 0', 0], ['', 0], ['$ _', 1],
];
export function paintScreen(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, kind: Screen) {
  if (kind === 'photo') return;
  ctx.save();
  ctx.fillStyle = '#060707'; ctx.fillRect(r.x, r.y, r.w, r.h);
  if (kind === 'code') {
    const fs = r.h / 15, lh = fs * 1.35, x = r.x + r.w * 0.07;
    ctx.font = `500 ${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`; ctx.textBaseline = 'top';
    SESSION.forEach(([t, k], i) => { ctx.fillStyle = k === 2 ? '#6ee7b0' : k === 1 ? '#e6e6e2' : '#9a9a96'; ctx.fillText(t, x, r.y + r.h * 0.1 + i * lh); });
  }
  ctx.restore();
}
