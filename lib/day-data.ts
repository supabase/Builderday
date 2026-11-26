/* day-data.ts: the event and its cities. The date is 10 December 2026. The cities are the Luma events', and so is each
   city's start: the local time its Luma event starts (18:00 in most). Offsets are December UTC offsets in minutes.
   Sunrise and sunset are approximate local times for mid-December, used only to draw the globe's daylight. Pure. */

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
/* the starts in words, from the cities: the usual local start (the one most cities share) and the others by name */
const hm2 = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const tally = new Map<number, City[]>(); CITIES.forEach((c) => tally.set(c.start, [...(tally.get(c.start) || []), c]));
const byCount = [...tally.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
/* local minutes of the start most cities share */
export const USUAL_START = byCount[0][0];
export const cityStartLocal = (c: { start: number }) => hm2(c.start);

/* how many cities, as words for the copy ("Fourteen cities") */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export const CITY_WORD = WORDS[CITIES.length] ?? String(CITIES.length);
export const CITY_WORD_CAP = CITY_WORD[0].toUpperCase() + CITY_WORD.slice(1);

export const EVENT = {
  year: 2026, month: 12, day: 10,
  /* the name where it stands alone (tab title, share text), and where Supabase is already beside it */
  name: 'Supabase Builder Day',
  short: 'Builder Day',
} as const;
/* minute 0 of the model: Dec 10, 00:00 UTC */
export const EPOCH = Date.UTC(EVENT.year, EVENT.month - 1, EVENT.day);

/* ---------------- the schedule ---------------- */
/* luma: each city at its own Luma start, local; sun: every city at startHour local; same: every city at startHour UTC */
export type SchedCfg = { schedule: string; startHour: number; buildMin: number; voteAfter: number };
export const SCHED: SchedCfg = { schedule: 'luma', startHour: 18, buildMin: 90, voteAfter: 30 };
export type CitySched = { city: City; start: number; buildEnd: number; end: number };

/* Minutes are UTC minutes from Dec 10, 00:00. A city's session runs from its start for buildMin, then voteAfter. */
export function sched(c: SchedCfg): { cs: CitySched[] } {
  const cs = CITIES.map((city) => {
    const start = c.schedule === 'same' ? c.startHour * 60 : (c.schedule === 'sun' ? c.startHour * 60 : city.start) - city.offset;
    return { city, start, buildEnd: start + c.buildMin, end: start + c.buildMin + c.voteAfter };
  });
  return { cs };
}
