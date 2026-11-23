/* The live numbers a wall draws, from the same seeded world as the city pages (lib/day-data.ts), on the city's live
   times. The host starts the clock when the intro ends, so the stage does not run on the planned 09:00: the seeded
   city is laid on the live times (its start is build_start, its close is build_end, voting ends at vote_end), and every
   count, ranking and arrival follows from there. The other nine cities are read at the same moment of the seeded day
   (this city's live minute mapped onto its planned one), so the wall's "Tokyo is building" agrees with the home.

   The worst cases a wall must survive are a `content` mode: none (no entries), many (182), long (the longest name the
   form allows on first and fourth place) and tie (third and fourth end level; the plan's tie rule keeps whoever reached
   that count first). Pure. */

import {
  CITIES, CITY_IDS, EPOCH, EVENT, LONG_NAME, SCHED, all, arriveAt, cityState, hiddenAt, hideMin, inAt, minOfVote, sched, seedData, votesAtMin, judgeAtMin,
  type CitySched, type Entry, type SeedCity,
} from '@/lib/day-data';
import type { Project } from '@/lib/data';
import { CODE } from '@/lib/places';
import type { CityLive } from './types';

export type Content = 'seeded' | 'none' | 'many' | 'long' | 'tie';
export const CONTENTS: [Content, string][] = [['seeded', 'Seeded'], ['none', 'No entries'], ['many', '182 entries'], ['long', 'A long name'], ['tie', 'A tie at 3rd']];

export type Phase = 'before' | 'build' | 'vote' | 'done';
export type Ranked = { p: Project; v: number; j: number; place: number; was: number | null; tie: boolean; r: Entry };
export type Arrival = { p: Project; at: number };
export type Other = { id: string; code: string; name: string; word: string; state: 'next' | 'build' | 'vote' | 'done'; top: { p: Project; v: number }[] };
export type Series = { p: Project; place: number; pts: [number, number][] };
export type World = {
  phase: Phase; now: number;
  /* seconds left to the end of building (build) or of voting (vote) */
  left: number;
  total: number; inNow: number;
  arrivals: Arrival[];
  ranking: Ranked[];
  /* the top 10 over time, as steps: minute from the start, votes */
  chart: { series: Series[]; span: number; max: number };
  /* the tie at third, in words, or null */
  tieNote: string | null;
  others: Other[];
  /* the tombola's pool: every entry outside the top 3 */
  pool: Project[];
  /* every entry in so far, oldest first (the showcase walks them in turn) */
  all: Project[];
  /* the counts are hidden (from the event's hideAt until voting closes): the ranking is the order frozen then, with
     later entries under it, and the wall prints no count */
  hidden: boolean;
};

const CACHE = new Map<string, SeedCity>();
export function seedCity(seed: number, id: string, content: Content): SeedCity {
  const key = seed + ':' + id + ':' + content, hit = CACHE.get(key); if (hit) return hit;
  const base = seedData(seed).cities[Math.max(0, CITY_IDS.indexOf(id))];
  const c: SeedCity = { ...base, list: base.list.map((r) => ({ ...r, p: { ...r.p } })), _all: null };
  if (content === 'none') c.entries = 0;
  if (content === 'many') c.entries = 182;
  if (content === 'long') { c.list[0].p.name = LONG_NAME; c.list[3].p.name = 'Shared Grocery Lists for Night-Shift Nurses'.slice(0, 40); }
  if (content === 'tie') { c.list[3].votes = c.list[2].votes; c.list[3].e = c.list[2].e + 0.12; }
  CACHE.set(key, c);
  return c;
}

const toMin = (ms: number) => (ms - EPOCH) / 60000;
/* the city's schedule on its live times (or its planned ones, before the clock starts) */
export function liveSched(c: CityLive): CitySched {
  const city = CITIES[Math.max(0, CITY_IDS.indexOf(c.id))];
  const start = toMin(c.build_start ?? c.planned_start), buildEnd = c.build_end ? toMin(c.build_end) : start + c.build_min, end = c.vote_end ? toMin(c.vote_end) : buildEnd + c.vote_after;
  return { city, start, buildEnd, end };
}
export function phaseOf(c: CityLive, now: number): Phase {
  if (c.build_start === null || now < c.build_start) return 'before';
  if (c.build_end && now < c.build_end) return 'build';
  if (c.vote_end && now < c.vote_end) return 'vote';
  return 'done';
}

/* the ranking at minute m: by votes, a tie kept by whoever reached that count first (the plan's rule), then the home's order */
function rankAt(sd: SeedCity, x: CitySched, m: number): { r: Entry; v: number; at: number }[] {
  if (m < x.start) return [];
  const k = inAt(sd, x, m), out: { r: Entry; v: number; at: number }[] = [];
  all(sd).forEach((r) => { if (r.a < k) { const v = votesAtMin(r, x, m); out.push({ r, v, at: v ? minOfVote(r, x, v) : arriveAt(r, x) }); } });
  return out.sort((a, b) => b.v - a.v || a.at - b.at || a.r.k - b.r.k);
}

export function worldAt(o: { seed: number; content: Content; city: CityLive; now: number; rows: number; arrivals: number }): World {
  const { city, now } = o, sd = seedCity(o.seed, city.id, o.content), x = liveSched(city), m = toMin(now), phase = phaseOf(city, now);
  const total = sd.entries, inNow = phase === 'before' ? 0 : inAt(sd, x, Math.min(m, x.buildEnd));
  const left = phase === 'build' ? (city.build_end! - now) / 1000 : phase === 'vote' ? (city.vote_end! - now) / 1000 : phase === 'before' ? city.build_min * 60 : 0;
  /* while hidden, the counts are read at the freeze and the later entries sit under them, in the order they came */
  const hidden = hiddenAt(x, m), mm = hidden ? hideMin(x)! : Math.min(m, x.end);
  /* arrivals: the latest in, newest first */
  const arrived = phase === 'before' ? [] : all(sd).filter((r) => r.a < inNow).map((r) => ({ p: r.p, at: arriveAt(r, x) })).sort((a, b) => b.at - a.at);
  const late = hidden ? all(sd).filter((r) => r.a >= inAt(sd, x, mm) && r.a < inNow).sort((a, b) => a.a - b.a).map((r) => ({ r, v: 0, at: arriveAt(r, x) })) : [];
  const now10 = rankAt(sd, x, mm).concat(late), ago = hidden ? now10 : rankAt(sd, x, mm - 10), wasOf = new Map(ago.map((t, i) => [t.r.p.id, i + 1]));
  const ranking: Ranked[] = now10.slice(0, o.rows).map((t, i) => ({ p: t.r.p, v: t.v, j: t.v ? judgeAtMin(t.r, x, mm) : 0, place: i + 1, was: wasOf.get(t.r.p.id) ?? null, tie: false, r: t.r }));
  let tieNote: string | null = null;
  const third = now10[2], fourth = now10[3];
  if (!hidden && third && fourth && third.v === fourth.v && third.v > 0) {
    if (ranking[2]) ranking[2].tie = true;
    if (ranking[3]) ranking[3].tie = true;
    tieNote = 'Level on ' + third.v + '. 3rd reached it first.';
  }
  /* the chart: the top ten now, each as its votes over time, sampled every minute (or coarser on a long session) */
  const span = Math.max(1, mm - x.start), stepM = Math.max(1, Math.round(span / 120));
  const series: Series[] = ranking.slice(0, 10).map((t) => {
    const a = arriveAt(t.r, x), pts: [number, number][] = [];
    for (let s = Math.max(0, Math.floor(a - x.start)); s <= span; s += stepM) pts.push([s, votesAtMin(t.r, x, x.start + s)]);
    pts.push([span, t.v]);
    return { p: t.p, place: t.place, pts };
  });
  const max = Math.max(1, ...ranking.map((t) => t.v));
  /* the other nine at the same moment of the seeded day */
  const S = sched(SCHED), mine = S.cs[CITY_IDS.indexOf(city.id)], dayM = mine.start + (m - x.start), day = seedData(o.seed);
  const others: Other[] = S.cs.filter((c) => c.city.id !== city.id).map((c) => {
    const st = cityState(c, day.cities[c.city.i], dayM), name = c.city.name;
    const word = st.state === 'next' ? name + ' starts in ' + waitWords(st.wait ?? 0) : st.state === 'build' ? name + ' is building' : st.state === 'vote' ? name + ' is voting' : name + ' has its top 3';
    return { id: c.city.id, code: CODE[c.city.id], name, word, state: st.state, top: st.top.map((t) => ({ p: t.p, v: t.v })) };
  });
  const top3 = new Set(now10.slice(0, EVENT.finalists).map((t) => t.r.p.id));
  const pool = phase === 'before' ? [] : all(sd).filter((r) => r.a < inNow && !top3.has(r.p.id)).map((r) => r.p);
  const every = arrived.slice().reverse().map((x) => x.p);
  return { phase, now, left, total, inNow, arrivals: arrived.slice(0, o.arrivals), ranking, chart: { series, span, max }, tieNote, others, pool, all: every, hidden };
}

/* "3 h", "40 min" */
export function waitWords(min: number): string { return min >= 2880 ? Math.round(min / 1440) + ' days' : min >= 90 ? Math.round(min / 60) + ' h' : Math.max(1, Math.round(min)) + ' min'; }

/* the tombola's draw: the same seed lands every screen on the same entry */
export function drawOf(pool: Project[], seed: number): number { if (!pool.length) return -1; let h = seed >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0; return (h ^ (h >>> 16)) % pool.length; }
