/* Test cards: what a city's monitor shows when it is not live. Before it opens, its test card: bars, a circle whose
   hands stand at the city's real opening time, a step ramp or a grating, and the city's code, name, page and opening
   time. After it closes, its closedown card: the same pattern dimmed, with its three finalists.
   Each city's card is drawn from a seed (its id, or the seed kept in saved/parts.config.json), so it is the same on
   every visit. The pattern is an SVG; the words are HTML over it, so they stay
   sharp and readable at any size. The card is a picture: nothing on it is under the screen lines. */
import { mulberry32 } from '@/lib/day-data';
import { hhmm, tz } from '@/lib/format';
import type { CardPalette } from './config';

const PAL: Record<CardPalette, string[]> = {
  wheel: ['#f4f4f2', '#d8d8d4', '#b4b4b0', '#ff7a1a', '#8a8a86', '#3d3dff', '#5c5d5c', '#f8d3a0', '#2b2c2c'],
  broadcast: ['#bfbfbf', '#bfbf00', '#00bfbf', '#00bf00', '#bf00bf', '#bf0000', '#0000bf', '#ffffff', '#131313'],
  mono: ['#f4f4f2', '#d6d6d2', '#b8b8b4', '#9a9a96', '#7c7c79', '#5e5e5c', '#40403f', '#2b2c2c', '#1a1b1b'],
};
const GROUND = '#0c0d0d';
/* coordinates rounded, so the server's drawing and the browser's agree to the digit */
const q = (n: number) => Math.round(n * 100) / 100;
export function seedOf(id: string): number { let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return (h >>> 0) % 9973 + 1; }

export type CardCity = { id: string; name: string; code: string; opens: number; offset: number };
export type Finalist = { place: number; name: string; votes: number };

export function TestCard({ city, seed, bars, palette, closedown, finalists, line, className }: {
  city: CardCity; seed: number; bars: number; palette: CardPalette; closedown?: boolean; finalists?: Finalist[]; line?: string; className?: string;
}) {
  const R = mulberry32(seed * 7919 + 13), W = 320, H = 200, bandH = Math.round(H * (0.5 + R() * 0.12)), pal = PAL[palette];
  const rot = Math.floor(R() * bars), cols = Array.from({ length: bars }, (_, i) => pal[(i + rot) % pal.length]);
  const bw = q(W / bars), cx = q([0.5, 0.36, 0.64][Math.floor(R() * 3)] * W), cy = q(bandH * 0.5), r = q(H * (0.2 + R() * 0.04));
  const grid = R() < 0.55, gstep = [16, 20, 24][Math.floor(R() * 3)], lower = R() < 0.5 ? 'ramp' : 'grating', steps = 4 + Math.floor(R() * 5);
  const local = city.opens + city.offset, hA = ((local / 60) % 12) / 12 * Math.PI * 2, mA = (local % 60) / 60 * Math.PI * 2;
  const hand = (a: number, l: number) => ({ x2: q(cx + Math.sin(a) * l), y2: q(cy - Math.cos(a) * l) });
  return (
    <figure className={'tc' + (closedown ? ' tc-down' : '') + (className ? ' ' + className : '')} aria-label={closedown ? city.name + ' has closed' : line ? city.name + ': ' + line : city.name + ' opens at ' + hhmm(local)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width={W} height={H} fill={GROUND} />
        <g opacity={closedown ? 0.32 : 1}>
          {cols.map((c, i) => <rect key={i} x={q(i * bw)} y={0} width={q(bw + 0.5)} height={bandH} fill={c} />)}
          {cols.slice().reverse().map((c, i) => <rect key={'r' + i} x={q(i * bw)} y={bandH} width={q(bw + 0.5)} height={8} fill={i % 2 ? GROUND : c} opacity={0.7} />)}
          {grid ? <g stroke="#f4f4f2" strokeOpacity="0.14" strokeWidth="0.6">{Array.from({ length: Math.ceil(W / gstep) }, (_, i) => <line key={'v' + i} x1={i * gstep} x2={i * gstep} y1={bandH + 8} y2={H} />)}{Array.from({ length: Math.ceil((H - bandH) / gstep) }, (_, i) => <line key={'h' + i} y1={bandH + 8 + i * gstep} y2={bandH + 8 + i * gstep} x1={0} x2={W} />)}</g> : null}
          {lower === 'ramp'
            ? Array.from({ length: steps }, (_, i) => <rect key={'s' + i} x={q(W * 0.06 + i * (W * 0.88 / steps))} y={H - 30} width={q(W * 0.88 / steps + 0.5)} height={18} fill={`rgb(${Array(3).fill(Math.round(244 * (i / (steps - 1)))).join(' ')})`} />)
            : Array.from({ length: 28 }, (_, i) => { const x = q(W * 0.06 + (W * 0.88) * Math.pow(i / 28, 0.7)); return <rect key={'g' + i} x={x} y={H - 30} width={q(Math.max(0.6, 4 - i * 0.13))} height={18} fill="#f4f4f2" />; })}
        </g>
        {closedown ? null : (
          <g>
            <circle cx={cx} cy={cy} r={r} fill={GROUND} stroke="#f4f4f2" strokeWidth="1.2" />
            {Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2, o = i % 3 ? 0.9 : 0.82; return <line key={'k' + i} x1={q(cx + Math.sin(a) * r * o)} y1={q(cy - Math.cos(a) * r * o)} x2={q(cx + Math.sin(a) * r * 0.97)} y2={q(cy - Math.cos(a) * r * 0.97)} stroke="#f4f4f2" strokeWidth={i % 3 ? 0.8 : 1.6} />; })}
            <line x1={cx} y1={cy} {...hand(hA, r * 0.5)} stroke="#f4f4f2" strokeWidth="2.2" strokeLinecap="round" />
            <line x1={cx} y1={cy} {...hand(mA, r * 0.78)} stroke="#f4f4f2" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="2.2" fill="#ff7a1a" />
          </g>
        )}
      </svg>
      <figcaption className="tc-txt">
        <span className="tc-code">{city.code}</span>
        {closedown ? (
          <>
            <span className="tc-l">Closedown</span>
            {finalists && finalists.length ? <ol className="tc-fin">{finalists.map((f) => <li key={f.place}><span>{f.place}</span><span className="tc-nm">{f.name}</span><span className="tc-v">{f.votes}</span></li>)}</ol> : <span className="tc-l">No entries</span>}
          </>
        ) : <span className="tc-l">{line ?? 'Opens ' + hhmm(local) + ' ' + tz(city.offset)}</span>}
      </figcaption>
    </figure>
  );
}
