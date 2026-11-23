/* places.ts (server): making an event and its places. A place is a row of `cities`, with its stage row and the
   default deck, the same as Builder Day's cities were loaded. Its id is the city's own short name when that is free
   (london), else the event's id in front (lisbon-hack-lisbon). The time zone comes from Luma; the offset is the
   zone's on the event's day. */
import { admin } from './supabase';
import { defaultDeck } from '@/lib/stage/deck';
import { slugOf } from '@/lib/forms';
import { formatRow, type Format } from '@/lib/event/format';
import { forgetEvents } from './events';

/* minutes east of UTC, in that zone, at noon UTC on that day */
export function offsetIn(zone: string, day: string): number {
  try {
    const at = new Date(day + 'T12:00:00Z');
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]));
    const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    return Math.round((local - at.getTime()) / 60000);
  } catch { return 0; }
}
export function zoneOK(zone: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
}

/* a room code: four letters and digits that cannot be misread on a wall */
const ALPHA = 'ACDEFHJKMNPQRTUVWXY34679';
export const roomCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

const idOK = (s: string) => /^[a-z0-9-]{3,60}$/.test(s);

/* a new event: its id from the short name, unique */
export async function makeEvent(o: { name: string; short: string; day: string; f: Partial<Format>; by: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const db = admin();
  let base = slugOf(o.short || o.name).slice(0, 40) || 'event';
  if (base.length < 3) base = base + '-event';
  base = base + '-' + o.day.slice(0, 4);
  let id = base;
  for (let k = 2; ; k++) {
    const { data } = await db.from('events').select('id').eq('id', id).maybeSingle();
    if (!data) break;
    id = base + '-' + k;
  }
  if (!idOK(id)) return { ok: false, error: 'Give the event a name with some letters in it.' };
  const { error } = await db.from('events').insert({ id, name: o.name, short: o.short, day: o.day, updated_by: o.by, ...formatRow(o.f) });
  if (error) return { ok: false, error: error.message.indexOf('check') >= 0 ? 'Check the name (2 to 60 characters) and the short name (2 to 30).' : 'The event was not made. Try again.' };
  forgetEvents();
  return { ok: true, id };
}

export type NewPlace = { event: string; day: string; name: string; zone: string; start: string; lumaEvent?: string | null; luma?: string | null; venue?: string | null; buildMin: number; voteAfter: number };

/* a new place in an event, with its stage and deck; start is a full time (ISO), the place's planned start */
export async function makePlace(p: NewPlace): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const db = admin();
  if (!zoneOK(p.zone)) return { ok: false, error: 'That time zone is not one we know. Use one like Europe/London.' };
  const t = Date.parse(p.start);
  if (isNaN(t)) return { ok: false, error: 'Check the start time.' };
  if (p.lumaEvent) {
    const { data: dup } = await db.from('cities').select('name, event').eq('luma_event_id', p.lumaEvent).maybeSingle();
    if (dup) return { ok: false, error: 'That Luma event is already a place: ' + dup.name + '.' };
  }
  const slug = slugOf(p.name).slice(0, 40) || 'place';
  let id = slug.length >= 3 ? slug : slug + '-' + p.event.slice(0, 20);
  const { data: taken } = await db.from('cities').select('id').eq('id', id).maybeSingle();
  if (taken) id = (p.event + '-' + slug).slice(0, 60).replace(/-+$/, '');
  for (let k = 2; ; k++) { const { data } = await db.from('cities').select('id').eq('id', id).maybeSingle(); if (!data) break; id = (p.event + '-' + slug).slice(0, 55) + '-' + k; }
  const { data: last } = await db.from('cities').select('i').order('i', { ascending: false }).limit(1);
  const i = ((last?.[0]?.i as number) ?? 0) + 1;
  const { error } = await db.from('cities').insert({
    id, i, event: p.event, name: p.name.slice(0, 60), zone: p.zone, offset_min: offsetIn(p.zone, p.day), venue: p.venue || null,
    luma_url: p.luma || null, luma_event_id: p.lumaEvent || null, planned_start: new Date(t).toISOString(), build_min: p.buildMin, vote_after: p.voteAfter, room_code: roomCode(), room_code_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: 'The place was not added. Try again.' };
  const deck = defaultDeck(id).map((s) => ({ city: id, position: s.position, kind: s.kind, title: s.title, data: s.data, notes: s.notes, hidden: s.hidden, event: true }));
  const { data: scenes } = await db.from('scenes').insert(deck).select('id, position').order('position');
  await db.from('stage').insert({ city: id, scene: scenes?.[0]?.id ?? null });
  forgetEvents();
  return { ok: true, id };
}

/* a place goes only while nothing hangs on it: no one on its list, no entries */
export async function removePlace(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = admin();
  const [{ count: listed }, { count: entries }] = await Promise.all([
    db.from('passes').select('id', { count: 'exact', head: true }).eq('city', id),
    db.from('entries').select('id', { count: 'exact', head: true }).eq('city', id),
  ]);
  if (listed || entries) return { ok: false, error: 'This place has people on its list or entries, so it stays. Remove those first.' };
  await db.from('roles').delete().eq('city', id);
  await db.from('reminders').delete().eq('city', id);
  await db.from('outbox').update({ city: null }).eq('city', id);
  await db.from('log').update({ city: null }).eq('city', id);
  const { error } = await db.from('cities').delete().eq('id', id);
  if (error) return { ok: false, error: 'The place was not removed. Try again.' };
  forgetEvents();
  return { ok: true };
}
