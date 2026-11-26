/* What the board shows, from the model. Pure: the home's world (lib/home.ts) and a city's world (lib/city.ts) are
   built from the same day config, seed and minute, so the home and every city page say the same thing. Nothing here
   makes a number up. */
import { CITIES, EVENT } from '@/lib/day-data';
import { DEF as HOME_DEF, world as homeWorld, type HomeCfg, type HomeCity, type HomeWorld } from '@/lib/home';
import { DEF as CITY_DEF, world as cityWorld, type CityCfg, type CityWorld, type Votes } from '@/lib/city';
import { EVENT as EV, all, hiddenAt, inAt, leader, top3, votesAtMin, type CitySched, type SeedCity } from '@/lib/day-data';
import { fmtN } from '@/lib/format';
import type { WireEvent, WireKind } from '@/lib/wire';
import { hhmm } from '@/lib/format';
import { CODE, PLACE, cityPage } from '@/lib/places';
import type { StateWord } from '@/components/screen/chip';
import type { Item } from './announce';
import type { GlobeLight } from './day-globe';
import type { Legend } from './segment';

/* the day both pages draw: the saved schedule and seed, and the worst content when asked */
export type Day = { seed: number; schedule: string; startHour: number; buildMin: number; voteAfter: number; pickAfter: number; worst: number };
export function homeAt(d: Day, minute: number): HomeWorld {
  return homeWorld({ ...HOME_DEF, ...d, now: minute } as HomeCfg);
}
export function cityAt(d: Day, id: string, minute: number, voted: Votes = {}, extra?: Partial<CityCfg>): CityWorld {
  return cityWorld({ ...CITY_DEF, ...extra, ...d, city: id, now: minute } as CityCfg, voted);
}

/* the last minutes of voting: the wheel's "last" rule, a tenth of the vote time and at least three minutes */
export function lastMinutes(d: Day): number { return Math.max(3, Math.round(d.voteAfter * 0.1)); }

/* a city's state as one of the six words. Entries close, votes run on: the six words have no other word for the time
   between, so "Last votes" is that whole stretch (the plan's words, read so there is no gap) */
export function cityWord(x: HomeCity, W: HomeWorld, d: Day): StateWord {
  void d;
  if (x.state === 'next') return 'opens';
  if (x.state === 'build') return 'building';
  /* a city where no project came in has nothing left to vote on */
  if (x.state === 'vote') return x.entries ? 'last' : 'closed';
  return W.picked && W.final.city.i === x.i ? 'picked' : x.entries ? 'finalists' : 'closed';
}
/* the day's state, for the home's header row */
export function dayWord(W: HomeWorld, d: Day): StateWord {
  if (W.picked) return 'picked';
  if (W.allDone) return 'finalists';
  if (W.live.length) return W.live.every((x) => cityWord(x, W, d) === 'last') ? 'last' : 'building';
  return W.done.length ? 'closed' : 'opens';
}

/* The wire, as lib/wire.ts writes it, with one difference: its cache is keyed by the city's content as well as its
   seed. lib/wire.ts keys by seed alone, so with the worst content on, a server that already drew the plain day hands
   back the plain day's events (a hydration mismatch in the labs). The sentences and thresholds are the same. */
const LEAD_MIN = 10, LEAD_HOLD = 2, ENTRY_MARKS = [50, 100, 150], VOTE_MARKS = [1000, 2000, 5000];
const EVENTS = new Map<string, WireEvent[]>();
function eventsOf(sd: SeedCity, x: CitySched): WireEvent[] {
  const key = [sd.seed, sd.i, sd.entries, sd.list.map((r) => r.p.name).join('|'), x.start, x.buildEnd, x.end, String(x.show)].join(':');
  const hit = EVENTS.get(key); if (hit) return hit;
  const nm = x.city.name, i = sd.i, N = sd.entries, ev: WireEvent[] = [];
  ev.push({ m: x.start, city: i, kind: 'open', text: nm + ' opens. Building and voting start now.' });
  ENTRY_MARKS.forEach((n) => { if (n >= N) return; const f = Math.pow((n - 0.5) / N, 1 / 0.85); ev.push({ m: x.start + f * (x.buildEnd - x.start), city: i, kind: 'entries', text: nm + ' passes ' + n + ' entries.' }); });
  let said: number | null = null, cand: number | null = null, since = 0, marks = 0;
  const entries = all(sd);
  for (let m = x.start; m <= x.end; m++) {
    /* while the counts are hidden the wire says nothing about them, as lib/wire.ts */
    if (hiddenAt(x, m)) continue;
    const b = leader(sd, x, m);
    if (b && b.v >= LEAD_MIN) {
      if (b.p.id !== cand) { cand = b.p.id; since = m; }
      if (cand !== said && m - since >= LEAD_HOLD && m < x.end) { ev.push({ m, city: i, kind: 'lead', text: said == null ? b.p.name + ' leads ' + nm + '.' : b.p.name + ' takes the lead in ' + nm + '.' }); said = cand; }
    }
    const k = inAt(sd, x, m); let tot = 0; entries.forEach((r) => { if (r.a < k) tot += votesAtMin(r, x, m); });
    while (marks < VOTE_MARKS.length && tot >= VOTE_MARKS[marks]) { ev.push({ m, city: i, kind: 'votes', text: nm + ' passes ' + fmtN(VOTE_MARKS[marks]) + ' votes.' }); marks++; }
  }
  ev.push({ m: x.buildEnd, city: i, kind: 'close', text: 'Entries close in ' + nm + '. ' + (N ? N + ' projects are in.' : 'No projects came in.') });
  const t = top3(sd, x, x.end).map((r) => r.p.name);
  if (t.length) ev.push({ m: x.end, city: i, kind: 'final', text: nm + (t.length > 1 ? '’s finalists: ' : '’s finalist: ') + listOf(t) + '.' });
  ev.sort((a, b) => a.m - b.m); EVENTS.set(key, ev);
  return ev;
}
const listOf = (a: string[]) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const kindOrder = (k: WireKind) => ['votes', 'entries', 'lead', 'open', 'close', 'final', 'pick'].indexOf(k);
const ordOf = (n: number) => n + (['th', 'st', 'nd', 'rd'][n] || 'th');
export function wireOf(W: HomeWorld, n: number, city?: number): WireEvent[] {
  let ev: WireEvent[] = [];
  W.cs.forEach((x, i) => { if (city != null && city !== i) return; ev = ev.concat(eventsOf(x.sd, W.S.cs[i]).filter((e) => e.m <= W.now)); });
  /* the pick is the day's news: it reaches every city's line, as ALL */
  if (W.picked) ev.push({ m: W.S.pickAt, city: null, kind: 'pick', text: EV.pickers + ' pick ' + W.final.p.name + ', ' + ordOf(W.final.place) + ' in ' + W.final.city.name + '.' });
  return ev.sort((a, b) => b.m - a.m || kindOrder(b.kind) - kindOrder(a.kind)).slice(0, n);
}

/* the wire as announcement items: time (UTC, or the city's local time with offset), city code, sentence */
export function wireItems(W: HomeWorld, n: number, city?: number, offset = 0): Item[] {
  return wireOf(W, n, city).map((e) => ({ id: e.m.toFixed(2) + ':' + (e.city ?? 'd') + ':' + e.kind, time: hhmm(e.m + offset), code: e.city == null ? 'ALL' : CODE[CITIES[e.city].id], text: e.text }));
}

/* the globe's lights: live cities light up, finished ones are dots */
export function lights(W: HomeWorld): GlobeLight[] {
  return W.cs.filter((x) => x.state !== 'next').map((x) => ({ lat: PLACE[x.id][0], lon: PLACE[x.id][1], kind: x.state === 'done' ? 'done' as const : 'live' as const }));
}
export function globeLabel(W: HomeWorld): string {
  const live = W.live.map((x) => x.name), done = W.done.length;
  return 'The globe at ' + hhmm(W.now) + ' UTC. ' + (live.length ? 'Live: ' + live.join(', ') + '. ' : 'No city is live. ') + (done ? done + ' of 10 closed.' : '');
}

/* a city's next change and the seconds to it, for the segment display; minute may carry a fraction */
export function countdown(x: { state: string; start: number; buildEnd: number; end: number }, minuteExact: number): { secs: number; lit: Legend | null; what: string } {
  if (x.state === 'next') return { secs: (x.start - minuteExact) * 60, lit: 'OPENS', what: 'opens' };
  if (x.state === 'build') return { secs: (x.buildEnd - minuteExact) * 60, lit: 'BUILD', what: 'entries close' };
  if (x.state === 'vote') return { secs: (x.end - minuteExact) * 60, lit: 'VOTE', what: 'voting closes' };
  return { secs: 0, lit: 'CLOSED', what: 'closed' };
}

/* the city the home points at: where to vote, else where to join, else the next to open */
export function focusCity(W: HomeWorld): HomeCity {
  return W.cs.filter((y) => y.state === 'vote').sort((a, b) => a.end - b.end)[0]
    || W.cs.filter((y) => y.state === 'build').sort((a, b) => a.buildEnd - b.buildEnd)[0]
    || W.cs.filter((y) => y.state === 'next').sort((a, b) => a.start - b.start)[0]
    || W.cs[W.final.city.i];
}

export { CODE, PLACE, cityPage, EVENT };
