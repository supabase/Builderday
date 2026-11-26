import day from '@/saved/day.config.json';
import { CODE, PLACE } from '@/lib/places';
import { CITIES, EPOCH, EVENT, SCHED, sched } from '@/lib/day-data';
import { hhmm } from '@/lib/format';
import type { WheelStatus } from '@/components/wheel/click';
import type { WheelFact } from '@/components/wheel/wheel';

/* Our facts for the wheel: the cities in their order, each city's session from the saved schedule, its state from
   Luma (lib/server/signups.ts), and the date. Where on the globe each city is comes from lib/places.ts. */

export type OurFact = WheelFact & { offset: number; opens: number };
export type OurWheel = { cities: OurFact[]; regOpen: boolean; date: string; buildMin: number };

/* live: each city's state from Luma; without it, every city is Open */
export function ourWheel(live?: Record<string, WheelStatus> | null): OurWheel {
  const cfg = { ...SCHED, schedule: day.schedule, startHour: day.startHour, buildMin: day.buildMin, voteAfter: day.voteAfter };
  const S = sched(cfg);
  const cities: OurFact[] = S.cs.map((x, i) => {
    const c = CITIES[i], o = c.offset, [lat, lon] = PLACE[c.id];
    const status: WheelStatus = live?.[c.id] ?? 'open';
    return {
      id: c.id, name: c.name, code: CODE[c.id] ?? c.name.slice(0, 3).toUpperCase(), lat, lon, status, offset: o,
      session: `${hhmm(x.start + o)}–${hhmm(x.end + o)} ${zoneText(o / 60)}`,
      href: '', action: status === 'full' ? `Join the waiting list in ${c.name}` : status === 'sold' ? `${c.name} is sold out` : `Join in ${c.name}`,
      opens: EPOCH + x.start * 60000,
    };
  });
  return { cities, regOpen: cities.some((c) => c.status !== 'soon'), date: `${EVENT.day} December ${EVENT.year}`, buildMin: cfg.buildMin };
}

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

/* a UTC offset as people write it: UTC, UTC+11, UTC−3, UTC+5:30 */
export function zoneText(offsetHours: number) {
  const size = Math.abs(offsetHours);
  return size === 0 ? 'UTC' : `UTC${offsetHours > 0 ? '+' : '−'}${size % 1 ? `${Math.floor(size)}:${String(Math.round((size % 1) * 60)).padStart(2, '0')}` : size}`;
}
