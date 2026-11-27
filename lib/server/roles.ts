/* roles.ts: who may do what on the desk, in one place. Every desk action asks here first.
   - super: everything, in every event; the only one who makes events;
   - admin: everything in one event (its places, its people, its format, the final);
   - host: one place's guest list, entries, deck, door and adding minutes (or every place of one event);
   - judge: their votes or scores (the database checks those) and seeing flags, in one place or a whole event.
   Signing in to the desk is a Supabase account (or the six-digit code while its switch is on): the signed hd_desk
   cookie, set only then, opens it (see keys.ts). */
import { cookies } from 'next/headers';
import { asUser } from './supabase';
import { DESK_COOKIE, deskMarkOk } from './keys';
import { bootstrapSuper, ensurePerson, personByAuth, rolesOf, type Person, type Role } from './people';
import { placeEvents } from './events';

export type Desk = {
  person: Person; roles: Role[]; super: boolean;
  /* an admin of this event (a super admin is one everywhere) */
  admins: (event: string) => boolean;
  hosts: (city: string) => boolean; judges: (city: string) => boolean;
  /* the events this person sees on the desk */
  sees: (event: string) => boolean;
  /* the places of an event this person sees: all of them, or the ones named in their roles */
  placesIn: (event: string) => 'all' | string[];
  eventOf: (city: string) => string | null;
};

/* the desk's person, or why not */
export async function deskUser(): Promise<Desk | { error: string; status: number }> {
  const sb = await asUser();
  const { data } = await sb.auth.getUser();
  const u = data.user;
  if (!u || !u.email) return { error: 'Sign in to the desk with your email.', status: 401 };
  if (!deskMarkOk(u.id, (await cookies()).get(DESK_COOKIE)?.value)) return { error: 'The desk needs a code from your email, even if you are signed in on this device.', status: 401 };
  const p = (await personByAuth(u.id)) || (await ensurePerson(u.email));
  await bootstrapSuper(p);
  const roles = await rolesOf(p.id);
  if (!roles.length) return { error: 'This email has no role on the desk. Ask a super admin to add you.', status: 403 };
  return deskOf(p, roles, await placeEvents());
}

/* the same rules, from the roles and the map of places to events (pure, so a test can build one) */
export function deskOf(p: Person, roles: Role[], places: Map<string, string>): Desk {
  const sup = roles.some((r) => r.role === 'super');
  const eventOf = (c: string) => places.get(c) || null;
  const admins = (ev: string) => sup || roles.some((r) => r.role === 'admin' && r.event === ev);
  const hosts = (c: string) => { const ev = eventOf(c); return !!ev && (admins(ev) || roles.some((r) => r.role === 'host' && r.event === ev && (!r.city || r.city === c))); };
  const judges = (c: string) => { const ev = eventOf(c); return !!ev && roles.some((r) => r.role === 'judge' && r.event === ev && (!r.city || r.city === c)); };
  const sees = (ev: string) => sup || roles.some((r) => r.event === ev);
  const placesIn = (ev: string): 'all' | string[] => {
    if (admins(ev) || roles.some((r) => r.event === ev && (r.role === 'host' || r.role === 'judge') && !r.city)) return 'all';
    return Array.from(new Set(roles.filter((r) => r.event === ev && r.city).map((r) => r.city as string)));
  };
  return { person: p, roles, super: sup, admins, hosts, judges, sees, placesIn, eventOf };
}

/* what each action needs: super (makes events, names super admins), admin (one event), host or judge (one place) */
export type Need = 'super' | 'admin' | 'host' | 'judge-or-host';
export function allowed(d: Desk, need: Need, event: string | null, city: string | null): boolean {
  if (need === 'super') return d.super;
  if (need === 'admin') return !!event && d.admins(event);
  if (!city) return false;
  if (need === 'host') return d.hosts(city);
  return d.hosts(city) || d.judges(city);
}
