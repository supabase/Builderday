/* The text globe: the world drawn as characters, the globe printed on the event's shirt. One drawing function for every
   canvas that shows it (the wheel's hub, the small globes beside the register links, the prize).

   How the motion study's frames are made (public/wheel/ascii-globe.txt, read cell by cell on 2026-11-18):
   - A frame is 25 rows of 100 columns. The globe is an ellipse of cells centred on column 50 and row 12, 24 columns and
     11.3 rows in radius, so with a cell about twice as tall as it is wide it draws as a circle.
   - Land is one hatch, `::|`, and nothing else: no lighter or darker characters. The hatch is fixed to the screen, not
     to the land: a cell is `|` when (column + row) is a multiple of 3, else `:`, in every frame. The land moves under
     a still diagonal pattern, the way a stencil moves over a printed screen. (This answers the plan's open question:
     the study ties the hatch to the screen.)
   - The grid is fixed too, and land covers it: a dotted limb (an ellipse of 24 columns by 10.7 rows, a little inside
     the land's), three dotted parallels (rows 6, 12 and 18, edge to edge) and one dotted column down the middle. They
     never turn with the globe.
   - `o` marks forty cells over the hundred frames: the motion study's region lights, a pair of frames each. They count
     as land and draw as a `.` in the land's ink, as the page has always drawn them; the marks are ours.
   - Frame k faces longitude −100 + 3.6k (east positive), so frame 0 faces the Americas: that frame is the shirt.

   The generator below draws a frame by the same rules from the land map (public/wheel/land.png): from each cell back
   to a latitude and longitude, the map read 2 by 2 times per cell, land where most of the cell is land. tools/
   globe-score.ts scores it against the study's frames. The study's own frames stay the large globe; the generator
   draws the sizes the study has no frames for.

   Three sizes, each drawn for its own pixels (never one picture scaled):
   - large: the study's 25 rows, when the globe is at least `large` CSS px tall;
   - mid: fewer rows by the same rules, so each row stays about 10 CSS px tall;
   - small: no characters at all, a square grid of dots: a dotted limb, a dot for each cell of land, a green dot for the
     city. Characters shrunk into a 64 px icon are grey mush. */

export const STUDY = { rows: 25, cols: 100, cx: 50, cy: 12, rx: 24, ry: 11.3, gridRy: 10.7, parallel: 6, first: -100, step: 3.6, frames: 100 };
export const FRAMES_URL = '/wheel/ascii-globe.txt';
export const LAND_URL = '/wheel/land.png';
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;

export type Frames = string[][];
/* the land map: one grey byte a pixel, longitude across (−180 at the left), latitude down (90 at the top) */
export type LandMap = { w: number; h: number; data: ArrayLike<number> };

/* ---- the land ---- */
export function landAt(m: LandMap, lat: number, lon: number): number {
  const u = ((((lon + 180) / 360) % 1) + 1) % 1, v = Math.min(Math.max((90 - lat) / 180, 0), 0.9999);
  return m.data[Math.floor(v * m.h) * m.w + Math.floor(u * m.w)] / 255;
}

/* ---- the grid: rows, the place of the globe in them, the fixed dots ---- */
export type Grid = { rows: number; cols: number; cx: number; cy: number; rx: number; ry: number; gridRy: number; parallels: number[] };
export function gridOf(rows: number): Grid {
  const k = rows / STUDY.rows, cols = Math.round(STUDY.cols * k), cy = (rows - 1) / 2;
  const p = Math.round(STUDY.parallel * k);
  return { rows, cols, cx: Math.round(cols / 2), cy, rx: STUDY.rx * k, ry: STUDY.ry * k, gridRy: STUDY.gridRy * k, parallels: [cy - p, cy, cy + p] };
}
/* the study's grid: '.' where the limb, a parallel or the middle column is */
function gridDot(g: Grid, r: number, c: number): boolean {
  const y = (r - g.cy) / g.gridRy; if (Math.abs(y) > 1) return false;
  const half = g.rx * Math.sqrt(1 - y * y), lo = Math.round(g.cx - half), hi = Math.round(g.cx + half);
  if (g.parallels.some((p) => Math.abs(p - r) < 0.5)) return c >= lo && c <= hi;
  return c === lo || c === hi || c === g.cx;
}

export type GenOpts = { threshold?: number; margin?: number; hatch?: 'screen' | 'land'; thin?: boolean };
/* One frame facing `facing` degrees, `rows` rows. `prev` (the frame before, same grid) holds a coast cell's character
   until its share of land crosses the line by `margin`, so a coast does not flicker from step to step. */
export function genFrame(m: LandMap, facing: number, rows: number, o: GenOpts = {}, prev?: string[]): string[] {
  const g = gridOf(rows), t = o.threshold ?? 0.5, mg = o.margin ?? 0, out: string[] = [];
  const subs = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
  const colStep = deg(Math.asin(1 / g.rx));
  for (let r = 0; r < g.rows; r++) {
    let line = '';
    for (let c = 0; c < g.cols; c++) {
      let share = 0, lonMid = NaN, edge = 0;
      for (const [dx, dy] of subs) {
        const x = (c + dx - g.cx) / g.rx, y = (g.cy - (r + dy)) / g.ry, z2 = 1 - x * x - y * y;
        if (z2 <= 0) continue;
        const lon = facing + deg(Math.atan2(x, Math.sqrt(z2)));
        share += landAt(m, deg(Math.asin(y)), lon) / subs.length;
        if (dx > 0 && dy > 0) { lonMid = lon; edge = Math.sqrt(x * x + y * y); }
      }
      /* the study draws no land past the grid's limb rows */
      if (Math.abs(r - g.cy) > g.gridRy) share = 0;
      const was = prev?.[r]?.[c], wasLand = was === ':' || was === '|';
      const land = prev ? (wasLand ? share >= t - mg : share >= t + mg) : share >= t;
      let ch = gridDot(g, r, c) ? '.' : ' ';
      if (land) {
        const phase = o.hatch === 'land' && isFinite(lonMid) ? Math.round(lonMid / colStep) : c;
        ch = (phase + r) % 3 === 0 ? '|' : ':';
        /* depth with fewer marks: near the limb the hatch thins (::| then : : then .) */
        if (o.thin) { if (edge > 0.93) ch = (c + r) % 2 ? '.' : ' '; else if (edge > 0.8 && ch === '|') ch = ' '; }
      }
      line += ch;
    }
    out.push(line);
  }
  return out;
}

/* ---- loading, once per page ---- */
let framesP: Promise<Frames | null> | null = null, landP: Promise<LandMap | null> | null = null;
export function loadFrames(): Promise<Frames | null> {
  framesP ??= fetch(FRAMES_URL).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))).then((t) => {
    const lines = t.split('\n'), frames: Frames = [];
    for (let k = 0; k < STUDY.frames; k++) {
      const f = lines[k] ?? '', rows: string[] = [];
      for (let r = 0; r < STUDY.rows; r++) rows.push(f.slice(r * STUDY.cols, (r + 1) * STUDY.cols));
      frames.push(rows);
    }
    return frames;
  }).catch(() => { framesP = null; return null; });
  return framesP;
}
export function loadLand(): Promise<LandMap | null> {
  landP ??= new Promise<LandMap | null>((done) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d', { willReadFrequently: true }); if (!x) { done(null); return; }
      x.drawImage(img, 0, 0); const px = x.getImageData(0, 0, c.width, c.height).data, data = new Uint8Array(c.width * c.height);
      for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
      done({ w: c.width, h: c.height, data });
    };
    img.onerror = () => { landP = null; done(null); };
    img.src = LAND_URL;
  });
  return landP;
}

/* the study's frame nearest a facing (degrees) */
export function studyFrame(facing: number): number {
  const k = Math.round((facing - STUDY.first) / STUDY.step);
  return ((k % STUDY.frames) + STUDY.frames) % STUDY.frames;
}
/* the facing a frame shows: the study's frames step by 3.6 degrees; a generated globe steps whole columns at the equator */
export function snapFacing(facing: number, size: Size, rows: number, study: boolean): number {
  if (size === 'large' && study) return STUDY.first + STUDY.step * Math.round((facing - STUDY.first) / STUDY.step);
  const step = size === 'small' ? 360 / 64 : deg(Math.asin(1 / gridOf(rows).rx));
  return step * Math.round(facing / step);
}

/* a place's cell, or null behind the limb */
export function cellOf(g: Grid, facing: number, lat: number, lon: number): [number, number] | null {
  const away = rad(lon - facing), up = rad(lat);
  if (Math.cos(up) * Math.cos(away) <= 0.08) return null;
  return [Math.round(g.cy - g.ry * Math.sin(up)), Math.round(g.cx + g.rx * Math.cos(up) * Math.sin(away))];
}
/* a cell's place on the globe (the limb's cells clamp to the edge) */
function placeOf(g: Grid, facing: number, r: number, c: number): [number, number] {
  const x = Math.max(-1, Math.min(1, (c - g.cx) / g.rx)), y = Math.max(-1, Math.min(1, (g.cy - r) / g.ry));
  return [deg(Math.asin(y)), facing + deg(Math.atan2(x, Math.sqrt(Math.max(0, 1 - x * x - y * y))))];
}

/* ---- the sun ---- */
/* the point the sun stands over at a moment (degrees): the declination by the day of the year, the longitude by the
   hour in UTC with the equation of time. Good to a fraction of a degree, which is far finer than a cell. */
export function subsolar(ms: number): { lat: number; lon: number } {
  const d = new Date(ms), n = (ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5;
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365) * (n + 10));
  const b = (2 * Math.PI * (n - 81)) / 364, eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const hours = (((ms % 864e5) + 864e5) % 864e5) / 36e5, lon = -15 * (hours - 12 + eot / 60);
  return { lat, lon: ((((lon + 180) % 360) + 360) % 360) - 180 };
}
/* the sine of the sun's height over a place: above 0 it is day there */
export function sunHeight(sun: { lat: number; lon: number }, lat: number, lon: number): number {
  return Math.sin(rad(lat)) * Math.sin(rad(sun.lat)) + Math.cos(rad(lat)) * Math.cos(rad(sun.lat)) * Math.cos(rad(lon - sun.lon));
}

/* ---- the seeded order (the thinning, the print's irregular stops) ---- */
export function hash3(a: number, b: number, seed: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(seed | 0, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/* ---- drawing ---- */
export type Size = 'large' | 'mid' | 'small';
export type Marks = 'one' | 'all' | 'tags';
export type TextGlobeLook = {
  /* the grey of the land (0 to 255), the second ink's share of it (a globe still arriving), the grid's share, the other
     cities' marks' share, the green, the page's ground (reverse video), the font */
  ink: number; dim: number; grid: number; markInk: number; green: string; ground: string; font: string;
  /* the heights (CSS px) from which the globe is drawn mid and large, and the dots across a small one */
  mid: number; large: number; dots: number;
  /* one: the chosen city only; all: every city a dim +; tags: also the code of the city under the pointer */
  marks: Marks;
  /* the leader from the chosen mark to the limb, thinning toward the limb, the study's frames for the large size (else
     generated), the latitudes where the dotted lines meet the limb */
  leader: boolean; thin: boolean; study: boolean; rim: boolean;
  /* the wake's length in steps, the sun's height under which the night side goes from `: :` to `.`, the tag's size in cells */
  wake: number; night: number; tag: number;
  /* the land's and the marks' font weight (500 when not given) */
  weight?: number;
};
export const LOOK_DEF: TextGlobeLook = {
  ink: 232, dim: 0.42, grid: 0.52, markInk: 0.62, green: '#3ecf8e', ground: '#000', font: 'ui-monospace, Menlo, monospace',
  mid: 150, large: 240, dots: 15, marks: 'one', leader: false, thin: false, study: true, rim: false, wake: 0, night: 0.2, tag: 1.2,
};

/* how a globe arrives: `sweep`, a line passes down a globe already there in the second ink and leaves it in full ink;
   `print`, the cells print in reading order behind a block cursor. `step` counts from 0 to `steps`. */
export type Reveal = { mode: 'sweep' | 'print'; step: number; steps: number };
export type GlobeCity = { lat: number; lon: number; code?: string };
export type TextGlobeDraw = {
  x: number; y: number; r: number; ratio: number; facing: number;
  cities: GlobeCity[]; active: number; bracket: boolean;
  frames: Frames | null; land: LandMap | null; look: TextGlobeLook;
  /* the row the leader runs along (device px), the wheel's reading line */
  leaderY?: number; size?: 'auto' | Size;
  /* the facings of the steps before this one, the latest first (the wake) */
  trail?: number[];
  reveal?: Reveal | null;
  /* where the sun stands (the morning); null: no light */
  sun?: { lat: number; lon: number } | null;
  /* the city under the pointer or focus (tags), and the city whose mark is pressed (reverse video); -1: none */
  hover?: number; invert?: number;
  /* the share of cells gone (0 to 1), in the seed's order: at 1 only the limb's dots and the chosen city are left */
  drop?: number; seed?: number;
  /* the picture is cut at this many radii (the labels outside it are not) */
  clip?: number;
};
export function sizeOf(r: number, ratio: number, look: Pick<TextGlobeLook, 'mid' | 'large'>): Size {
  const h = (2 * r) / ratio;
  return h >= look.large ? 'large' : h >= look.mid ? 'mid' : 'small';
}
/* mid: rows that keep each row about 10 CSS px tall, odd so the equator is a row, never fewer than 11 */
export function midRows(r: number, ratio: number): number {
  const n = Math.floor((2 * r) / ratio / (0.904 * 10));
  return Math.max(11, Math.min(STUDY.rows, n - (n % 2 === 0 ? 1 : 0)));
}

const memo = new Map<string, string[]>();
function generated(land: LandMap, facing: number, rows: number, thin: boolean): string[] {
  const key = rows + ':' + facing.toFixed(3) + ':' + thin;
  let f = memo.get(key);
  if (!f) { f = genFrame(land, facing, rows, { thin }); if (memo.size > 400) memo.clear(); memo.set(key, f); }
  return f;
}

/* where a globe's cells fall: the size, the facing shown, the grid, the cell in device px and the first cell's corner */
export type Layout = { size: Size; facing: number; g: Grid; study: boolean; colW: number; lineH: number; left: number; top: number };
export function layoutOf(d: Pick<TextGlobeDraw, 'x' | 'y' | 'r' | 'ratio' | 'facing' | 'frames' | 'land' | 'look' | 'size'>): Layout | null {
  const L = d.look, size = d.size && d.size !== 'auto' ? d.size : sizeOf(d.r, d.ratio, L);
  if (size === 'small') return null;
  const study = size === 'large' && L.study && !!d.frames && !L.thin;
  if (!study && !d.land) return null;
  const rows = size === 'large' ? STUDY.rows : midRows(d.r, d.ratio), g = gridOf(rows), facing = snapFacing(d.facing, size, rows, study);
  /* whole device pixels */
  const colW = Math.max(1, Math.round(d.r / g.rx)), lineH = Math.max(1, Math.round(d.r / g.ry));
  return { size, facing, g, study, colW, lineH, left: Math.round(d.x - g.cx * colW - colW / 2), top: Math.round(d.y - g.cy * lineH - lineH / 2) };
}
function linesAt(d: Pick<TextGlobeDraw, 'frames' | 'land' | 'look'>, lay: Layout, facing: number): string[] {
  return lay.study ? d.frames![studyFrame(facing)] : generated(d.land!, facing, lay.g.rows, d.look.thin);
}
/* the cities' cells on this globe */
function marksOf(d: TextGlobeDraw, lay: Layout) {
  const out: { i: number; r: number; c: number; on: boolean }[] = [];
  d.cities.forEach((ct, i) => {
    if (d.look.marks === 'one' && i !== d.active) return;
    const cell = cellOf(lay.g, lay.facing, ct.lat, ct.lon); if (cell) out.push({ i, r: cell[0], c: cell[1], on: i === d.active });
  });
  return out;
}
/* the city whose mark is under a point (device px), within `reach` device px of the mark's middle, or -1 */
export function markAt(d: TextGlobeDraw, px: number, py: number, reach: number): number {
  const lay = layoutOf(d); if (!lay) return -1;
  let best = -1, bd = reach;
  for (const m of marksOf(d, lay)) {
    const dx = lay.left + (m.c + 0.5) * lay.colW - px, dy = lay.top + (m.r + 0.5) * lay.lineH - py, dd = Math.hypot(dx, dy);
    if (dd <= bd) { bd = dd; best = m.i; }
  }
  return best;
}
/* where the chosen city's mark sits (device px), or null behind the limb */
export function markPoint(d: TextGlobeDraw): [number, number] | null {
  const lay = layoutOf(d); if (!lay) return null;
  const m = marksOf(d, lay).find((x) => x.on);
  return m ? [lay.left + (m.c + 0.5) * lay.colW, lay.top + (m.r + 0.5) * lay.lineH] : null;
}

const fontSize = new Map<string, number>();
/* the font size whose advance is one cell */
function sizeFor(ctx: CanvasRenderingContext2D, font: string, cell: number) {
  let unit = fontSize.get(font);
  /* measured with no tracking: the canvas may still carry another text's letter-spacing (the prize's digits do), and
     the unit is kept for the whole page */
  if (!unit) { const ls = ctx.letterSpacing; ctx.letterSpacing = '0px'; ctx.font = `500 100px ${font}`; unit = ctx.measureText('0').width / 100 || 0.6; ctx.letterSpacing = ls; fontSize.set(font, unit); }
  return cell / unit;
}
const grey = (v: number, a: number) => `rgba(${v}, ${v}, ${Math.max(0, v - 2)}, ${a})`;
const isLand = (ch: string | undefined) => ch === ':' || ch === '|' || ch === 'o';
function limbDot(g: Grid, r: number, c: number): boolean {
  const y = (r - g.cy) / g.gridRy; if (Math.abs(y) > 1) return false;
  const half = g.rx * Math.sqrt(1 - y * y);
  return c === Math.round(g.cx - half) || c === Math.round(g.cx + half);
}

/* Draws the globe centred on (x, y), radius r (device px). Returns the size drawn and the facing shown. */
export function drawTextGlobe(ctx: CanvasRenderingContext2D, d: TextGlobeDraw): { size: Size; facing: number } {
  const L = d.look, lay = layoutOf(d);
  if (!lay) {
    const size = d.size && d.size !== 'auto' ? d.size : sizeOf(d.r, d.ratio, L);
    return size === 'small' ? { size, facing: drawDots(ctx, d) } : { size, facing: d.facing };
  }
  const { g, colW, lineH, left, top, facing } = lay, lines = linesAt(d, lay, facing);
  const seed = d.seed ?? 1, drop = d.drop ?? 0, rv = d.reveal ?? null;
  ctx.save();
  /* the two faces by name: the canvas gives a weight of 700 back as "bold", so the weight is never swapped in the string */
  const px = sizeFor(ctx, L.font, colW), plain = `500 ${px}px ${L.font}`, heavy = L.weight && L.weight !== 500 ? `${L.weight} ${px}px ${L.font}` : '';
  ctx.font = plain; ctx.letterSpacing = '0px'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  if (d.clip) { ctx.save(); ctx.beginPath(); ctx.arc(d.x, d.y, d.clip * d.r, 0, Math.PI * 2); ctx.clip(); }

  /* the marks: the cells under them are cleared (one cell, one character); thinning takes the other cities too */
  const marks = marksOf(d, lay).filter((m) => m.on || hash3(m.r, m.c + 1000, seed) >= drop);
  const active = marks.find((m) => m.on);
  const markCells = new Set<number>();
  for (const m of marks) for (let k = -1; k <= 1; k++) if (m.on || k === 0) markCells.add(m.r * 1000 + m.c + k);

  /* the wake: a cell land has just left goes through lighter characters, `:` then `.`, then blank */
  const wake = new Map<number, string>();
  if (d.trail && L.wake > 0) {
    const n = Math.min(L.wake, d.trail.length);
    for (let a = 1; a <= n; a++) {
      const f = snapFacing(d.trail[a - 1], lay.size, g.rows, lay.study); if (f === facing) continue;
      const was = linesAt(d, lay, f);
      for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
        const k = r * 1000 + c;
        if (!wake.has(k) && isLand(was[r][c]) && !isLand(lines[r][c])) wake.set(k, a < L.wake ? ':' : '.');
      }
    }
  }

  /* the leader: dots from the active mark left to the limb, along the reading line */
  const lead = new Set<number>();
  if (L.leader && active) {
    const lr = Math.max(0, Math.min(g.rows - 1, d.leaderY === undefined ? active.r : Math.round((d.leaderY - top - lineH / 2) / lineH)));
    for (let r = Math.min(active.r, lr); r <= Math.max(active.r, lr); r++) if (r !== active.r) lead.add(r * 1000 + active.c);
    for (let c = active.c - 2; c >= 0; c--) {
      const y = (lr - g.cy) / g.gridRy, half = Math.abs(y) <= 1 ? g.rx * Math.sqrt(1 - y * y) : 0;
      if (c < g.cx - half) break;
      lead.add(lr * 1000 + c);
    }
  }

  /* the arrival: the sweep's line, or how far the print has gone (cells in reading order, irregular stops by the seed) */
  const sweepRow = rv && rv.mode === 'sweep' ? Math.floor((rv.step / rv.steps) * (g.rows + 1)) : -1;
  let printed = Infinity;
  const c0 = Math.max(0, Math.floor(g.cx - g.rx) - 1), c1 = Math.min(g.cols - 1, Math.ceil(g.cx + g.rx) + 1), span = c1 - c0 + 1;
  if (rv && rv.mode === 'print') {
    let f = 0;
    for (let s = 1; s <= rv.step; s++) f = Math.max(f, Math.min(1, (s + 0.6 * (hash3(s, 7, seed) - 0.5)) / rv.steps));
    printed = Math.round(f * g.rows * span);
  }

  for (let r = 0; r < g.rows; r++) {
    let grid = '', land = '', dim = '', led = '', cur = '';
    for (let c = 0; c < g.cols; c++) {
      const k = r * 1000 + c, base = lines[r][c];
      let ch = markCells.has(k) ? ' ' : base;
      let landy = isLand(ch);
      if (landy) ch = ch === 'o' ? '.' : ch;
      else if (ch !== '.' && wake.has(k)) { ch = wake.get(k)!; landy = true; }
      /* the morning: on the night side the hatch thins to `: :`, deeper in the night to `.` */
      if (landy && d.sun && ch !== '.') {
        const [la, lo] = placeOf(g, facing, r, c), h = sunHeight(d.sun, la, lo);
        if (h < 0) ch = (c + r) % 2 === 0 ? (h < -L.night ? '.' : ':') : ' ';
      }
      /* the hand-over: cells go in the seed's order until only the limb is left */
      if (drop > 0 && ch !== ' ' && !(ch === '.' && !landy && limbDot(g, r, c)) && hash3(r, c, seed) < drop) ch = ' ';
      const isLead = lead.has(k) && (ch === ' ' || (ch === '.' && !landy));
      let inGrid = !isLead && ch === '.' && !landy, inLand = landy && ch !== ' ', inDim = false, cursor = ' ';
      if (sweepRow >= 0 && r >= sweepRow) {
        if (r === sweepRow) { const y = (r - g.cy) / g.ry, half = Math.abs(y) <= 1 ? g.rx * Math.sqrt(1 - y * y) : -1; if (!inLand && Math.abs(c - g.cx) <= half) { inGrid = false; ch = '-'; inDim = true; } }
        else if (inLand) { inLand = false; inDim = true; }
      }
      if (printed !== Infinity) {
        const idx = c < c0 || c > c1 ? -1 : r * span + (c - c0);
        if (idx < 0 || idx > printed) { inGrid = inLand = inDim = false; }
        if (idx === printed) { inGrid = inLand = inDim = false; cursor = '█'; }
      }
      grid += inGrid ? '.' : ' ';
      land += inLand ? ch : ' ';
      dim += inDim ? ch : ' ';
      led += isLead ? '.' : ' ';
      cur += cursor;
    }
    const at = top + r * lineH + lineH / 2;
    ctx.fillStyle = grey(L.ink, L.grid); ctx.fillText(grid, left, at);
    if (heavy) ctx.font = heavy;
    ctx.fillStyle = grey(L.ink, 1); ctx.fillText(land, left, at); ctx.fillText(cur, left, at);
    if (heavy) ctx.font = plain;
    if (sweepRow >= 0) { ctx.fillStyle = grey(L.ink, L.dim); ctx.fillText(dim, left, at); }
    if (lead.size) { ctx.fillStyle = L.green; ctx.fillText(led, left, at); }
  }

  /* the marks, and the pressed one in reverse video */
  const hidden = (m: { r: number; c: number }) => printed !== Infinity && m.r * span + (m.c - c0) > printed;
  for (const m of marks) {
    if (hidden(m)) continue;
    const at = top + m.r * lineH + lineH / 2, cx = left + m.c * colW, inv = d.invert === m.i;
    if (inv) {
      ctx.fillStyle = m.on ? L.green : grey(L.ink, 1);
      ctx.fillRect(cx - colW, top + m.r * lineH, colW * 3, lineH);
      ctx.fillStyle = L.ground; ctx.fillText('[', cx - colW, at); ctx.fillText('+', cx, at); ctx.fillText(']', cx + colW, at);
      continue;
    }
    if (m.on) {
      ctx.fillStyle = L.green;
      if (d.bracket) { ctx.fillText('[', cx - colW, at); ctx.fillText(']', cx + colW, at); }
      ctx.fillText('+', cx, at);
    } else { ctx.fillStyle = grey(L.ink, L.markInk); ctx.fillText('+', cx, at); }
  }

  if (d.clip) ctx.restore();
  /* outside the picture, upper-case mono (L8): the latitudes of the dotted lines, and the code of the city pointed at */
  if (L.rim && drop < 1) {
    ctx.fillStyle = grey(L.ink, L.grid); ctx.textAlign = 'right';
    for (const p of g.parallels) {
      const la = Math.round(deg(Math.asin((g.cy - p) / g.ry))), y = (p - g.cy) / g.gridRy, half = g.rx * Math.sqrt(Math.max(0, 1 - y * y));
      ctx.fillText(la === 0 ? '0' : Math.abs(la) + (la > 0 ? 'N' : 'S'), left + (Math.round(g.cx - half) - 1) * colW, top + p * lineH + lineH / 2);
    }
    ctx.textAlign = 'left';
  }
  const tagged = L.marks === 'tags' && d.hover !== undefined && d.hover >= 0 ? marks.find((m) => m.i === d.hover) : undefined;
  const code = tagged ? d.cities[tagged.i]?.code : undefined;
  if (tagged && code && drop < 1) {
    const right = tagged.c >= g.cx, y = (tagged.r - g.cy) / g.gridRy, half = g.rx * Math.sqrt(Math.max(0, 1 - y * y));
    const edge = right ? Math.round(g.cx + half) + 1 : Math.round(g.cx - half) - 1, at = top + tagged.r * lineH + lineH / 2;
    const from = right ? tagged.c + 2 : edge, to = right ? edge : tagged.c - 2;
    ctx.fillStyle = grey(L.ink, L.markInk);
    for (let c = from; c <= to; c++) ctx.fillText('.', left + c * colW, at);
    ctx.font = `500 ${sizeFor(ctx, L.font, colW * L.tag)}px ${L.font}`; ctx.fillStyle = tagged.on ? L.green : grey(L.ink, 1);
    ctx.textAlign = right ? 'left' : 'right';
    ctx.fillText(code, left + (right ? edge + 1 : edge) * colW, at);
  }
  ctx.restore();
  return { size: lay.size, facing };
}

/* The small globe: dots on a square grid. Land is a dot, the limb a ring of dots, the active city a green dot a little
   larger; the other cities are not drawn this small (they would read as land). Never fewer than 3 CSS px a dot. */
function drawDots(ctx: CanvasRenderingContext2D, d: TextGlobeDraw): number {
  const L = d.look, css = (2 * d.r) / d.ratio, n = Math.max(8, Math.min(L.dots, Math.floor(css / 3)));
  const cell = (2 * d.r) / n, dot = Math.max(1, Math.round(cell * 0.5)), facing = snapFacing(d.facing, 'small', n, false), half = n / 2;
  ctx.save();
  const at = (i: number) => Math.round(d.x - d.r + (i + 0.5) * cell - dot / 2), aty = (j: number) => Math.round(d.y - d.r + (j + 0.5) * cell - dot / 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5 - half) / half, y = (half - j - 0.5) / half, rr = Math.hypot(x, y);
    if (rr > 1) continue;
    let share = 0;
    if (d.land) for (const [dx, dy] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
      const sx = (i + 0.5 + dx - half) / half, sy = (half - j - 0.5 - dy) / half, z2 = 1 - sx * sx - sy * sy;
      if (z2 > 0) share += landAt(d.land, deg(Math.asin(sy)), facing + deg(Math.atan2(sx, Math.sqrt(z2)))) / 4;
    }
    const limb = rr > 1 - 1.15 / half;
    if (share >= 0.5) ctx.fillStyle = grey(L.ink, 0.95);
    else if (limb) ctx.fillStyle = grey(L.ink, L.grid * 0.9);
    else continue;
    ctx.fillRect(at(i), aty(j), dot, dot);
  }
  const ct = d.cities[d.active];
  if (ct) {
    const away = rad(ct.lon - facing), up = rad(ct.lat);
    if (Math.cos(up) * Math.cos(away) > 0.08) {
      const i = Math.round(half - 0.5 + half * Math.cos(up) * Math.sin(away)), j = Math.round(half - 0.5 - half * Math.sin(up));
      const s = Math.max(dot + 1, Math.round(cell * 1.1));
      ctx.fillStyle = L.green; ctx.fillRect(Math.round(d.x - d.r + (i + 0.5) * cell - s / 2), Math.round(d.y - d.r + (j + 0.5) * cell - s / 2), s, s);
    }
  }
  ctx.restore();
  return facing;
}
