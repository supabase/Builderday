/* proto:under-hero. One city's 90 minutes as a fixed sample, drawn by every direction: who arrives when, each public
   vote, each judge vote (worth 5). "Your project" arrives at 34, is hidden with the rest until 60, takes judge votes
   at 66, 78 and 84, and ends 2nd, inside the top 3. Pure. */
import { mulberry32 } from '@/lib/day-data';

export const OPEN = 45, SHOW = 60, END = 90, WEIGHT = 5;
export type Ev = { t: number; n: number; judge: boolean };
export type Proj = { name: string; arrive: number; ev: Ev[]; you?: boolean };

const ROWS: { name: string; arrive: number; pub: number; skew: number; judge: number[]; you?: boolean }[] = [
  { name: 'Your project', arrive: 34, pub: 34, skew: 0.55, judge: [66, 78, 84], you: true },
  { name: 'Field notes', arrive: 12, pub: 41, skew: 1.35, judge: [70, 86] },
  { name: 'Sound map', arrive: 21, pub: 37, skew: 1, judge: [74] },
  { name: 'Switchyard', arrive: 9, pub: 30, skew: 0.9, judge: [64, 81] },
  { name: 'Open atlas', arrive: 40, pub: 26, skew: 0.8, judge: [88] },
  { name: 'Tidepool', arrive: 27, pub: 22, skew: 1.1, judge: [72] },
  { name: 'Night shift', arrive: 52, pub: 18, skew: 0.7, judge: [] },
  { name: 'Kopi run', arrive: 16, pub: 12, skew: 1.2, judge: [] },
  { name: 'Daybreak', arrive: 63, pub: 8, skew: 0.6, judge: [] },
];

export const RACE: Proj[] = ROWS.map((r, i) => {
  const R = mulberry32(4201 + i * 97), lo = Math.max(OPEN, r.arrive), ev: Ev[] = [];
  for (let k = 0; k < r.pub; k++) ev.push({ t: lo + (END - lo) * Math.pow(R(), r.skew) * 0.995, n: 1, judge: false });
  r.judge.forEach((t) => ev.push({ t, n: WEIGHT, judge: true }));
  ev.sort((a, b) => a.t - b.t);
  return { name: r.name, arrive: r.arrive, ev, you: r.you };
});

/* the count at a minute, everything cast before it */
export const countAt = (p: Proj, m: number) => p.ev.reduce((a, e) => (e.t < m ? a + e.n : a), 0);

/* The moment shown: a minute and, at 60, how far the reveal has run (0 to 1, bottom to top, leader last). */
export type At = { min: number; reveal: number };
/* one replay, in ms: 0 to 45, the hidden stretch, the reveal, 60 to 90, the hold at the close */
export const BEATS = { open: 2600, hidden: 2200, reveal: 1600, live: 5200, hold: 2600 };
export const TOTAL = Object.values(BEATS).reduce((a, b) => a + b, 0);
export function atMs(ms: number): At {
  const { open, hidden, reveal, live } = BEATS;
  if (ms < open) return { min: (OPEN * ms) / open, reveal: 0 };
  ms -= open; if (ms < hidden) return { min: OPEN + ((SHOW - OPEN) * ms) / hidden, reveal: 0 };
  ms -= hidden; if (ms < reveal) return { min: SHOW, reveal: ms / reveal };
  ms -= reveal; if (ms < live) return { min: SHOW + ((END - SHOW) * ms) / live, reveal: 1 };
  return { min: END, reveal: 1 };
}
/* the ms a minute is first reached (for scroll-driven takes) */
export function msOf(min: number): number {
  const { open, hidden, reveal, live } = BEATS;
  if (min <= OPEN) return (open * min) / OPEN;
  if (min <= SHOW) return open + (hidden * (min - OPEN)) / (SHOW - OPEN);
  return open + hidden + reveal + (live * (Math.min(END, min) - SHOW)) / (END - SHOW);
}

/* What the public sees at a moment: counts (null while hidden), the order, and the cut (3rd place's count). */
export type Row = { p: Proj; i: number; shown: number | null; rank: number };
export function standing(at: At): { rows: Row[]; hidden: boolean; inHidden: number; cut: number | null; closed: boolean } {
  const here = RACE.map((p, i) => ({ p, i })).filter((x) => x.p.arrive <= at.min);
  const hidden = at.min < SHOW || (at.min === SHOW && at.reveal === 0);
  const inHidden = RACE.reduce((a, p) => a + p.ev.filter((e) => e.t >= OPEN && e.t < Math.min(at.min, SHOW)).length, 0);
  if (at.min < SHOW) {
    const rows = here.sort((a, b) => a.p.arrive - b.p.arrive).map((x, k) => ({ ...x, shown: null, rank: k + 1 }));
    return { rows, hidden: true, inHidden, cut: null, closed: false };
  }
  /* the reveal: bottom to top by the count at 60, leader last; a row not yet revealed shows "?" */
  const at60 = here.map((x) => ({ ...x, c: countAt(x.p, SHOW) })).sort((a, b) => a.c - b.c);
  const done = new Set(at60.slice(0, Math.floor(at.reveal * (at60.length + 0.999))).map((x) => x.i));
  const rows = here.map((x) => ({ ...x, shown: at.reveal >= 1 || done.has(x.i) ? countAt(x.p, at.min) : null }))
    .sort((a, b) => (b.shown ?? -1) - (a.shown ?? -1) || a.p.arrive - b.p.arrive).map((x, k) => ({ ...x, rank: k + 1 }));
  const third = rows[2]?.shown ?? null;
  return { rows, hidden, inHidden, cut: at.reveal >= 1 ? third : null, closed: at.min >= END };
}

/* the cities' finalists for the final grid, seeded; the visitor's city carries "Your project" in 2nd */
const NAMES = ['Relay', 'Soft signal', 'Offcut', 'Sidecar', 'Daylight', 'Paper trail', 'Wayfinder', 'Beacon', 'Tidepool', 'Crosswalk', 'Canopy', 'Pocket map', 'Kopi run', 'Night shift', 'Field notes', 'Sound map', 'Switchyard', 'Open atlas', 'Lantern', 'Ferry', 'Larder', 'Quay', 'Hearth', 'Signal box', 'Ledger', 'Orchard', 'Atrium', 'Tram stop', 'Bellwether', 'Driftwood', 'Low tide', 'Hatchery', 'Postcard', 'Weathervane', 'Rooftop', 'Index', 'Halfway', 'Courtyard', 'Overpass', 'Junction', 'Kiln', 'Skylight'];
export function finalists(ids: string[], mine: string): Record<string, string[]> {
  const R = mulberry32(911), pool = NAMES.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const out: Record<string, string[]> = {};
  ids.forEach((id, k) => { out[id] = id === mine ? ['Field notes', 'Your project', 'Sound map'] : pool.slice(k * 3, k * 3 + 3); });
  return out;
}
