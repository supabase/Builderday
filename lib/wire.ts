/* wire.ts: the day as it happens, in sentences. Two things the pages read:

   - sentence(W): one sentence that says what is happening now. It is the first viewport's headline.
   - wire(W, n): the last n events before now, newest first. Every line is one real event with a minute and one
     sentence. The wire speaks only at thresholds: a city opens, entry milestones, a lead change, round vote totals,
     entries close, voting closes with its three finalists, the pick.

   The events come from the same seeded data both pages read (day-data.ts), so the wire never says anything a row
   does not show. A lead change is said once the new leader has held it for LEAD_HOLD minutes, the way a live page
   would have to wait to be sure; nothing leads before LEAD_MIN votes. Pure, and memoised per city and schedule. */
import { EVENT, hiddenAt, inAt, leader, top3, votesAtMin, all, type CitySched, type SeedCity } from './day-data';
import { dur, fmtN, hhmm } from './format';
import type { HomeCity, HomeWorld } from './home';

export type WireKind = 'open' | 'entries' | 'lead' | 'votes' | 'close' | 'final' | 'pick';
/* m: the UTC minute; city: the city's index, or null for the day */
export type WireEvent = { m: number; city: number | null; kind: WireKind; text: string };

const LEAD_MIN = 10, LEAD_HOLD = 2;
const ENTRY_MARKS = [50, 100, 150];
const VOTE_MARKS = [1000, 2000, 5000];

const CACHE = new Map<string, WireEvent[]>();
/* one city's events across its session */
export function cityEvents(sd: SeedCity, x: CitySched): WireEvent[] {
  const key = sd.seed + ':' + sd.i + ':' + x.start + ':' + x.buildEnd + ':' + x.end + ':' + x.hide;
  const hit = CACHE.get(key); if (hit) return hit;
  const nm = x.city.name, i = sd.i, N = sd.entries, ev: WireEvent[] = [];
  ev.push({ m: x.start, city: i, kind: 'open', text: nm + ' opens. Building and voting start now.' });
  /* entry milestones: the minute the count reaches n (the inverse of inAt) */
  ENTRY_MARKS.forEach((n) => {
    if (n >= N) return;
    const f = Math.pow((n - 0.5) / N, 1 / 0.85);
    ev.push({ m: x.start + f * (x.buildEnd - x.start), city: i, kind: 'entries', text: nm + ' passes ' + n + ' entries.' });
  });
  /* lead changes and vote totals, minute by minute */
  let said: number | null = null, cand: number | null = null, since = 0, marks = 0;
  const entries = all(sd);
  for (let m = x.start; m <= x.end; m++) {
    /* while the counts are hidden the wire says nothing about them: no lead change, no vote total, until the close */
    if (hiddenAt(x, m)) continue;
    const b = leader(sd, x, m);
    if (b && b.v >= LEAD_MIN) {
      if (b.p.id !== cand) { cand = b.p.id; since = m; }
      if (cand !== said && m - since >= LEAD_HOLD && m < x.end) {
        ev.push({ m, city: i, kind: 'lead', text: said == null ? b.p.name + ' leads ' + nm + '.' : b.p.name + ' takes the lead in ' + nm + '.' });
        said = cand;
      }
    }
    const k = inAt(sd, x, m);
    let tot = 0; entries.forEach((r) => { if (r.a < k) tot += votesAtMin(r, x, m); });
    while (marks < VOTE_MARKS.length && tot >= VOTE_MARKS[marks]) { ev.push({ m, city: i, kind: 'votes', text: nm + ' passes ' + fmtN(VOTE_MARKS[marks]) + ' votes.' }); marks++; }
  }
  ev.push({ m: x.buildEnd, city: i, kind: 'close', text: 'Entries close in ' + nm + '. ' + (N ? N + ' projects are in.' : 'No projects came in.') });
  const t = top3(sd, x, x.end).map((r) => r.p.name);
  if (t.length) ev.push({ m: x.end, city: i, kind: 'final', text: nm + (t.length > 1 ? '’s finalists: ' : '’s finalist: ') + list(t) + '.' });
  ev.sort((a, b) => a.m - b.m);
  CACHE.set(key, ev);
  return ev;
}
function list(a: string[]): string { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

/* every event of the day so far, newest first; city: only that city's (the city page's own wire) */
export function wire(W: HomeWorld, n: number, city?: number): WireEvent[] {
  let ev: WireEvent[] = [];
  W.cs.forEach((x, i) => { if (city != null && city !== i) return; ev = ev.concat(cityEvents(x.sd, W.S.cs[i]).filter((e) => e.m <= W.now)); });
  if (W.picked && city == null) ev.push({ m: W.S.pickAt, city: null, kind: 'pick', text: EVENT.pickers + ' pick ' + W.final.p.name + ', ' + ord(W.final.place) + ' in ' + W.final.city.name + '.' });
  return ev.sort((a, b) => b.m - a.m || kindOrder(b.kind) - kindOrder(a.kind)).slice(0, n);
}
/* at the same minute, the bigger news goes first */
function kindOrder(k: WireKind): number { return ['votes', 'entries', 'lead', 'open', 'close', 'final', 'pick'].indexOf(k); }
function ord(n: number): string { return n + (['th', 'st', 'nd', 'rd'][n] || 'th'); }
export function wireTime(e: WireEvent): string { return hhmm(e.m); }

/* the live sentence: what is happening now, in one sentence (two short ones at most) */
export function sentence(W: HomeWorld): string {
  /* three per city, or fewer from a city that closed with fewer entries */
  const n = W.finalists.length, total = W.cs.reduce((t, x) => t + (x.state === 'done' ? Math.min(EVENT.finalists, x.entries) : EVENT.finalists), 0);
  if (W.picked) return EVENT.pickers + ' picked ' + W.final.p.name + ', ' + ord(W.final.place) + ' in ' + W.final.city.name + '.';
  if (W.allDone) return 'All ' + total + ' finalists are in. ' + EVENT.pickers + ' pick one at ' + hhmm(W.S.pickAt) + ' UTC.';
  const next = W.cs.filter((x) => x.state === 'next').sort((a, b) => a.start - b.start)[0];
  if (!W.live.length && !W.done.length) return next.name + ' opens first, in ' + dur(next.wait!) + '.';
  const live = W.live;
  let s = live.length === 1 ? live[0].name + ' is live.' : live.length === 2 ? live[0].name + ' and ' + live[1].name + ' are live.' : live.length ? names(live) + ' are live.' : '';
  if (n) s += (s ? ' ' : '') + n + ' of ' + total + ' finalists are in.';
  else if (next && !live.length) s += ' ' + next.name + ' opens in ' + dur(next.wait!) + '.';
  return s.trim();
}
function names(l: HomeCity[]): string { return l.length > 3 ? l.length + ' cities' : l.slice(0, -1).map((x) => x.name).join(', ') + ' and ' + l[l.length - 1].name; }
