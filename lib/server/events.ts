/* events.ts (server): the events on the desk, read from `events`, and the place each city belongs to. The public pages
   still read Builder Day from lib/day-data.ts; everything the desk and the editor server do reads the event from here.
   A short cache (ten seconds) keeps a burst of calls from asking the database each time. */
import { admin } from './supabase';
import { formatOf, type Format } from '@/lib/event/format';
import { EVENT } from '@/lib/day-data';

export type EventRec = { id: string; name: string; short: string; day: string; archived: boolean; created: number; f: Format };
type Row = Record<string, unknown>;

export const eventOf = (r: Row): EventRec => ({
  id: r.id as string, name: r.name as string, short: r.short as string, day: String(r.day), archived: !!r.archived_at,
  created: r.created_at ? new Date(r.created_at as string).getTime() : 0, f: formatOf(r),
});

let all: { at: number; list: EventRec[] } | null = null;
let places: { at: number; map: Map<string, string> } | null = null;
const TTL = 10_000;
export function forgetEvents() { all = null; places = null; }

export async function events(): Promise<EventRec[]> {
  if (all && Date.now() - all.at < TTL) return all.list;
  const { data } = await admin().from('events').select('*').order('day', { ascending: true });
  all = { at: Date.now(), list: (data || []).map(eventOf) };
  return all.list;
}
export async function eventById(id: string): Promise<EventRec | null> {
  return (await events()).find((e) => e.id === id) || null;
}
/* place id to event id */
export async function placeEvents(): Promise<Map<string, string>> {
  if (places && Date.now() - places.at < TTL) return places.map;
  const { data } = await admin().from('cities').select('id, event');
  places = { at: Date.now(), map: new Map((data || []).map((r) => [r.id as string, r.event as string])) };
  return places.map;
}
export async function eventOfCity(city: string): Promise<string> {
  const m = await placeEvents();
  if (!m.has(city)) { places = null; return (await placeEvents()).get(city) || EVENT.id; }
  return m.get(city)!;
}
/* the event a place is in, with its format; Builder Day's when the place is not known */
export async function eventForCity(city: string): Promise<EventRec | null> {
  return eventById(await eventOfCity(city));
}
