/* art.ts: the emails' picture, as characters. A pure function of the look and the subject: the same look, seed and
   subject always give the same characters, so a saved look is exactly what goes out.

   What it draws, on one grid of `cols` columns:
   - the word (a six-digit code, a city's three letters, HOST or JUDGE) in a 5 by 7 dot matrix, the departure board's
     letters; each dot is `dotW` columns by `dotH` rows of the globe's hatch, `:` with `|` on every third diagonal;
   - the print's offset shadow, `shadow` cells down and right, in a dim `:`;
   - the dotted grid behind, a dim `.` every `grid` cells;
   - the text globe facing the person's city (components/wheel/text-globe.ts, the same generator the site uses, read
     from a baked land map), with the city as a green `[+]`.
   Where the globe goes: beside the word when both fit in the columns, else nowhere (mode globe: always above, large).
   The seed moves the hatch's phase, the grid's phase and nudges the globe a few degrees. */
import { genFrame, gridOf, cellOf, type LandMap } from '@/components/wheel/text-globe';
import { PLACE } from '@/lib/places';
import { LAND_BITS, LAND_H, LAND_W } from './land';
import type { EmailLook } from './look';
import { F } from '@/lib/dot-font';

/* a cell: its character and its ink (0 none, 1 ink, 2 shadow, 3 grid, 4 green, 5 the globe's dotted limb) */
export type Ink = 0 | 1 | 2 | 3 | 4 | 5;
export type Art = { rows: string[]; inks: Ink[][]; cols: number };
export type ArtSubject = { word: string; city?: string | null };

let land: LandMap | null = null;
function landMap(): LandMap {
  if (land) return land;
  const bin = typeof atob === 'function' ? atob(LAND_BITS) : Buffer.from(LAND_BITS, 'base64').toString('binary');
  const data = new Uint8Array(LAND_W * LAND_H);
  for (let i = 0; i < data.length; i++) data[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1 ? 255 : 0;
  return (land = { w: LAND_W, h: LAND_H, data });
}

const glyph = (ch: string) => (F[ch] || F[' ']).split(' ');

/* the word's dots: a bitmap of `w` by 7, one column of gap between letters */
function wordDots(word: string): { w: number; on: (x: number, y: number) => boolean } {
  const chars = word.toUpperCase().split('').filter((c) => F[c] !== undefined).slice(0, 12);
  const w = Math.max(0, chars.length * 6 - 1);
  return { w, on: (x, y) => { const i = Math.floor(x / 6), gx = x % 6; return i < chars.length && gx < 5 && glyph(chars[i])[y][gx] === '1'; } };
}

/* the globe as rows of characters, cropped to its limb, facing the city (the seed nudges it), the city's cell found */
function globeRows(rows: number, city: string | null | undefined, seed: number) {
  const ll = city ? PLACE[city] : null, nudge = ((seed * 9301 + 49297) % 233280) / 233280 * 16 - 8;
  const facing = (ll ? ll[1] : -40) - 12 + nudge;
  const g = gridOf(rows), lines = genFrame(landMap(), facing, rows);
  const lo = Math.max(0, Math.floor(g.cx - g.rx) - 1), hi = Math.min(g.cols - 1, Math.ceil(g.cx + g.rx) + 1);
  const mark = ll ? cellOf(g, facing, ll[0], ll[1]) : null;
  return { lines: lines.map((l) => l.slice(lo, hi + 1)), w: hi - lo + 1, mark: mark ? [mark[0], mark[1] - lo] as [number, number] : null };
}

export function makeArt(look: EmailLook, sub: ArtSubject): Art {
  const W = look.cols, s = look.seed, phase = s % 3;
  const word = wordDots(sub.word || '');
  const wantGlobe = look.globe && look.mode !== 'plain';
  const gRows = look.mode === 'globe' ? Math.min(17, look.globeRows + 4) : look.globeRows;
  let globe = wantGlobe ? globeRows(gRows, sub.city, s) : null;

  /* the word's dot size: as asked, narrower until it fits beside the globe, then alone */
  let dw = look.dotW;
  const fits = (d: number, room: number) => word.w * d + look.shadow <= room;
  const beside = globe && look.mode !== 'globe' ? W - globe.w - 3 : W;
  /* the word's size wins over the globe's place: beside at the asked size, else under it at the asked size, and only
     then narrower dots */
  let side = false;
  if (globe && look.mode !== 'globe') for (let d = look.dotW; d >= Math.min(2, look.dotW); d--) if (fits(d, beside)) { dw = d; side = true; break; }
  if (!side) while (dw > 1 && !fits(dw, W)) dw--;
  /* under a long word the globe would only float in the corner: outside the globe layout it goes beside or not at all */
  if (!side && look.mode !== 'globe' && word.w) globe = null;
  const wordW = word.w * dw, wordH = word.w ? 7 * look.dotH : 0;

  /* the frame: rows for the word (and the globe beside it, or above/below it) with one row of air top and bottom */
  const pad = 1, gH = globe ? globe.lines.length : 0;
  const H = side ? Math.max(wordH + look.shadow, gH) + pad * 2 : wordH + (wordH ? look.shadow : 0) + gH + (globe && wordH ? 1 : 0) + pad * 2;
  const ch: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
  const ink: Ink[][] = Array.from({ length: H }, () => Array(W).fill(0 as Ink));
  const put = (r: number, c: number, x: string, k: Ink) => { if (r >= 0 && r < H && c >= 0 && c < W) { ch[r][c] = x; ink[r][c] = k; } };

  /* where things go */
  let wr = pad, wc = 0, gr = pad, gc = 0;
  if (side && globe) { wr = pad + Math.max(0, Math.floor((gH - wordH - look.shadow) / 2)); gc = W - globe.w; gr = pad + Math.max(0, Math.floor((wordH + look.shadow - gH) / 2)); }
  else if (globe && look.mode === 'globe') { gc = Math.floor((W - globe.w) / 2); gr = pad; wr = pad + gH + 1; wc = Math.floor((W - wordW) / 2); }
  else if (globe) { wr = pad; gr = pad + wordH + look.shadow + 1; gc = W - globe.w; }

  /* the grid first, so everything else covers it */
  if (look.grid) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if ((r + s) % look.grid === 0 && (c + 2 * s) % (look.grid * 2) === 0) put(r, c, '.', 3);

  /* the word, its shadow under it */
  const solid = (r: number, c: number) => { const x = Math.floor((c - wc) / dw), y = Math.floor((r - wr) / look.dotH); return c >= wc && r >= wr && x < word.w && y < 7 && word.on(x, y); };
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (solid(r, c)) {
      const k = (r + c + phase) % 3, x = look.hatch === 'dots' ? ':' : look.hatch === 'dense' ? ((r + c) % 2 ? '|' : ':') : k === 0 ? '|' : ':';
      put(r, c, x, 1);
    } else if (look.shadow && solid(r - look.shadow, c - look.shadow)) put(r, c, ':', 2);
  }

  /* the globe */
  if (globe) {
    globe.lines.forEach((line, r) => { for (let c = 0; c < line.length; c++) { const x = line[c]; if (x === ' ') continue; put(gr + r, gc + c, x === 'o' ? '.' : x, x === '.' ? 5 : 1); } });
    if (look.mark && globe.mark) { const [r, c] = globe.mark; put(gr + r, gc + c - 1, '[', 4); put(gr + r, gc + c, '+', 4); put(gr + r, gc + c + 1, ']', 4); }
  }
  return { rows: ch.map((r) => r.join('')), inks: ink, cols: W };
}
