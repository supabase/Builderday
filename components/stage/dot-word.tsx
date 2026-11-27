'use client';
import { useEffect, useRef } from 'react';
import { F } from '@/lib/dot-font';
import { MONO } from '@/components/wheel/config';

/* Print: a scene's words drawn as the globe draws land. Each letter is the board's 5 by 7 dots; each dot is two
   characters of the globe's hatch (`:` where the column and row add to a multiple of three, `|` elsewhere: the globe's
   two characters on its fixed grid, weighted to the bar so a letter reads from the back of the room), with the cells around it a faint dotted grid. The words print once in reading
   order behind a block cursor, a whole cell at a time, and stay. The real words are the heading's text; the canvas is
   a picture of them. */

const MORE: Record<string, string> = {
  '?': '01110 10001 00001 00010 00100 00000 00100', '.': '00000 00000 00000 00000 00000 01100 01100',
  ',': '00000 00000 00000 00000 01100 00100 01000', '$': '00100 01111 10100 01110 00101 11110 00100',
  ':': '00000 01100 01100 00000 01100 01100 00000', "'": '00100 00100 01000 00000 00000 00000 00000',
};
const glyph = (ch: string) => (MORE[ch] ?? F[ch] ?? F[' ']).split(' ');
/* a letter is 5 dots of 2 characters and a gap of 2: 12 columns; a row of letters is 7 rows and a gap of 3 */
const COLS = 12, ROWS = 7, GAP_ROWS = 2;

/* the words broken into at most `max` lines, as even as can be */
function lines(text: string, max: number): string[] {
  const words = text.toUpperCase().replace(/’/g, "'").split(/\s+/).filter(Boolean);
  let best: string[] = [words.join(' ')], bestW = best[0].length;
  for (let n = 2; n <= Math.min(max, words.length); n++) {
    const target = words.join(' ').length / n, out: string[] = [];
    let cur = '';
    for (const w of words) { const next = cur ? cur + ' ' + w : w; if (cur && next.length > target && out.length < n - 1) { out.push(cur); cur = w; } else cur = next; }
    out.push(cur);
    const wd = Math.max(...out.map((l) => l.length));
    if (wd < bestW) { best = out; bestW = wd; }
  }
  return best;
}

export function DotWord({ text, maxLines = 3, maxCell = 20, ms = 900, fresh = true, reduced = false, className }: {
  text: string; maxLines?: number;
  /* the widest a character cell may be, in wall px (at 1920 by 1080) */
  maxCell?: number;
  /* how long the print takes; fresh: it prints (a step the wall arrived at is simply there) */
  ms?: number; fresh?: boolean; reduced?: boolean; className?: string;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = cv.current, box = el?.parentElement, wall = el?.closest('.sw') as HTMLElement | null;
    if (!el || !box || !wall) return;
    const ctx = el.getContext('2d'); if (!ctx) return;
    let raf = 0, t0 = 0;
    const font = MONO.geist.replace(/var\((--[\w-]+)\)/g, (_m, v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || 'monospace');
    const ls = lines(text, maxLines);
    const plan = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2), wpx = wall.clientHeight / 1080;
      const availW = box.clientWidth, availH = Math.max(box.clientHeight, wall.clientHeight * 0.66);
      const widest = Math.max(...ls.map((l) => l.length)) * COLS - 2, tall = ls.length * (ROWS + GAP_ROWS) - GAP_ROWS;
      /* the cell: as wide as fits, never wider than maxCell; a row is 2.15 cells tall, as the globe's */
      const cell = Math.max(2, Math.min(maxCell * wpx, availW / widest, availH / (tall * 2.15)));
      const cw = Math.max(1, Math.round(cell * ratio)), lh = Math.round(cw * 2.15);
      const W = widest * cw, H = tall * lh;
      el.width = W; el.height = H; el.style.width = W / ratio + 'px'; el.style.height = H / ratio + 'px';
      /* every cell in reading order: on (hatch) or grid */
      const cells: { x: number; y: number; ch: string; on: boolean }[] = [];
      ls.forEach((l, li) => {
        for (let r = 0; r < ROWS; r++) for (let k = 0; k < l.length; k++) {
          const g = glyph(l[k])[r];
          for (let d = 0; d < 5; d++) for (let h = 0; h < 2; h++) {
            const col = k * COLS + d * 2 + h, row = li * (ROWS + GAP_ROWS) + r, on = g[d] === '1';
            cells.push({ x: col * cw, y: row * lh, ch: on ? ((col + row) % 3 === 0 ? ':' : '|') : (col % 2 === 0 && row % 2 === 0 ? '.' : ''), on });
          }
        }
      });
      return { W, H, cw, lh, cells, px: cw / 0.6 };
    };
    const p = plan();
    const paint = (n: number) => {
      ctx.clearRect(0, 0, p.W, p.H);
      ctx.font = `700 ${p.px}px ${font}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      let shown = 0, last: { x: number; y: number } | null = null;
      for (const c of p.cells) {
        if (!c.ch) continue;
        if (shown >= n) break;
        shown++; last = c;
        ctx.fillStyle = c.on ? '#f4f4f2' : 'rgba(244, 244, 242, 0.16)';
        ctx.fillText(c.ch, c.x + p.cw / 2, c.y + p.lh / 2);
      }
      /* the block cursor sits on the cell after the last one printed */
      if (last && n < Infinity) { ctx.fillStyle = '#3ecf8e'; ctx.fillRect(last.x + p.cw, last.y + p.lh * 0.15, p.cw, p.lh * 0.7); }
    };
    const total = p.cells.filter((c) => c.ch).length;
    if (!fresh || reduced || ms <= 0) { paint(Infinity); return; }
    const frame = (now: number) => {
      t0 ||= now;
      const u = Math.min(1, (now - t0) / ms);
      if (u >= 1) { paint(Infinity); return; }
      /* whole cells per frame, an even rate */
      paint(Math.floor(u * total)); raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [text, maxLines, maxCell, ms, fresh, reduced]);
  return <canvas ref={cv} className={'stp-word' + (className ? ' ' + className : '')} aria-hidden="true" />;
}
