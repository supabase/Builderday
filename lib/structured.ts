/* structured.ts: the page's facts as schema.org data, so search engines can read the day as an event (one per city, at
   its own local time). Built from the same facts the
   page draws, never written by hand. Pure. */
import { CITIES, EPOCH, EVENT, SCHED, type City } from './day-data';
import day from '@/saved/day.config.json';

const cfg = day as { startHour?: number; schedule?: string };
const startHour = typeof cfg.startHour === 'number' ? cfg.startHour : SCHED.startHour, schedule = cfg.schedule || SCHED.schedule;
/* each city's planned start, ms: its Luma start, local, on the day (or startHour on the other schedules) */
const plannedStart = (c: Pick<City, 'offset' | 'start'>) => EPOCH + ((schedule === 'luma' ? c.start : startHour * 60) - (schedule === 'same' ? 0 : c.offset)) * 60000;

const pad = (n: number) => String(n).padStart(2, '0');
/* a moment as local time with its offset: 2026-12-10T09:00:00+09:00 */
function localIso(ms: number, offsetMin: number) {
  const d = new Date(ms + offsetMin * 60000), a = Math.abs(offsetMin);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00${offsetMin < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function previewLd(o: { url: string; description: string }) {
  const span = (day.buildMin + day.voteAfter) * 60000;
  const organizer = { '@type': 'Organization', name: 'Supabase', url: 'https://supabase.com' };
  const cities = CITIES.map((c) => {
    const start = plannedStart(c);
    return {
      '@type': 'Event', name: `${EVENT.name} in ${c.name}`, url: `${o.url}?city=${c.i}`,
      startDate: localIso(start, c.offset), endDate: localIso(start + span, c.offset),
      eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: c.name, address: { '@type': 'PostalAddress', addressLocality: c.name } },
      organizer,
    };
  });
  const starts = CITIES.map((c) => plannedStart(c));
  const event = {
    '@type': 'Event', name: EVENT.name, url: o.url, description: o.description,
    startDate: new Date(Math.min(...starts)).toISOString(), endDate: new Date(Math.max(...starts) + span).toISOString(),
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: cities.map((c) => c.location), organizer, subEvent: cities,
  };
  /* "<" escaped so no text in the data can close the script tag */
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [event] }).replace(/</g, '\\u003c');
}
