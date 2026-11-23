/* teams.ts: builders on one city's list who build one entry together (supabase/migrations/20261123120000_teams.sql).
   Made, joined and left from the account sheet (POST /api/team); the rules live in the database functions, which
   take the person from here. A team is found by its code, KTR-482: three letters and three numbers, said across a
   room or sent as a link (/team/KTR482). Members see each other's public names; a member with no name yet shows as
   the start of their email, never the whole address. */
import { admin } from './supabase';
import { said } from './http';
import { siteUrl } from './env';
import { EVENT_ID, type Person } from './people';
import { eventById } from './events';
import { forget } from './snapshot';
import { teamCode } from '@/lib/team';

export type TeamMember = { name: string; you: boolean; named: boolean };
export type MyTeam = {
  code: string; city: string; cityName: string; max: number;
  /* building has ended in the team's city: no joining or leaving */
  set: boolean;
  members: TeamMember[];
  entry: { name: string; slug: string } | null;
  link: string;
};
type Row = Record<string, unknown>;

/* "ana@example.com" to "ana…" */
const masked = (email: string) => { const u = String(email).split('@')[0]; return (u.length > 3 ? u.slice(0, 3) : u) + '…'; };

/* the entry a person builds: their own, or their team's */
export async function entryRowOf(person: string, event: string = EVENT_ID, cols = 'id, city'): Promise<Row | null> {
  const db = admin();
  const { data: m } = await db.from('team_members').select('team').eq('person', person).eq('event', event).maybeSingle();
  if (m?.team) {
    const { data } = await db.from('entries').select(cols).eq('team', m.team).maybeSingle();
    if (data) return data as unknown as Row;
  }
  const { data } = await db.from('entries').select(cols).eq('owner', person).eq('event', event).maybeSingle();
  return (data as unknown as Row) || null;
}

export async function teamOf(p: Person, event: string = EVENT_ID, req?: Request): Promise<MyTeam | null> {
  const db = admin();
  const { data: m } = await db.from('team_members').select('team, teams(id, code, city, cities(name, build_end))').eq('person', p.id).eq('event', event).maybeSingle();
  const t = m?.teams as unknown as { id: string; code: string; city: string; cities: { name: string; build_end: string | null } } | null;
  if (!t) return null;
  const [{ data: ms }, { data: e }, ev] = await Promise.all([
    db.from('team_members').select('person, joined_at, people(name, email)').eq('team', t.id).order('joined_at'),
    db.from('entries').select('name, slug').eq('team', t.id).maybeSingle(),
    eventById(event),
  ]);
  const members = (ms || []).map((r: Row) => {
    const pp = r.people as { name: string | null; email: string } | null, nm = (pp?.name || '').trim();
    return { name: nm || masked(pp?.email || ''), you: r.person === p.id, named: !!nm };
  });
  return {
    code: teamCode(t.code), city: t.city, cityName: t.cities?.name || t.city, max: ev?.f.teamMax || 4,
    set: !!t.cities?.build_end && Date.now() >= Date.parse(t.cities.build_end), members,
    entry: e ? { name: e.name as string, slug: e.slug as string } : null,
    link: siteUrl(req) + '/team/' + t.code,
  };
}

export type TeamResult = { ok: true; team: MyTeam | null } | { ok: false; error: string; status: number; field?: string };

async function after(p: Person, event: string, req?: Request): Promise<TeamResult> {
  const team = await teamOf(p, event, req);
  forget(team?.city);
  return { ok: true, team };
}
const refused = (e: { message?: string; code?: string }): TeamResult => ({
  ok: false, error: said(e, 'The team did not change. Try again.'),
  status: e.code === 'P0002' ? 404 : e.code === '42501' ? 403 : e.code === '22023' ? 400 : 409,
  field: e.code === '22023' || e.code === 'P0002' ? 'code' : undefined,
});

export async function makeTeam(p: Person, event: string = EVENT_ID, req?: Request): Promise<TeamResult> {
  const { error } = await admin().rpc('team_make', { who: p.id, ev: event });
  return error ? refused(error) : after(p, event, req);
}
export async function joinTeam(p: Person, code: string, event: string = EVENT_ID, req?: Request): Promise<TeamResult> {
  const { error } = await admin().rpc('team_join', { who: p.id, ev: event, typed: String(code || '').slice(0, 20) });
  return error ? refused(error) : after(p, event, req);
}
export async function leaveTeam(p: Person, event: string = EVENT_ID, req?: Request): Promise<TeamResult> {
  const before = await teamOf(p, event, req);
  const { error } = await admin().rpc('team_leave', { who: p.id, ev: event, force: false });
  if (error) return refused(error);
  forget(before?.city);
  return { ok: true, team: null };
}

/* a team's city and code from a link, for /team/<code>: null when no team has it */
export async function teamByCode(code: string, event: string = EVENT_ID): Promise<{ code: string; city: string } | null> {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{3}[0-9]{3}$/.test(c)) return null;
  const { data } = await admin().from('teams').select('code, city').eq('event', event).eq('code', c).maybeSingle();
  return data ? { code: data.code as string, city: data.city as string } : null;
}
