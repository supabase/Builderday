/* source.ts: where the real pages get their numbers.
   - No backend configured: the seeded world of lib/day-data.ts, as today; every lab, every ?moment= still and
     tools/agree.mjs read only that.
   - A backend: the snapshots from /api/city/<id>/snapshot and /api/day/snapshot, turned into the very shapes the pages
     already draw (a CityWorld, a HomeWorld), so no drawing changes. The home and a city page read the same tally.

   What is exact and what is drawn. Every number a visitor reads is exact at the minute shown: entries in, each entry's
   votes and judges' votes, the order (most votes, then who reached that count first), the leader, the top 3, the
   times. Entries arrive at their real minutes (day-data's Entry.arrived). The lines that show how a count grew (the
   traces, the pylon's history, the ranking chart) are drawn from the real presses (Entry.steps) wherever the
   snapshot carries them, as a city's own snapshot does: nothing is drawn between or past them. The day snapshot
   leaves the presses out to stay small, so there (the home's rows and wire) each count's line is still day-data's
   curve, fitted to pass through the real count now.

   Minutes are UTC minutes from 10 December 00:00, as everywhere in the model. The pages' project id is the entry's
   number (votes are keyed by it on the server too). Pure, except useSnapshots at the end. */
import { useEffect, useRef, useState } from 'react';
import { CITIES, EPOCH, EVENT, arriveAt, hiddenAt, showMin, judgeMin, publicMin, type CitySched, type CityState, type Entry, type JudgeVote, type Sched, type SeedCity, type SeedDay, type Top } from './day-data';
import type { Project } from './data';
import type { CityWorld, Row, Votes } from './city';
import type { HomeCity, HomeWorld } from './home';
import { publicSnap, rankOrder, type CitySnap, type DaySnap, type SnapCity, type SnapEntry, type SnapStep } from './event/snapshot';
import { topTies } from './event/format';
import { at } from '@/lib/routes';

const minOf = (ms: number) => (ms - EPOCH) / 60000;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* ---------------- times ---------------- */
/* a city's schedule: the live times once the host has started the clock; before that, the planned start (pushed to
   just after now if the planned minute has passed and the room has not started, so the page still says "next") */
export function schedOf(c: SnapCity, nowMin: number): Omit<CitySched, 'city'> {
  /* showAt: an answer without it keeps the event's default (show left out) */
  const hide = (start: number) => ({
    ...(c.showAt === undefined ? {} : { show: c.showAt == null ? null : start + c.showAt }),
    /* publicAt and judgeAt: likewise; null opens at the start (judges: with everyone) */
    ...(c.publicAt === undefined ? {} : { pub: start + (c.publicAt ?? 0) }),
    ...(c.judgeAt === undefined ? {} : { jud: start + (c.judgeAt ?? c.publicAt ?? 0) }),
  });
  if (c.buildStart != null) { const start = minOf(c.buildStart); return { start, buildEnd: minOf(c.buildEnd!), end: minOf(c.voteEnd!), ...hide(start) }; }
  const start = Math.max(minOf(c.planned), Math.ceil(nowMin) + 1);
  return { start, buildEnd: start + c.buildMin, end: start + c.buildMin + c.voteAfter, ...hide(start) };
}
/* the day's schedule with every city's own times; cities without a snapshot keep the seeded schedule */
export function liveSched(base: Sched, cities: SnapCity[], nowMin: number, pickAfter = 60): Sched {
  const cs = base.cs.map((x) => { const c = cities.find((y) => y.id === x.city.id); return c ? { city: x.city, ...schedOf(c, nowMin) } : x; });
  const first = Math.min(...cs.map((x) => x.start)), last = Math.max(...cs.map((x) => x.end));
  const pickAt = Math.ceil((last + pickAfter) / 15) * 15, winStart = Math.floor((first - 60) / 60) * 60;
  const winEnd = Math.max(winStart + 1440, Math.ceil((pickAt + 30) / 60) * 60);
  return { cs, first, last, pickAt, winStart, winEnd };
}

/* ---------------- entries ---------------- */
function projectOf(e: SnapEntry): Project {
  return { id: e.no, name: e.name, pitch: e.pitch, handle: e.by || '', repo: (e.repo || '').replace(/^https?:\/\//, ''), demo: e.url.replace(/^https?:\/\//, ''), image: e.picture || undefined, slug: e.slug };
}
/* the count after each of an entry's steps, oldest first, and its judges' presses as day-data's JudgeVote */
function history(no: number, steps: SnapStep[]): { at: number[]; n: number[]; jv: JudgeVote[] } {
  const at: number[] = [], n: number[] = [], jv: JudgeVote[] = []; let cum = 0;
  steps.forEach(([k, ms, d, judge]) => {
    if (k !== no) return;
    cum += d; at.push(minOf(ms)); n.push(cum);
    if (judge && d > 0) jv.push({ n: cum, c: d });
  });
  return { at, n, jv };
}
/* An entry's curve, fitted. a: arrival minute; x.end: voting closes. Before the close, votes and e are chosen so the
   curve reads the real count T now and half of it at the real half-way minute; after the close, votes is T. */
function fit(T: number, a: number, x: Omit<CitySched, 'city'>, nowMin: number, half: number | null): { votes: number; e: number } {
  if (T <= 0) return { votes: 0, e: 1 };
  const span = Math.max(1e-6, x.end - a);
  const fNow = nowMin >= x.end ? 1 : clamp((nowMin - a) / span, 1e-4, 0.9999);
  const fHalf = half == null ? null : clamp((half - a) / span, 1e-5, fNow * 0.999);
  let e = 1;
  if (fHalf != null && fHalf < fNow) e = clamp(Math.log(0.5) / Math.log(fHalf / fNow), 0.25, 4);
  return { votes: fNow >= 1 ? T : T / Math.pow(fNow, e), e };
}

export type LiveCity = { sd: SeedCity; x: Omit<CitySched, 'city'>; ranked: SnapEntry[]; byNo: Map<number, Entry>; snap: CitySnap };
/* One city's shapes from its snapshot: every entry at its real arrival minute, with its real presses when the
   snapshot has them (a city's own snapshot), else its count now on a fitted curve (the day snapshot). */
export function liveCity(snap0: CitySnap, nowMin: number): LiveCity {
  /* the server freezes what it sends; a snapshot read a moment before the freeze is frozen here by the visitor's clock,
     when it has the steps to do it (a city's own); the day's, without them, is shown as it came until the next read */
  const snap = snap0.steps.length ? publicSnap(snap0, EPOCH + nowMin * 60000) : snap0;
  const c = snap.city, i = CITIES.findIndex((y) => y.id === c.id), x = schedOf(c, nowMin);
  const ents = snap.entries.slice().sort((a, b) => a.created - b.created || a.no - b.no);
  const N = ents.length, span = Math.max(1e-6, x.buildEnd - x.start);
  const real = snap.steps.length > 0 || ents.every((e) => e.votes === 0);
  const all: Entry[] = ents.map((e, k) => {
    const arrived = minOf(e.created), h = history(e.no, snap.steps);
    const jv = h.jv.length ? h.jv : e.judge ? [{ n: e.votes, c: e.judge }] : [];
    const base = { p: projectOf(e), k, a: k, af: clamp((arrived - x.start) / span, 0, 1), jv, arrived };
    if (real) return { ...base, votes: e.votes, e: 1, steps: { at: h.at, n: h.n } };
    const f = fit(e.votes, arrived, x, nowMin, null);
    return { ...base, votes: f.votes, e: f.e };
  });
  const byNo = new Map(all.map((r) => [r.p.id, r]));
  const ranked = ents.slice().sort(rankOrder);
  const list = ranked.slice(0, 7).map((e) => ({ p: byNo.get(e.no)!.p, votes: e.votes, e: byNo.get(e.no)!.e }));
  const sd: SeedCity = { i, entries: N, list, _all: all, seed: 0 };
  return { sd, x, ranked, byNo, snap };
}

/* one city's state at the minute, exact: the same fields cityState() gives the home row */
export function liveState(L: LiveCity, city: CitySched['city'], nowMin: number): HomeCity {
  const { x, ranked, byNo } = L, N = L.snap.entries.length;
  const top: Top[] = nowMin < x.start ? [] : ranked.slice(0, EVENT.finalists).map((e, k) => ({ p: byNo.get(e.no)!.p, v: e.votes, j: e.judge, r: byNo.get(e.no)!, place: k + 1 }));
  const o: CityState = { i: city.i, id: city.id, name: city.name, city, start: x.start, buildEnd: x.buildEnd, end: x.end, entries: N, list: L.sd.list, sd: L.sd, state: 'done', top };
  if (nowMin < x.start) { o.state = 'next'; o.wait = x.start - nowMin; }
  else if (nowMin < x.buildEnd) { o.state = 'build'; o.f = (nowMin - x.start) / (x.buildEnd - x.start); o.n = N; o.left = x.buildEnd - nowMin; }
  else if (nowMin < x.end) { o.state = 'vote'; o.f = (nowMin - x.buildEnd) / (x.end - x.buildEnd); o.n = N; o.left = x.end - nowMin; }
  else { o.state = 'done'; o.n = N; }
  if (o.state !== 'next' && ranked.length && (o.state !== 'done' || N)) o.lead = { p: byNo.get(ranked[0].no)!.p, v: ranked[0].votes };
  /* hidden: the snapshot carries no counts (the server holds them until showAt), so the order is the order entries came in */
  o.showAt = showMin(x); o.hidden = hiddenAt(x, nowMin); o.publicAt = publicMin(x); o.judgeAt = judgeMin(x);
  return o;
}

/* ---------------- the worlds ---------------- */
/* The home's world from the day snapshot. base: the seeded world at the same minute, for the cities the snapshot does
   not have and for the fields that are the same either way. */
export function liveHome(base: HomeWorld, day: DaySnap, nowMin: number): HomeWorld {
  const S = liveSched(base.S, day.cities.map((c) => c.city), nowMin);
  const L = new Map(day.cities.map((c) => [c.city.id, liveCity(c, nowMin)]));
  const cs: HomeCity[] = S.cs.map((x, i) => { const l = L.get(x.city.id); return l ? liveState(l, x.city, nowMin) : base.cs[i]; });
  const live = cs.filter((x) => x.state === 'build' || x.state === 'vote'), done = cs.filter((x) => x.state === 'done');
  const finalists = done.flatMap((x) => x.top.map((t) => ({ ...t, city: x })));
  /* the pick: entered on the desk; until then the first finalist stands in (nothing shows it while picked is false) */
  const pk = day.pick ? cs.find((x) => x.id === day.pick!.city) : null;
  const pt = pk ? pk.top.find((t) => t.p.id === day.pick!.no) || pk.top[0] : null;
  const fallback = finalists[0] || base.final;
  const final = pk && pt ? { ...pt, city: pk } : fallback;
  const pc = (pk || final.city) as HomeWorld['pick']; pc.win = { p: final.p, v: final.v };
  return {
    S, now: nowMin, cs, live, done, allDone: done.length === cs.length, picked: !!(pk && pt), archived: nowMin > S.winEnd, early: nowMin < S.winStart,
    pick: pc, total: cs.reduce((a, x) => a + x.entries, 0), finalists, final,
  };
}

/* A city page's world from its snapshot (with every vote step) and the home's live world. base: the seeded world at the
   same minute, for its config and window shape. voted / judged: this visitor's own presses, already counted by the
   server once they land; they are added here only until the next snapshot shows them. */
export function liveCityWorld(base: CityWorld, snap: CitySnap, H: HomeWorld, nowMin: number, voted: Votes, judged?: Readonly<Record<string, number>>, adj?: Readonly<Record<string, number>>): CityWorld {
  const l = liveCity(snap, nowMin), i = l.sd.i, x: CitySched = { city: base.city, ...l.x }, S = H.S;
  const st = liveState(l, base.city, nowMin);
  const votesOn = st.state !== 'next', voting = st.state === 'build' || st.state === 'vote', f = st.state === 'vote' ? st.f! : st.state === 'done' ? 1 : 0;
  /* hidden: no count shows (liveCity cut the snapshot at the start), your presses move nothing, and the order is the
     order entries came in */
  const hidden = !!st.hidden;
  /* an earlier minute (the pylon's ten minutes ago) is read from the steps; now is the tally itself */
  const past = nowMin < minOf(snap.at) - 0.05;
  const count = (no: number) => { let n = 0, j = 0; for (const [k, ms, d, judge] of snap.steps) { if (k !== no) continue; if (minOf(ms) > nowMin) break; n += d; if (judge) j += d; } return { n, j }; };
  const rows: Row[] = l.ranked.filter((e) => !past || minOf(e.created) <= nowMin).map((e) => {
    const r = l.byNo.get(e.no)!, id = String(e.no), c = past ? count(e.no) : { n: e.votes, j: e.judge };
    /* a press of yours the snapshot does not show yet (adj: +1 or -1 until the next snapshot) */
    const yours = voting && voted[id] ? 1 : 0, pending = voting && !past && !hidden && adj ? adj[id] || 0 : 0, jm = voting && judged ? judged[id] || 0 : 0;
    const v = Math.max(0, (votesOn ? c.n : 0) + pending), late = hidden;
    return { r, p: r.p, k: r.k, a: r.a, arrive: arriveAt(r, x), v, mine: yours + jm, rank: 0, j: c.j, votes: hidden ? null : v, judges: hidden ? null : c.j, late, tie: null as Row['tie'] };
  });
  const arrived = st.state === 'next' ? [] : rows;
  const ranked = votesOn ? arrived.slice().sort((a, b) => b.v - a.v || order(l, a) - order(l, b)) : arrived.slice().sort((a, b) => b.a - a.a);
  ranked.forEach((o, j) => { o.rank = j + 1; });
  /* ties at the top, once voting has closed: the host settles them at the desk (the snapshot's tie order) */
  if (st.state === 'done' && !past) {
    const tieOf = new Map(l.ranked.map((e) => [String(e.no), e.tie ?? null]));
    topTies(ranked, EVENT.finalists, (o) => o.v, (o) => tieOf.get(String(o.p.id)), (o) => String(o.p.id)).forEach((t, id) => { const o = ranked.find((y) => String(y.p.id) === id); if (o) o.tie = t; });
  }
  const lead = votesOn && ranked.length ? ranked[0] : null;
  const pickHere = H.picked && H.final.city.i === i;
  const SD: SeedDay = { cities: H.cs.map((c) => c.sd), pick: H.final.city.i, final: { city: H.final.city.i, place: H.final.place || 1 } };
  const Wn = { S, x, w0: x.start - 60, w1: S.pickAt + 30 };
  return {
    c: base.c, S, x, Wn, i, city: x.city, off: x.city.offset, sd: l.sd, SD, now: nowMin, st, state: st.state, f, votesOn, voting,
    rows, arrived, ranked, lead, second: ranked[1], total: arrived.reduce((a, o) => a + o.v, 0), topV: ranked[0]?.v || 0,
    scaleV: Math.max(10, lead ? lead.v : 0),
    picked: H.picked, isPick: pickHere, pickCity: CITIES[H.final.city.i], pickWin: H.final.p, you: null,
    last: voting && st.left! <= Math.max(3, Math.round((x.end - x.start) * 0.05)) + 0.01,
    inDay: nowMin >= S.winStart && nowMin <= S.winEnd,
    day: H.cs,
    hidden, showAt: showMin(x),
    publicAt: publicMin(x), publicOpen: voting && nowMin >= publicMin(x), judgeAt: judgeMin(x), judgeOpen: voting && nowMin >= judgeMin(x), judgeWeight: snap.city.judgeWeight ?? EVENT.judgeWeight,
  };
}
/* the tie rule: who reached that count first, then who arrived first (the snapshot's order) */
function order(l: LiveCity, o: Row): number { return l.ranked.findIndex((e) => e.no === o.p.id); }

/* ---------------- reading the snapshots in the browser ---------------- */
/* Polls the snapshots every few seconds while the tab is showing; never while hidden. On a failed read the last good
   snapshot stays (the server marks a stale one). city: also the city's own snapshot, with its vote steps. */
const EVERY = 4000;
export function useSnapshots(on: boolean, city: string | null): { day: DaySnap | null; city: CitySnap | null } {
  const [s, setS] = useState<{ day: DaySnap | null; city: CitySnap | null }>({ day: null, city: null });
  const busy = useRef(false);
  useEffect(() => {
    if (!on) return;
    let dead = false;
    const read = async () => {
      if (busy.current || document.visibilityState !== 'visible') return;
      busy.current = true;
      try {
        const [d, c] = await Promise.all([
          fetch(at('/api/day/snapshot'), { cache: 'no-store' }).then((r) => (r.ok ? r.json() as Promise<DaySnap> : null)).catch(() => null),
          city ? fetch(at('/api/city/' + encodeURIComponent(city) + '/snapshot'), { cache: 'no-store' }).then((r) => (r.ok ? r.json() as Promise<CitySnap> : null)).catch(() => null) : Promise.resolve(null),
        ]);
        if (!dead) setS((o) => ({ day: d || o.day, city: c || o.city }));
      } finally { busy.current = false; }
    };
    read();
    const t = setInterval(read, EVERY);
    const vis = () => { if (document.visibilityState === 'visible') read(); };
    document.addEventListener('visibilitychange', vis);
    return () => { dead = true; clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [on, city]);
  return s;
}
