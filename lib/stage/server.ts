/* The stage on the server: reading a city's deck, stage row and times from the tables, and carrying out a press.
   Server only (imports lib/server). The wall and the remote never write a table themselves: a press goes to the
   server action in app/desk/[city]/remote/actions.ts, which asks here.

   A press is the same pure act() the lab runs. What it changes is written in two places:
   - the stage row (scene, step, blank, QR, chart, talk timer, the deadline said, the draw), as the signed-in host,
     so the table's own rule (a host of this city) holds as well as ours;
   - the city's clock, through the database's own functions (start_building, add_minutes, end_early), which check the
     role again and log the change. Starting the clock keeps to the deadline the wall said: after start_building the
     end is set to that deadline (act() only uses it when at least half the building time is left).
   The clock lives on `cities`, which Realtime does not carry, so after a clock change the stage row is touched: every
   screen then reads the city's times again. */

import { admin, asUser } from '@/lib/server/supabase';
import { backendOn } from '@/lib/server/env';
import { deskUser } from '@/lib/server/roles';
import { forget } from '@/lib/server/snapshot';
import { said } from '@/lib/server/http';
import { eventForCity, placeEvents } from '@/lib/server/events';
import { act } from './act';
import { BD_WALL, wallEvent, type WallEvent } from './event';
import { CITY_COLS, cityFrom, deckFrom, stageFrom, stageTo } from './rows';
import type { CityLive, SceneRow, StageAction, StageRow } from './types';

export type StageStart = { deck: SceneRow[]; row: StageRow; city: CityLive };
export type DriveOut = { ok: true; row: StageRow; city: CityLive } | { ok: false; why: string };

/* the door's two counts: on the list, and checked in by a host (not readable by everyone). There is no room code any
   more (owner, 2026-11-25), so the wall shows the address and the QR alone. */
async function facts(id: string): Promise<{ room_code: string | null; listed: number | null; here: number | null }> {
  const sb = admin();
  const [listed, here] = await Promise.all([
    sb.from('passes').select('id', { count: 'exact', head: true }).eq('city', id),
    sb.from('passes').select('id', { count: 'exact', head: true }).eq('city', id).not('checked_in_at', 'is', null),
  ]);
  return { room_code: null, listed: listed.count ?? null, here: here.count ?? null };
}

/* a place's name from its row: Builder Day's cities and any place another event has on the desk. Null when the
   backend is off, the place is not in the table, or it cannot be read. */
export async function placeName(id: string): Promise<string | null> {
  if (!backendOn() || !/^[a-z0-9-]{1,80}$/.test(id)) return null;
  try {
    const { data } = await admin().from('cities').select('name').eq('id', id).maybeSingle();
    return (data as { name?: string } | null)?.name ?? null;
  } catch { return null; }
}

/* the place's event for its wall and remote: Builder Day's (from the code, as always) for its own places, when the
   backend is off, or when the event cannot be read; another event's name, format, prizes and number of places */
export async function wallEventFor(id: string): Promise<WallEvent> {
  if (!backendOn()) return BD_WALL;
  try {
    const [e, m] = await Promise.all([eventForCity(id), placeEvents()]);
    if (!e) return BD_WALL;
    let n = 0; m.forEach((ev) => { if (ev === e.id) n++; });
    return wallEvent(e, n);
  } catch { return BD_WALL; }
}

/* the place's deck, row and times, or null when the backend is off, unreachable, or has no stage for the place yet.
   Any place in the table has a stage (Builder Day's cities and the desk's own places alike). */
export async function loadStage(id: string, o: { hidden: boolean }): Promise<StageStart | null> {
  if (!backendOn() || !/^[a-z0-9-]{1,80}$/.test(id)) return null;
  try {
    const sb = admin();
    let q = sb.from('scenes').select('id, city, position, kind, title, data, notes, hidden').eq('city', id).order('position');
    if (!o.hidden) q = q.eq('hidden', false);
    const [scenes, stage, city, f] = await Promise.all([
      q, sb.from('stage').select('*').eq('city', id).maybeSingle(), sb.from('cities').select(CITY_COLS).eq('id', id).maybeSingle(), facts(id),
    ]);
    if (scenes.error || stage.error || city.error || !stage.data || !city.data) return null;
    return { deck: deckFrom(scenes.data), row: stageFrom(stage.data), city: cityFrom(city.data, f) };
  } catch { return null; }
}

/* who may drive this city's stage: a host of it (a super admin is a host everywhere) */
export async function stageRights(id: string): Promise<{ drive: boolean; super: boolean; person: string | null; why: string }> {
  if (!backendOn()) return { drive: false, super: false, person: null, why: 'The backend is not configured on this server.' };
  try {
    const d = await deskUser();
    if ('error' in d) return { drive: false, super: false, person: null, why: d.error };
    if (!d.hosts(id)) return { drive: false, super: false, person: d.person.id, why: 'You are not a host for this city.' };
    return { drive: true, super: d.super, person: d.person.id, why: '' };
  } catch { return { drive: false, super: false, person: null, why: 'The desk cannot be reached right now.' }; }
}

const minutes = (msv: number) => Math.round(msv / 60000);

export async function drive(id: string, a: StageAction, talkMin: number): Promise<DriveOut> {
  const who = await stageRights(id);
  if (!who.drive) return { ok: false, why: who.why };
  if (a.t === 'close' && !who.super) return { ok: false, why: 'Only a super admin can close voting early.' };
  const s = await loadStage(id, { hidden: true });
  if (!s) return { ok: false, why: 'The stage cannot be read right now. Try again.' };
  const now = Date.now(), r = act(s.deck, s.row, s.city, a, now, who.person, talkMin);
  if (!r) return { ok: false, why: 'Nothing to do here.' };
  const me = await asUser();
  let city = s.city;
  if (r.city) {
    /* the clock, through the database's functions */
    const c = r.city;
    if (a.t === 'start' || (a.t === 'next' && c.build_start !== undefined)) {
      const st = await me.rpc('start_building', { c: id });
      if (st.error) return { ok: false, why: said(st.error, 'The clock did not start. Try again.') };
      /* keep to the deadline the wall said */
      if (c.build_end && c.vote_end) {
        const fix = await admin().from('cities').update({ build_end: new Date(c.build_end).toISOString(), vote_end: new Date(c.vote_end).toISOString() }).eq('id', id);
        if (fix.error) return { ok: false, why: 'The clock started, but the deadline could not be set. Check the desk.' };
      }
    } else if (a.t === 'add') {
      const what = s.city.build_end && now < s.city.build_end ? 'build' : 'vote';
      const x = await me.rpc('add_minutes', { c: id, what, mins: Math.max(1, Math.min(60, minutes(a.min * 60000))) });
      if (x.error) return { ok: false, why: said(x.error, 'No time was added. Try again.') };
    } else if (a.t === 'close') {
      const x = await me.rpc('end_early', { c: id, what: 'vote' });
      if (x.error) return { ok: false, why: said(x.error, 'Voting did not close. Try again.') };
    }
    forget(id);
    const back = await admin().from('cities').select(CITY_COLS).eq('id', id).maybeSingle();
    city = back.data ? cityFrom(back.data, { room_code: s.city.room_code, listed: s.city.listed, here: s.city.here }) : { ...s.city, ...c };
  }
  /* the row, as the host; a clock change touches it too, so every screen reads the times again */
  const row = { ...r.row, updated_at: now };
  const w = await me.from('stage').update(stageTo(row)).eq('city', id);
  if (w.error) return { ok: false, why: said(w.error, 'The wall did not change. Try again.') };
  return { ok: true, row, city };
}
