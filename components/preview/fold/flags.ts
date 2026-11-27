/* Flags in dots, for the city columns of How Builder Day works (how.tsx). Each is a grid of 15 by 10 dots, one colour a
   dot, drawn from a few shapes (stripes, a disc, a crescent, a star as a handful of dots): the same dot matrix as the
   text globe and the emails, so a flag reads as one of the page's own marks and not as a picture from somewhere else.
   Pure. */

export const FLAG_W = 15, FLAG_H = 10;
type Fn = (x: number, y: number) => string;

/* the inks, a little under full strength so a flag sits in the page's black */
export const FLAG_INK: Record<string, string> = {
  R: '#d8505d', W: '#ecebe4', B: '#4a6bb5', L: '#7fb2e0', G: '#2f9f69', Y: '#e5c050', K: '#1c1d1d', N: '#a8845a', _: 'transparent',
};

const disc = (x: number, y: number, cx: number, cy: number, r: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const crescent = (x: number, y: number, cx: number, cy: number, r: number, dx: number, dy: number, r2: number) => disc(x, y, cx, cy, r) && !disc(x, y, cx + dx, cy + dy, r2);

const FLAGS: Record<string, Fn> = {
  /* stars and stripes: seven stripes' worth of rows, the canton with a checker of stars */
  US: (x, y) => (x <= 6 && y <= 4 ? (x % 2 === 1 && y % 2 === 1 ? 'W' : x % 2 === 0 && y % 2 === 0 && x > 0 && x < 6 && y > 0 && y < 4 ? 'W' : 'B') : y % 2 === 0 ? 'R' : 'W'),
  GB: (x, y) => {
    const dx = x / (FLAG_W - 1), dy = y / (FLAG_H - 1);
    if (x === 7 || y === 4 || y === 5) return 'R';
    if (x === 6 || x === 8 || y === 3 || y === 6) return 'W';
    return Math.abs(dx - dy) < 0.1 || Math.abs(dx - (1 - dy)) < 0.1 ? 'W' : 'B';
  },
  KR: (x, y) => {
    if (disc(x, y, 7, 4.5, 2.3)) return y + (x - 7) * 0.5 < 4.5 ? 'R' : 'B';
    const t = (x === 2 || x === 12) && (y === 1 || y === 2 || y === 7 || y === 8) || (x === 1 || x === 13) && (y === 1 || y === 8) || (x === 3 || x === 11) && (y === 2 || y === 7);
    return t ? 'K' : 'W';
  },
  SG: (x, y) => {
    if (crescent(x, y, 3.5, 2.3, 2.3, 1.3, 0, 1.9)) return 'W';
    if ((x === 8 && y === 0) || (x === 10 && y === 1) || (x === 9 && y === 3) || (x === 7 && y === 3) || (x === 6 && y === 1)) return 'W';
    return y < 5 ? 'R' : 'W';
  },
  PK: (x, y) => {
    if (x < 4) return 'W';
    if (crescent(x, y, 9, 4.5, 2.9, 1.2, -0.7, 2.4) || (x === 11 && y === 2) || (x === 12 && y === 3)) return 'W';
    return 'G';
  },
  MR: (x, y) => {
    if (y <= 1 || y >= 8) return 'R';
    if (crescent(x, y, 7, 3.8, 2.6, 0, -1.4, 2.3) || (x === 7 && y === 3)) return 'Y';
    return 'G';
  },
  AR: (x, y) => (disc(x, y, 7, 4.5, 1.3) ? 'Y' : (['L', 'W', 'W', 'L'] as const)[Math.min(3, Math.floor(y / 2.5))]),
  CL: (x, y) => (y >= 5 ? 'R' : x <= 4 ? (x === 2 && y === 2) || (x === 1 && y === 2) || (x === 3 && y === 2) || (x === 2 && (y === 1 || y === 3)) ? 'W' : 'B' : 'W'),
  EC: (x, y) => (disc(x, y, 7, 4.5, 1) ? 'N' : y < 5 ? 'Y' : y < 7 ? 'B' : 'R'),
  CA: (x, y) => {
    const leaf = [[7], [6, 7, 8], [5, 6, 7, 8, 9], [5, 6, 7, 8, 9], [6, 7, 8], [7], [7]];
    if (y >= 2 && y <= 8 && leaf[y - 2]?.includes(x)) return 'R';
    return x <= 3 || x >= 11 ? 'R' : 'W';
  },
  SV: (x, y) => ((x === 7 && y === 3) ? 'Y' : (x >= 6 && x <= 8 && y === 4) || (x === 7 && y === 5) ? 'G' : (['B', 'W', 'W', 'B'] as const)[Math.min(3, Math.floor(y / 2.5))]),
  MX: (x, y) => ((x === 7 && y >= 4 && y <= 5) || (x === 6 && y === 5) || (x === 8 && y === 5) ? 'N' : x < 5 ? 'G' : x < 10 ? 'W' : 'R'),
};

/* the flag of each city's country: its two letters */
export const COUNTRY: Record<string, string> = {
  seoul: 'KR', singapore: 'SG', peshawar: 'PK', nouakchott: 'MR', london: 'GB', rosario: 'AR', santiago: 'CL', manta: 'EC',
  'new-york': 'US', toronto: 'CA', 'san-salvador': 'SV', austin: 'US', 'mexico-city': 'MX', 'san-francisco': 'US',
};

/* one SVG path per ink: each dot is a zero-length round-capped stroke, so the whole flag is a handful of nodes */
const CACHE = new Map<string, { ink: string; d: string }[]>();
export function flagPaths(cc: string): { ink: string; d: string }[] {
  const hit = CACHE.get(cc); if (hit) return hit;
  const f = FLAGS[cc]; if (!f) return [];
  const by = new Map<string, string>();
  for (let y = 0; y < FLAG_H; y++) for (let x = 0; x < FLAG_W; x++) { const k = f(x, y); by.set(k, (by.get(k) ?? '') + `M${x + 0.5} ${y + 0.5}h0`); }
  const out = [...by].map(([k, d]) => ({ ink: FLAG_INK[k] ?? FLAG_INK.W, d }));
  CACHE.set(cc, out);
  return out;
}
