/* people.ts: a person (an email, a public name), their place on one city's list (the pass), and their roles.
   All through the service role; callers have already checked who may do what. */
import { admin } from './supabase';
import { makeKey, readKey } from './keys';
import { superAdmins } from './env';
import { EVENT } from '@/lib/day-data';
import { eventOfCity } from './events';

export type Person = { id: string; email: string; name: string | null; auth_user: string | null };
export type Pass = {
  id: string; person: string; city: string; source: 'luma' | 'host'; key_version: number; editor_version: number;
  sent_at: string | null; opened_at: string | null; checked_in_at: string | null; checked_in_how: 'room' | 'host' | null;
  list_email: string; luma_status: string | null; luma_registered_at: string | null; claimed_at: string | null; editor_seen_at: string | null;
};
export type Role = { id: string; role: 'super' | 'admin' | 'host' | 'judge'; event: string | null; city: string | null; budget: number };

export const PASS_COLS = 'id, person, city, source, key_version, editor_version, sent_at, opened_at, checked_in_at, checked_in_how, list_email, luma_status, luma_registered_at, claimed_at, editor_seen_at';
/* the public site's event (Builder Day): the default wherever a caller does not name one */
export const EVENT_ID = EVENT.id;
export const norm = (email: string) => String(email || '').trim().toLowerCase();

export async function personByEmail(email: string): Promise<Person | null> {
  const { data } = await admin().from('people').select('id, email, name, auth_user').eq('email', norm(email)).maybeSingle();
  return data as Person | null;
}
export async function personByAuth(authId: string): Promise<Person | null> {
  const { data } = await admin().from('people').select('id, email, name, auth_user').eq('auth_user', authId).maybeSingle();
  return data as Person | null;
}

/* the person with this email, made if new; a name is kept only if they had none (Luma's name wins over nothing) */
export async function ensurePerson(email: string, name?: string | null, ip?: string | null): Promise<Person> {
  const db = admin(), e = norm(email);
  const found = await personByEmail(e);
  if (found) {
    if (name && !found.name) { await db.from('people').update({ name: name.slice(0, 60) }).eq('id', found.id); found.name = name.slice(0, 60); }
    return found;
  }
  const { data, error } = await db.from('people').insert({ email: e, name: name ? name.slice(0, 60) : null, first_ip: ip || null }).select('id, email, name, auth_user').single();
  if (error) { const again = await personByEmail(e); if (again) return again; throw new Error(error.message); }
  return data as Person;
}

export async function passOf(person: string, event: string = EVENT_ID): Promise<Pass | null> {
  const { data } = await admin().from('passes').select(PASS_COLS).eq('event', event).eq('person', person).maybeSingle();
  return data as Pass | null;
}
/* the place listed under this address, whoever holds it now */
export async function passByListEmail(email: string, event: string = EVENT_ID): Promise<Pass | null> {
  const { data } = await admin().from('passes').select(PASS_COLS).eq('event', event).eq('list_email', norm(email)).maybeSingle();
  return data as Pass | null;
}

/* Luma's facts about a registration, when the place comes from Luma */
export type LumaFacts = { guestId?: string | null; status?: string | null; registeredAt?: string | null };
export type Ensured = { pass: Pass; made: boolean; moved: string | null; kept?: 'later' | 'checked-in' | 'held' };

/* A place on a city's list (from Luma or a host), matched on the address it is listed
   under. One per address and one per account in the event.
   - Listed already in this city: Luma's facts are brought up to date.
   - Listed in another city: a host's add moves it; a Luma registration moves it only when it is the later one
     (decision 11), and never once the person is checked in. A move clears the check-in, which was for the other room.
   - Not listed, but the account behind this address holds a place listed under another address (claimed): that
     place is kept and nothing is made; the caller logs it. */
export async function ensurePass(person: Person, city: string, source: Pass['source'], addedBy?: string | null, luma?: LumaFacts): Promise<Ensured> {
  const db = admin(), email = norm(person.email), ev = await eventOfCity(city);
  const lumaCols = luma ? { luma_guest_id: luma.guestId || null, luma_status: luma.status || null, luma_registered_at: luma.registeredAt || null } : {};
  const old = await passByListEmail(email, ev);
  if (old && old.city === city) {
    if (!luma) return { pass: old, made: false, moved: null };
    const { data } = await db.from('passes').update(lumaCols).eq('id', old.id).select(PASS_COLS).single();
    return { pass: (data as Pass) || old, made: false, moved: null };
  }
  if (old) {
    if (old.checked_in_at) return { pass: old, made: false, moved: null, kept: 'checked-in' };
    if (source === 'luma' && old.luma_registered_at && luma?.registeredAt && Date.parse(luma.registeredAt) < Date.parse(old.luma_registered_at)) return { pass: old, made: false, moved: null, kept: 'later' };
    const { data } = await db.from('passes').update({ city, source, ...lumaCols, checked_in_at: null, checked_in_how: null, checked_in_by: null }).eq('id', old.id).select(PASS_COLS).single();
    return { pass: data as Pass, made: false, moved: old.city };
  }
  const held = await passOf(person.id, ev);
  if (held) return { pass: held, made: false, moved: null, kept: 'held' };
  const { data, error } = await db.from('passes').insert({ person: person.id, city, source, event: ev, list_email: email, added_by: addedBy || null, ...lumaCols }).select(PASS_COLS).single();
  if (error) { const again = await passByListEmail(email, ev); if (again) return { pass: again, made: false, moved: null }; throw new Error(error.message); }
  return { pass: data as Pass, made: true, moved: null };
}

/* Luma says this registration is no longer approved: the place it made goes, unless the person is checked in
   (decision 14). Only a place from Luma, in that city; a host's place stays. The account always stays. */
export async function dropLumaPass(email: string, city: string): Promise<'gone' | 'checked-in' | 'none'> {
  const old = await passByListEmail(email, await eventOfCity(city));
  if (!old || old.city !== city || old.source !== 'luma') return 'none';
  if (old.checked_in_at) return 'checked-in';
  await admin().from('passes').delete().eq('id', old.id);
  return 'gone';
}

export async function rolesOf(person: string): Promise<Role[]> {
  const { data } = await admin().from('roles').select('id, role, event, city, budget').eq('person', person);
  return (data || []) as Role[];
}

/* the first super admins come from SUPER_ADMINS; they get the role the first time they sign in */
export async function bootstrapSuper(p: Person): Promise<void> {
  if (superAdmins().indexOf(norm(p.email)) < 0) return;
  const roles = await rolesOf(p.id);
  if (roles.some((r) => r.role === 'super')) return;
  await admin().from('roles').insert({ person: p.id, role: 'super', city: null });
  await admin().from('log').insert({ who: p.id, what: 'super admin from SUPER_ADMINS' });
}

/* the editor key has its own version, so replacing it (a key found in a repository, a host ending it) leaves the link */
export const editorKeyFor = (pass: Pick<Pass, 'id' | 'editor_version'>) => makeKey('mcp', pass.id, pass.editor_version);

/* the day after a city closes, its keys stop: the city's vote end (or planned start plus the session) plus a day */
export async function stillValid(city: string): Promise<boolean> {
  const { data } = await admin().from('cities').select('planned_start, build_min, vote_after, vote_end').eq('id', city).single();
  if (!data) return false;
  const end = data.vote_end ? new Date(data.vote_end).getTime() : new Date(data.planned_start).getTime() + (data.build_min + data.vote_after) * 60000;
  return Date.now() < end + 24 * 3600000;
}

/* the pass and person a key opens, or why not */
export async function openKey(use: 'in' | 'mcp', key: string): Promise<{ pass: Pass; person: Person } | { error: string }> {
  const k = readKey(use, key);
  if (!k) return { error: 'That link is not one of ours. Check it was copied whole.' };
  const { data } = await admin().from('passes').select(PASS_COLS + ', people!passes_person_fkey(id, email, name, auth_user)').eq('id', k.pass).maybeSingle();
  const row = data as (Pass & { people: Person }) | null;
  if (!row || !k.check(use === 'mcp' ? row.editor_version : row.key_version)) return { error: use === 'mcp' ? 'That editor line no longer works. Copy your line again from your account on the site.' : 'That link no longer works. Sign in on the site with your email for a new one.' };
  if (!(await stillValid(row.city))) return { error: 'That link ended the day after your city closed.' };
  const { people, ...pass } = row;
  return { pass, person: people };
}
