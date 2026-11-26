/* day-data.ts: the one model both pages read, so a city's row on the home and that city's own page always agree:
   the cities, the schedule, the clock, and each city's seeded project list.

   The date is decided: 10 December 2026. The cities are the Luma events', and so is each city's start: the local time its
   Luma event starts (18:00 in most). Not confirmed: whether building starts then or after the doors.
   Offsets are December UTC offsets in minutes. Sunrise and sunset are approximate local times for mid-December, used only to draw the daylight band; they
   are not checked against an almanac.

   The home's seeding is kept call-for-call (same seed, same random draws, same winner and counts); each city then
   gets its full list of entries on top, with arrival times and a vote history. Projects 1-20 come from data.ts; the
   rest of each city's entries are generated here from the seed. Judge votes and the pick's place come from their own
   generators, after everything else, so adding them changed no count and no winner. Pure: no window, no DOM. */
import { PAST, SAMPLE_PROJECTS, type PastEvent, type Project } from './data';

export type City = { i: number; id: string; name: string; offset: number; rise: number; set: number; start: number };

function hm(s: string): number { const p = s.split(':'); return +p[0] * 60 + +p[1]; }
/* id, name, December UTC offset, sunrise, sunset, the local start (the Luma event's start time) */
const C: [string, string, number, string, string, string][] = [
  ['seoul', 'Seoul', 540, '07:40', '17:15', '18:00'],
  ['singapore', 'Singapore', 480, '06:59', '19:00', '18:00'],
  ['peshawar', 'Peshawar', 300, '07:00', '17:05', '11:30'],
  ['nouakchott', 'Nouakchott', 0, '07:40', '18:45', '11:30'],
  ['london', 'London', 0, '07:59', '15:51', '18:00'],
  ['rosario', 'Rosario', -180, '05:35', '20:10', '18:00'],
  ['santiago', 'Santiago', -180, '06:25', '20:55', '18:00'],
  ['manta', 'Manta', -300, '06:05', '18:20', '10:00'],
  ['new-york', 'New York City', -300, '07:09', '16:28', '18:00'],
  ['toronto', 'Toronto', -300, '07:45', '16:42', '18:00'],
  ['san-salvador', 'San Salvador', -360, '05:55', '17:25', '16:00'],
  ['austin', 'Austin', -360, '07:20', '17:32', '18:00'],
  ['mexico-city', 'Mexico City', -360, '07:05', '18:00', '18:00'],
  ['san-francisco', 'San Francisco', -480, '07:14', '16:51', '18:00'],
];
/* east to west, always (rule 1) */
export const CITIES: City[] = C.map((r, i) => ({ i, id: r[0], name: r[1], offset: r[2], rise: hm(r[3]), set: hm(r[4]), start: hm(r[5]) }));
export const CITY_IDS: string[] = CITIES.map((c) => c.id);
export function cityById(id: string): City | undefined { return CITIES.find((c) => c.id === id); }
/* the starts in words, from the cities: the usual local start (the one most cities share) and the others by name */
const hm2 = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const tally = new Map<number, City[]>(); CITIES.forEach((c) => tally.set(c.start, [...(tally.get(c.start) || []), c]));
const byCount = [...tally.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
/* local minutes of the start most cities share */
export const USUAL_START = byCount[0][0];
export const cityStartLocal = (c: { start: number }) => hm2(c.start);
const and = (a: string[]) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
/* "Most cities start at 18:00 local time; Peshawar and Nouakchott at 11:30, Manta at 10:00 and San Salvador at 16:00." */
export function startsSentence(): string {
  if (byCount.length === 1) return 'Every city starts at ' + hm2(USUAL_START) + ' local time.';
  const rest = byCount.slice(1).map(([m, cs]) => and(cs.map((c) => c.name)) + ' at ' + hm2(m));
  return 'Most cities start at ' + hm2(USUAL_START) + ' local time; ' + and(rest) + '.';
}
/* how many cities, as words for the copy ("Fourteen cities") */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export const CITY_COUNT = CITIES.length;
export const CITY_WORD = WORDS[CITY_COUNT] ?? String(CITY_COUNT);
export const CITY_WORD_CAP = CITY_WORD[0].toUpperCase() + CITY_WORD.slice(1);

export const EVENT = {
  /* the event's row in the database (events.id): one event per site; a later event is a new row */
  id: 'builder-day-2026',
  date: '10 December 2026',
  year: 2026, month: 12, day: 10,
  /* the name where it stands alone (tab title, share text, an email's subject), and where Supabase is already beside it */
  name: 'Supabase Builder Day',
  short: 'Builder Day',
  /* who picks the global 1st, 2nd and 3rd from the finalists (prize sheet, 2026-11-25) */
  pickers: 'the Supabase team',
  /* the top this many in each city go to the final */
  finalists: 3,
  /* judges per city (PLACEHOLDER), each judge's votes and what one counts (owner, 2026-11-23: "judges only have 10 votes
     and each vote is 5 normal votes worth") */
  judges: 2,
  judgeVotes: 10,
  judgeWeight: 5,
  /* One block per city (owner, 2026-11-25: "there will be no seperate voting part anymore"): build and submit for the
     whole 90 minutes; voting opens for everyone this many minutes in. Owner, 2026-11-26: voting is open from the start,
     only the counts wait (showAt). null: from the start */
  publicAt: 0 as number | null,
  /* judges vote from this many minutes in (null: with everyone) */
  judgeAt: 60 as number | null,
  /* the counts are hidden from the start until this many minutes in, then shown live until the close ("first 60
     minutes all votes will be hidden then last 30 minutes all shown"). null: never hidden */
  showAt: 60 as number | null,
} as const;
/* how many go to the final: the top few in every city */
export const FINALIST_COUNT = EVENT.finalists * CITIES.length;
/* minute 0 of the model: Dec 10, 00:00 UTC */
export const EPOCH = Date.UTC(EVENT.year, EVENT.month - 1, EVENT.day);

/* Past rows come from PAST only. Winners of past hackathons are not in the repo, so none are shown. */
export function pastEvents(): PastEvent[] { return PAST; }

/* ---------------- the schedule ---------------- */
/* luma: each city at its own Luma start, local; sun: every city at startHour local; same: every city at startHour UTC.
   startHour is also the usual local start (18:00, ten of the fourteen), which the drawings show as one line. */
export type ScheduleKind = 'luma' | 'sun' | 'same';
/* showAt: minutes after a city's start when its counts are shown (hidden before); null never hidden; absent, the
   event's (EVENT.showAt). voteAfter: minutes of voting after building ends, 0 since 2026-11-25. */
export type SchedCfg = { schedule: ScheduleKind | string; startHour: number; buildMin: number; voteAfter: number; pickAfter: number; showAt?: number | null };
/* the schedule knobs both pages share, with the home's defaults */
export const SCHED: SchedCfg = { schedule: 'luma', startHour: 18, buildMin: 90, voteAfter: 0, pickAfter: 60, showAt: EVENT.showAt };

/* show: the minute the counts are shown (start + showAt), null when they are never hidden; absent, start + EVENT.showAt.
   pub: the minute voting opens, for everyone. jud: the minute judges may vote. Absent, from EVENT. */
export type CitySched = { city: City; start: number; buildEnd: number; end: number; show?: number | null; pub?: number; jud?: number };
/* the minute voting opens in a city */
export function publicMin(x: { start: number; pub?: number }): number { return x.pub !== undefined ? x.pub : x.start + (EVENT.publicAt ?? 0); }
/* the minute judges may vote in a city */
export function judgeMin(x: { start: number; pub?: number; jud?: number }): number { return x.jud !== undefined ? x.jud : EVENT.judgeAt == null ? publicMin(x) : x.start + EVENT.judgeAt; }
/* the minute a city's counts are shown, or null when they are never hidden */
export function showMin(x: { start: number; show?: number | null }): number | null { return x.show !== undefined ? x.show : EVENT.showAt == null ? null : x.start + EVENT.showAt; }
/* whether a city's counts are hidden at minute m: from its start until they are shown (never after the close) */
export function hiddenAt(x: { start: number; end: number; show?: number | null }, m: number): boolean { const s = showMin(x); return s != null && m >= x.start && m < s && m < x.end; }
/* the minute hidden counts are read at: the start, so a hidden ranking is the order entries came in; null when the city
   never hides. (Before 2026-11-25 this was the minute of a freeze near the end.) */
export function hideMin(x: { start: number; show?: number | null }): number | null { return showMin(x) == null ? null : x.start; }
/* the minute a city's counts are read at: the start while hidden, else m */
export function countMin(x: { start: number; end: number; show?: number | null }, m: number): number { return hiddenAt(x, m) ? x.start : m; }
/* a config's showAt: its own when it says (null: never hidden), else the event's */
export function showAtOf(c: { showAt?: number | null }): number | null { return c.showAt === undefined ? EVENT.showAt : c.showAt == null ? null : Math.max(0, +c.showAt); }
export type Sched = { cs: CitySched[]; first: number; last: number; pickAt: number; winStart: number; winEnd: number };

export const TA = 0.94;   /* home clock: t from 0 to TA runs the day's strip; from TA to 1 is the day after (archived) */
export function mulberry32(a: number): () => number {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle<T>(a: T[], R: () => number): T[] { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* Minutes are UTC minutes from Dec 10, 00:00. Building runs buildMin; voting opens at publicAt and closes voteAfter
   minutes after building (0: with it). */
export function sched(c: SchedCfg): Sched {
  const h = showAtOf(c);
  const cs = CITIES.map((city) => {
    const start = c.schedule === 'same' ? c.startHour * 60 : (c.schedule === 'sun' ? c.startHour * 60 : city.start) - city.offset;
    return { city, start, buildEnd: start + c.buildMin, end: start + c.buildMin + c.voteAfter, show: h == null ? null : start + h, pub: start + (EVENT.publicAt ?? 0), jud: start + (EVENT.judgeAt ?? EVENT.publicAt ?? 0) };
  });
  const first = Math.min(...cs.map((x) => x.start)), last = Math.max(...cs.map((x) => x.end));
  const pickAt = Math.ceil((last + c.pickAfter) / 15) * 15, winStart = Math.floor((first - 60) / 60) * 60;
  const winEnd = Math.max(winStart + 1440, Math.ceil((pickAt + 30) / 60) * 60);
  return { cs, first, last, pickAt, winStart, winEnd };
}
/* the home's clock: t (0..1) to a UTC minute and back */
export function nowOf(t: number, S: Sched): number { return t >= TA ? S.winEnd + 7 * 1440 : S.winStart + t / TA * (S.winEnd - S.winStart); }
export function tOf(now: number, S: Sched): number { return clamp((now - S.winStart) / (S.winEnd - S.winStart) * TA, 0, TA - 0.0005); }

/* ---------------- the seeded entries ---------------- */
/* generated entries: plain names, plain pitches, one handle each */
const NA = ['Quiet', 'Paper', 'Signal', 'Little', 'Open', 'Second', 'Night', 'Field', 'Pocket', 'Slow', 'North', 'Glass', 'Copper', 'Hollow', 'Kind', 'Loose', 'Plain', 'Late', 'Bright', 'Common', 'Small', 'Spare'];
const NB = ['Queue', 'Ledger', 'Index', 'Lantern', 'Harbor', 'Atlas', 'Notebook', 'Relay', 'Sketch', 'Tally', 'Compass', 'Inbox', 'Garden', 'Mirror', 'Switch', 'Pantry', 'Almanac', 'Beacon', 'Thread', 'Drawer', 'Roster', 'Kettle'];
const NF = ['Landlords', 'Book Clubs', 'Food Banks', 'Choirs', 'Night Shifts', 'Allotments', 'Climbing Gyms', 'Dog Walkers'];
const PX = ['A Realtime board', 'Row-level policies', 'An Edge Function', 'A Storage browser', 'pgvector search', 'Magic-link sign-in', 'A Postgres changelog', 'A typed client', 'A cron dashboard', 'Presence cursors', 'A shared calendar', 'Auth with passkeys'];
const PY = ['small teams', 'side projects', 'classrooms', 'a food bank', 'pet sitters', 'book clubs', 'open-source maintainers', 'a running club', 'event organizers', 'landlords and tenants', 'a corner shop', 'night-shift nurses'];
const HN = ['ana', 'bo', 'chidi', 'dana', 'emre', 'femi', 'gus', 'hana', 'ivo', 'jin', 'kai', 'lena', 'milo', 'nia', 'oli', 'pia', 'quin', 'rui', 'sol', 'tara', 'uma', 'vik', 'wren', 'xiu', 'yara', 'zed'];
const HS = ['.dev', '_b', '.sh', '.codes', '.app', '', '.io', '_k'];
export function slug(s: string): string { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

export type TopEntry = { p: Project; votes: number; e: number };
/* Judge votes: some of an entry's own votes, marked as a judge's. { n, c } says its votes numbered n - c + 1 to n were
   one judge's press (c votes at once), so they land when the entry reaches its n-th vote. They are carved out of the
   total, never added to it: every count and every winner is what it was before judges existed. */
export type JudgeVote = { n: number; c: number };
/* one entry in a city: k is its place in the home's order, a its arrival order, af its arrival as a fraction of the
   build, jv its judge votes (ordered by n) */
export type Entry = TopEntry & { k: number; a: number; af: number; jv: JudgeVote[]; steps?: Steps; arrived?: number };
/* Live data only (lib/source.ts fills these from the database; the seeded world never has them). steps: the entry's
   real votes, at[i] the minute of a press and n[i] its count after it, oldest first. arrived: the minute it was
   submitted. When they are there, the functions below read them and nothing else: no curve is drawn between or past
   real presses. When they are not, every function reads the seeded curves exactly as before. */
export type Steps = { at: number[]; n: number[] };
/* the count after the last real press at or before minute m */
export function stepsAt(s: Steps, m: number): number { let v = 0; for (let i = 0; i < s.at.length && s.at[i] <= m; i++) v = s.n[i]; return v; }
export type SeedCity = { i: number; entries: number; list: TopEntry[]; _all: Entry[] | null; seed: number };
/* pick: the city index the Supabase team picks from (the home has always read it). final: the same city and the place of
   the picked finalist (1 to 3), so the pick is one of the thirty. */
export type Pick = { city: number; place: number };
export type SeedDay = { cities: SeedCity[]; pick: number; final: Pick };

/* One city's seeded world. Draws from the home's two generators first and in the home's order, so the home's winner,
   entry count and vote counts are unchanged; everything after that uses its own generator. The cache is a memo of a
   pure function of the seed, the same for every request. */
const CACHE: Record<number, SeedDay> = {};
export function seedData(seed: number): SeedDay {
  if (CACHE[seed]) return CACHE[seed];
  const P = SAMPLE_PROJECTS, R = mulberry32(seed * 7919 + 13), perm = shuffle(P, R), pick = Math.floor(R() * 10);
  const out = CITIES.map((city, i): SeedCity => {
    const Rc = mulberry32(seed * 1000 + i * 104729 + 7), entries = 48 + Math.floor(Rc() * 170), win = perm[i];
    const rest = shuffle(P.filter((p) => p !== win), Rc).slice(0, 6), top = Math.round(entries * (1.6 + Rc() * 1.8));
    const list = [win].concat(rest).map((p, k) => (
      { p, votes: k ? Math.round(top * (0.93 - k * 0.1) * (0.88 + Rc() * 0.1)) : top, e: k ? 0.55 + Rc() * 0.4 : 1.05 + Rc() * 0.5 }
    ));
    return { i, entries, list, _all: null, seed };
  });
  /* every sample project leads one city at most and shows in one city's seven at most: a project already seen (a winner,
     or in an earlier city's seven) gives its place to a made-up one with the same votes, from its own generator, so
     the thirty finalists can be told apart and no count moves */
  const seen = new Set<number>(out.map((c) => c.list[0].p.id)), Rn = mulberry32(seed * 7919 + 211), taken: Record<string, 1> = {};
  P.forEach((p) => { taken[p.name] = 1; });
  out.forEach((c, i) => { c.list = c.list.map((r, k) => {
    if (!k || !seen.has(r.p.id)) { seen.add(r.p.id); return r; }
    let nm = '';
    for (let g = 0; g < 40 && (!nm || taken[nm]); g++) nm = NA[Math.floor(Rn() * NA.length)] + ' ' + NB[Math.floor(Rn() * NB.length)];
    if (taken[nm]) nm += ' ' + (i + 1) + k;
    taken[nm] = 1;
    const hd = HN[Math.floor(Rn() * HN.length)] + HS[Math.floor(Rn() * HS.length)];
    return { ...r, p: { id: 900 + i * 10 + k, name: nm, handle: hd, pitch: PX[Math.floor(Rn() * PX.length)] + ' for ' + PY[Math.floor(Rn() * PY.length)] + '.',
      repo: 'github.com/' + hd.replace(/[^a-z0-9]/gi, '') + '/' + slug(nm), demo: slug(nm) + '.vercel.app', gen: true } };
  }); });
  /* the place of the picked finalist: its own generator, after every other draw */
  const place = 1 + Math.floor(mulberry32(seed * 7919 + 71)() * EVENT.finalists);
  return (CACHE[seed] = { cities: out, pick, final: { city: pick, place } });
}
/* The full list for one city: the home's seven, the other thirteen sample projects, then generated entries up to the
   entry count. Every entry gets an arrival (a fraction of the build) and a vote curve. The tail is held under the
   second project's final total (smaller total, slower curve), so the final winner is the home's. Before voting closes,
   an early arrival can lead for a while; both pages read the same leader() for that. */
export function all(sd: SeedCity): Entry[] {
  if (sd._all) return sd._all;
  if (!sd.entries) return (sd._all = []);
  const P = SAMPLE_PROJECTS, Rx = mulberry32(sd.seed * 1000 + sd.i * 104729 + 99991), N = sd.entries;
  const inTop = sd.list.map((r) => r.p.id);
  let tailP: Project[] = shuffle(P.filter((p) => inTop.indexOf(p.id) < 0), Rx);
  const used: Record<string, number> = {};
  P.forEach((p) => { used[p.name] = 1; }); sd.list.forEach((r) => { used[r.p.name] = 1; });
  for (let k = tailP.length + 7; k < N; k++) {
    let nm = '';
    for (let g = 0; g < 40 && (!nm || used[nm]); g++) {
      const a = Rx();
      nm = a < 0.12 ? NB[Math.floor(Rx() * NB.length)] + ' for ' + NF[Math.floor(Rx() * NF.length)]
        : a < 0.3 ? NB[Math.floor(Rx() * NB.length)] + ['ly', 'r', 'io', 'kit'][Math.floor(Rx() * 4)]
          : NA[Math.floor(Rx() * NA.length)] + ' ' + NB[Math.floor(Rx() * NB.length)];
    }
    if (used[nm]) nm += ' ' + (k + 1);
    used[nm] = 1;
    const hd = HN[Math.floor(Rx() * HN.length)] + (Rx() < 0.5 ? '' : HN[Math.floor(Rx() * HN.length)].slice(0, 3)) + HS[Math.floor(Rx() * HS.length)];
    const id = 1000 + sd.i * 1000 + k;
    tailP.push({ id, name: nm, handle: hd, pitch: PX[Math.floor(Rx() * PX.length)] + ' for ' + PY[Math.floor(Rx() * PY.length)] + '.',
      repo: 'github.com/' + hd.replace(/[^a-z0-9]/gi, '') + '/' + slug(nm), demo: slug(nm) + '.vercel.app', gen: true });
  }
  tailP = tailP.slice(0, Math.max(0, N - 7));
  const V7 = Math.min(...sd.list.slice(1).map((r) => r.votes)), e1 = sd.list[1].e, T = tailP.length;
  const tail = tailP.map((p, j) => {
    const v = Math.round(V7 * 0.94 * Math.pow(1 - j / Math.max(1, T), 2.1) * (0.82 + Rx() * 0.18));
    return { p, votes: v, e: e1 + Rx() * 0.35 };
  });
  const full: Entry[] = sd.list.map((r) => ({ p: r.p, votes: r.votes, e: r.e })).concat(tail).map((r, k) => ({ ...r, k, a: 0, af: 0, jv: [] }));
  /* arrival order: a seeded shuffle; the first arrives as building opens. The home counts entries as
     max(1, round(N * f^0.85)), and these arrivals are placed so that count is exactly the number already in. */
  shuffle(full, Rx).forEach((r, a) => { r.a = a; r.af = a ? Math.pow((a + 0.5) / N, 1 / 0.85) : 0; });
  judge(full, sd);
  return (sd._all = full);
}
/* The judges' votes: each judge spends up to a full budget, a few votes at a time, mostly on the stronger entries.
   Each press is carved out of an entry's own count (see JudgeVote), above the share of it an entry can have before the
   judges start: an entry voted on from the opening reaches f = (judgeAt - publicAt) / (close - publicAt) of its window
   then, so votes^(f^e) with the flattest curve (e 0.55); later arrivals reach less. */
const JUDGE_FLOOR = (() => {
  const open = EVENT.publicAt ?? 0, close = SCHED.buildMin + SCHED.voteAfter, j = EVENT.judgeAt ?? open;
  const f = close > open ? Math.min(1, Math.max(0, (j - open) / (close - open))) : 0;
  return Math.min(0.9, Math.pow(f, 0.55) + 0.04);
})();
function judge(full: Entry[], sd: SeedCity) {
  const Rj = mulberry32(sd.seed * 1000 + sd.i * 104729 + 424243), pool = full.slice().sort((a, b) => b.votes - a.votes || a.k - b.k).slice(0, 24);
  for (let j = 0; j < EVENT.judges; j++) {
    /* left counts the judge's own votes; c is what a press adds to the count (each of the judge's votes at its weight) */
    let left = EVENT.judgeVotes;
    for (let g = 0; g < 40 && left > 0; g++) {
      const r = pool[Math.floor(Math.pow(Rj(), 1.6) * pool.length)], press = Math.min(left, 1 + Math.floor(Rj() * 2)), c = press * EVENT.judgeWeight;
      const taken = r.jv.reduce((a, v) => a + v.c, 0), free = r.votes - taken;
      if (free < c + 2) continue;
      /* the press lands above the floor (after the judges start), on a vote no other press holds */
      let n = Math.round(r.votes * (JUDGE_FLOOR + Rj() * (1 - JUDGE_FLOOR)));
      n = Math.min(r.votes, Math.max(c + Math.ceil(r.votes * JUDGE_FLOOR), n));
      if (n > r.votes) continue;
      if (r.jv.some((v) => n - c < v.n && v.n - v.c < n)) continue;
      r.jv.push({ n, c }); left -= press;
    }
  }
  full.forEach((r) => r.jv.sort((a, b) => a.n - b.n));
}
/* Each entry can be voted on from its arrival (or from when voting opens, if later) until voting closes. f is that
   entry's own fraction (0 when it can first be voted on, 1 when voting closes), so the final count is always r.votes,
   whatever the schedule. Whole numbers, so the trace
   steps. */
export function votesAt(r: TopEntry, f: number): number { return f >= 1 ? r.votes : f <= 0 ? 0 : Math.round(r.votes * Math.pow(f, r.e)); }
/* the fraction (as above) at which an entry reached its n-th vote: the inverse of votesAt */
export function fOfVote(r: TopEntry, n: number): number { return n <= 0 ? 0 : Math.pow((n - 0.5) / r.votes, 1 / r.e); }
export function countAt(N: number, f: number): number { return Math.max(1, Math.round(N * Math.pow(f, 0.85))); }
/* x is one city's schedule (start, buildEnd, end). An entry's arrival minute, how many entries are in at minute m,
   and an entry's votes at minute m. */
export function arriveAt(r: Entry, x: CitySched): number { return r.arrived != null ? r.arrived : x.start + r.af * (x.buildEnd - x.start); }
export function inAt(sd: SeedCity, x: CitySched, m: number): number {
  const L = sd._all;
  if (L && L.length && L[0].arrived != null) { let k = 0; L.forEach((r) => { if (r.arrived! <= m) k++; }); return k; }
  return m < x.start || !sd.entries ? 0 : m >= x.buildEnd ? sd.entries : countAt(sd.entries, (m - x.start) / (x.buildEnd - x.start));
}
/* the first minute an entry can be voted on: its arrival, or when voting opens if that is later */
export function voteFrom(r: Entry, x: CitySched): number { return Math.min(x.end - 1, Math.max(arriveAt(r, x), publicMin(x))); }
export function votesAtMin(r: Entry, x: CitySched, m: number): number { if (r.steps) return stepsAt(r.steps, m); const a = voteFrom(r, x); return m >= x.end ? r.votes : m <= a ? 0 : votesAt(r, (m - a) / (x.end - a)); }
/* the minute an entry reached its n-th vote (live: the minute of the press that took it there; not reached yet: its
   last press) */
export function minOfVote(r: Entry, x: CitySched, n: number): number {
  if (r.steps) { const s = r.steps; if (n <= 0 || !s.at.length) return arriveAt(r, x); const i = s.n.findIndex((v) => v >= n); return i >= 0 ? s.at[i] : s.at[s.at.length - 1]; }
  const a = voteFrom(r, x); return a + fOfVote(r, n) * (x.end - a);
}
/* how many of an entry's votes are judges' once it has v votes; at minute m */
export function judgeOf(r: Entry, v: number): number { let j = 0; for (const x of r.jv) { if (x.n <= v) j += x.c; else if (x.n - x.c < v) j += v - (x.n - x.c); } return j; }
export function judgeAtMin(r: Entry, x: CitySched, m: number): number { return judgeOf(r, votesAtMin(r, x, m)); }
export type Lead = { p: Project; v: number; r?: Entry };
/* the leader at minute m among the entries already in; ties go to the earlier entry in the home's order */
export function leader(sd: SeedCity, x: CitySched, m: number): Lead | null {
  let best: Lead | null = null; const n = inAt(sd, x, m);
  all(sd).forEach((r) => { if (r.a >= n) return; const v = votesAtMin(r, x, m); if (!best || v > best.v) best = { p: r.p, v, r }; });
  return best;
}
/* A finalist (or a contender for it): its votes at the minute, and how many of them are judges'. place is 1 to 3. */
export type Top = { p: Project; v: number; j: number; r: Entry; place: number };
/* The top n at minute m among the entries already in, by votes; ties go to the earlier entry in the home's order, the
   leader's rule. (Not confirmed: the real tie rule at 3rd.) Before a city starts there is no ranking: empty. */
export function topAt(sd: SeedCity, x: CitySched, m: number, n: number = EVENT.finalists): Top[] {
  if (m < x.start) return [];
  const k = inAt(sd, x, m), out: Top[] = [];
  all(sd).forEach((r) => { if (r.a < k) out.push({ p: r.p, v: votesAtMin(r, x, m), j: judgeAtMin(r, x, m), r, place: 0 }); });
  out.sort((a, b) => b.v - a.v || a.r.k - b.r.k);
  return out.slice(0, n).map((t, i) => ({ ...t, place: i + 1 }));
}
export function top3(sd: SeedCity, x: CitySched, m: number): Top[] { return topAt(sd, x, m, EVENT.finalists); }
/* While a city's counts are hidden (from its start until showAt): every entry in by minute m, in the order they came,
   with no counts (they are read at the start, where every count is 0). Outside the hidden stretch it is the plain
   order at m. */
export function frozenOrder(sd: SeedCity, x: CitySched, m: number): Top[] {
  if (m < x.start) return [];
  const cm = countMin(x, m), k = inAt(sd, x, m), kf = inAt(sd, x, cm), early: Top[] = [], late: Top[] = [];
  all(sd).forEach((r) => {
    if (r.a >= k) return;
    if (r.a < kf) early.push({ p: r.p, v: votesAtMin(r, x, cm), j: judgeAtMin(r, x, cm), r, place: 0 });
    else late.push({ p: r.p, v: 0, j: 0, r, place: 0 });
  });
  early.sort((a, b) => b.v - a.v || a.r.k - b.r.k);
  late.sort((a, b) => arriveAt(a.r, x) - arriveAt(b.r, x) || a.r.a - b.r.a);
  return early.concat(late).map((t, i) => ({ ...t, place: i + 1 }));
}

export type CityStateName = 'next' | 'build' | 'vote' | 'done';
export type CityState = {
  i: number; id: string; name: string; city: City; start: number; buildEnd: number; end: number; entries: number; list: TopEntry[]; sd: SeedCity;
  state: CityStateName; wait?: number; f?: number; n?: number; left?: number; lead?: { p: Project; v: number };
  /* the counts and order are hidden (from the start until showAt): top is the order entries came in, with no counts;
     showAt is the minute they are shown (null: this city never hides) */
  hidden?: boolean; showAt?: number | null;
  /* the minute voting opens (for everyone), and the minute judges may vote */
  publicAt?: number; judgeAt?: number;
  /* the top 3 now: the contenders while live, the finalists once voting has closed; empty before the city starts */
  top: Top[];
};
/* one city's state at UTC minute now: the same fields the home row reads. 'build': entries arriving and voting open;
   'vote': building closed, the last minutes of voting. f is the fraction through the current phase (for the bars). */
export function cityState(x: CitySched, sd: SeedCity, now: number): CityState {
  const o: CityState = { i: x.city.i, id: x.city.id, name: x.city.name, city: x.city, start: x.start, buildEnd: x.buildEnd, end: x.end, entries: sd.entries, list: sd.list, sd, state: 'done', top: top3(sd, x, now) };
  if (now < x.start) { o.state = 'next'; o.wait = x.start - now; }
  else if (now < x.buildEnd) { o.state = 'build'; o.f = (now - x.start) / (x.buildEnd - x.start); o.n = inAt(sd, x, now); o.left = x.buildEnd - now; }
  else if (now < x.end) { o.state = 'vote'; o.f = (now - x.buildEnd) / (x.end - x.buildEnd); o.n = sd.entries; o.left = x.end - now; }
  else { o.state = 'done'; o.n = sd.entries; if (sd.entries) o.lead = { p: sd.list[0].p, v: sd.list[0].votes }; }
  o.showAt = showMin(x); o.hidden = hiddenAt(x, now); o.publicAt = publicMin(x); o.judgeAt = judgeMin(x);
  if (o.hidden) {
    const f = frozenOrder(sd, x, now); o.top = f.slice(0, EVENT.finalists);
    if (f.length) o.lead = { p: f[0].p, v: f[0].v };
  } else if (o.state === 'build' || o.state === 'vote') { const b = leader(sd, x, now); if (b) o.lead = { p: b.p, v: b.v }; }
  return o;
}

/* ---------------- the worst case, for the tuning pages ---------------- */
/* The content a layout must survive: the longest name the submit form allows (40 characters) on first place in Seoul
   and on second place in London, 182 entries in Rosario, and a city with no entries at all (Singapore, or the next city
   along if Singapore holds the pick). San Francisco, the longest city name, is always there. Same seed, same draws:
   only those fields change. */
export const LONG_NAME = 'Realtime Inventory Sync for Corner Shops';
export const WORST = { long: [['seoul', 0], ['london', 1]] as [string, number][], many: 'rosario', manyN: 182, none: ['singapore', 'peshawar', 'manta'] };
const WCACHE: Record<number, SeedDay> = {};
export function seedWorst(seed: number): SeedDay {
  if (WCACHE[seed]) return WCACHE[seed];
  const base = seedData(seed), idx = (id: string) => CITY_IDS.indexOf(id);
  const none = WORST.none.map(idx).find((i) => i !== base.pick)!;
  const cities = base.cities.map((sd): SeedCity => {
    const c: SeedCity = { ...sd, list: sd.list.map((r) => ({ ...r })), _all: null };
    WORST.long.forEach(([id, k]) => { if (idx(id) === sd.i) c.list[k] = { ...c.list[k], p: { ...c.list[k].p, name: LONG_NAME } }; });
    if (idx(WORST.many) === sd.i) c.entries = WORST.manyN;
    if (none === sd.i) c.entries = 0;
    return c;
  });
  return (WCACHE[seed] = { ...base, cities });
}
/* the seeded day a config asks for: the tuning pages' worst case, or the plain seed */
export function seedFor(c: { seed: number; worst?: unknown }): SeedDay { return c.worst && +(c.worst as number) ? seedWorst(c.seed) : seedData(c.seed); }
