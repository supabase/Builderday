/* The wall's numbers from the backend: the city snapshot (its entries, counts and vote steps) and the day snapshot (the
   other nine), laid on the live times the stage row's city carries. Gives the same World the seeded lab draws, so every
   scene reads one shape whichever world is behind it. Pure. */

import { CITIES, EVENT } from '@/lib/day-data';
import type { Project } from '@/lib/data';
import { CODE } from '@/lib/places';
import { phaseAt, rankOrder, type CitySnap, type DaySnap, type SnapEntry, type SnapStep } from '@/lib/event/snapshot';
import { phaseOf, waitWords, type Other, type Ranked, type Series, type World } from './world';
import type { CityLive } from './types';
import type { RankBy } from './event';

/* an entry as the pictures and rows want it: the entry's number is its id on the wall */
export function projectOf(e: SnapEntry): Project {
  return { id: e.no, name: e.name, pitch: e.pitch, handle: e.by ?? '', repo: e.repo ?? '', demo: e.url, image: e.picture ?? undefined, slug: e.slug };
}

/* each entry's votes (and judges' share) at a moment, from the steps */
function votesAt(steps: SnapStep[], t: number): Map<number, { v: number; j: number; reached: number }> {
  const m = new Map<number, { v: number; j: number; reached: number }>();
  for (const [no, at, n, judge] of steps) {
    if (at > t) break;
    const x = m.get(no) ?? { v: 0, j: 0, reached: at };
    x.v += n; if (judge) x.j += n; if (n > 0) x.reached = at;
    m.set(no, x);
  }
  return m;
}

/* by: what the ranking counts (lib/stage/event.ts, from the place's event and the phase); Builder Day counts every vote */
export function worldFromSnap(o: { snap: CitySnap | null; day: DaySnap | null; city: CityLive; now: number; rows: number; arrivals: number; by?: (done: boolean) => RankBy }): World {
  const { city, now } = o, phase = phaseOf(city, now), by = o.by ? o.by(phase === 'done') : 'votes';
  /* the public snapshot is frozen while the counts are hidden; the wall then prints no count and nothing moves */
  const hidden = !!o.snap?.hidden && now < o.snap.hidden.until;
  const entries = (o.snap?.entries ?? []).filter((e) => e.created <= now || phase === 'done');
  /* the steps that count: all of them, the public ones (the people's choice), or the judges' */
  const all = o.snap?.steps ?? [], steps = by === 'public' ? all.filter((x) => !x[3]) : by === 'judge' ? all.filter((x) => x[3]) : all;
  const val = (e: SnapEntry) => (by === 'public' ? e.votes - e.judge : by === 'judge' ? e.judge : e.votes);
  const left = phase === 'build' ? (city.build_end! - now) / 1000 : phase === 'vote' ? (city.vote_end! - now) / 1000 : phase === 'before' ? city.build_min * 60 : 0;
  const total = entries.length, inNow = phase === 'before' ? 0 : total;
  const arrivals = phase === 'before' ? [] : entries.slice().sort((a, b) => b.created - a.created).slice(0, o.arrivals).map((e) => ({ p: projectOf(e), at: e.created }));
  /* the ranking now (the snapshot's own counts) and ten minutes ago (from the steps), for the rows' "was" */
  /* none: no order at all (the judges decide, and nothing of theirs is on the wall while it runs) */
  const order = by === 'none' ? [] : by === 'votes' ? entries.slice().sort(rankOrder) : entries.slice().sort((a, b) => val(b) - val(a) || a.reached - b.reached || a.created - b.created);
  const ago = votesAt(steps, now - 10 * 60000);
  const agoOrder = entries.slice().sort((a, b) => (ago.get(b.no)?.v ?? 0) - (ago.get(a.no)?.v ?? 0) || (ago.get(a.no)?.reached ?? a.created) - (ago.get(b.no)?.reached ?? b.created) || a.created - b.created);
  const wasOf = new Map((hidden ? order : agoOrder).map((e, i) => [e.no, i + 1]));
  const ranking: Ranked[] = order.slice(0, o.rows).map((e, i) => ({
    p: projectOf(e), v: val(e), j: by === 'votes' ? e.judge : 0, place: i + 1, was: wasOf.get(e.no) ?? null, tie: false,
    /* the seeded world's entry record is not used on the wall; the row reads p, v, j, place and tie */
    r: null as unknown as Ranked['r'],
  }));
  let tieNote: string | null = null;
  const third = order[EVENT.finalists - 1], fourth = order[EVENT.finalists];
  if (!hidden && third && fourth && val(third) === val(fourth) && val(third) > 0) {
    if (ranking[2]) ranking[2].tie = true;
    if (ranking[3]) ranking[3].tie = true;
    tieNote = 'Level on ' + val(third) + '. 3rd reached it first.';
  }
  /* the chart: the top ten, each as its count over time, one point a minute from the start of building */
  const start = city.build_start ?? now, end = Math.min(now, city.vote_end ?? now), span = Math.max(1, (end - start) / 60000);
  const stepM = Math.max(1, Math.round(span / 120));
  const series: Series[] = ranking.slice(0, 10).map((r) => {
    const mine = steps.filter((s) => s[0] === r.p.id), e = entries.find((x) => x.no === r.p.id)!, pts: [number, number][] = [];
    let v = 0, k = 0;
    for (let m = Math.max(0, Math.floor((e.created - start) / 60000)); m <= span; m += stepM) {
      const t = start + m * 60000;
      while (k < mine.length && mine[k][1] <= t) { v += mine[k][2]; k++; }
      pts.push([m, v]);
    }
    pts.push([span, r.v]);
    return { p: r.p, place: r.place, pts };
  });
  const max = Math.max(1, ...ranking.map((r) => r.v));
  /* the other nine, from the day snapshot */
  /* a place outside Builder Day's cities has no other nine on its wall */
  const ours = CITIES.some((x) => x.id === city.id);
  const others: Other[] = (ours ? o.day?.cities ?? [] : []).filter((c) => c.city.id !== city.id).map((c) => {
    const st = phaseAt(c.city, now), name = c.city.name;
    const state: Other['state'] = st === 'next' ? 'next' : st;
    const word = st === 'next' ? name + ' starts in ' + waitWords(Math.max(0, (c.city.planned - now) / 60000)) : st === 'build' ? name + ' is building' : st === 'vote' ? name + ' is voting' : name + ' has its top 3';
    const top = st === 'done' ? c.entries.slice().sort(rankOrder).slice(0, EVENT.finalists).map((e) => ({ p: projectOf(e), v: e.votes })) : [];
    return { id: c.city.id, code: CODE[c.city.id] ?? c.city.id.slice(0, 3).toUpperCase(), name, word, state, top };
  }).sort((a, b) => CITIES.findIndex((x) => x.id === a.id) - CITIES.findIndex((x) => x.id === b.id));
  const top3 = new Set(order.slice(0, EVENT.finalists).map((e) => e.no));
  const pool = phase === 'before' ? [] : entries.filter((e) => !top3.has(e.no)).map(projectOf);
  const every = phase === 'before' ? [] : entries.slice().sort((a, b) => a.created - b.created || a.no - b.no).map(projectOf);
  return { phase, now, left, total, inNow, arrivals, ranking, chart: { series, span, max }, tieNote, others, pool, all: every, hidden };
}
