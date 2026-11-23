import { hash3, landAt, sunHeight, type LandMap } from '@/components/wheel/text-globe';

/* The world opened flat: the text globe's land unrolled into one map, in the same characters
   and by the same rules. Longitude runs across the full 360 degrees, latitude down from `north` to `south`, each cell a
   plain step of both (the map is equirectangular, so with the globe's tall cells it keeps the world's proportions).
   - Land is the globe's one hatch, `::|`, fixed to the cells: `|` where (column + row) is a multiple of 3.
   - The equator is a dotted row; nothing else is drawn on the sea.
   - Every city is a `+` in its cell; the chosen one is the green `[+]`. Two cities that fall in one cell, or side by
     side, are moved a row apart, so each keeps its own mark and its own target.
   - With the sun, the night side's hatch thins to `: :`, then to `.` deeper in the night, as on the globe.
   - On a phone the map is dots (one per cell of land, on a square grid), as the small globes are, and has no equator.
   Pure: the picture is a function of the land map, the grid, the cities and the seed. */

export type MapGrid = { rows: number; cols: number; north: number; south: number };
export type MapCity = { lat: number; lon: number; code: string };
/* label: the block the code takes (its gap from the mark included); code: where its characters go, and how many */
export type MapMark = { i: number; r: number; c: number; lat: number; lon: number; label: { c: number; r: number; side: 'right' | 'left' }; code: { r: number; c: number; n: number } };

const span = (g: MapGrid) => g.north - g.south;
/* the cell a place falls in (it may be outside the crop: then the row is clamped to the edge) */
export function mapCell(g: MapGrid, lat: number, lon: number): [number, number] {
  const u = ((((lon + 180) / 360) % 1) + 1) % 1;
  const r = Math.floor(((g.north - lat) / span(g)) * g.rows), c = Math.floor(u * g.cols);
  return [Math.max(0, Math.min(g.rows - 1, r)), Math.max(0, Math.min(g.cols - 1, c))];
}
/* a cell's middle as a place */
export function cellPlace(g: MapGrid, r: number, c: number): [number, number] {
  return [g.north - ((r + 0.5) / g.rows) * span(g), -180 + ((c + 0.5) / g.cols) * 360];
}
/* the row the equator lies in, or -1 when the crop leaves it out */
export function equatorRow(g: MapGrid): number {
  if (g.north <= 0 || g.south >= 0) return -1;
  return Math.min(g.rows - 1, Math.floor((g.north / span(g)) * g.rows));
}

/* the map's characters: '|' and ':' land, '.' the equator, ' ' the sea (each cell read 2 by 2 times; land where most of
   it is) */
export function mapLines(m: LandMap, g: MapGrid): string[] {
  const eq = equatorRow(g), out: string[] = [], subs = [0.25, 0.75];
  for (let r = 0; r < g.rows; r++) {
    let line = '';
    for (let c = 0; c < g.cols; c++) {
      let share = 0;
      for (const dy of subs) for (const dx of subs) share += landAt(m, g.north - ((r + dy) / g.rows) * span(g), -180 + ((c + dx) / g.cols) * 360) / 4;
      line += share >= 0.5 ? ((c + r) % 3 === 0 ? '|' : ':') : r === eq ? '.' : ' ';
    }
    out.push(line);
  }
  return out;
}

/* the night side: the hatch thins where the sun is under the horizon (the same rule as the globe's) */
export function nightLines(lines: string[], g: MapGrid, sun: { lat: number; lon: number }, night: number): string[] {
  return lines.map((line, r) => Array.from(line, (ch, c) => {
    if (ch !== ':' && ch !== '|') return ch;
    const [lat, lon] = cellPlace(g, r, c), h = sunHeight(sun, lat, lon);
    return h < 0 ? ((c + r) % 2 === 0 ? (h < -night ? '.' : ':') : ' ') : ch;
  }).join(''));
}

/* Where each city's mark and code go. In the cities' own order (the order of the day): a mark that would share a cell
   with another, or stand right beside it, moves to the nearest free row; its code goes to the right of the mark, or
   to the left when the right is taken or off the map, or onto the row above or below. `len` is the code's length in
   cells with a clear cell on each side of it. */
export function placeMarks(g: MapGrid, cities: MapCity[], len = 5): MapMark[] {
  const taken = new Set<number>(), key = (r: number, c: number) => r * 10000 + c;
  const free = (r: number, c0: number, c1: number) => {
    if (r < 0 || r >= g.rows || c0 < 0 || c1 >= g.cols) return false;
    for (let c = c0; c <= c1; c++) if (taken.has(key(r, c))) return false;
    return true;
  };
  const out: MapMark[] = [];
  cities.forEach((ct, i) => {
    const [r0, c] = mapCell(g, ct.lat, ct.lon);
    /* the mark with a cell clear on each side (the brackets) */
    let r = r0;
    for (const d of [0, -1, 1, -2, 2, -3, 3]) { if (free(r0 + d, c - 1, c + 1)) { r = r0 + d; break; } }
    for (let k = -1; k <= 1; k++) taken.add(key(r, c + k));
    const tries: MapMark['label'][] = [
      { r, c: c + 2, side: 'right' }, { r, c: c - 1 - len, side: 'left' },
      { r: r - 1, c: c + 1, side: 'right' }, { r: r + 1, c: c + 1, side: 'right' },
      { r: r - 1, c: c - len, side: 'left' }, { r: r + 1, c: c - len, side: 'left' },
    ];
    const label = tries.find((t) => free(t.r, t.c, t.c + len - 1)) ?? tries[0];
    for (let k = 0; k < len; k++) taken.add(key(label.r, label.c + k));
    out.push({ i, r, c, lat: ct.lat, lon: ct.lon, label, code: { r: label.r, c: label.c + 1, n: len - 2 } });
  });
  return out;
}

/* How far the print has gone after `t` (0 to 1) of its time, as a count of cells in reading order. A line printer's
   carriage runs at one speed, so the rows are even, but each row starts after a small stop of its own (the seed). */
export function printedAt(g: MapGrid, t: number, seed: number): number {
  if (t >= 1) return Infinity;
  if (t <= 0) return -1;
  const w = Array.from({ length: g.rows }, (_, r) => 0.75 + 0.5 * hash3(r, 31, seed)), all = w.reduce((a, b) => a + b, 0);
  let at = t * all;
  for (let r = 0; r < g.rows; r++) {
    if (at < w[r]) {
      /* the first fifth of a row's time is its stop: the cursor waits at the row's start */
      const f = Math.max(0, (at / w[r] - 0.2) / 0.8);
      return r * g.cols + Math.floor(f * g.cols);
    }
    at -= w[r];
  }
  return Infinity;
}

export type MapLook = { ink: number; grid: number; markInk: number; green: string; font: string };
const grey = (v: number, a: number) => `rgba(${v}, ${v}, ${Math.max(0, v - 2)}, ${a})`;
const units = new Map<string, number>();
function sizeFor(ctx: CanvasRenderingContext2D, font: string, cell: number) {
  let u = units.get(font);
  /* measured with no tracking, whatever the canvas carried before */
  if (!u) { const ls = ctx.letterSpacing; ctx.letterSpacing = '0px'; ctx.font = `500 100px ${font}`; u = ctx.measureText('0').width / 100 || 0.6; ctx.letterSpacing = ls; units.set(font, u); }
  return cell / u;
}

export type MapDraw = {
  w: number; h: number; g: MapGrid; lines: string[]; marks: MapMark[]; active: number; look: MapLook;
  /* how far the print has gone (cells), Infinity when done; -1 before it starts */
  printed?: number;
  /* the unroll: 0 the globe, 1 the map; the globe faces this longitude and has this radius (device px) */
  unroll?: { t: number; facing: number; r: number } | null;
  /* dots instead of characters (a phone) */
  dots?: boolean; ratio?: number;
  /* the day pages: each city's mark as its state (`+`, `[+]`, `[:]`, `[.]`, `[3]`), and how strong its ink is (0 to 1);
     absent, every mark is the plain `+` and the active one the green `[+]` (the preview) */
  states?: { mark: string; ink: number }[];
  /* the start line: a column of characters at the longitude where the day starts now */
  line?: { col: number; char: string; ink: number } | null;
};

/* the cells' size on the canvas */
export function cellSize(d: Pick<MapDraw, 'w' | 'h' | 'g'>) { return { colW: d.w / d.g.cols, lineH: d.h / d.g.rows }; }

export function drawMap(ctx: CanvasRenderingContext2D, d: MapDraw) {
  const { g, lines, look: L } = d, { colW, lineH } = cellSize(d), printed = d.printed ?? Infinity;
  ctx.clearRect(0, 0, d.w, d.h);
  if (printed < 0) return;
  const shown = (r: number, c: number) => r * g.cols + c < printed;
  const cursorAt = printed === Infinity ? -1 : printed;
  const marked = new Map<number, MapMark>();
  for (const m of d.marks) {
    for (let k = -1; k <= 1; k++) marked.set(m.r * 10000 + m.c + k, m);
    /* the code is text over the map (a link): its cells are left clear */
    if (!d.dots) for (let k = -1; k <= m.code.n; k++) marked.set(m.code.r * 10000 + m.code.c + k, m);
  }

  if (d.dots) {
    /* a phone: a dot for each cell of land and the cities larger. No equator: in dots it reads as a rule across the map */
    const p = Math.min(colW, lineH), rad = Math.max(0.6, p * 0.22);
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const ch = lines[r][c]; if (ch === ' ' || ch === '.' || !shown(r, c) || marked.has(r * 10000 + c)) continue;
      ctx.fillStyle = grey(L.ink, ch === '|' || ch === ':' ? 1 : 0.8);
      ctx.beginPath(); ctx.arc((c + 0.5) * colW, (r + 0.5) * lineH, rad, 0, Math.PI * 2); ctx.fill();
    }
    if (d.line) { ctx.fillStyle = grey(L.ink, d.line.ink); ctx.fillRect((d.line.col + 0.5) * colW - Math.max(0.5, rad * 0.5), 0, Math.max(1, rad), d.h); }
    for (const m of d.marks) {
      if (!shown(m.r, m.c)) continue;
      const on = m.i === d.active;
      ctx.fillStyle = on ? L.green : grey(L.ink, d.states?.[m.i]?.ink ?? 1);
      ctx.beginPath(); ctx.arc((m.c + 0.5) * colW, (m.r + 0.5) * lineH, on ? p * 0.62 : p * 0.42, 0, Math.PI * 2); ctx.fill();
    }
    if (cursorAt >= 0) { const r = Math.floor(cursorAt / g.cols), c = cursorAt % g.cols; ctx.fillStyle = grey(L.ink, 1); ctx.fillRect(c * colW, r * lineH, colW, lineH); }
    return;
  }

  ctx.font = `500 ${sizeFor(ctx, L.font, colW)}px ${L.font}`; ctx.letterSpacing = '0px'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';

  if (d.unroll && d.unroll.t < 1) {
    /* the unroll: every printed character travels from its place on the globe (the back half from the limb) to its cell */
    const u = d.unroll, e = u.t < 0.5 ? 4 * u.t ** 3 : 1 - (-2 * u.t + 2) ** 3 / 2, cx = d.w / 2, cy = d.h / 2;
    const at = (r: number, c: number): [number, number, number] => {
      const [lat, lon] = cellPlace(g, r, c), la = (lat * Math.PI) / 180, away = ((lon - u.facing) * Math.PI) / 180;
      const front = Math.cos(la) * Math.cos(away) > 0, s = Math.sin(away);
      const gx = cx + u.r * Math.cos(la) * (front ? s : Math.sign(s) || 1), gy = cy - u.r * Math.sin(la);
      const mx = c * colW, my = (r + 0.5) * lineH;
      return [gx + (mx - gx) * e, gy + (my - gy) * e, front ? 1 : e];
    };
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const ch = lines[r][c]; if (ch === ' ' || marked.has(r * 10000 + c)) continue;
      const [x, y, a] = at(r, c), sea = ch === '.';
      ctx.fillStyle = grey(L.ink, (sea ? L.grid : 1) * a); ctx.fillText(ch, x, y);
    }
    for (const m of d.marks) { const [x, y] = at(m.r, m.c); ctx.fillStyle = m.i === d.active ? L.green : grey(L.ink, L.markInk); ctx.fillText('+', x, y); }
    return;
  }

  for (let r = 0; r < g.rows; r++) {
    let sea = '', land = '';
    for (let c = 0; c < g.cols; c++) {
      let ch = lines[r][c];
      if (marked.has(r * 10000 + c) || !shown(r, c)) ch = ' ';
      sea += ch === '.' ? '.' : ' ';
      land += ch === ':' || ch === '|' ? ch : ' ';
    }
    const y = (r + 0.5) * lineH;
    ctx.fillStyle = grey(L.ink, L.grid); ctx.fillText(sea, 0, y);
    ctx.fillStyle = grey(L.ink, 1); ctx.fillText(land, 0, y);
  }
  if (d.line) {
    /* the start line: its character in every row, over the sea and the land alike, but never over a mark or a code */
    ctx.fillStyle = grey(L.ink, d.line.ink);
    for (let r = 0; r < g.rows; r++) if (shown(r, d.line.col) && !marked.has(r * 10000 + d.line.col)) { ctx.clearRect(d.line.col * colW, r * lineH, colW, lineH); ctx.fillText(d.line.char, d.line.col * colW, (r + 0.5) * lineH); }
  }
  for (const m of d.marks) {
    if (!shown(m.r, m.c)) continue;
    const y = (m.r + 0.5) * lineH, x = m.c * colW, st = d.states?.[m.i];
    if (st) {
      /* the state: one character in the mark's cell, brackets either side when it has them; the active one in green */
      const mk = st.mark, on = m.i === d.active, body = mk.length === 3 ? mk[1] : mk;
      ctx.fillStyle = on ? L.green : grey(L.ink, st.ink);
      /* brackets need a free cell either side: two marks closer than that (Santiago and Rosario) keep the body only */
      const near = d.marks.some((o) => o !== m && o.r === m.r && Math.abs(o.c - m.c) < 4);
      if ((mk.length === 3 && !near) || on) { ctx.fillText('[', x - colW, y); ctx.fillText(']', x + colW, y); }
      ctx.fillText(body, x, y);
    } else if (m.i === d.active) { ctx.fillStyle = L.green; ctx.fillText('[', x - colW, y); ctx.fillText('+', x, y); ctx.fillText(']', x + colW, y); }
    else { ctx.fillStyle = grey(L.ink, L.markInk); ctx.fillText('+', x, y); }
  }
  if (cursorAt >= 0) { const r = Math.floor(cursorAt / g.cols), c = cursorAt % g.cols; ctx.fillStyle = grey(L.ink, 1); ctx.fillText('█', c * colW, (r + 0.5) * lineH); }
}
