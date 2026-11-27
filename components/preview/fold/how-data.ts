import { EVENT, mulberry32 } from '@/lib/day-data';

/* The numbers behind the three drawings of How Builder Day works (how.tsx). Pure and seeded: the same on the server and
   in the browser, so the section's first paint is the finished picture and a replay draws the same one.
   The votes are an illustration, not a count: nine made-up projects over one city's block. Voting opens at OPEN_MIN,
   the counts are hidden until SHOW_MIN and live until END_MIN. "Yours" (Gig map, the project printed in Build) is third
   when the counts are shown and first at the close. The page never says who casts the votes. */

export const END_MIN = 90;
export const OPEN_MIN = EVENT.publicAt ?? 0;
export const SHOW_MIN = EVENT.showAt ?? OPEN_MIN;

/* the project the three drawings follow: printed in Build, a row in the votes, a row in your city's column */
export const YOURS = 'Gig map';
export const PROJECTS = [YOURS, 'Field notes', 'Sound map', 'Switchyard', 'Open atlas', 'Night bus', 'Tide table', 'Pocket choir', 'Loose ends'] as const;
/* cumulative votes at seven checkpoints, evenly spaced from OPEN_MIN to END_MIN */
const CHECK: number[][] = [
  [0, 4, 9, 22, 36, 48, 61],
  [0, 6, 14, 27, 40, 49, 55],
  [0, 5, 11, 24, 35, 43, 48],
  [0, 3, 7, 14, 22, 29, 36],
  [0, 2, 6, 12, 18, 24, 29],
  /* the rest of the board, under the cut: a city has more than five, the panel shows as many as fit and fades the rest */
  [0, 3, 6, 10, 15, 20, 24],
  [0, 1, 4, 8, 12, 16, 20],
  [0, 2, 4, 7, 10, 13, 15],
  [0, 1, 2, 5, 7, 9, 11],
];
export const PEAK = 64;

/* one value per minute, 0..90 (0 before voting opens): the checkpoints joined, with small seeded bursts, never down */
export const HISTORY: number[][] = CHECK.map((pts, lane) => {
  const R = mulberry32(521 + lane * 719), out: number[] = [], span = (END_MIN - OPEN_MIN) / 6;
  let last = 0;
  for (let m = 0; m <= END_MIN; m++) {
    if (m <= OPEN_MIN) { out.push(0); continue; }
    const u = (m - OPEN_MIN) / span, seg = Math.min(5, Math.floor(u)), f = u - seg;
    const base = pts[seg] + (pts[seg + 1] - pts[seg]) * f;
    const v = Math.max(last, Math.round(base + (R() - 0.5) * 2.2 * (m < END_MIN ? 1 : 0)));
    out.push(m === END_MIN ? pts[6] : v);
    last = out[out.length - 1];
  }
  return out;
});

/* the order at a minute, most votes first; a tie keeps the lane order (the order they came in) */
export function order(m: number): number[] {
  const at = Math.min(END_MIN, Math.max(0, Math.floor(m)));
  return HISTORY.map((_, i) => i).sort((a, b) => HISTORY[b][at] - HISTORY[a][at] || a - b);
}

/* How the vote drawing's clock runs against its progress p (0 to 1): to the opening quickly, the hidden stretch, a
   hold at the reveal (the hatch lifts, then the counts land from the bottom up, then the rows settle), then the live
   stretch at an easier pace. m: the minute shown; reveal: 0 while hidden, then 0 to 1 through the hold. */
const OPEN_END = 0.06, HIDE_END = 0.3;
/* hold: the share of the drawing the reveal takes (the live stretch gives it up) */
export function clockAt(p: number, hold = 0.18): { m: number; reveal: number } {
  const HOLD_END = HIDE_END + hold;
  if (p >= 1) return { m: END_MIN, reveal: 1 };
  if (p <= 0) return { m: 0, reveal: 0 };
  if (p < OPEN_END) return { m: (p / OPEN_END) * OPEN_MIN, reveal: 0 };
  if (p < HIDE_END) return { m: OPEN_MIN + ((p - OPEN_END) / (HIDE_END - OPEN_END)) * (SHOW_MIN - OPEN_MIN), reveal: 0 };
  if (p < HOLD_END) return { m: SHOW_MIN, reveal: (p - HIDE_END) / (HOLD_END - HIDE_END) };
  return { m: SHOW_MIN + ((p - HOLD_END) / (1 - HOLD_END)) * (END_MIN - SHOW_MIN), reveal: 1 };
}
/* the start frame the vote drawing plays from when it comes into view: just after voting opens, so the hidden
   stretch and the reveal are always seen */
export const VOTE_FROM = OPEN_END + 0.02;

/* the example projects of the other cities in the final, three each, in a fixed order */
export const EXAMPLES: string[][] = [
  ['Relay', 'Soft signal', 'Offcut'], ['Sidecar', 'Daylight', 'Paper trail'], ['Local loop', 'Paloma', 'Postmark'],
  ['Wayfinder', 'Night shift', 'Beacon'], ['Tidepool', 'Daybreak', 'Pocket map'], ['Kopi run', 'Crosswalk', 'Canopy'],
  ['Streetlight', 'Dispatch', 'Wavelength'], ['Overtone', 'Fieldwork', 'Switchback'], ['Headroom', 'Patchwork', 'First light'],
  ['Lantern', 'Quayside', 'Tinder'], ['Harbour', 'Almanac', 'Spindle'], ['Bellwether', 'Kiln', 'Margin'], ['Sundial', 'Tessera', 'Foxglove'],
];

/* The build receipt: what prints, at which minute, as the project goes from an empty folder to submitted. The last
   line is the submit, in the way the reader picked (editor or browser). */
export type Line = { at: number; what: string; note?: string };
export const RECEIPT: Line[] = [
  { at: 0, what: 'Empty folder', note: 'clock starts' },
  { at: 4, what: 'New Supabase project' },
  { at: 11, what: 'Table gigs', note: 'venue, starts_at, tickets_left' },
  { at: 26, what: 'Sign in with email' },
  { at: 47, what: 'Map of tonight’s gigs' },
  { at: 68, what: 'Deployed', note: 'gig-map.vercel.app' },
];
export const SUBMIT_AT = 86;

export const smooth = (x: number) => { const p = Math.max(0, Math.min(1, x)); return p * p * (3 - 2 * p); };

/* characters for what is counted but not shown: rows of the text globe's ramp, thicker and thinner in slow waves, the
   same on the server and in the browser */
export function hatchRows(rows: number, cols: number, seed: number): string[] {
  const R = mulberry32(seed), ramp = ' .:|';
  return Array.from({ length: rows }, (_, y) => {
    let row = '';
    for (let x = 0; x < cols; x++) {
      const v = (Math.sin(x * 0.27 + y * 0.9) + Math.sin(x * 0.11 - y * 0.5) + 2) / 4 + (R() - 0.5) * 0.35;
      row += ramp[Math.max(0, Math.min(3, Math.floor(v * 4)))];
    }
    return row;
  });
}
