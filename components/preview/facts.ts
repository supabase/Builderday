import day from '@/saved/day.config.json';
import { CODE, PLACE } from '@/lib/places';
import { RULES, SERVER } from '@/lib/hackday-server';
import { CITIES, EPOCH, EVENT, SCHED, USUAL_START, mulberry32, sched } from '@/lib/day-data';
import { hhmm } from '@/lib/format';
import { PRIZES, PRIZE_SHEET, credits, prizeLine } from '@/lib/prizes';
import type { WheelStatus } from '@/components/wheel/click';
import type { WheelFact } from '@/components/wheel/wheel';

/* Our facts for the wheel, from the model: the cities in their order, each city's session from the saved
   schedule (building opens, voting closes), and the date. Where on the globe each city is comes from the table below,
   in lib/places.ts, since the model has no coordinates. PLACEHOLDERS: the people counts and the states are seeded, not real; the
   model has no sign-ups yet. */

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export { PLACE };

export type OurFact = WheelFact & { offset: number; opens: number; buildEnds: number; closes: number };
export type OurWheel = { cities: OurFact[]; regOpen: boolean; date: string; dateShort: string; nearest: number; buildMin: number; voteAfter: number; startHour: number; pickAt: string; how: [string, string][]; format: [string, string][] };

/* live: each city's people and state from the backend (lib/server/signups.ts); without it, seeded stand-ins (the labs) */
/* onDay: on the day pages, the day's own finalists count (a city with fewer than three entries sends fewer) and the vote
   rules as they stand (the preview's words wait on the owner) */
export function ourWheel(live?: Record<string, { people: number; status: WheelStatus }> | null, onDay?: { finalists: number }): OurWheel {
  const cfg = { ...SCHED, schedule: day.schedule, startHour: day.startHour, buildMin: day.buildMin, voteAfter: day.voteAfter, pickAfter: day.pickAfter };
  const S = sched(cfg), R = mulberry32(day.seed * 977 + 11);
  const cities: OurFact[] = S.cs.map((x, i) => {
    const c = CITIES[i], o = c.offset, [lat, lon] = PLACE[c.id];
    /* PLACEHOLDER: seeded sign-ups against a seeded room size */
    const room = [150, 200, 250, 300][Math.floor(R() * 4)], seeded = Math.min(room, Math.round((0.55 + R() * 0.5) * room / 10) * 10);
    const real = live ? live[c.id] : undefined, people = live ? real?.people ?? 0 : seeded;
    const status: WheelStatus = live ? real?.status ?? 'open' : seeded >= room ? 'full' : seeded >= room * 0.85 ? 'nearing' : 'open';
    return {
      id: c.id, name: c.name, code: CODE[c.id] ?? c.name.slice(0, 3).toUpperCase(), lat, lon, status, offset: o,
      session: `${hhmm(x.start + o)}–${hhmm(x.end + o)} ${zoneText(o / 60)}`, count: people === 1 ? '1 person' : `${people} people`, people,
      href: `/city/${c.id}`, action: status === 'full' ? `Join the waiting list in ${c.name}` : status === 'sold' ? `${c.name} is sold out` : `Join in ${c.name}`,
      opens: EPOCH + x.start * 60000, buildEnds: EPOCH + x.buildEnd * 60000, closes: EPOCH + x.end * 60000,
    };
  });
  const top = EVENT.finalists, n = cities.length, pickAt = hhmm(S.pickAt) + ' UTC', fin = onDay ? onDay.finalists : top * n;
  const cityPrize = PRIZES.city.what ?? 'the city prize';
  return {
    cities, regOpen: cities.some((c) => c.status !== 'soon'), date: `${EVENT.day} December ${EVENT.year}`, dateShort: `${ordinal(EVENT.day)} Dec ${EVENT.year}`, nearest: 0, buildMin: cfg.buildMin, voteAfter: cfg.voteAfter, startHour: cfg.startHour, pickAt,
    /* the rail's four cells, and the sheet's format */
    format: [
      ['Build', `${cfg.buildMin} minutes, most from ${hhmm(USUAL_START)} local`],
      ['Vote', `From ${EVENT.publicAt ? 'minute ' + EVENT.publicAt : 'the start'}, counts shown from minute ${EVENT.showAt ?? 0}`],
      ['City prize', `1st in each city wins ${cityPrize}`],
      ['Global final', `${PRIZE_SHEET.picker} picks 1st, 2nd and 3rd from the ${fin}`],
    ],
    how: [
      ['How do I enter?', `Register for your city on Luma and come on ${EVENT.day} December. You get ${cfg.buildMin} minutes to build something new with Supabase.`],
      ['How do I submit?', `In your browser on your city’s page, or from your editor with the Builder Day server. Your host checks you in at the door first: only people on the list who are checked in can submit.${SERVER.live ? '' : ' The editor server opens soon.'}`],
      ['What is checked?', RULES.join(' ')],
      ['Who can vote?', `Anyone signed in with a Supabase account. Voting is open for everyone ${EVENT.publicAt ? 'from minute ' + EVENT.publicAt : 'from the start'}. The counts stay hidden until minute ${EVENT.showAt ?? 0}, then show live until everything closes at minute ${cfg.buildMin}.`],
      ['Who goes to the final?', `The top ${top} by votes in each city, ${fin} in all. First place wins the city: ${prizeLine(PRIZE_SHEET.city.winner)}. The other two get ${prizeLine(PRIZE_SHEET.city.finalist)} each.`],
      ['What do the judges do?', `They vote from minute ${EVENT.judgeAt ?? EVENT.publicAt ?? 0}, in the same count as everyone. Each judge has ${EVENT.judgeVotes} votes, and each one counts ${EVENT.judgeWeight}.`],
      ['How are the global winners picked?', `${cap(PRIZE_SHEET.picker)} picks 1st, 2nd and 3rd from the ${fin} finalists, announced ${PRIZE_SHEET.announce}. ${PRIZE_SHEET.global.map((g) => ['1st', '2nd', '3rd'][g.place - 1] + ' wins a ' + g.thing + ' and ' + credits(g)).join('; ')}.`],
    ],
  };
}

/* 1st, 2nd, 3rd, 4th, 11th, 21st */
function ordinal(n: number) {
  const t = n % 100, o = n % 10;
  return n + (t >= 11 && t <= 13 ? 'th' : o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th');
}

/* the city whose UTC offset is closest to the visitor's */
/* where the visitor is (degrees), when known: from the host's IP lookup, or ?at=lat,lon */
export type Here = { lat: number; lon: number };
const km = (a: Here, b: Here) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/* the nearest city: by distance from where the visitor is; with no position, by time zone */
export function nearestCity(cities: { offset: number; lat?: number; lon?: number }[], visitorOffset: number, here?: Here | null) {
  let best = 0;
  if (here) {
    let d = Infinity;
    cities.forEach((c, i) => { if (c.lat === undefined || c.lon === undefined) return; const x = km(here, { lat: c.lat, lon: c.lon }); if (x < d) { d = x; best = i; } });
    return best;
  }
  cities.forEach((c, i) => { if (Math.abs(c.offset - visitorOffset) < Math.abs(cities[best].offset - visitorOffset)) best = i; });
  return best;
}

/* "Opens in 23 days", counted to the city's own opening */
export function countdown(c: OurFact, now: number): string {
  if (now >= c.closes) return 'Closed';
  if (now >= c.buildEnds) return 'Voting now';
  if (now >= c.opens) return 'Building now';
  const min = Math.ceil((c.opens - now) / 60000);
  if (min >= 1440) { const d = Math.ceil(min / 1440); return `Opens in ${d} day${d === 1 ? '' : 's'}`; }
  if (min >= 60) return `Opens in ${Math.floor(min / 60)} h ${min % 60} min`;
  return `Opens in ${min} min`;
}

/* a UTC offset as people write it: UTC, UTC+11, UTC−3, UTC+5:30 */
export function zoneText(offsetHours: number) {
  const size = Math.abs(offsetHours);
  return size === 0 ? 'UTC' : `UTC${offsetHours > 0 ? '+' : '−'}${size % 1 ? `${Math.floor(size)}:${String(Math.round((size % 1) * 60)).padStart(2, '0')}` : size}`;
}
