/* me.ts: everything a page needs about the person in this browser, in one answer: who (their own email, their
   public name), their place on a list, their roles, their entry, their votes and, for a judge, their count. */
import { SERVER } from '@/lib/hackday-server';
import { admin } from './supabase';
import { siteUrl } from './env';
import { EVENT_ID, editorKeyFor, passOf, rolesOf, type Person, type Role } from './people';
import { dayGate } from './gate';
import { entryRowOf, teamOf, type MyTeam } from './teams';
import { eventById } from './events';

export type MyEntry = {
  id: string; no: number; handle: string; slug: string; name: string; pitch: string; url: string; repo: string; demo: string; video: string;
  city: string; cityName: string; deadline: string; picture: string | null; pictureFrom: string | null; createdAt: string; updatedAt: string; hidden: boolean;
};
export type Me = {
  signedIn: true; email: string; name: string | null;
  /* checkedIn: typed the room code (rule 7c); editorSeen: the last call from their editor ("editor connected");
     listedAs: the address the place is listed under, when it is not the one signed in (a claimed place) */
  pass: { city: string; cityName: string; source: string; checkedIn: boolean; editorSeen: string | null; listedAs: string | null; start: string; offset: number } | null;
  roles: Role[];
  entry: MyEntry | null;
  votes: Record<string, number[]>;
  judging: Record<string, { budget: number; used: number; per: Record<string, number> }>;
  editor: { url: string } | null;
  /* the day pages are open (lib/server/gate.ts): before then the account sheet points nowhere but the preview page */
  open: boolean;
  /* the person's team (lib/server/teams.ts), and whether the event has teams and how many may be in one */
  team: MyTeam | null;
  teams: { on: boolean; max: number };
};

type EntryRow = { id: string; no: number; slug: string; name: string; pitch: string; url: string; repo: string | null; video: string | null; picture: string | null; picture_from: string | null;
  city: string; created_at: string; updated_at: string; hidden_at: string | null; with_names: string | null; cities: unknown; people: unknown };
const iso = (v: string | null) => (v ? new Date(v).toISOString() : '');

export async function entryOf(person: string, event: string = EVENT_ID): Promise<MyEntry | null> {
  /* their own entry, or their team's */
  const e = await entryRowOf(person, event, 'id, no, slug, name, pitch, url, repo, video, picture, picture_from, city, created_at, updated_at, hidden_at, with_names, cities(name, build_end, planned_start, build_min), people!entries_owner_fkey(name)') as unknown as EntryRow | null;
  if (!e) return null;
  const c = e.cities as unknown as { name: string; build_end: string | null; planned_start: string; build_min: number };
  const by = e.people as unknown as { name: string | null } | null;
  const deadline = c.build_end || new Date(new Date(c.planned_start).getTime() + c.build_min * 60000).toISOString();
  return {
    id: e.id, no: e.no, handle: e.with_names || by?.name || '', slug: e.slug, name: e.name, pitch: e.pitch, url: e.url, repo: e.repo || '', demo: e.url, video: e.video || '',
    city: e.city, cityName: c.name, deadline: iso(deadline), picture: e.picture, pictureFrom: e.picture_from, createdAt: iso(e.created_at), updatedAt: iso(e.updated_at), hidden: !!e.hidden_at,
  };
}

export async function meOf(p: Person, req?: Request): Promise<Me> {
  const db = admin();
  const [pass, roles, entry, votes, gate, team, ev] = await Promise.all([
    passOf(p.id), rolesOf(p.id), entryOf(p.id),
    db.from('votes').select('n, kind, entries(no, city)').eq('person', p.id),
    dayGate(), teamOf(p, EVENT_ID, req), eventById(EVENT_ID),
  ]);
  let passOut: Me['pass'] = null;
  if (pass) {
    const { data: c } = await db.from('cities').select('name, planned_start, offset_min').eq('id', pass.city).single();
    passOut = { city: pass.city, cityName: c?.name || pass.city, source: pass.source, checkedIn: !!pass.checked_in_at, editorSeen: pass.editor_seen_at,
      listedAs: pass.list_email && pass.list_email !== p.email ? pass.list_email : null, start: iso(c?.planned_start || null), offset: c?.offset_min ?? 0 };
  }
  const mine: Record<string, number[]> = {}, judged: Record<string, Record<string, number>> = {}, used: Record<string, number> = {};
  let usedAll = 0;
  (votes.data || []).forEach((v) => {
    const en = v.entries as unknown as { no: number; city: string } | null; if (!en) return;
    if (v.kind === 'public') (mine[en.city] = mine[en.city] || []).push(en.no);
    else { const j = (judged[en.city] = judged[en.city] || {}); j[en.no] = (j[en.no] || 0) + v.n; used[en.city] = (used[en.city] || 0) + v.n; usedAll += v.n; }
  });
  const judging: Me['judging'] = {};
  roles.filter((r) => r.role === 'judge').forEach((r) => {
    const cities = r.city ? [r.city] : Object.keys(judged).concat(['*']);
    cities.forEach((c) => {
      const per = Object.fromEntries(Object.entries(judged[c] || {}).filter(([, n]) => n > 0));
      judging[c] = { budget: Math.max(judging[c]?.budget || 0, r.budget), used: usedAll, per };
    });
  });
  /* the editor server's base: the one set, else the site's own (it answers at /api/mcp wherever the backend is on) */
  const mcp = SERVER.url || siteUrl(req) + '/api/mcp';
  return {
    signedIn: true, email: p.email, name: p.name, pass: passOut, roles, entry,
    votes: mine, judging,
    editor: pass && mcp ? { url: mcp + '/' + editorKeyFor(pass) } : null,
    open: gate.open,
    team, teams: { on: ev ? ev.f.teams : true, max: ev?.f.teamMax || 4 },
  };
}
