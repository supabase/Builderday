/* home.ts: the home's model. world(cfg) is a pure function of the config and one UTC minute: the seed decides every
   city's entries, votes and winner (day-data.ts, shared with the city page), the minute decides the moment, and the
   config decides the look. The config is saved/day.config.json; the tuning page (/lab/day) writes it.

   Rules: cities east to west, always; one green now line; every city is one fixed row and text never reflows;
   unchanged cells do not move; heavier weight means live; green only for now, the leader or winner, you, the main
   action; a city announces only its top result; ten become one through joining lines; dashed means not yet, hatched
   means closed; every picture is a project picture. */
import { CITIES, EVENT, TA, cityState, nowOf, sched, seedFor, tOf, type CityState, type Sched, type Top } from './day-data';
import { NB, dur, hhmm, plural } from './format';

export type HomeCfg = {
  seed: number; mode: string; t: number;
  ground: string; schedule: string; startHour: number; buildMin: number; voteAfter: number; pickAfter: number;
  display: number; ratio: number; row: number; slope: number; hair: number; band: number; soft: number;
  green: number; shot: number; peek: number; seal: number; speed: number; reduced: number; you: number;
  /* the minute on screen; when absent, t places it */
  now?: number;
  [k: string]: unknown;
};
export const DEF: HomeCfg = {
  seed: 17, mode: 'timetable', t: 0.5,
  ground: 'night', schedule: 'sun', startHour: 9, buildMin: 90, voteAfter: 30, pickAfter: 60,
  display: 88, ratio: 1.5, row: 76, slope: 5, hair: 1, band: 100, soft: 75,
  green: 4, shot: 40, peek: 1, seal: 1, speed: 1, reduced: 0, you: -1,
};
/* [min, max, step] */
export const BOUNDS: Record<string, [number, number, number]> = {
  seed: [1, 9999, 1], t: [0, 1, 0.001], startHour: [8, 11, 1], buildMin: [60, 180, 15], voteAfter: [0, 60, 5], pickAfter: [30, 120, 15],
  display: [56, 128, 4], ratio: [1.2, 1.62, 0.02], row: [64, 96, 4], slope: [4, 6, 1], hair: [0.5, 1.5, 0.25], band: [0, 100, 5], soft: [0, 90, 5],
  green: [1, 4, 1], shot: [28, 56, 4], peek: [0, 1, 1], seal: [0, 1, 1], speed: [0.5, 2, 0.1], reduced: [0, 1, 1], you: [-1, 9, 1],
};
export const CHOICES: Record<string, string[]> = { mode: ['timetable'], ground: ['night', 'paper', 'mint'], schedule: ['sun', 'same'] };

/* clamps every knob into its bounds; extra: the lab's own bounds and choices on top */
export function clampCfg<T extends HomeCfg>(c: T, extra?: { def?: Record<string, unknown>; bounds?: Record<string, [number, number, number]>; choices?: Record<string, string[]> }): T {
  const def = { ...DEF, ...(extra?.def || {}) } as Record<string, unknown>, bounds = { ...BOUNDS, ...(extra?.bounds || {}) }, choices = { ...CHOICES, ...(extra?.choices || {}) };
  const o = c as Record<string, unknown>;
  Object.keys(bounds).forEach((k) => { const v = +(o[k] as number), b = bounds[k]; o[k] = Math.min(b[1], Math.max(b[0], isFinite(v) && o[k] !== '' && o[k] != null ? v : def[k] as number)); if (b[2] >= 1) o[k] = Math.round(o[k] as number); });
  Object.keys(choices).forEach((k) => { if (choices[k].indexOf(String(o[k])) < 0) o[k] = def[k]; o[k] = String(o[k]); });
  return c;
}

/* ---------------- time ---------------- */
export type Moment = [id: string, label: string, t: number];
export function moments(c: HomeCfg): Moment[] {
  const S = sched(c), mid = S.cs[6];
  return [
    ['announced', 'Announced', 0],
    ['first', 'First city live', tOf(S.first + Math.min(45, c.buildMin / 2), S)],
    ['mid', 'Mid-day', tOf(mid.start + c.buildMin / 2, S)],
    ['closed', 'All closed', tOf(S.last + (S.pickAt - S.last) / 2, S)],
    ['picked', 'Picked', tOf(Math.min(S.pickAt + 15, S.winEnd - 5), S)],
    ['archived', 'Archived', 0.97],
  ];
}
/* the minute on screen: the clock's, or (in the lab) the config's t */
export function minuteOf(c: HomeCfg, S: Sched): number { return c.now != null ? c.now : nowOf(c.t, S); }
export function dayOf(m: number): string { return 'Dec ' + (EVENT.day + Math.floor(Math.round(m) / 1440)); }
export { TA };

/* ---------------- the seeded world ---------------- */
export type HomeCity = CityState & { win?: { p: CityState['list'][number]['p']; v: number } };
export type HomeWorld = {
  S: Sched; now: number; cs: HomeCity[]; live: HomeCity[]; done: HomeCity[]; allDone: boolean; picked: boolean; archived: boolean; early: boolean;
  pick: HomeCity & { win: { p: CityState['list'][number]['p']; v: number } }; total: number;
  /* the final: every finalist in so far (three per closed city, east to west, first place first), and the one Ant and
     Copple pick, which is one of the thirty (today's page reads pick, which is that city's first place) */
  finalists: (Top & { city: HomeCity })[];
  final: Top & { city: HomeCity };
};
export function world(c: HomeCfg): HomeWorld {
  const S = sched(c), now = minuteOf(c, S), SD = seedFor(c), archived = now > S.winEnd;
  /* each city's state, and its leader, come from the full seeded list it shares with its own page */
  const cs: HomeCity[] = S.cs.map((x, i) => cityState(x, SD.cities[i], now));
  const live = cs.filter((x) => x.state === 'build' || x.state === 'vote'), done = cs.filter((x) => x.state === 'done');
  const picked = now >= S.pickAt, pc = cs[SD.pick]; pc.win = { p: pc.list[0].p, v: pc.list[0].votes };
  const finalists = done.flatMap((x) => x.top.map((t) => ({ ...t, city: x })));
  const fc = cs[SD.final.city], ft = cityState(S.cs[fc.i], SD.cities[fc.i], S.cs[fc.i].end).top[SD.final.place - 1];
  return { S, now, cs, live, done, allDone: done.length === cs.length, picked, archived, early: now < S.winStart, pick: pc as HomeWorld['pick'], total: cs.reduce((a, x) => a + x.entries, 0), finalists, final: { ...ft, city: fc } };
}

/* ---------------- links (they carry the preview parameters) ---------------- */
/* what a link to the other pages carries: the moment (as that page's t), the seed and the ground, if this page was given them */
/* lab: the tuning page links to the city's tuning page, with its own clock (ht) */
export type Carry = { preview: boolean; still: boolean; seed?: string | null; ground?: string | null; lab?: { panel: boolean } };
export function carryQuery(carry: Carry, t: number | null): string {
  let u = '';
  if ((carry.preview || carry.still) && t != null) u += '&t=' + t.toFixed(5);
  if (carry.still) u += '&still=1';
  if (carry.seed) u += '&seed=' + encodeURIComponent(carry.seed);
  if (carry.ground) u += '&ground=' + encodeURIComponent(carry.ground);
  return u ? '?' + u.slice(1) : '';
}
export function cityHref(x: { id: string; start: number }, c: HomeCfg, W: HomeWorld, carry: Carry): string {
  if (carry.lab) {
    let u = '/lab/city?city=' + x.id + '&ht=' + (c.now != null ? tOf(c.now, W.S) : +c.t).toFixed(4);
    if (c.seed !== DEF.seed) u += '&seed=' + c.seed;
    if (carry.ground && carry.ground !== 'night') u += '&ground=' + carry.ground;
    if (!carry.lab.panel) u += '&panel=0';
    return u;
  }
  const w0 = x.start - 60, w1 = W.S.pickAt + 30;
  return '/city/' + x.id + carryQuery(carry, (W.now - w0) / (w1 - w0));
}

/* ---------------- copy ---------------- */
export function status(W: HomeWorld): string {
  const pc = W.pick, nm = pc.win.p.name;
  if (W.picked) return EVENT.pickers + ' picked ' + nm + ' from ' + pc.name + '.';
  if (W.allDone) return 'All ten winners are in. The pick is at ' + hhmm(W.S.pickAt) + ' UTC.';
  const next = W.cs.filter((x) => x.state === 'next').sort((a, b) => a.start - b.start)[0];
  if (!W.live.length && !W.done.length) return next.name + ' starts first, in ' + dur(next.wait!) + '.';
  let s = W.live.length === 1 ? W.live[0].name + ' is ' + (W.live[0].state === 'build' ? 'building' : 'voting') + '.' : W.live.length + ' of 10 cities are live.';
  if (!W.live.length) s = '';
  const last = W.done.slice().sort((a, b) => b.end - a.end)[0];
  if (last) s += (s ? ' ' : '') + last.name + '’s winner is in.';
  else if (next) s += ' ' + next.name + ' starts in ' + dur(next.wait!) + '.';
  return s;
}
/* the main action: where to go next. Every live or coming city is a link to its page. */
export function action(W: HomeWorld, c: HomeCfg, href: (x: HomeCity) => string): { t: string; href: string } {
  if (W.allDone || W.archived) return { t: W.picked ? 'See the winner' : 'See the ten winners', href: '#pick' };
  const you = c.you >= 0 ? W.cs[c.you] : null;
  if (you && (you.state === 'next' || you.state === 'build')) return { t: 'Join in ' + you.name, href: href(you) };
  if (you && you.state === 'vote') return { t: 'Vote in ' + you.name, href: href(you) };
  let x = W.cs.filter((y) => y.state === 'vote')[0]; if (x) return { t: 'Vote in ' + x.name, href: href(x) };
  x = W.cs.filter((y) => y.state === 'build')[0]; if (x) return { t: 'Join in ' + x.name, href: href(x) };
  x = W.cs.filter((y) => y.state === 'next')[0]; return { t: 'Join in ' + x.name, href: href(x) };
}
export function slotText(x: HomeCity, W: HomeWorld): { k: string; a: string; b: string } {
  if (x.state === 'next') return { k: 'Starts in', a: dur(x.wait!, true), b: 'Entries open then' };
  if (!x.lead) return x.state === 'done' ? { k: 'Closed', a: 'No entries', b: '' } : { k: 'Building', a: 'No entries yet', b: '' };
  /* while the counts are hidden the leader is the one at the freeze, said as such, with no count */
  if (x.hidden && (x.state === 'build' || x.state === 'vote')) return { k: 'Leading at ' + (x.hideAt! - x.start) + ' min', a: x.lead!.p.name, b: 'Votes hidden · ' + (x.state === 'build' ? plural(x.n!, 'project') : dur(x.left!, true) + ' left') };
  if (x.state === 'build') return { k: 'Leading', a: x.lead!.p.name, b: plural(x.lead!.v, 'vote') + ' · ' + plural(x.n!, 'project') };
  if (x.state === 'vote') return { k: 'Leading', a: x.lead!.p.name, b: plural(x.lead!.v, 'vote') + ' · ' + dur(x.left!, true) + ' left' };
  const pk = W.picked && W.pick === x;
  return { k: (pk ? 'Picked' : 'Winner') + ' of ' + x.n, a: x.lead!.p.name, b: plural(x.lead!.v, 'vote') };
}
export function localSpan(x: HomeCity): string { const o = x.city.offset; return hhmm(x.start + o) + '–' + hhmm(x.end + o); }
export function showNow(W: HomeWorld): boolean { return !W.archived && !W.early; }
export function cityIds(): string[] { return CITIES.map((x) => x.id); }

/* ---------------- geometry of the strip ---------------- */
export type View = { v0: number; v1: number; x: (m: number) => number; nx: number; span: number };
export function view(c: HomeCfg, W: HomeWorld): View {
  const S = W.S, span = S.winEnd - S.winStart, now = Math.min(W.now, S.winEnd);
  /* the tuning page's "what moves: day" keeps now fixed and slides the day under it */
  const v0 = c.moves === 'day' ? now - span * 0.35 : S.winStart, v1 = v0 + span;
  return { v0, v1, x: (m) => (m - v0) / (v1 - v0) * 100, nx: (now - v0) / (v1 - v0) * 100, span };
}
/* the page's look, as unitless custom properties on .dl-page */
export function pageVars(c: HomeCfg): Record<string, string | number> {
  const fact = Math.round(c.display / (c.ratio * c.ratio) / 4) * 4;
  return { '--disp': c.display, '--row': c.row, '--fact': fact, '--fact2': Math.max(16, Math.round(fact / c.ratio / 2) * 2), '--sc': c.slope, '--shot': c.shot, '--hair': c.hair + 'px', '--speed': c.speed, '--bandk': c.band / 100 };
}
export { NB };
