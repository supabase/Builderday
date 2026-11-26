/* room.ts (server): the check-in, and who may build.
   Only a person on a city's list whom a host has checked in at the door (the desk's Check-in tab) may submit, edit or
   delete an entry. The check-in is kept on the pass for the day. Both ways in (the web form and the editor server) go
   through mayBuild, from lib/server/entries.ts; the pages only ask. There is no room code any more (owner, 2026-11-25). */
import { admin } from './supabase';
import { EVENT_ID, PASS_COLS, passOf, type Pass, type Person } from './people';
import { eventById } from './events';
import { notInRoom, notListed, notListedAnywhere } from '@/lib/event/rule';

/* mark the pass as in the room; the first check-in is the one kept. how is always 'host' now ('room' was the old code) */
export async function checkIn(pass: Pass, how: 'room' | 'host', by: string | null): Promise<Pass> {
  if (pass.checked_in_at) return pass;
  const db = admin();
  const { data } = await db.from('passes').update({ checked_in_at: new Date().toISOString(), checked_in_how: how, checked_in_by: how === 'host' ? by : null })
    .eq('id', pass.id).is('checked_in_at', null).select(PASS_COLS).maybeSingle();
  await db.from('log').insert({ who: by || pass.person, what: how === 'room' ? 'in the room (room code)' : 'marked in the room', city: pass.city, target: pass.person });
  return (data as Pass | null) || pass;
}

/* a host takes the mark back (a guest checked in by mistake) */
export async function uncheck(pass: Pass, by: string): Promise<void> {
  const db = admin();
  await db.from('passes').update({ checked_in_at: null, checked_in_how: null, checked_in_by: null }).eq('id', pass.id);
  await db.from('log').insert({ who: by, what: 'not in the room', city: pass.city, target: pass.person });
}

/* may this person change an entry in this city? field says which step is missing: 'list' or 'room' */
export type Gate = { ok: true; pass: Pass } | { ok: false; status: number; error: string; field: 'list' | 'room'; city?: string };
/* event: the event the entry is in (Builder Day unless named). An event that does not ask for a check-in (its format's
   roomCode switch, kept under its old name) lets everyone on a place's list submit. */
export async function mayBuild(p: Person, city: string | null, event: string = EVENT_ID): Promise<Gate> {
  const cityName = nameOfCity;
  const pass = await passOf(p.id, event);
  if (!pass) return { ok: false, status: 403, field: 'list', error: city ? notListed(await cityName(city)) : notListedAnywhere };
  if (city && pass.city !== city) return { ok: false, status: 403, field: 'list', error: notListed(await cityName(city)) };
  if (!pass.checked_in_at && (await eventById(event))?.f.roomCode !== false) return { ok: false, status: 403, field: 'room', city: pass.city, error: notInRoom(await cityName(pass.city)) };
  return { ok: true, pass };
}

export async function nameOfCity(id: string): Promise<string> {
  const { data } = await admin().from('cities').select('name').eq('id', id).maybeSingle();
  return (data?.name as string) || id;
}
