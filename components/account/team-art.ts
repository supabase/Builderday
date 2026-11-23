/* team-art.ts: the team as characters. A pure function of the look and the seats: the same look, seed and team always
   give the same characters, so a saved look is exactly what the sheet shows.

   seats: one stub per place in the team, side by side. A member is their initials in the departure board's 5 by 7
     letters (lib/email/art.ts), each dot `dotW` by `dotH` characters of the globe's hatch, with the print's shadow; an
     empty seat is a dim plus, a dim field of dots, or only its outline. You get the green [+] under your seat.
   board: the team's code in the same letters, and under it a row of seats as pips, [::] taken and [..] free.
   The seed moves the hatch's phase and the grid's. */
import { F } from '@/lib/dot-font';
import type { TeamLook } from './team-config';

/* a cell's ink: 0 none, 1 ink, 2 shadow and outlines, 3 the grid and empty seats, 4 green */
export type TeamInk = 0 | 1 | 2 | 3 | 4;
export type TeamArt = { rows: string[]; inks: TeamInk[][]; cols: number };
export type Seat = { initials: string; you: boolean } | null;

const glyph = (ch: string) => (F[ch] || F[' ']).split(' ');
/* a word's dots, `w` by 7, a column of gap between letters */
function dots(word: string) {
  const chars = word.toUpperCase().split('').filter((c) => F[c] !== undefined).slice(0, 8);
  const w = Math.max(0, chars.length * 6 - 1);
  return { w, on: (x: number, y: number) => { const i = Math.floor(x / 6), gx = x % 6; return i < chars.length && gx < 5 && y >= 0 && y < 7 && glyph(chars[i])[y][gx] === '1'; } };
}

/* two letters from a public name: the first of the first two words, else the first two letters; only A to Z */
export function initialsOf(name: string): string {
  const plain = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const words = plain.split(/[^A-Z]+/).filter(Boolean);
  if (words.length >= 2) return words[0][0] + words[1][0];
  return (words[0] || '').slice(0, 2) || '+';
}

export function teamArt(look: TeamLook, seats: Seat[], code: string): TeamArt {
  const s = look.seed, phase = s % 3, dw = look.dotW, dh = look.dotH;
  const hatch = (r: number, c: number) => (look.hatch === 'dots' ? ':' : look.hatch === 'dense' ? ((r + c) % 2 ? '|' : ':') : (r + c + phase) % 3 === 0 ? '|' : ':');
  const two = dots('MM');   /* every seat is as wide as two letters */
  const innerW = two.w * dw, innerH = 7 * dh, edge = look.frame ? 1 : 0;
  const seatW = innerW + 2 * (look.pad + edge) + look.shadow, seatH = innerH + 2 * (look.pad + edge) + look.shadow;
  const markRow = look.mark ? 1 : 0;

  let W: number, H: number;
  const word = dots(code.replace(/[^A-Z0-9-]/gi, ''));
  if (look.mode === 'board') { W = Math.max(word.w * dw + look.shadow, seats.length * 5 - 1) + 2; H = 7 * dh + look.shadow + 4; }
  else { W = seats.length * seatW + (seats.length - 1) * look.gap; H = seatH + markRow; }
  const ch: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
  const ink: TeamInk[][] = Array.from({ length: H }, () => Array(W).fill(0 as TeamInk));
  const put = (r: number, c: number, x: string, k: TeamInk) => { if (r >= 0 && r < H && c >= 0 && c < W) { ch[r][c] = x; ink[r][c] = k; } };

  if (look.grid) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if ((r + s) % look.grid === 0 && (c + 2 * s) % (look.grid * 2) === 0) put(r, c, '.', 3);

  /* letters at (r0, c0): solid dots in the hatch, the shadow down and right of them */
  const print = (d: ReturnType<typeof dots>, r0: number, c0: number, k: TeamInk) => {
    const on = (r: number, c: number) => { const x = c - c0, y = r - r0; return x >= 0 && y >= 0 && d.on(Math.floor(x / dw), Math.floor(y / dh)); };
    const h = 7 * dh + look.shadow, w = d.w * dw + look.shadow;
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) {
      if (on(r, c)) put(r, c, k === 1 ? hatch(r, c) : ':', k);
      else if (look.shadow && k === 1 && on(r - look.shadow, c - look.shadow)) put(r, c, ':', 2);
    }
  };

  if (look.mode === 'board') {
    print(word, 1, 1, 1);
    const pr = 7 * dh + look.shadow + 2;
    seats.forEach((st, i) => {
      const c = 1 + i * 5;
      put(pr, c, '[', st?.you && look.mark ? 4 : 2); put(pr, c + 3, ']', st?.you && look.mark ? 4 : 2);
      put(pr, c + 1, st ? hatch(pr, c + 1) : '.', st ? (st.you && look.mark ? 4 : 1) : 3); put(pr, c + 2, st ? hatch(pr, c + 2) : '.', st ? (st.you && look.mark ? 4 : 1) : 3);
    });
  } else {
    seats.forEach((st, i) => {
      const c0 = i * (seatW + look.gap), w = seatW - look.shadow, h = seatH - look.shadow;
      /* clear the seat of the grid, so letters and outline stand on plain ground */
      for (let r = 0; r < h; r++) for (let c = c0; c < c0 + w; c++) put(r, c, ' ', 0);
      if (look.frame) {
        const k: TeamInk = st ? 2 : 3;
        for (let c = c0; c < c0 + w; c++) { put(0, c, c === c0 || c === c0 + w - 1 ? '+' : '-', k); put(h - 1, c, c === c0 || c === c0 + w - 1 ? '+' : '-', k); }
        for (let r = 1; r < h - 1; r++) { put(r, c0, st ? '|' : ':', k); put(r, c0 + w - 1, st ? '|' : ':', k); }
      }
      const r0 = edge + look.pad, ci = c0 + edge + look.pad;
      if (st) {
        const d = dots(st.initials); print(d, r0, ci + Math.floor((innerW - d.w * dw) / 2), 1);
        if (look.mark && st.you) { const m = c0 + Math.floor(w / 2) - 1; put(seatH, m, '[', 4); put(seatH, m + 1, '+', 4); put(seatH, m + 2, ']', 4); }
      } else if (look.empty === 'plus') {
        const d = dots('+'); print(d, r0, ci + Math.floor((innerW - d.w * dw) / 2), 3);
      } else if (look.empty === 'dots') {
        for (let r = r0; r < r0 + innerH; r++) for (let c = ci; c < ci + innerW; c++) if ((r + c) % 2 === 0) put(r, c, '.', 3);
      }
    });
  }
  return { rows: ch.map((r) => r.join('')), inks: ink, cols: W };
}
