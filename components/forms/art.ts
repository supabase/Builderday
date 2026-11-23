import { PLACE } from '@/lib/places';
import { cellOf, genFrame, gridOf, hash3, type Frames, type LandMap } from '@/components/wheel/text-globe';
import type { ArtLook, ArtSubject } from './art-config';

/* The sheets' drawing: a word printed in the text globe's characters, on the dotted grid, with the print's offset
   shadow and, beside it, the text globe facing the person's city. One pure function of the look, the subject, the size
   and how far the print has come (0 to 1); every random choice comes from the look's seed.

   How the word becomes characters: the word is set in the site's sans at the band's size on a canvas of its own, then
   read cell by cell (3 by 3 samples a cell). A cell the type covers past `solid` gets the hatch, `:` with `|` on every
   third diagonal, fixed to the screen as on the globe; a cell covered past `edge` gets a `.`. The shadow is the solid
   cells again, `shadow` cells down and to the right, where they fall on empty cells. */

export type ArtBox = { w: number; h: number; dpr: number };
export type ArtAssets = { land: LandMap | null; frames: Frames | null; ground: string; sans: string; mono: string; green: string; ink2: string };

const grey = (v: number, a: number) => `rgba(${v}, ${v}, ${Math.max(0, v - 2)}, ${a})`;
const units = new Map<string, number>();
function glyphSize(ctx: CanvasRenderingContext2D, font: string, colW: number): number {
  let u = units.get(font);
  if (!u) { ctx.font = `500 100px ${font}`; u = ctx.measureText('0').width / 100 || 0.6; units.set(font, u); }
  return colW / u;
}
function hatchAt(h: ArtLook['hatch'], r: number, c: number): string {
  if (h === 'dots') return ':';
  if (h === 'dense') return (r + c) % 2 === 0 ? '|' : ':';
  return (r + c) % 3 === 0 ? '|' : ':';
}

/* where the word, the globe and the stub sit in each mode (CSS px, from the box) */
function placeOf(look: ArtLook, box: ArtBox) {
  const { w, h } = box, pad = w < 420 ? 16 : 32;
  if (look.mode === 'split') {
    const gr = Math.min(w - 32, h * 0.5) * look.globeSize * 0.58;
    return { word: { x: pad, y: h - pad - h * 0.2, w: w - 2 * pad, h: Math.min(h * 0.2, (w - 2 * pad) * 0.5) }, globe: { x: w / 2, y: h * 0.38, r: gr }, pad };
  }
  const gr = (h * look.globeSize) / 2, room = look.globe ? w - 2 * pad - gr * 2 - pad - 28 : w - 2 * pad;
  /* pass: the stub's line runs along the top, the code sits under it */
  /* the word's baseline keeps clear of the band's bottom edge (the perforation) by the shadow and some air, the same
     for every word, so a short code and a long word that had to shrink both stand at the same height */
  const top = look.mode === 'pass' ? 46 : 12, foot = 30, wh = Math.min(h * look.word, h - top - foot);
  /* pass: the globe sits under the stub's line too, as large as the room left there */
  const pr = top ? Math.min(gr, (h - top - 12) / 2) : gr, py = top ? top + (h - top) / 2 - 2 : h / 2;
  return { word: { x: pad, y: h - foot - wh, w: room, h: wh }, globe: { x: w - pad - 28 - pr, y: py, r: pr }, pad };
}

/* the word's coverage, one number a cell */
function wordCells(word: string, look: ArtLook, box: ArtBox, a: ArtAssets, colW: number, lineH: number, cols: number, rows: number, place: ReturnType<typeof placeOf>) {
  const dpr = box.dpr, W = cols * colW, H = rows * lineH, cv = document.createElement('canvas');
  cv.width = Math.max(1, W); cv.height = Math.max(1, H);
  const x = cv.getContext('2d', { willReadFrequently: true })!; x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
  /* the cap height fills the word's box; then it shrinks to fit the width */
  let size = place.word.h * dpr / 0.72;
  x.font = `700 ${size}px ${a.sans}`; x.letterSpacing = (size * -0.02) + 'px';
  const m = x.measureText(word); const maxW = place.word.w * dpr;
  if (m.width > maxW) { size *= maxW / m.width; x.font = `700 ${size}px ${a.sans}`; x.letterSpacing = (size * -0.02) + 'px'; }
  /* every word sits on the same baseline, the bottom of its box, whatever size it came out at */
  const base = (place.word.y + place.word.h) * dpr;
  x.fillText(word, place.word.x * dpr, base);
  const right = place.word.x * dpr + x.measureText(word).width;
  const px = x.getImageData(0, 0, cv.width, cv.height).data, cov = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let n = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const X = Math.min(cv.width - 1, Math.floor(c * colW + (sx + 0.5) * colW / 3)), Y = Math.min(cv.height - 1, Math.floor(r * lineH + (sy + 0.5) * lineH / 3));
      if (px[(Y * cv.width + X) * 4 + 3] > 127) n++;
    }
    cov[r * cols + c] = n / 9;
  }
  return { cov, right: right / colW, baseRow: Math.floor(base / lineH) };
}

/* what a picture is, worked out once per size, subject and look (the word read into cells, the globe's frame, the
   print order); painting a step of the print only walks this list */
type Op = { x: number; y: number; w: number; f: 0 | 1; ch: string; fill: string; ink: boolean; o: number };
export type ArtPlan = { W: number; H: number; lineH: number; fonts: string[]; ground: Op[]; ops: Op[]; stub: { text: string; font: string; x: number; y: number; ls: string; fill: string } | null };

/* A cell is never under 7 device px (the canvas is drawn at 2x, so this only guards a tiny cell knob). */
export function planArt(ctx: CanvasRenderingContext2D, look: ArtLook, sub: ArtSubject, box: ArtBox, a: ArtAssets): ArtPlan {
  const dpr = box.dpr, W = Math.round(box.w * dpr), H = Math.round(box.h * dpr);
  const colW = Math.max(7, Math.round(look.cell * dpr)), lineH = Math.max(5, Math.round(colW * look.aspect));
  const cols = Math.ceil(W / colW), rows = Math.ceil(H / lineH), place = placeOf(look, box);
  const word = (sub.word || '').toUpperCase();
  const { cov, right, baseRow } = wordCells(word, look, box, a, colW, lineH, cols, rows, place);
  const solid = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols && cov[r * cols + c] >= look.solid;

  /* what to draw: every glyph with its place (device px), so the word, its shadow, the globe and its limb share one
     print order. The dotted grid is the ground and is there from the first frame; everything else is ranked. */
  const ops: Op[] = [], ground: Op[] = [], last: Op[] = [];
  const op = (x: number, y: number, w: number, f: 0 | 1, ch: string, fill: string, ink: boolean): Op => ({ x, y, w, f, ch, fill, ink, o: -1 });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = cov[r * cols + c], x = c * colW, y = r * lineH + lineH / 2;
    if (v >= look.solid) ops.push(op(x, y, colW, 0, hatchAt(look.hatch, r, c), grey(look.ink, 1), true));
    else if (v >= look.edge) ops.push(op(x, y, colW, 0, '.', grey(look.ink, 0.9), true));
    else if (look.shadow && solid(r - look.shadow, c - look.shadow) && v === 0) ops.push(op(x, y, colW, 0, ':', grey(look.ink, look.shadowInk), false));
    else if (look.grid && r % look.grid === 0 && c % (look.grid * 2) === 0) ground.push(op(x, y, colW, 0, '.', grey(look.ink, look.gridInk), false));
  }
  /* the green mark: `[+]` after the word, on its last row; it lands last */
  if (look.mark && word) {
    const c0 = Math.min(cols - 3, Math.ceil(right) + 1), r0 = Math.max(0, baseRow - 1);
    '[+]'.split('').forEach((ch, k) => last.push(op((c0 + k) * colW, r0 * lineH + lineH / 2, colW, 0, ch, a.green, false)));
  }

  /* the globe, facing the city, on the word's own rows: the text globe's frame generated at this many rows (its
     columns are narrower than the word's, as the globe's are, so it stays round) */
  let gw = colW;
  if (look.globe && a.land) {
    const ll = sub.city ? PLACE[sub.city] : null, facing = ll ? ll[1] - 12 : -100;
    let gr = Math.floor((place.globe.r * 2 * dpr) / lineH); gr -= gr % 2 === 0 ? 1 : 0; gr = Math.max(9, gr);
    const g = gridOf(gr), lines = genFrame(a.land, facing, gr); gw = (lineH * g.ry) / g.rx;
    const x0 = place.globe.x * dpr - g.cx * gw - gw / 2, y0 = place.globe.y * dpr - g.cy * lineH - lineH / 2;
    const mark = ll ? cellOf(g, facing, ll[0], ll[1]) : null;
    for (let r = 0; r < lines.length; r++) for (let c = 0; c < lines[r].length; c++) {
      const ch = lines[r][c]; if (ch === ' ') continue;
      const x = x0 + c * gw, y = y0 + r * lineH + lineH / 2;
      if (mark && mark[0] === r && mark[1] === c) { last.push(op(x - gw, y, gw, 1, '[', a.green, false), op(x, y, gw, 1, '+', a.green, false), op(x + gw, y, gw, 1, ']', a.green, false)); continue; }
      ops.push(ch === '.' ? op(x, y, gw, 1, '.', grey(look.ink, look.gridInk + 0.25), false) : op(x, y, gw, 1, ch === 'o' ? '.' : ch, grey(look.ink, 1), true));
    }
    /* the limb: a dotted ring just outside the land, as on the shirt */
    const R = g.rx * gw + gw * 0.6, Ry = g.ry * lineH + lineH * 0.5, cx = place.globe.x * dpr, cy = place.globe.y * dpr, n = Math.round((2 * Math.PI * R) / (gw * 2.2));
    for (let k = 0; k < n; k++) { const t = (k / n) * Math.PI * 2; ops.push(op(cx + Math.cos(t) * R - gw / 2, cy + Math.sin(t) * Ry, gw, 1, '.', grey(look.ink, look.gridInk + 0.3), false)); }
  }

  /* the print order: by rank among the glyphs that draw, so the print starts at once and ends evenly. print: rows
     top to bottom, left to right within a row, a little off by the seed; sweep: left to right. The marks come last. */
  const key = (k: Op) => { const j = hash3(Math.round(k.x), Math.round(k.y), look.seed); return look.reveal === 'sweep' ? k.x + j * W * 0.12 : Math.round(k.y / lineH) * W * 4 + k.x + j * colW * 8; };
  const ranked = ops.map((k) => [key(k), k] as const).sort((m, n) => m[0] - n[0]);
  ranked.forEach(([, k], i) => { k.o = (i / Math.max(1, ranked.length)) * 0.9; });
  last.forEach((k) => { k.o = 0.94; });

  const fonts = [`500 ${glyphSize(ctx, a.mono, colW)}px ${a.mono}`, `500 ${glyphSize(ctx, a.mono, gw * 1.15)}px ${a.mono}`];

  /* the stub's line (pass): small mono along the top, in ink 2, parts joined by a dot; parts drop from the end until
     the line clears the close key */
  let stub: ArtPlan['stub'] = null;
  if (look.mode === 'pass' && sub.lines?.length) {
    const fs = Math.round(11 * dpr), font = `500 ${fs}px ${a.mono}`, ls = (0.06 * fs) + 'px';
    ctx.font = font; ctx.letterSpacing = ls;
    const parts = sub.lines.slice(), room = W - place.pad * dpr - 64 * dpr;
    while (parts.length > 1 && ctx.measureText(parts.join('  ·  ').toUpperCase()).width > room) parts.pop();
    ctx.letterSpacing = '0px';
    stub = { text: parts.join('  ·  ').toUpperCase(), font, x: place.pad * dpr, y: 18 * dpr, ls, fill: a.ink2 };
  }
  return { W, H, lineH, fonts, ground, ops: ranked.map(([, k]) => k).concat(last), stub };
}

/* Paints one step of the print. `p`: how far it has come, 0 to 1 (1: still). The stub types in over the first half;
   the ink cells at the print's front draw as a block, the cursor. */
export function paintArt(ctx: CanvasRenderingContext2D, plan: ArtPlan, look: ArtLook, p: number) {
  ctx.clearRect(0, 0, plan.W, plan.H);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  let cur = -1;
  const lead = 0.05, lh = plan.lineH;
  for (const k of plan.ground.concat(plan.ops)) {
    if (k.o >= p && p < 1) continue;
    if (p < 1 && k.ink && p - k.o < lead) { ctx.fillStyle = grey(look.ink, 0.5); ctx.fillRect(k.x, k.y - lh / 2 + 1, k.w, lh - 2); continue; }
    if (cur !== k.f) { ctx.font = plan.fonts[k.f]; cur = k.f; }
    ctx.fillStyle = k.fill; ctx.fillText(k.ch, k.x, k.y);
  }
  const st = plan.stub;
  if (st) {
    ctx.font = st.font; ctx.textBaseline = 'top'; ctx.fillStyle = st.fill; ctx.letterSpacing = st.ls;
    ctx.fillText(st.text.slice(0, Math.ceil(st.text.length * Math.min(1, p / 0.5))), st.x, st.y);
    ctx.letterSpacing = '0px';
  }
}
