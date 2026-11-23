/* room.ts (server): the room code and the check-in it gives.
   Only a person on a city's list who has typed that city's room code with their own email (or whom a host has marked
   as in the room at the desk) may submit, edit or delete an entry. The check-in is kept on the pass for the day, so a
   new room code later does not undo it. Both doors (the web form and the editor server) go through mayBuild, from
   lib/server/entries.ts; the pages only ask. */
import { admin } from './supabase';
import { EVENT_ID, PASS_COLS, passOf, type Pass, type Person } from './people';
import { eventById } from './events';
import { notInRoom, notListed, notListedAnywhere, wrongCode } from '@/lib/event/rule';

/* the last code still works for a few minutes after the host makes a new one, for people typing it as it changes */
const PREV_GRACE_MIN = 15;
type CodeRow = { room_code: string | null; room_code_prev: string | null; room_code_at: string | null };
export function codeOK(row: CodeRow, code: string): boolean {
  const c = String(code || '').trim().toUpperCase();
  if (!c || !row.room_code) return false;
  const prevOk = !!row.room_code_prev && !!row.room_code_at && Date.now() - new Date(row.room_code_at).getTime() < PREV_GRACE_MIN * 60000;
  return c === row.room_code || (prevOk && c === row.room_code_prev);
}

/* mark the pass as in the room; the first check-in is the one kept. how: 'room' (the code) or 'host' (by hand) */
export async function checkIn(pass: Pass, how: 'room' | 'host', by: string | null): Promise<Pass> {
  if (pass.checked_in_at) return pass;
  const db = admin();
  const { data } = await db.from('passes').update({ checked_in_at: new Date().toISOString(), checked_in_how: how, checked_in_by: how === 'host' ? by : null })
    .eq('id', pass.id).is('checked_in_at', null).select(PASS_COLS).maybeSingle();
  await db.from('log').insert({ who: by || pass.person, what: how === 'room' ? 'in the room (room code)' : 'marked in the room', city: pass.city, target: pass.person });
  return (data as Pass | null) || pass;
}

/* a host takes the mark back (a guest marked by mistake); the next submit asks for the room code again */
export async function uncheck(pass: Pass, by: string): Promise<void> {
  const db = admin();
  await db.from('passes').update({ checked_in_at: null, checked_in_how: null, checked_in_by: null }).eq('id', pass.id);
  await db.from('log').insert({ who: by, what: 'not in the room', city: pass.city, target: pass.person });
}

/* may this person change an entry in this city? field says which step is missing: 'list' or 'room' */
export type Gate = { ok: true; pass: Pass } | { ok: false; status: number; error: string; field: 'list' | 'room'; city?: string };
/* event: the event the entry is in (Builder Day unless named). An event that does not ask for the room code lets
   everyone on a place's list submit. */
export async function mayBuild(p: Person, city: string | null, event: string = EVENT_ID): Promise<Gate> {
  const cityName = nameOfCity;
  const pass = await passOf(p.id, event);
  if (!pass) return { ok: false, status: 403, field: 'list', error: city ? notListed(await cityName(city)) : notListedAnywhere };
  if (city && pass.city !== city) return { ok: false, status: 403, field: 'list', error: notListed(await cityName(city)) };
  if (!pass.checked_in_at && (await eventById(event))?.f.roomCode !== false) return { ok: false, status: 403, field: 'room', city: pass.city, error: notInRoom(await cityName(pass.city)) };
  return { ok: true, pass };
}

/* a signed-in person (the submit sheet, the editor server) types the code: checked against their own city's room */
export async function checkInWithCode(p: Person, code: string, event: string = EVENT_ID): Promise<{ ok: true; pass: Pass; already: boolean } | { ok: false; error: string; field: 'list' | 'code' }> {
  const pass = await passOf(p.id, event);
  if (!pass) return { ok: false, field: 'list', error: notListedAnywhere };
  if (pass.checked_in_at) return { ok: true, pass, already: true };
  const { data: row } = await admin().from('cities').select('name, room_code, room_code_prev, room_code_at').eq('id', pass.city).maybeSingle();
  if (!row || !codeOK(row, code)) return { ok: false, field: 'code', error: wrongCode((row?.name as string) || pass.city) };
  return { ok: true, pass: await checkIn(pass, 'room', null), already: false };
}

export async function nameOfCity(id: string): Promise<string> {
  const { data } = await admin().from('cities').select('name').eq('id', id).maybeSingle();
  return (data?.name as string) || id;
}
