import type { ReactNode } from 'react';

/* The segment display: the one big number on a page, the time left. Digits only, each from seven strokes; the strokes
   that are off stay faintly there, as on a real display. The state is a row of fixed legends that light up (OPENS,
   BUILD, VOTE, CLOSED), never free text. Always the same width: hours, minutes and (if shown) seconds, zero-padded;
   past 99 hours it shows days. The reading is in the text for screen readers; the drawing is hidden from them. */

/* segments a to g of a digit in a 10 by 18 box, as polygons with bevelled ends */
const T = 2, W = 10, H = 18, M = H / 2;
const SEG: Record<string, string> = {
  a: `1,0 ${W - 1},0 ${W - 1 - T},${T} ${1 + T},${T}`,
  b: `${W},1 ${W},${M - 0.5} ${W - T},${M - 0.5 - T * 0.5} ${W - T},${1 + T}`,
  c: `${W},${M + 0.5} ${W},${H - 1} ${W - T},${H - 1 - T} ${W - T},${M + 0.5 + T * 0.5}`,
  d: `1,${H} ${W - 1},${H} ${W - 1 - T},${H - T} ${1 + T},${H - T}`,
  e: `0,${M + 0.5} ${T},${M + 0.5 + T * 0.5} ${T},${H - 1 - T} 0,${H - 1}`,
  f: `0,1 ${T},${1 + T} ${T},${M - 0.5 - T * 0.5} 0,${M - 0.5}`,
  g: `${1},${M} ${1 + T},${M - T / 2} ${W - 1 - T},${M - T / 2} ${W - 1},${M} ${W - 1 - T},${M + T / 2} ${1 + T},${M + T / 2}`,
};
const ON: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', ' ': '' };

function Digit({ d, x }: { d: string; x: number }) {
  const on = ON[d] ?? '';
  return <g transform={`translate(${x} 0) skewX(-6)`}>{Object.keys(SEG).map((k) => <polygon key={k} points={SEG[k]} className={on.indexOf(k) >= 0 ? 'sg-on' : 'sg-off'} />)}</g>;
}

export type Legend = 'OPENS' | 'BUILD' | 'VOTE' | 'CLOSED';
export const LEGENDS: Legend[] = ['OPENS', 'BUILD', 'VOTE', 'CLOSED'];

/* the reading for a number of seconds left */
export function segText(secs: number, withSecs: boolean): { digits: string; days: boolean } {
  const s = Math.max(0, Math.floor(secs)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60, p = (n: number) => String(n).padStart(2, '0');
  if (h > 99) { const d = Math.floor(h / 24); return { digits: p(Math.min(99, d)) + ':' + p(h % 24) + (withSecs ? ':' + p(m) : ''), days: true }; }
  return { digits: p(h) + ':' + p(m) + (withSecs ? ':' + p(x) : ''), days: false };
}

/* `also` lights a second legend beside `lit`, for a moment that is two things at once (building with voting open);
   left out, one legend lights as before */
export function Segment({ secs, lit, also, label, withSecs, className }: { secs: number; lit: Legend | null; also?: Legend | null; label: string; withSecs: boolean; className?: string }) {
  const r = segText(secs, withSecs), parts = r.digits.split(':');
  let x = 0; const g: ReactNode[] = [];
  parts.forEach((p, i) => {
    if (i) { g.push(<g key={'c' + i} className="sg-on"><rect x={x + 1} y={4.5} width={2} height={2} /><rect x={x} y={11.5} width={2} height={2} /></g>); x += 5; }
    p.split('').forEach((d, j) => { g.push(<Digit key={i + '-' + j} d={d} x={x} />); x += W + 3; });
  });
  const vw = x - 2;
  return (
    <div className={'sg' + (className ? ' ' + className : '')} role="timer" aria-live="off" aria-label={label}>
      <svg className="sg-digits" viewBox={`-1 -1 ${vw + 2} ${H + 2}`} aria-hidden="true">{g}</svg>
      <div className="sg-legends" aria-hidden="true">
        {LEGENDS.map((l) => <span key={l} className={l === lit || (also && l === also) ? 'sg-lit' : undefined}>{l[0] + l.slice(1).toLowerCase()}</span>)}
      </div>
    </div>
  );
}
