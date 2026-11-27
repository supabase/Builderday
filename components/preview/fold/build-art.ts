import { mulberry32 } from '@/lib/day-data';

/* Build in How Builder Day works, drawn as blocks: the project goes up block by block on an empty dotted ground, the way
   the merch's stickers stack isometric cubes into the Builder Day mark, and it is drawn in the text globe's characters.
   Pure: rows of characters from (config, minute), the same on the server and in the browser, so the server's HTML is the
   finished picture (minute 90) and a replay draws the same one. Saved in saved/build.config.json.

   Rules (never knobs):
   - one project, Gig map, from an empty folder at minute 0 to submitted; the steps are the receipt's (how-data.ts);
   - everything is characters on one cell grid in the page's mono: no strokes, no gradients;
   - cubes in 2:1 isometric, three faces told apart by value: the top lightest, the left face mid, the right face darkest;
   - the hatch is fixed to the screen, not to the block (the globe's stencil rule): a block moves under a still pattern;
   - the ground is the globe's dotted grid laid flat: the empty folder;
   - the newest blocks are green (an instruction booklet shows only the new parts), then settle; at the submit the whole
     build turns green, the colour Gig map keeps in the votes and the final. */

export type BuildShape = 'mark' | 'stack' | 'heap';
export type BuildShade = 'print' | 'hatch' | 'ramp' | 'dots';
export type BuildArrive = 'drop' | 'print';
export type BuildLook = {
  shape: BuildShape; shade: BuildShade; arrive: BuildArrive; seed: number;
  /* the grid: columns and rows of characters, and the font size (px at the panel's width) */
  cols: number; rows: number; font: number;
  /* a cube: half its width in cells, its height against that, how far the ground's grid reaches beyond the build */
  cube: number; tall: number; ground: number;
  /* motion: how much of the gap to the next step a step's blocks take to start arriving, how long one block takes to
     land (minutes of the clock: the page plays 90 in about 4 s, so 5 is about 230 ms), how far it falls (cubes), how
     long a new block stays green (minutes), how long the submit takes to turn the build green (minutes) */
  fill: number; fall: number; drop: number; settle: number; sweep: number;
  /* the faces' inks (0 to 1 of the page's ink), the plan of blocks still to come (0 hides it), the face edges */
  left: number; right: number; ghost: number; edge: number;
};
export const BUILD_SHAPES: BuildShape[] = ['mark', 'stack', 'heap'];
export const BUILD_SHADES: BuildShade[] = ['print', 'hatch', 'ramp', 'dots'];
export const BUILD_ARRIVES: BuildArrive[] = ['drop', 'print'];
export const BUILD_DEF: BuildLook = {
  shape: 'stack', shade: 'print', arrive: 'drop', seed: 12,
  cols: 44, rows: 17, font: 10,
  cube: 5, tall: 1.2, ground: 0,
  fill: 0.6, fall: 5, drop: 2, settle: 12, sweep: 5,
  left: 0.62, right: 0.55, ghost: 0.5, edge: 0.3,
};
export const BUILD_BOUNDS: Record<string, [number, number, number]> = {
  seed: [1, 99999, 1], cols: [36, 80, 1], rows: [12, 24, 1], font: [8, 12, 0.5],
  cube: [2, 5, 1], tall: [0.6, 1.6, 0.05], ground: [0, 3, 1],
  fill: [0.1, 1, 0.05], fall: [1, 10, 0.5], drop: [0, 5, 0.5], settle: [0, 30, 1], sweep: [0, 8, 0.5],
  left: [0.2, 0.9, 0.02], right: [0.1, 0.7, 0.02], ghost: [0, 1, 0.05], edge: [0, 1, 0.05],
};
export function clampBuild(s: Partial<BuildLook>): BuildLook {
  const o = { ...BUILD_DEF, ...s } as BuildLook & Record<string, unknown>;
  if (!BUILD_SHAPES.includes(o.shape)) o.shape = BUILD_DEF.shape;
  if (!BUILD_SHADES.includes(o.shade)) o.shade = BUILD_DEF.shade;
  if (!BUILD_ARRIVES.includes(o.arrive)) o.arrive = BUILD_DEF.arrive;
  for (const [k, [a, b]] of Object.entries(BUILD_BOUNDS)) { const v = Number(o[k]); o[k] = Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : BUILD_DEF[k as keyof BuildLook]; }
  for (const k of ['seed', 'cols', 'rows', 'cube', 'ground']) o[k] = Math.round(o[k] as number);
  return o;
}

/* ---- the blocks ---- */
type V = [number, number, number];
/* x runs to the right and towards you, y to the left and towards you, z up */
function shapeOf(look: BuildLook): V[] {
  if (look.shape === 'mark') {
    /* the Builder Day cross standing on the ground, two cubes deep: a plus of nine, arms two long */
    const out: V[] = [];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) if (x === 2 || z === 2) out.push([x, y, z]);
    return out;
  }
  if (look.shape === 'stack') {
    /* stepped like the stickers' cubes: a three by three floor, two by two on it, one on top */
    const out: V[] = [];
    for (let z = 0; z < 3; z++) for (let x = 0; x < 3 - z; x++) for (let y = 0; y < 3 - z; y++) out.push([x, y, z]);
    return out;
  }
  /* a small seeded skyline on a four by three plot: every column at least one high, nothing floats */
  const R = mulberry32(look.seed * 97 + 13), out: V[] = [];
  for (let x = 0; x < 4; x++) for (let y = 0; y < 3; y++) {
    const h = 1 + Math.floor(R() * R() * 4);
    for (let z = 0; z < h; z++) out.push([x, y, z]);
  }
  return out;
}
/* the build order: floor up, back to front, so nothing is placed on air (the cross's arms excepted) */
const byBuild = (a: V, b: V) => a[2] - b[2] || (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0];
/* the drawing order: back to front, then low to high */
const byPaint = (a: V, b: V) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]) || a[2] - b[2] || a[0] - b[0];

/* ---- the steps ---- */
export type Step = { at: number; what: string; note?: string };
/* when each block arrives (start and end, minutes): the steps that add blocks share them out in build order, each step's
   blocks starting one after another through `fill` of the gap to the next step, each landing in `fall` minutes */
function timing(n: number, steps: Step[], submitAt: number, fill: number, fall: number): [number, number][] {
  const k = steps.length, out: [number, number][] = [];
  for (let s = 0; s < k; s++) {
    const a = Math.round((s * n) / k), b = Math.round(((s + 1) * n) / k), gap = ((s + 1 < k ? steps[s + 1].at : submitAt) - steps[s].at) * fill;
    for (let j = a; j < b; j++) { const t0 = steps[s].at + (gap * (j - a)) / (b - a); out.push([t0, t0 + fall]); }
  }
  return out;
}
/* ---- the picture ---- */
/* a run: characters of one kind in a row. ink: 'top' | 'left' | 'right' | 'ground' | 'ghost'; g: how green (0 to 1) */
export type Run = { text: string; ink: 'top' | 'left' | 'right' | 'ground' | 'ghost' | 'none'; g: number };
export type Picture = { rows: Run[][]; cols: number; total: number; placed: number };
const smooth = (x: number) => { const p = Math.max(0, Math.min(1, x)); return p * p * (3 - 2 * p); };
const hash = (c: number, r: number, s: number) => { let h = (c * 374761393 + r * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function drawBuild(look: BuildLook, m: number, steps: Step[], submitAt: number): Picture {
  const cols = look.cols, rows = look.rows, s = look.cube, h = s * look.tall;
  /* cells are twice as tall as wide: work in half-row units (one unit = one column = half a row) */
  const built = [...shapeOf(look)].sort(byBuild), times = timing(built.length, steps, submitAt, look.fill, look.fall);
  const paint = built.map((v, i) => ({ v, i })).sort((a, b) => byPaint(a.v, b.v));
  /* screen position of a corner, before centring */
  const P = (x: number, y: number, z: number): [number, number] => [(x - y) * s, (x + y) * s / 2 - z * h];
  /* centre the build and its ground in the grid, sitting a little low so the falling blocks have room */
  const ext = Math.max(...built.map((v) => Math.max(v[0], v[1]))) + 1, g0 = -look.ground, g1 = ext + look.ground;
  const pts = [P(g0, g0, 0), P(g1, g0, 0), P(g0, g1, 0), P(g1, g1, 0), ...built.map((v) => P(v[0], v[1], v[2] + 1))];
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  const ox = Math.round((cols - (maxX - minX)) / 2 - minX), oy = Math.round((rows * 2 - (maxY - minY)) / 2 - minY + Math.min(2, look.drop * h * 0.3));
  /* each cell: which block and face covers it now, and at the end */
  const N = cols * rows, own = new Int32Array(N).fill(-1), face = new Int8Array(N), fin = new Int32Array(N).fill(-1), finFace = new Int8Array(N);
  const inside = (q: [number, number][], px: number, py: number) => {
    let c = false;
    for (let a = 0, b = q.length - 1; a < q.length; b = a++) if ((q[a][1] > py) !== (q[b][1] > py) && px < ((q[b][0] - q[a][0]) * (py - q[a][1])) / (q[b][1] - q[a][1]) + q[a][0]) c = !c;
    return c;
  };
  const faces = (v: V, dz: number): [number, number][][] => {
    const [x, y] = v, z = v[2] + dz, Q = (a: number, b: number, c: number): [number, number] => { const p = P(a, b, c); return [p[0] + ox, p[1] + oy]; };
    return [
      [Q(x, y, z + 1), Q(x + 1, y, z + 1), Q(x + 1, y + 1, z + 1), Q(x, y + 1, z + 1)],
      [Q(x, y + 1, z), Q(x + 1, y + 1, z), Q(x + 1, y + 1, z + 1), Q(x, y + 1, z + 1)],
      [Q(x + 1, y, z), Q(x + 1, y + 1, z), Q(x + 1, y + 1, z + 1), Q(x + 1, y, z + 1)],
    ];
  };
  const fillFaces = (fs: [number, number][][], id: number, into: Int32Array, intoFace: Int8Array, show: (c: number, r: number) => boolean) => {
    for (let f = 0; f < 3; f++) {
      const q = fs[f], x0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[0])))), x1 = Math.min(cols - 1, Math.ceil(Math.max(...q.map((p) => p[0]))));
      const r0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[1])) / 2)), r1 = Math.min(rows - 1, Math.ceil(Math.max(...q.map((p) => p[1])) / 2));
      for (let r = r0; r <= r1; r++) for (let c = x0; c <= x1; c++) if (inside(q, c + 0.5, r * 2 + 1) && show(c, r)) { into[r * cols + c] = id; intoFace[r * cols + c] = f; }
    }
  };
  let placed = 0;
  for (const { v, i } of paint) {
    fillFaces(faces(v, 0), i, fin, finFace, () => true);
    const [t0, t1] = times[i], t = (m - t0) / (t1 - t0);
    if (t <= 0) continue;
    if (t >= 1) placed++;
    /* a fall lands with an ease-out, so the block slows into place instead of hitting it */
    if (look.arrive === 'drop') fillFaces(faces(v, Math.pow(1 - Math.min(1, t), 3) * look.drop), i, own, face, () => true);
    else fillFaces(faces(v, 0), i, own, face, (c, r) => t >= 1 || hash(c, r, look.seed) < t);
  }
  /* how green a block is: new ones, then the submit's sweep in build order */
  const sent = m >= submitAt;
  const green = (i: number) => {
    const fresh = look.settle > 0 ? 1 - smooth((m - times[i][1]) / look.settle) : 0;
    const sweep = sent ? (look.sweep > 0 ? smooth(((m - submitAt) / look.sweep) * 1.4 - (i / built.length) * 0.4) : 1) : 0;
    return Math.max(m >= times[i][0] ? fresh : 0, sweep);
  };
  /* the ground: a dot at each crossing of the grid, laid flat (the globe's dotted grid); the cells they fall in */
  const ground = new Uint8Array(N);
  for (let gx = g0; gx <= g1; gx++) for (let gy = g0; gy <= g1; gy++) {
    const [X, Y] = P(gx, gy, 0), c = Math.floor(X + ox), r = Math.floor((Y + oy) / 2);
    if (c >= 0 && c < cols && r >= 0 && r < rows) ground[r * cols + c] = 1;
  }
  const groundAt = (c: number, r: number) => ground[r * cols + c] === 1;
  const chars = look.shade === 'ramp' ? ['|', ':', '.'] : null;
  const out: Run[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Run[] = [];
    const push = (ch: string, ink: Run['ink'], g: number) => {
      const last = row[row.length - 1];
      if (last && last.ink === ink && Math.abs(last.g - g) < 0.05) last.text += ch; else row.push({ text: ch, ink, g });
    };
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c, id = own[k];
      if (id >= 0) {
        const f = face[k];
        /* an edge: the cell beside it (right or below) belongs to another face, the hatch's | marks it */
        const nb = (k2: number) => k2 >= 0 && k2 < N && (own[k2] !== id || face[k2] !== f);
        const edge = look.edge > 0.5 && (nb(k + 1) || nb(k + cols)) && look.shade !== 'dots';
        /* print: the globe's hatch on the lit top, the walls in upright strokes (an engraver's walls), the shaded side in dots */
        const hatch = edge || (c + r) % 3 === 0 ? '|' : ':';
        const ch = look.shade === 'dots' ? (f === 0 ? '•' : '·') : chars ? chars[f] : look.shade === 'print' ? (f === 0 ? hatch : f === 1 ? '|' : '.') : hatch;
        push(ch, (['top', 'left', 'right'] as const)[f], Math.round(green(id) * 20) / 20);
        continue;
      }
      const fid = fin[k];
      if (fid >= 0 && look.ghost > 0) {
        const nb = (k2: number) => k2 < 0 || k2 >= N || fin[k2] !== fid || finFace[k2] !== finFace[k];
        if (nb(k + 1) || nb(k - 1) || nb(k + cols) || nb(k - cols)) { push('.', 'ghost', 0); continue; }
      }
      if (groundAt(c, r)) { push('.', 'ground', 0); continue; }
      push(' ', 'none', 0);
    }
    out.push(row);
  }
  return { rows: out, cols, total: built.length, placed };
}
