/* city.ts: one city's page, as a model. world(cfg, votes) is a pure function of the config, one UTC minute and this
   visitor's own votes. The entries, their arrival and their votes come from day-data.ts, the same seeded data the
   home reads, so a city's row on the home and this page always agree: same winner, same counts, same moment.

   Rules: same row as the home; time runs across; projects re-sort, rows glide, numbers never animate; a row never
   moves under the pointer or focus; one winner, one cut line; nothing listed twice; vote where you look, no toast; no
   ranking while building; vote traces are step lines; every vote lands as a tick at the now line; the rest of the
   day is always one click away; the winner's mark is the city's seal. */
import { CITIES, CITY_IDS, EVENT, FINALIST_COUNT, TA, all, arriveAt, cityState, countMin, frozenOrder, hiddenAt, showMin, judgeMin, judgeOf, minOfVote, publicMin, sched, seedFor, slug, votesAtMin, type CitySched, type CityState, type Entry, type Sched, type SeedCity, type SeedDay } from './day-data';
import type { Project } from './data';
import { NB, clamp, dur as durAny, fmtN, hhmm, ord, pluralN as plural, r2, tz } from './format';

export { NB, fmtN, hhmm, ord, plural, r2, tz };
/* a city page's countdown groups its numbers */
export function dur(min: number, short?: boolean): string { return durAny(min, short, true); }

export type CityCfg = {
  seed: number; city: string; mode: string; t: number;
  schedule: string; startHour: number; buildMin: number; voteAfter: number; pickAfter: number;
  ground: string; top: number; row: number; nameSize: number; disp: number; pic: number;
  strip: string; trace: number; cut: string; ledger: string; peek: number; table: number; seal: number;
  you: number; rate: number; reorder: number; speed: number; reduced: number;
  sort: string; q: string; more: number;
  /* the tuning page's own looks, passed through as data attributes */
  title?: string; mini?: string;
  /* the minute on screen; when absent, t places it */
  now?: number;
  [k: string]: unknown;
};
export const DEF: CityCfg = {
  seed: 17, city: 'london', mode: 'tower', t: -1,
  schedule: 'sun', startHour: 9, buildMin: 90, voteAfter: 30, pickAfter: 60,
  ground: 'night', top: 10, row: 56, nameSize: 32, disp: 128, pic: 36,
  strip: 'both', trace: 1.5, cut: 'full', ledger: 'ledger', peek: 1, table: 44, seal: 1,
  you: -1, rate: 1, reorder: 4, speed: 1, reduced: 0,
  sort: 'ranked', q: '', more: 0,
};
/* [min, max, step] */
export const BOUNDS: Record<string, [number, number, number]> = {
  seed: [1, 9999, 1], t: [0, 1, 0.0001], startHour: [8, 11, 1], buildMin: [60, 180, 15], voteAfter: [0, 60, 5], pickAfter: [30, 120, 15],
  top: [6, 12, 1], row: [48, 72, 4], nameSize: [20, 40, 2], disp: [72, 160, 4], pic: [28, 56, 4], trace: [1, 2.5, 0.5], peek: [0, 1, 1], table: [36, 56, 4], seal: [0, 1, 1],
  you: [-1, 40, 1], rate: [0, 30, 1], reorder: [2, 10, 1], speed: [0.5, 2, 0.1], reduced: [0, 1, 1], more: [0, 1, 1],
};
export const CHOICES: Record<string, string[]> = { mode: ['tower'], city: CITY_IDS, ground: ['night', 'paper', 'mint'], schedule: ['sun', 'same'], strip: ['both', 'arrivals', 'traces'], cut: ['full', 'short', 'off'], ledger: ['ledger', 'off'], sort: ['ranked', 'shuffled', 'newest'] };

export type Extra = { def?: Record<string, unknown>; bounds?: Record<string, [number, number, number]>; choices?: Record<string, string[]> };
/* clamps every knob into its bounds; extra: the tuning page's own bounds and choices on top */
export function clampCfg<T extends CityCfg>(c: T, extra?: Extra): T {
  const def = { ...DEF, ...(extra?.def || {}) } as Record<string, unknown>, bounds = { ...BOUNDS, ...(extra?.bounds || {}) }, choices = { ...CHOICES, ...(extra?.choices || {}) };
  const o = c as Record<string, unknown>;
  Object.keys(bounds).forEach((k) => {
    if (k === 't' && (o.t == null || +(o.t as number) < 0)) { o.t = -1; return; }
    const v = +(o[k] as number), b = bounds[k]; o[k] = Math.min(b[1], Math.max(b[0], isFinite(v) && o[k] !== '' && o[k] != null ? v : def[k] as number)); if (b[2] >= 1) o[k] = Math.round(o[k] as number);
  });
  Object.keys(choices).forEach((k) => { if (choices[k].indexOf(String(o[k])) < 0) o[k] = def[k]; o[k] = String(o[k]); });
  o.q = String(o.q || '').slice(0, 60);
  return c;
}

/* ---------------- time ---------------- */
export function cityIndex(c: { city: string }): number { return CITIES.filter((x) => x.id === c.city)[0].i; }
/* this city's window: an hour before it starts to half an hour after the pick */
export type Win = { S: Sched; x: CitySched; w0: number; w1: number };
export function win(c: CityCfg): Win {
  const S = sched(c), x = S.cs[cityIndex(c)];
  return { S, x, w0: x.start - 60, w1: S.pickAt + 30 };
}
/* the minute on screen: the clock's, or (in the lab) the config's t across the window */
export function minuteOf(c: CityCfg, Wn: Win): number { return c.now != null ? c.now : Wn.w0 + (c.t < 0 ? 0 : c.t) * (Wn.w1 - Wn.w0); }
export function tAt(m: number, Wn: Win): number { return clamp((m - Wn.w0) / (Wn.w1 - Wn.w0), 0, 1); }
export type Moment = [id: string, label: string, t: number];
export function moments(c: CityCfg): Moment[] {
  const Wn = win(c), x = Wn.x, S = Wn.S;
  return [
    ['before', 'Before', tAt(x.start - 25, Wn)],
    ['build', 'Building', tAt(x.start + c.buildMin * 0.55, Wn)],
    ['vote', 'Voting', tAt(x.buildEnd + c.voteAfter * 0.38, Wn)],
    ['last', 'Last minutes', tAt(x.end - Math.max(3, Math.round(c.voteAfter * 0.1)), Wn)],
    ['closed', 'Closed', tAt(x.end + Math.min(25, (S.pickAt - x.end) / 2), Wn)],
    ['picked', 'Picked', tAt(S.pickAt + 15, Wn)],
  ];
}
/* the home's clock position for a minute, unclamped: below 0 is before the day, 0.94 and up the day after */
export function homeT(now: number, S: Sched): number { return now > S.winEnd ? 1 : (now - S.winStart) / (S.winEnd - S.winStart) * TA; }

/* ---------------- the world ---------------- */
export type Votes = Readonly<Record<string, 1>>;
/* v: votes now, yours included; mine: yours (one as a visitor, any number as a judge); j: how many are judges' (a
   judge's own included).
   While the city's counts are hidden (W.hidden): v and j are the counts as they stood when hiding began (no later vote, not
   even yours, moves them), rank is the frozen order, and votes and judges are null; mine still says which are yours.
   Otherwise votes is v and judges is j. A page prints votes and judges; v stays for the bars and traces. late: came in
   after hiding began (it sits at the bottom, in the order it came). j and judges are in counted votes (a judge's vote at
   EVENT.judgeWeight). tie: once voting has closed, in a tie on votes that touches the top EVENT.finalists, 'open' until
   the host has settled it at the desk, then 'settled' (the order is the host's); null otherwise */
export type Row = { r: Entry; p: Project; k: number; a: number; arrive: number; v: number; mine: number; rank: number; j: number; votes: number | null; judges: number | null; late: boolean; tie: 'open' | 'settled' | null };
export type CityWorld = {
  c: CityCfg; S: Sched; x: CitySched; Wn: Win; i: number; city: CitySched['city']; off: number; sd: SeedCity; SD: SeedDay; now: number;
  st: CityState; state: CityState['state']; f: number; votesOn: boolean; voting: boolean;
  rows: Row[]; arrived: Row[]; ranked: Row[]; lead: Row | null; second: Row | undefined; total: number; topV: number; scaleV: number;
  picked: boolean; isPick: boolean; pickCity: typeof CITIES[number]; pickWin: Project; you: Row | null; last: boolean; inDay: boolean; day: CityState[];
  /* hidden: no counts are shown, from the start until showAt (a minute, on the same scale as x.start; null: this city
     never hides); the order is the order entries came in. From showAt the counts are live until the close */
  hidden: boolean; showAt: number | null;
  /* publicAt: the minute voting opens, for everyone; publicOpen: voting is on and that minute has come. judgeAt and
     judgeOpen: the same for judges. judgeWeight: what one judge's vote counts */
  publicAt: number; publicOpen: boolean; judgeAt: number; judgeOpen: boolean; judgeWeight: number;
};
/* voted: this visitor's own votes, by project id. judged: a judge's own votes (several may go on one project); they
   move the order like anyone's. Both show while voting is open; once it closes, the day's data is the count both
   pages show */
export function world(c: CityCfg, voted: Votes, judged?: Readonly<Record<string, number>>): CityWorld {
  const Wn = win(c), S = Wn.S, x = Wn.x, i = cityIndex(c), SD = seedFor(c), sd = SD.cities[i], entries = all(sd), now = minuteOf(c, Wn);
  const st = cityState(x, sd, now), city = x.city, off = city.offset;
  /* voting opens with building: votes show from the first entry; you can vote while building or voting is on */
  const votesOn = st.state !== 'next', voting = st.state === 'build' || st.state === 'vote', f = st.state === 'vote' ? st.f! : st.state === 'done' ? 1 : 0;
  const hidden = hiddenAt(x, now), cm = countMin(x, now);
  const rows: Row[] = entries.map((r) => {
    const late = hidden && arriveAt(r, x) > cm;
    const v = votesOn && !late ? votesAtMin(r, x, cm) : 0, jm = voting && judged ? judged[r.p.id] || 0 : 0, mine = (voting && voted[r.p.id] ? 1 : 0) + jm;
    /* your own presses on the count: a visitor's one vote, a judge's votes at their weight */
    const vv = hidden ? v : v + (mine - jm) + jm * EVENT.judgeWeight, jj = hidden ? judgeOf(r, v) : judgeOf(r, v) + jm * EVENT.judgeWeight;
    return { r, p: r.p, k: r.k, a: r.a, arrive: arriveAt(r, x), v: vv, mine, rank: 0, j: jj, votes: hidden ? null : vv, judges: hidden ? null : jj, late, tie: null as Row['tie'] };
  });
  const arrived = st.state === 'next' ? [] : st.state === 'build' ? rows.filter((o) => o.a < st.n!) : rows;
  let ranked: Row[];
  if (hidden) { const byId = new Map(rows.map((o) => [o.p.id, o])); ranked = frozenOrder(sd, x, now).map((t) => byId.get(t.p.id)!).filter((o) => arrived.indexOf(o) >= 0); }
  else ranked = votesOn ? arrived.slice().sort((a, b) => b.v - a.v || a.k - b.k) : arrived.slice().sort((a, b) => b.a - a.a);
  ranked.forEach((o, j) => { o.rank = j + 1; });
  const lead = votesOn && ranked.length ? ranked[0] : null, second = ranked[1];
  const total = arrived.reduce((a, o) => a + o.v, 0);
  const picked = now >= S.pickAt, pick = SD.pick, pickCity = CITIES[pick], pickSd = SD.cities[pick];
  const ys = c.you >= 0 && c.you < rows.length ? rows.filter((o) => o.k === c.you)[0] : null;
  return {
    c, S, x, Wn, i, city, off, sd, SD, now, st, state: st.state, f, votesOn, voting,
    rows, arrived, ranked, lead, second, total, topV: sd.list[0].votes,
    /* traces share one vertical scale: the leader's count now, so first place's line reaches the top of its row */
    scaleV: Math.max(10, lead ? lead.v : 0),
    picked, isPick: pick === i, pickCity, pickWin: pickSd.list[0].p, you: ys || null,
    last: voting && st.left! <= Math.max(3, Math.round((x.end - x.start) * 0.05)) + 0.01,
    inDay: now >= S.winStart && now <= S.winEnd,
    day: S.cs.map((y, j) => cityState(y, SD.cities[j], now)),
    hidden, showAt: showMin(x),
    publicAt: publicMin(x), publicOpen: voting && now >= publicMin(x), judgeAt: judgeMin(x), judgeOpen: voting && now >= judgeMin(x), judgeWeight: EVENT.judgeWeight,
  };
}
/* the last few votes before now, from the shared vote curves (each entry's n-th vote has a minute) */
export type VoteEvent = { o: Row; m: number };
export function latest(W: CityWorld, n: number): VoteEvent[] {
  if (!W.voting || W.hidden) return [];
  const x = W.x, ev: VoteEvent[] = [];
  W.arrived.forEach((o) => {
    const v = o.v - o.mine;
    for (let j = 0; j < 3 && v - j > 0; j++) ev.push({ o, m: minOfVote(o.r, x, v - j) });
  });
  return ev.sort((a, b) => b.m - a.m).slice(0, n);
}
/* the votes in the last ten minutes; none while the counts are hidden (lastTenOrNull says hidden as null) */
export function lastTenOrNull(W: CityWorld): number | null { return W.hidden ? null : lastTen(W); }
export function lastTen(W: CityWorld): number {
  if (!W.voting || W.hidden) return 0;
  return W.arrived.reduce((a, o) => a + (o.v - o.mine) - votesAtMin(o.r, W.x, W.now - 10), 0);
}

export function slugOf(p: Project): string { return p.slug || slug(p.name); }

/* ---------------- copy ---------------- */
export function local(W: CityWorld, m: number): string { return hhmm(m + W.off); }
export function status(W: CityWorld): string {
  const s = W.st, nm = W.city.name;
  if (s.state === 'next') return nm + ' starts at ' + local(W, W.x.start) + (s.wait! >= 1440 ? ' on ' + EVENT.date : '') + '. That is in ' + dur(s.wait!) + '.';
  if (s.state === 'build' && W.now < W.publicAt) return nm + ' is building. Voting opens at ' + local(W, W.publicAt) + '. Entries close in ' + dur(s.left!) + '.';
  if (W.hidden) return 'Voting is open. The counts are hidden until ' + local(W, W.showAt!) + '. Entries close in ' + dur(s.left!) + '.';
  if (s.state === 'build') return nm + ' is building and voting is open. Everything closes in ' + dur(s.left!) + '.';
  if (s.state === 'vote') return W.lead ? 'Voting closes in ' + dur(s.left!) + '.' : 'No entries came in. Entries closed at ' + local(W, W.x.buildEnd) + '.';
  if (!W.lead) return nm + ' had no entries.';
  const fin = W.ranked.slice(0, EVENT.finalists).map((o) => o.p.name);
  return (fin.length > 1 ? fin.slice(0, -1).join(', ') + ' and ' + fin[fin.length - 1] + ' are' : fin[0] + ' is') + ' in the final.';   /* the pick is said once, on the line under the table */
}
/* the main action. Remind me and Submit open forms, so they are buttons; the rest are links.
   While building, voting is open too: Submit stays the main action (entries close first), and every row has Vote. */
export type Action = { t: string; act?: 'remind' | 'submit'; href?: string };
export function action(W: CityWorld, L: Links): Action {
  const s = W.state;
  if (s === 'next') return { t: 'Remind me', act: 'remind' };
  if (s === 'build') return { t: 'Submit your project', act: 'submit' };
  if (s === 'vote') return W.lead ? { t: 'Vote', href: '#sheet' } : { t: 'See the other cities', href: homeHref(W, '', L) };
  return W.picked ? { t: 'See the pick', href: homeHref(W, '#final', L) } : { t: `See the ${FINALIST_COUNT} finalists`, href: homeHref(W, '#final', L) };
}
export function gapText(W: CityWorld, o: Row): string {
  if (!W.votesOn || !W.lead || W.hidden) return '';
  if (o === W.lead) return !W.second ? 'The only project' : o.v === W.second.v ? 'Level with 2nd' : fmtN(o.v - W.second.v) + ' ahead of 2nd';
  return o.v === W.lead.v ? 'Level with 1st' : fmtN(W.lead.v - o.v) + ' behind 1st';
}

/* the top 3 now, as rows: the contenders while live, the finalists once closed */
export function finalists(W: CityWorld): Row[] { return W.votesOn ? W.ranked.slice(0, EVENT.finalists) : []; }

export function slotText(W: CityWorld, o: Row | null | undefined): { k: string; a: string; b: string } {
  if (!o) return { k: '', a: '', b: '' };
  const first = o === W.lead, done = W.state === 'done';
  if (W.hidden) return { k: 'In at ' + local(W, o.arrive), a: W.now < W.publicAt ? 'Voting opens at ' + local(W, W.publicAt) : 'Votes hidden until ' + local(W, W.showAt!), b: '' };
  return { k: first ? (done ? (W.picked && W.isPick ? 'Picked' : 'Winner') : 'Leading') : ord(o.rank), a: plural(o.v, 'vote'), b: gapText(W, o) };
}

/* the title's facts: a countdown or the close, the local time, the count, the votes */
export function facts(W: CityWorld): [string, string][] {
  const s = W.st; let k1: string, v1: string;
  if (s.state === 'next') { k1 = 'Starts in'; v1 = dur(s.wait!, true); }
  else if (s.state === 'build') { k1 = 'Entries close in'; v1 = dur(s.left!, true); }
  else if (s.state === 'vote') { k1 = 'Voting closes in'; v1 = dur(s.left!, true); }
  else { k1 = 'Voting closed at'; v1 = local(W, W.x.end); }
  const n = W.state === 'next' ? 0 : W.state === 'build' ? s.n! : W.sd.entries;
  return [[k1, v1], ['Local time, ' + tz(W.off), local(W, W.now)], ['Projects', fmtN(n)], ['Votes', W.hidden ? 'Hidden' : W.votesOn ? fmtN(W.total) : '–']];
}

/* ---------------- links between the pages (they carry the preview parameters) ---------------- */
export type Links = { kind: 'page'; preview: boolean; still: boolean; seed?: string | null; ground?: string | null };
function carry(L: Links, t: number): string {
  let u = '';
  if (L.preview || L.still) u += '&t=' + t.toFixed(5);
  if (L.still) u += '&still=1';
  if (L.seed) u += '&seed=' + encodeURIComponent(L.seed);
  if (L.ground) u += '&ground=' + encodeURIComponent(L.ground);
  return u;
}
export function cityHref(W: CityWorld, id: string, L: Links): string {
  const y = W.S.cs.filter((z) => z.city.id === id)[0], w0 = y.start - 60, w1 = W.S.pickAt + 30, u = carry(L, (W.now - w0) / (w1 - w0));
  return '/city/' + id + (u ? '?' + u.slice(1) : '');
}
export function homeHref(W: CityWorld, hash: string, L: Links): string {
  const u = carry(L, homeT(W.now, W.S));
  return '/' + (u ? '?' + u.slice(1) : '') + (hash || '');
}

export function projectPath(city: string, slug: string): string { return '/city/' + city + '/p/' + slug; }

/* ---------------- geometry: the session strip (the city's bar, opened) ---------------- */
export type View = { v0: number; v1: number; x: (m: number) => number; nx: number };
export function view(W: CityWorld): View { const x = W.x, v0 = x.start - 10, v1 = x.end + 10; return { v0, v1, x: (m) => (m - v0) / (v1 - v0) * 100, nx: (W.now - v0) / (v1 - v0) * 100 }; }

export type Tick = { m: number; left: number; cut: boolean; major: boolean; label: string | null };
export function ticks(W: CityWorld, V: View): Tick[] {
  const o: Tick[] = [], x = W.x, first = Math.ceil(V.v0 / 15) * 15, live = W.now >= V.v0 && W.now <= V.v1;
  for (let m = first; m <= V.v1; m += 15) {
    const px = V.x(m), major = ((m + W.off) % 30 + 30) % 30 === 0, hide = !major || px < 3 || px > 97 || (live && Math.abs(px - V.nx) < 6);
    o.push({ m, left: r2(px), cut: m === x.buildEnd, major, label: hide ? null : local(W, m) });
  }
  return o;
}
/* one entry's line on the strip: the arrival mark, then the vote trace as steps from its arrival to now */
export function trace(W: CityWorld, V: View, o: Row, c: CityCfg, big?: boolean): { d: string | null; arr: number | null } | null {
  const x = W.x, show = c.strip, base = 92, top = big ? 10 : 14;
  const ax = V.x(o.arrive) * 10, end = Math.min(W.now, x.end, W.hidden ? W.x.start : Infinity), endX = V.x(end) * 10, bx = V.x(x.buildEnd) * 10;
  if (W.state === 'next' || o.arrive > W.now || o.arrive > end) return null;
  let d = 'M' + r2(ax) + ' ' + base;
  if (W.votesOn && show !== 'arrivals') {
    const stepM = Math.max(2, Math.round((x.end - x.start) / 40)); let prevY = base, v = 0;
    for (let m = o.arrive; m <= end + 0.001; m += stepM) {
      v = votesAtMin(o.r, x, Math.min(m, end));
      const y = r2(base - v / W.scaleV * (base - top));
      if (y !== prevY) { d += 'V' + y; prevY = y; }
      const nx = Math.min(m + stepM, end); d += 'H' + r2(V.x(nx) * 10);
      if (nx >= end) break;
    }
    if (o.mine && !W.hidden) d += 'V' + r2(base - o.v / W.scaleV * (base - top));
  } else d += 'H' + r2(Math.min(endX, bx));
  if (show === 'traces' && !W.votesOn) return null;
  return { d, arr: show !== 'traces' ? r2(ax / 10) : null };
}

