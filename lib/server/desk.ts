/* desk.ts: what the desk reads and does. Every action names what it needs (roles.ts) and is written to the log.
   The guest list holds emails, so it is only ever read here, by the server, after the role check. */
import { admin, asUser } from './supabase';
import { allowed, type Desk, type Need } from './roles';
import { EVENT_ID, ensurePass, ensurePerson, norm, passOf } from './people';
import { checkIn, uncheck } from './room';
import { send } from './mail';
import { forget } from './snapshot';
import { refreshPicture } from './entries';
import { parseGuests, type Parsed } from '@/lib/luma';
import { approvedGuests, lumaOn } from './luma';
import { emailOK, slugOf } from '@/lib/forms';
import { mailDriver } from './mail';
import { devMail, mailAllowList, mailHeld, siteUrl } from './env';
import { dayGate, forgetGate } from './gate';
import { replaceEditorKey } from './repo-key';
import { applyGuest, type CityLite } from './registrations';
import type { DeskState, DeskGuest, DeskEntry, DeskCity, DeskPerson, DeskOutbox, DeskLog, DeskScene, DeskEvent } from '@/lib/event/desk';
import { events, eventById, forgetEvents } from './events';
import { makeEvent, makePlace, removePlace, offsetIn, zoneOK } from './places';
import { calendarEvents } from './luma';
import { formatProblem, formatRow, publicVotes, rankValue, ranked, PRESETS, type Format } from '@/lib/event/format';
import { EVENT } from '@/lib/day-data';
const EVENT_DAY = EVENT.year + '-12-' + String(EVENT.day).padStart(2, '0');

type Row = Record<string, unknown>;
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);
const THROWAWAY = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc'];

/* the event is filled from the place by the database; an event-wide line names its event */
async function log(d: Desk, what: string, city: string | null, target?: string | null, data?: Record<string, unknown>, event?: string | null) {
  await admin().from('log').insert({ who: d.person.id, what, city, target: target || null, data: data || {}, ...(event ? { event } : {}) });
}

function cityOf(r: Row): DeskCity {
  return {
    id: r.id as string, event: r.event as string, prize: (r.prize as string) || '', name: r.name as string, offset: r.offset_min as number, zone: r.zone as string, venue: (r.venue as string) || '', luma: (r.luma_url as string) || '', lumaEvent: (r.luma_event_id as string) || '', editor: (r.editor_name as string) || '',
    planned: ms(r.planned_start)!, buildMin: r.build_min as number, voteAfter: r.vote_after as number,
    buildStart: ms(r.build_start), buildEnd: ms(r.build_end), voteEnd: ms(r.vote_end),
    submissionsPaused: !!r.submissions_paused, votingPaused: !!r.voting_paused,
  };
}

/* signs of stuffing, for hosts and judges only: many new voters from one address in a minute, throwaway domains,
   +tag copies of one address. Flags, never blocks. */
function stuffing(votes: Row[]): Map<string, string[]> {
  const out = new Map<string, string[]>(), add = (e: string, f: string) => { const l = out.get(e) || []; if (l.indexOf(f) < 0) l.push(f); out.set(e, l); };
  const byIpMin = new Map<string, Set<string>>(), byBase = new Map<string, Map<string, Set<string>>>();
  votes.forEach((v) => {
    const p = v.people as Row | null, email = String(p?.email || ''), entry = v.entry as string;
    if (v.ip) { const k = entry + '|' + v.ip + '|' + Math.floor(new Date(v.created_at as string).getTime() / 60000); const s = byIpMin.get(k) || new Set(); s.add(email); byIpMin.set(k, s); }
    const [local, dom] = email.split('@');
    if (dom && THROWAWAY.indexOf(dom) >= 0) add(entry, 'throwaway');
    if (local && local.indexOf('+') > 0) { const base = local.split('+')[0] + '@' + dom; const m = byBase.get(entry) || new Map(); const s = m.get(base) || new Set(); s.add(email); m.set(base, s); byBase.set(entry, m); }
  });
  byIpMin.forEach((s, k) => { if (s.size >= 8) add(k.split('|')[0], 'one-address'); });
  byBase.forEach((m, entry) => { m.forEach((s) => { if (s.size >= 3) add(entry, 'plus-copies'); }); });
  return out;
}

/* the role words for the desk ("Host, London", "Judge, every place") */
function roleWords(d: Desk, ev: string, names: Map<string, string>): string {
  if (d.super) return 'Super admin';
  const mine = d.roles.filter((r) => r.event === ev);
  if (mine.some((r) => r.role === 'admin')) return 'Admin';
  return mine.map((r) => (r.role === 'host' ? 'Host' : 'Judge') + ', ' + (r.city ? names.get(r.city) || r.city : 'every place')).join(' · ');
}

const ENTRY_COLS = 'id, no, city, slug, name, pitch, url, repo, picture, picture_from, via, flags, hidden_at, created_at, tie_rank, with_names, people!entries_owner_fkey(name, email), tally(votes, judge_votes, score_sum, score_n, reached_at)';
function entryOfRow(e: Row, host: boolean, stuffed?: Map<string, string[]>): DeskEntry {
  const t = (Array.isArray(e.tally) ? e.tally[0] : e.tally) as Row | null, p = e.people as Row | null;
  return { no: e.no as number, slug: e.slug as string, name: e.name as string, pitch: e.pitch as string, url: (e.url as string) || '', repo: (e.repo as string) || '', picture: (e.picture as string) || null,
    pictureFrom: (e.picture_from as string) || null, via: e.via as string, by: (e.with_names as string) || (p?.name as string) || '', byEmail: host ? String(p?.email || '') : '', city: e.city as string,
    flags: ((e.flags as string[]) || []).concat(stuffed?.get(e.id as string) || []), hidden: !!e.hidden_at, created: ms(e.created_at)!, votes: (t?.votes as number) || 0, judge: (t?.judge_votes as number) || 0,
    scoreSum: (t?.score_sum as number) || 0, scoreN: (t?.score_n as number) || 0, reached: ms(t?.reached_at) || ms(e.created_at)!, tie: e.tie_rank == null ? null : Number(e.tie_rank) };
}

/* want: the event and place asked for. Someone who sees one event goes straight to it, and someone who sees one place
   of it (or an event with one place) straight to that place. */
export async function deskState(d: Desk, want: { event?: string | null; city?: string | null }): Promise<DeskState> {
  const db = admin(), now = Date.now();
  const all = (await events()).filter((e) => d.sees(e.id));
  const { data: allCities } = await db.from('cities').select('id, event, name, planned_start, build_start, vote_end').order('i');
  const names = new Map((allCities || []).map((c: Row) => [c.id as string, c.name as string]));
  let evId: string | null = want.city ? d.eventOf(want.city) : want.event || null;
  if (evId && !all.some((e) => e.id === evId)) evId = null;
  const live = all.filter((e) => !e.archived);
  if (!evId && !d.super && live.length === 1) evId = live[0].id;

  /* the list of events, with their counts */
  const list: DeskEvent[] = await Promise.all(all.map(async (e) => {
    const cs = (allCities || []).filter((c: Row) => c.event === e.id);
    const [{ count: listed }, { count: entries }] = await Promise.all([
      db.from('passes').select('id', { count: 'exact', head: true }).eq('event', e.id),
      db.from('entries').select('id', { count: 'exact', head: true }).eq('event', e.id).is('hidden_at', null),
    ]);
    const starts = cs.map((c: Row) => ms(c.planned_start)!).filter(Boolean), first = starts.length ? Math.min(...starts) : null;
    const done = cs.length > 0 && cs.every((c: Row) => c.vote_end && ms(c.vote_end)! <= now);
    const running = cs.some((c: Row) => c.build_start && (!c.vote_end || ms(c.vote_end)! > now));
    return { id: e.id, name: e.name, short: e.short, day: e.day, archived: e.archived, f: e.f, places: cs.length, listed: listed || 0, entries: entries || 0,
      phase: done ? 'done' : running ? 'live' : 'next', first, mine: roleWords(d, e.id, names) };
  }));
  list.sort((a, b) => Number(a.archived) - Number(b.archived) || a.day.localeCompare(b.day));

  const ev = evId ? all.find((e) => e.id === evId)! : null;
  const { data: crows } = evId ? await db.from('cities').select('*').eq('event', evId).order('i') : { data: [] as Row[] };
  const scope = evId ? d.placesIn(evId) : [];
  const mine = (crows || []).filter((c: Row) => scope === 'all' || scope.indexOf(c.id as string) >= 0).map(cityOf);
  let cur = want.city && mine.some((c) => c.id === want.city) ? want.city : null;
  if (!cur && mine.length === 1 && (want.event == null || (crows || []).length === 1)) cur = mine[0].id;
  const isAdmin = !!evId && d.admins(evId);
  const host = cur ? d.hosts(cur) : false, judge = cur ? d.judges(cur) : false;
  const state: DeskState = {
    me: { email: d.person.email, name: d.person.name, super: d.super, roles: d.roles.map((r) => ({ role: r.role, event: r.event, city: r.city, budget: r.budget })) },
    events: list, event: evId, city: cur, cities: mine, can: { host, judge, super: d.super, admin: isAdmin },
    overview: [], finalists: [], judging: null, supers: [],
    counts: null, guests: [], entries: [], scenes: [], people: [], outbox: [], log: [], pick: null,
    mail: mailDriver(), mailHeld: mailHeld(), mailTest: process.env.RESEND_API_KEY ? mailAllowList().length : 0, devCodes: devMail(), luma: lumaOn(), hook: !!process.env.LUMA_WEBHOOK_SECRET,
    gate: d.super && evId === EVENT.id ? await dayGate() : null,
  };
  if (d.super) {
    const { data: sr } = await db.from('roles').select('id, role, event, city, budget, people!roles_person_fkey(id, email, name, auth_user)').eq('role', 'super').order('created_at');
    state.supers = (sr || []).map((r: Row) => personOf(r, new Map()));
  }
  if (!ev) return state;
  const cityIds = (crows || []).map((c: Row) => c.id as string);

  /* the event: its places at a glance, its finalists, its people, its outbox and log */
  if (isAdmin || scope === 'all') {
    const { data: es } = await db.from('entries').select(ENTRY_COLS).eq('event', ev.id).is('hidden_at', null).limit(5000);
    const evEntries = (es || []).map((e: Row) => entryOfRow(e, false));
    state.overview = await Promise.all(mine.map(async (c) => {
      const [{ count: listed }, { count: inRoom }, { count: editors }] = await Promise.all([
        db.from('passes').select('id', { count: 'exact', head: true }).eq('city', c.id),
        db.from('passes').select('id', { count: 'exact', head: true }).eq('city', c.id).not('checked_in_at', 'is', null),
        db.from('passes').select('id', { count: 'exact', head: true }).eq('city', c.id).not('editor_seen_at', 'is', null),
      ]);
      const here = ranked(evEntries.filter((e) => e.city === c.id), ev.f);
      return { id: c.id, listed: listed || 0, inRoom: inRoom || 0, editors: editors || 0, entries: here.length, votes: here.reduce((a, e) => a + publicVotes(e), 0), leader: here[0] && rankValue(here[0], ev.f) > 0 ? here[0].name : null };
    }));
    if (ev.f.finalOn) state.finalists = mine.flatMap((c) => ranked(evEntries.filter((e) => e.city === c.id), ev.f).slice(0, ev.f.finalists)
      .map((e, i) => ({ no: e.no, name: e.name, city: c.id, by: e.by, value: rankValue(e, ev.f), place: i + 1, picture: e.picture, url: e.url })));
  }
  if (isAdmin) {
    const [{ data: roles }, { data: out }, { data: lg }, { data: pk }, { data: jv }, { data: sc }] = await Promise.all([
      db.from('roles').select('id, role, event, city, budget, created_at, people!roles_person_fkey(id, email, name, auth_user)').eq('event', ev.id).order('created_at', { ascending: false }),
      cityIds.length ? db.from('outbox').select('id, to_email, template, city, data, status, error, created_at').in('city', cityIds).order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: [] as Row[] }),
      db.from('log').select('id, what, city, target, data, at, people(name, email)').eq('event', ev.id).order('at', { ascending: false }).limit(200),
      db.from('pick').select('at, entries(no, name, city)').eq('event', ev.id).maybeSingle(),
      db.from('votes').select('person, n, entries!inner(event)').eq('kind', 'judge').eq('entries.event', ev.id),
      db.from('scores').select('judge, entry, entries!inner(event)').eq('entries.event', ev.id),
    ]);
    const used = new Map<string, number>(); (jv || []).forEach((v: Row) => used.set(v.person as string, (used.get(v.person as string) || 0) + (v.n as number)));
    const scored = new Map<string, Set<string>>(); (sc || []).forEach((v: Row) => { const s = scored.get(v.judge as string) || new Set(); s.add(v.entry as string); scored.set(v.judge as string, s); });
    state.people = (roles || []).map((r: Row) => personOf(r, used, scored));
    state.outbox = (out || []).map(outOf(state.devCodes));
    state.log = (lg || []).map((l: Row): DeskLog => { const p = l.people as Row | null; return { id: l.id as number, what: l.what as string, city: (l.city as string) || null, target: (l.target as string) || '', at: ms(l.at)!, who: (p?.name as string) || (p?.email as string) || '' }; });
    const pe = pk?.entries as unknown as Row | null;
    state.pick = pe ? { no: pe.no as number, name: pe.name as string, city: pe.city as string, at: ms(pk!.at)! } : null;
  }
  if (!cur) return state;

  /* the place */
  if (host || judge) {
    const [{ count: listed }, { count: opened }, { data: entries }, { data: votes }] = await Promise.all([
      db.from('passes').select('id', { count: 'exact', head: true }).eq('city', cur),
      db.from('passes').select('id', { count: 'exact', head: true }).eq('city', cur).not('opened_at', 'is', null),
      db.from('entries').select(ENTRY_COLS).eq('city', cur).order('created_at', { ascending: false }),
      db.from('votes').select('entry, ip, created_at, people!inner(email), entries!inner(city)').eq('entries.city', cur).eq('kind', 'public').limit(20000),
    ]);
    const stuffed = stuffing((votes || []) as Row[]);
    state.entries = (entries || []).map((e: Row) => entryOfRow(e, host, stuffed));
    const signedIn = await db.from('passes').select('people!inner(auth_user)', { count: 'exact', head: true }).eq('city', cur).not('people.auth_user', 'is', null);
    const inRoom = await db.from('passes').select('id', { count: 'exact', head: true }).eq('city', cur).not('checked_in_at', 'is', null);
    const editors = await db.from('passes').select('id', { count: 'exact', head: true }).eq('city', cur).not('editor_seen_at', 'is', null);
    state.counts = { listed: listed || 0, opened: opened || 0, signedIn: signedIn.count || 0, inRoom: inRoom.count || 0, entries: state.entries.filter((e) => !e.hidden).length, votes: state.entries.reduce((a, e) => a + publicVotes(e), 0), editors: editors.count || 0 };
  }
  if (judge) {
    if (ev.f.judging === 'scores') {
      const { data: mineS } = await db.from('scores').select('criterion, score, entries!inner(no, city)').eq('judge', d.person.id).eq('entries.city', cur);
      const sc: Record<string, Record<string, number>> = {};
      (mineS || []).forEach((r: Row) => { const no = String((r.entries as Row).no); (sc[no] = sc[no] || {})[r.criterion as string] = r.score as number; });
      state.judging = { scores: sc };
    } else {
      const { data: jr } = await (await asUser()).rpc('my_judging', { c: cur });
      const r = (Array.isArray(jr) ? jr[0] : jr) as Row | null;
      if (r) state.judging = { budget: r.budget as number, used: r.used as number, per: (r.per as Record<string, number>) || {} };
    }
  }
  if (host) {
    const [{ data: guests }, { data: scenes }] = await Promise.all([
      db.from('passes').select('id, source, sent_at, opened_at, created_at, checked_in_at, checked_in_how, list_email, editor_seen_at, people!passes_person_fkey(id, email, name, auth_user, entries!entries_owner_fkey(no, event))').eq('city', cur).order('created_at', { ascending: false }).limit(5000),
      db.from('scenes').select('id, position, kind, title, data, notes, hidden, event').eq('city', cur).order('position'),
    ]);
    state.guests = (guests || []).map((g: Row): DeskGuest => {
      const p = g.people as Row, en = ([] as Row[]).concat((p.entries as Row[] | Row | null) || []).filter((x) => x.event === ev.id);
      const listed = String(g.list_email || '');
      return { person: p.id as string, email: p.email as string, name: (p.name as string) || '', source: g.source as DeskGuest['source'], sent: ms(g.sent_at), opened: ms(g.opened_at), signedIn: !!p.auth_user, inRoom: ms(g.checked_in_at), inRoomHow: (g.checked_in_how as DeskGuest['inRoomHow']) || null, entry: en.length > 0,
        listedAs: listed && listed !== p.email ? listed : null, editor: ms(g.editor_seen_at) };
    });
    state.scenes = (scenes || []) as DeskScene[];
    if (!isAdmin) {
      /* a host sees their own place's outbox, so they can copy a link that did not arrive */
      const { data: out } = await db.from('outbox').select('id, to_email, template, city, data, status, error, created_at').eq('city', cur).order('created_at', { ascending: false }).limit(100);
      state.outbox = (out || []).filter((o: Row) => o.template !== 'code').map(outOf(false));
    }
  }
  return state;
}

function personOf(r: Row, used: Map<string, number>, scored?: Map<string, Set<string>>): DeskPerson {
  const p = r.people as Row;
  return { role: r.id as string, kind: r.role as DeskPerson['kind'], event: (r.event as string) || null, city: (r.city as string) || null, budget: r.budget as number, person: p.id as string, email: p.email as string, name: (p.name as string) || '', signedIn: !!p.auth_user, used: used.get(p.id as string) || 0, scored: scored?.get(p.id as string)?.size || 0 };
}
const outOf = (codes: boolean) => (o: Row): DeskOutbox => ({ id: o.id as string, to: o.to_email as string, template: o.template as string, city: (o.city as string) || null, status: o.status as string, error: (o.error as string) || '', at: ms(o.created_at)!,
  link: ((o.data as Row)?.link as string) || '', code: codes ? (((o.data as Row)?.code as string) || '') : '' });

/* ---------------- actions ---------------- */
type Act = { action: string; city?: string | null; [k: string]: unknown };
export type ActResult = { ok: true; [k: string]: unknown } | { ok: false; error: string; status?: number };
const NEEDS: Record<string, Need> = {
  'import.preview': 'host', 'import.commit': 'host', 'guest.add': 'host', 'guest.remove': 'host', 'guest.in': 'host', 'guest.out': 'host',
  'guest.editor': 'host',
  'entry.hide': 'host', 'entry.show': 'host', 'tie.settle': 'host', 'tie.clear': 'host', 'entry.picture': 'host', 'clock.add': 'host', 'clock.start': 'host',
  'scene.add': 'host', 'scene.update': 'host', 'scene.move': 'host', 'scene.remove': 'host',
  'judge.vote': 'judge-or-host', 'judge.score': 'judge-or-host',
  'import.all': 'admin', 'clock.end': 'admin', 'city.update': 'admin', 'role.add': 'admin', 'role.remove': 'admin', 'role.again': 'admin', 'switch': 'admin',
  'pick.set': 'admin', 'pick.clear': 'admin', 'outbox.retry': 'admin', 'event.update': 'admin', 'place.add': 'admin', 'place.remove': 'admin', 'luma.events': 'admin',
  'gate.set': 'super', 'event.create': 'super', 'event.archive': 'super',
};

async function cityRow(id: string): Promise<Row | null> { const { data } = await admin().from('cities').select('*').eq('id', id).maybeSingle(); return data as Row | null; }

export async function deskAct(d: Desk, a: Act, req: Request): Promise<ActResult> {
  const need = NEEDS[a.action];
  if (!need) return { ok: false, error: 'Unknown action.', status: 400 };
  const db = admin();
  const city = typeof a.city === 'string' && a.city ? a.city : null;
  /* the event: named, or the place's; a role's own event for the role's actions */
  let event = typeof a.event === 'string' && a.event ? a.event : city ? d.eventOf(city) : null;
  if (city && d.eventOf(city) !== event) return { ok: false, error: 'That place is not in this event.', status: 404 };
  /* a role for one place belongs to that place's event */
  const roleCity = a.action === 'role.add' && typeof a.roleCity === 'string' && a.roleCity ? a.roleCity : null;
  if (roleCity) {
    const rcEvent = d.eventOf(roleCity);
    if (!rcEvent) return { ok: false, error: 'That place was not found.', status: 404 };
    if (event && event !== rcEvent) return { ok: false, error: 'That place is not in this event.', status: 404 };
    event = rcEvent;
  }
  let superRole = false;
  if (a.action === 'role.remove' || a.action === 'role.again') {
    const { data: r } = await db.from('roles').select('role, event').eq('id', String(a.id || '')).maybeSingle();
    if (!r) return { ok: false, error: 'That role is already gone.', status: 404 };
    event = (r.event as string) || null; superRole = r.role === 'super';
  }
  if (a.action === 'role.add' && a.role === 'super') superRole = true;
  const needNow: Need = superRole ? 'super' : need;
  if ((needNow === 'host' || needNow === 'judge-or-host') && !city) return { ok: false, error: 'Choose a place first.', status: 400 };
  if (!allowed(d, needNow, event, city)) return { ok: false, error: needNow === 'super' ? 'Only a super admin can do that.' : needNow === 'admin' ? 'Only an admin of this event can do that.' : 'Only a host for this place can do that.', status: 403 };
  const evRec = event ? await eventById(event) : null;

  switch (a.action) {
    case 'import.preview':
    case 'import.commit': {
      let parsed: Parsed;
      if (a.from === 'luma') {
        /* the same preview and the same import, with the list read from the city's Luma event */
        if (!lumaOn()) return { ok: false, error: 'Luma is not connected on this server. Import the CSV instead.' };
        const cr = await cityRow(city!), ev = cr?.luma_event_id as string | undefined;
        if (!ev) return { ok: false, error: 'This city has no Luma event yet. A super admin sets it under Cities.' };
        try {
          const seen = new Set<string>(); let repeats = 0;
          const guests = (await approvedGuests(ev)).filter((g) => { if (seen.has(g.email)) { repeats++; return false; } seen.add(g.email); return emailOK(g.email); });
          parsed = { guests, bad: [], skipped: 0, repeats };
        } catch (e) { return { ok: false, error: (e instanceof Error ? e.message : 'Luma did not answer.') + ' Try again, or import the CSV.' }; }
      } else parsed = parseGuests(String(a.text || ''));
      const emails = parsed.guests.map((g) => g.email);
      /* places are matched on the address they were listed under, whoever holds them now */
      const { data: known } = emails.length ? await db.from('passes').select('list_email, city').eq('event', event!).in('list_email', emails) : { data: [] };
      const here = new Set<string>(), elsewhere = new Map<string, string>();
      (known || []).forEach((p: Row) => { if (p.city === city) here.add(p.list_email as string); else elsewhere.set(p.list_email as string, p.city as string); });
      const fresh = parsed.guests.filter((g) => !here.has(g.email));
      const preview = { fresh: fresh.length, already: here.size, elsewhere: fresh.filter((g) => elsewhere.has(g.email)).length, bad: parsed.bad.length, badList: parsed.bad.slice(0, 5), skipped: parsed.skipped, repeats: parsed.repeats };
      if (a.action === 'import.preview') return { ok: true, preview };
      let added = 0;
      for (const g of fresh) {
        /* on another city's list: a CSV never moves it; a Luma sync moves it only when this registration is the later one */
        if (elsewhere.has(g.email) && !(a.from === 'luma' && g.registeredAt)) continue;
        const p = await ensurePerson(g.email, g.name);
        const { made, kept } = await ensurePass(p, city!, 'luma', d.person.id, { status: 'approved', guestId: g.id, registeredAt: g.registeredAt });
        if (kept === 'held') await log(d, 'second registration under another email; place kept', city, p.id);
        if (made) added++;
      }
      await log(d, 'import guests', city, null, { added, ...preview });
      return { ok: true, added, preview };
    }
    case 'guest.add': {
      const email = norm(String(a.email || '')), name = String(a.name || '').trim().slice(0, 60) || null;
      if (!emailOK(email)) return { ok: false, error: 'Check the email. It needs an @ and a domain.' };
      const p = await ensurePerson(email, name);
      const { pass, moved, kept } = await ensurePass(p, city!, 'host', d.person.id);
      if (kept === 'held') return { ok: false, error: email + ' already holds a place listed under another email (in ' + ((await cityRow(pass.city))?.name || pass.city) + '). Remove that one first.' };
      if (kept === 'checked-in') return { ok: false, error: email + ' is already checked in at ' + ((await cityRow(pass.city))?.name || pass.city) + ', so the place was not moved.' };
      await log(d, 'add guest', city, p.id, { moved });
      return { ok: true, moved };
    }
    /* the door: a host checks a guest in (the only way in now; owner, 2026-11-25), or takes it back; both go in the
       log (lib/server/room.ts) */
    case 'guest.in':
    case 'guest.out': {
      const pass = await passOf(String(a.person || ''), event!);
      if (!pass || pass.city !== city) return { ok: false, error: 'That person is not on this city’s list.', status: 404 };
      if (a.action === 'guest.in') await checkIn(pass, 'host', d.person.id);
      else if (pass.checked_in_at) await uncheck(pass, d.person.id);
      return { ok: true };
    }
    case 'guest.remove': {
      const person = String(a.person || '');
      const { data: pass } = await db.from('passes').select('id, city').eq('event', event!).eq('person', person).maybeSingle();
      if (!pass || pass.city !== city) return { ok: false, error: 'That person is not on this city’s list.', status: 404 };
      /* off the list, and their editor line ends; their entry (if any) stays for the host to hide */
      await db.from('passes').delete().eq('id', pass.id);
      await log(d, 'remove guest', city, person);
      return { ok: true };
    }
    /* a host ends one person's editor line (a lost laptop, a line posted somewhere); they copy a new one from their account */
    case 'guest.editor': {
      const pass = await passOf(String(a.person || ''), event!);
      if (!pass || pass.city !== city) return { ok: false, error: 'That person is not on this city’s list.', status: 404 };
      await replaceEditorKey(pass, 'editor line ended at the desk', d.person.id);
      return { ok: true };
    }
    /* every city with a Luma event, synced at once: the same rules as the webhook (the later registration wins) */
    case 'import.all': {
      if (!lumaOn()) return { ok: false, error: 'Luma is not connected on this server.' };
      const { data: cs } = await db.from('cities').select('id, name, planned_start, offset_min, luma_event_id').eq('event', event!).not('luma_event_id', 'is', null).order('i');
      const per: { city: string; added: number; error?: string }[] = [];
      for (const cr of (cs || []) as CityLite[]) {
        try {
          const guests = await approvedGuests(cr.luma_event_id as string);
          let added = 0;
          for (const g of guests) {
            if (!emailOK(g.email)) continue;
            const r = await applyGuest(cr, { email: g.email, name: g.name, id: g.id, status: 'approved', registeredAt: g.registeredAt }, 'sync', { by: d.person.id });
            if (r.result === 'made' || r.result === 'moved') added++;
          }
          per.push({ city: cr.name, added });
        } catch (e) { per.push({ city: cr.name, added: 0, error: e instanceof Error ? e.message : 'Luma did not answer.' }); }
      }
      await log(d, 'sync every place from Luma', null, null, { per }, event);
      return { ok: true, per };
    }
    /* when the day pages open: the time, and the override that wins over it */
    case 'gate.set': {
      const patch: Row = { updated_at: new Date().toISOString(), updated_by: d.person.id };
      if (a.open === 'auto' || a.open === 'open' || a.open === 'closed') patch.open = a.open;
      if (a.opensAt === null) patch.opens_at = null;
      else if (typeof a.opensAt === 'string' || typeof a.opensAt === 'number') { const t = new Date(a.opensAt); if (isNaN(t.getTime())) return { ok: false, error: 'Check the opening time.' }; patch.opens_at = t.toISOString(); }
      await db.from('events').update(patch).eq('id', EVENT_ID);
      forgetGate();
      await log(d, 'day pages: ' + (patch.open || 'time'), null, null, patch, EVENT_ID);
      return { ok: true, gate: await dayGate() };
    }
    case 'entry.hide':
    case 'entry.show': {
      const { data, error } = await db.from('entries').update({ hidden_at: a.action === 'entry.hide' ? new Date().toISOString() : null }).eq('city', city!).eq('no', Number(a.no)).select('id').maybeSingle();
      if (error || !data) return { ok: false, error: 'That entry is not in this city.', status: 404 };
      forget(city!); await log(d, a.action === 'entry.hide' ? 'hide entry' : 'show entry', city, data.id);
      return { ok: true };
    }
    case 'entry.picture': {
      const { data } = await db.from('entries').select('id').eq('city', city!).eq('no', Number(a.no)).maybeSingle();
      if (!data) return { ok: false, error: 'That entry is not in this city.', status: 404 };
      const r = await refreshPicture(data.id, { anyTime: true });
      if (!r.ok) return { ok: false, error: r.error, status: 422 };
      await log(d, 'refresh picture', city, data.id);
      return { ok: true };
    }
    case 'clock.start':
    case 'clock.add':
    case 'clock.end': {
      /* the clock goes through the database functions as the person, so their rules hold here too */
      const sb = await asUser();
      const r = a.action === 'clock.start' ? await sb.rpc('start_building', { c: city })
        : a.action === 'clock.add' ? await sb.rpc('add_minutes', { c: city, what: a.what === 'vote' ? 'vote' : 'build', mins: Math.trunc(Number(a.mins) || 5) })
          : await sb.rpc('end_early', { c: city, what: a.what === 'vote' ? 'vote' : 'build' });
      if (r.error) return { ok: false, error: r.error.message, status: 409 };
      forget(city!);
      return { ok: true };
    }
    case 'scene.add': {
      const kind = ['speaker', 'words', 'link', 'product'].indexOf(String(a.kind)) >= 0 ? String(a.kind) : 'words';
      const { data: last } = await db.from('scenes').select('position').eq('city', city!).order('position', { ascending: false }).limit(1);
      /* new slides go after Welcome by default, where speakers come in the evening */
      const at = Number.isInteger(a.position) ? Number(a.position) : (last?.[0]?.position ?? 0) + 1;
      const { data: rows } = await db.from('scenes').select('id, position').eq('city', city!).gte('position', at).order('position', { ascending: false });
      for (const r of rows || []) await db.from('scenes').update({ position: (r.position as number) + 1 }).eq('id', r.id);
      const title = String(a.title || '').slice(0, 80) || (kind === 'speaker' ? 'Speaker' : kind === 'link' ? 'Link' : kind === 'product' ? 'Product' : 'Words');
      const { data, error } = await db.from('scenes').insert({ city, position: at, kind, title, data: sceneData(a.data), notes: String(a.notes || '').slice(0, 400), event: false }).select('id').single();
      if (error) return { ok: false, error: 'The slide was not added. Try again.' };
      await log(d, 'add slide', city, data.id);
      return { ok: true, id: data.id };
    }
    case 'scene.update': {
      const patch: Row = {};
      if (typeof a.title === 'string') patch.title = a.title.slice(0, 80);
      if (typeof a.notes === 'string') patch.notes = a.notes.slice(0, 400);
      if (typeof a.hidden === 'boolean') patch.hidden = a.hidden;
      if (a.data && typeof a.data === 'object') patch.data = sceneData(a.data);
      const { data, error } = await db.from('scenes').update(patch).eq('id', String(a.id)).eq('city', city!).select('id').maybeSingle();
      if (error || !data) return { ok: false, error: 'That slide is not in this city.', status: 404 };
      await log(d, 'edit slide', city, data.id, { fields: Object.keys(patch) });
      return { ok: true };
    }
    case 'scene.move': {
      /* the whole order, as a list of ids; anything missing keeps its place after the listed ones */
      const ids = Array.isArray(a.order) ? (a.order as unknown[]).map(String) : [];
      const { data: all } = await db.from('scenes').select('id').eq('city', city!).order('position');
      const rest = (all || []).map((r) => r.id as string).filter((id) => ids.indexOf(id) < 0), order = ids.filter((id) => (all || []).some((r) => r.id === id)).concat(rest);
      for (const [k, id] of order.entries()) await db.from('scenes').update({ position: k + 1 }).eq('id', id).eq('city', city!);
      await log(d, 'reorder slides', city);
      return { ok: true };
    }
    case 'scene.remove': {
      const { data } = await db.from('scenes').select('id, event').eq('id', String(a.id)).eq('city', city!).maybeSingle();
      if (!data) return { ok: false, error: 'That slide is not in this city.', status: 404 };
      if (data.event) return { ok: false, error: 'The event’s own scenes can be hidden, not deleted.' };
      await db.from('scenes').delete().eq('id', data.id);
      await log(d, 'delete slide', city, data.id);
      return { ok: true };
    }
    case 'city.update': {
      const patch: Row = {};
      if (typeof a.venue === 'string') patch.venue = a.venue.slice(0, 120) || null;
      if (typeof a.luma === 'string') { const v = a.luma.trim(); if (v && !/^https:\/\//.test(v)) return { ok: false, error: 'Use the full Luma address, starting https://.' }; patch.luma_url = v || null; }
      if (typeof a.lumaEvent === 'string') { const v = a.lumaEvent.trim(); if (v && !/^[A-Za-z0-9_-]{3,80}$/.test(v)) return { ok: false, error: 'The Luma event ID is letters, numbers and dashes, like evt-AbC123.' }; patch.luma_event_id = v || null; }
      if (typeof a.editor === 'string') patch.editor_name = a.editor.slice(0, 40) || null;
      if (typeof a.prize === 'string') patch.prize = a.prize.trim().slice(0, 120) || null;
      if (typeof a.name === 'string') { const v = a.name.trim(); if (v.length < 2 || v.length > 60) return { ok: false, error: 'A place’s name is 2 to 60 characters.' }; patch.name = v; }
      if (typeof a.zone === 'string' && a.zone !== '') { if (!zoneOK(a.zone)) return { ok: false, error: 'That time zone is not one we know. Use one like Europe/London.' }; patch.zone = a.zone; patch.offset_min = offsetIn(a.zone, evRec?.day || EVENT_DAY); }
      if (a.buildMin != null) { const n = Math.trunc(Number(a.buildMin)); if (!(n >= 15 && n <= 600)) return { ok: false, error: 'Building lasts between 15 and 600 minutes.' }; patch.build_min = n; }
      if (a.voteAfter != null) { const n = Math.trunc(Number(a.voteAfter)); if (!(n >= 0 && n <= 240)) return { ok: false, error: 'Voting runs on between 0 and 240 minutes.' }; patch.vote_after = n; }
      if (typeof a.planned === 'string') { const t = new Date(a.planned); if (isNaN(t.getTime())) return { ok: false, error: 'Check the start time.' }; patch.planned_start = t.toISOString(); }
      await db.from('cities').update(patch).eq('id', city!);
      forget(city!); forgetEvents(); await log(d, 'edit place', city, null, { fields: Object.keys(patch) });
      return { ok: true };
    }
    case 'role.add': {
      const email = norm(String(a.email || '')), kind = String(a.role), rc = a.roleCity ? String(a.roleCity) : null;
      if (!emailOK(email)) return { ok: false, error: 'Check the email. It needs an @ and a domain.' };
      if (['admin', 'host', 'judge', 'super'].indexOf(kind) < 0) return { ok: false, error: 'Choose admin, host, judge or super admin.' };
      if ((kind === 'super' || kind === 'admin') && rc) return { ok: false, error: kind === 'super' ? 'A super admin is for every event.' : 'An admin is for the whole event.' };
      if (kind !== 'super' && !event) return { ok: false, error: 'Choose the event first.' };
      if (rc && d.eventOf(rc) !== event) return { ok: false, error: 'That place is not in this event.' };
      const p = await ensurePerson(email, String(a.name || '').trim() || null);
      const budget = kind === 'judge' ? Math.max(1, Math.min(1000, Math.trunc(Number(a.budget) || evRec?.f.judgeBudget || 50))) : 50;
      const { error } = await db.from('roles').insert({ person: p.id, role: kind, event: kind === 'super' ? null : event, city: rc, budget, added_by: d.person.id });
      if (error) return { ok: false, error: error.code === '23505' ? email + ' already has that role.' : 'The role was not added. Try again.' };
      const cn = rc ? ((await cityRow(rc))?.name as string) : undefined, base = siteUrl(req);
      const link = base + '/desk' + (kind === 'super' ? '' : '?event=' + event + (rc ? '&city=' + rc : ''));
      await send(p.email, 'role', { role: (kind === 'admin' ? 'host' : kind) as 'host' | 'judge' | 'super', city: cn || (kind === 'super' ? undefined : evRec?.short), name: p.name || undefined, link }, rc);
      await log(d, 'add ' + kind, rc, p.id, {}, kind === 'super' ? null : event);
      return { ok: true };
    }
    case 'role.remove': {
      const { data } = await db.from('roles').select('id, role, event, city, person').eq('id', String(a.id)).maybeSingle();
      if (!data) return { ok: false, error: 'That role is already gone.', status: 404 };
      if (data.person === d.person.id && (data.role === 'super' || data.role === 'admin')) return { ok: false, error: 'You can’t remove your own ' + (data.role === 'super' ? 'super admin' : 'admin') + ' role.' };
      await db.from('roles').delete().eq('id', data.id);
      await log(d, 'remove ' + data.role, data.city as string | null, data.person as string, {}, data.event as string | null);
      return { ok: true };
    }
    case 'role.again': {
      const { data } = await db.from('roles').select('role, event, city, people!roles_person_fkey(email, name)').eq('id', String(a.id)).maybeSingle();
      if (!data) return { ok: false, error: 'That role is gone.', status: 404 };
      const p = data.people as unknown as Row, rc = data.city as string | null, base = siteUrl(req);
      const link = base + '/desk' + (data.event ? '?event=' + data.event + (rc ? '&city=' + rc : '') : '');
      await send(p.email as string, 'role', { role: (data.role === 'admin' ? 'host' : data.role) as 'host', city: rc ? ((await cityRow(rc))?.name as string) : evRec?.short, name: (p.name as string) || undefined, link }, rc);
      return { ok: true };
    }
    case 'switch': {
      const patch: Row = {};
      if (typeof a.submissionsPaused === 'boolean') patch.submissions_paused = a.submissionsPaused;
      if (typeof a.votingPaused === 'boolean') patch.voting_paused = a.votingPaused;
      if (!Object.keys(patch).length) return { ok: false, error: 'Nothing to switch.' };
      if (a.all === true) await db.from('cities').update(patch).eq('event', event!);
      else { if (!city) return { ok: false, error: 'Choose a place.' }; await db.from('cities').update(patch).eq('id', city); }
      forget(a.all === true ? undefined : city!); await log(d, 'switch', a.all === true ? null : city, null, patch, event);
      return { ok: true };
    }
    case 'pick.set': {
      const { data: cv } = await db.from('cities').select('vote_end').eq('id', city!).maybeSingle();
      if (!cv?.vote_end || Date.parse(cv.vote_end as string) > Date.now()) return { ok: false, error: 'Voting is still open in this place, so its finalists are not final yet.', status: 409 };
      const { data: e } = await db.from('entries').select('id, name').eq('city', city!).eq('no', Number(a.no)).maybeSingle();
      if (!e) return { ok: false, error: 'That entry is not in this place.', status: 404 };
      await db.from('pick').upsert({ event, entry: e.id, set_by: d.person.id, at: new Date().toISOString() });
      forget(); await log(d, 'enter the winner', city, e.id, { name: e.name });
      return { ok: true };
    }
    case 'pick.clear': {
      await db.from('pick').delete().eq('event', event!);
      forget(); await log(d, 'clear the winner', null, null, {}, event);
      return { ok: true };
    }
    /* a tie at the top, settled by the host once voting has closed: a.order is the tied entries' numbers, first place
       first. As the host, so the database's own rules hold (closed, same count, this place) */
    case 'tie.settle':
    case 'tie.clear': {
      const nos = Array.isArray(a.order) ? (a.order as unknown[]).map((n) => Math.trunc(Number(n))).filter((n) => n > 0) : [];
      let ids: string[] | null = null;
      if (a.action === 'tie.settle') {
        const { data } = await db.from('entries').select('id, no').eq('city', city!).in('no', nos);
        const byNo = new Map((data || []).map((e: Row) => [e.no as number, e.id as string]));
        if (nos.length < 2 || nos.some((n) => !byNo.has(n))) return { ok: false, error: 'Choose two or more tied projects from this place.', status: 400 };
        ids = nos.map((n) => byNo.get(n)!);
      }
      const r = await (await asUser()).rpc('settle_tie', { c: city!, entry_ids: ids });
      if (r.error) return { ok: false, error: r.error.message, status: 409 };
      forget(city!);
      return { ok: true };
    }
    /* a judge's press on the desk, as the judge, so the database's own rules hold (budget, scope, the clock) */
    case 'judge.vote':
    case 'judge.score': {
      const { data: e } = await db.from('entries').select('id').eq('city', city!).eq('no', Number(a.no)).maybeSingle();
      if (!e) return { ok: false, error: 'That entry is not in this place.', status: 404 };
      const sb = await asUser();
      const r = a.action === 'judge.vote'
        ? await sb.rpc('judge_vote', { entry_id: e.id, delta: Math.trunc(Number(a.delta) || 0) })
        : await sb.rpc('judge_score', { entry_id: e.id, crit: String(a.crit || ''), val: a.val == null ? null : Math.trunc(Number(a.val)) });
      if (r.error) return { ok: false, error: r.error.message, status: 409 };
      forget(city!);
      return { ok: true };
    }
    /* ---- events ---- */
    case 'event.create': {
      const name = String(a.name || '').trim(), short = String(a.short || '').trim() || name, day = String(a.day || '');
      if (name.length < 2 || name.length > 60) return { ok: false, error: 'Give the event a name, 2 to 60 characters.' };
      if (short.length < 2 || short.length > 30) return { ok: false, error: 'The short name is 2 to 30 characters.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(Date.parse(day))) return { ok: false, error: 'Choose the day.' };
      const preset = PRESETS.find((x) => x.id === a.preset) || PRESETS[0];
      /* a new event names its own prizes; Builder Day's are only its own */
      const r = await makeEvent({ name, short, day, f: { ...preset.f, prize: '', placePrize: '' }, by: d.person.id });
      if (!r.ok) return r;
      await log(d, 'make event', null, null, { name, preset: preset.id }, r.id);
      return { ok: true, id: r.id };
    }
    case 'event.update': {
      const patch: Row = { updated_at: new Date().toISOString(), updated_by: d.person.id };
      if (typeof a.name === 'string') { const v = a.name.trim(); if (v.length < 2 || v.length > 60) return { ok: false, error: 'Give the event a name, 2 to 60 characters.' }; patch.name = v; }
      if (typeof a.short === 'string') { const v = a.short.trim(); if (v.length < 2 || v.length > 30) return { ok: false, error: 'The short name is 2 to 30 characters.' }; patch.short = v; }
      if (typeof a.day === 'string') { if (!/^\d{4}-\d{2}-\d{2}$/.test(a.day)) return { ok: false, error: 'Choose the day.' }; patch.day = a.day; }
      const f = (a.f && typeof a.f === 'object' ? a.f : {}) as Partial<Format>;
      const next: Format = { ...evRec!.f, ...f };
      if (Array.isArray(f.criteria)) next.criteria = f.criteria.map((c) => ({ id: slugOf(String(c.name || c.id || '')).slice(0, 30) || 'c', name: String(c.name || '').trim().slice(0, 40) })).filter((c) => c.name);
      const why = formatProblem(next);
      if (why) return { ok: false, error: why };
      Object.assign(patch, formatRow({ ...f, criteria: Array.isArray(f.criteria) ? next.criteria : undefined }));
      /* a judge's budget follows the event's, for the judges who had the event's old one */
      const { error } = await db.from('events').update(patch).eq('id', event!);
      if (error) return { ok: false, error: 'The event was not saved. Check the values and try again.' };
      if (f.judgeBudget != null && f.judgeBudget !== evRec!.f.judgeBudget) await db.from('roles').update({ budget: f.judgeBudget }).eq('event', event!).eq('role', 'judge').eq('budget', evRec!.f.judgeBudget);
      forgetEvents(); forget(); await log(d, 'edit event', null, null, { fields: Object.keys(patch).concat(Object.keys(f)) }, event);
      return { ok: true };
    }
    case 'event.archive': {
      await db.from('events').update({ archived_at: a.archived === false ? null : new Date().toISOString() }).eq('id', event!);
      forgetEvents(); await log(d, a.archived === false ? 'bring back event' : 'archive event', null, null, {}, event);
      return { ok: true };
    }
    case 'luma.events': {
      if (!lumaOn()) return { ok: false, error: 'Luma is not connected on this server.' };
      try {
        const after = new Date(Date.parse(evRec!.day) - 60 * 86400000).toISOString();
        const { data: used } = await db.from('cities').select('luma_event_id, name, event').not('luma_event_id', 'is', null);
        const taken = new Map((used || []).map((u: Row) => [u.luma_event_id as string, u.name as string]));
        const list = (await calendarEvents(after)).map((e) => ({ ...e, taken: taken.get(e.id) || null }));
        return { ok: true, list };
      } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Luma did not answer.' }; }
    }
    case 'place.add': {
      const name = String(a.name || '').trim();
      if (name.length < 2 || name.length > 60) return { ok: false, error: 'Give the place a name, 2 to 60 characters.' };
      const r = await makePlace({ event: event!, day: evRec!.day, name, zone: String(a.zone || ''), start: String(a.start || ''), lumaEvent: a.lumaEvent ? String(a.lumaEvent) : null, luma: a.luma ? String(a.luma) : null, venue: a.venue ? String(a.venue) : null, buildMin: evRec!.f.buildMin, voteAfter: evRec!.f.voteAfter });
      if (!r.ok) return r;
      await log(d, 'add place', r.id, null, { name });
      return { ok: true, id: r.id };
    }
    case 'place.remove': {
      const id = String(a.place || '');
      if (d.eventOf(id) !== event) return { ok: false, error: 'That place is not in this event.', status: 404 };
      const r = await removePlace(id);
      if (!r.ok) return r;
      await log(d, 'remove place', null, id, {}, event);
      return { ok: true };
    }
    case 'outbox.retry': {
      const { data: o } = await db.from('outbox').select('to_email, template, city, data').eq('id', String(a.id)).maybeSingle();
      if (!o) return { ok: false, error: 'That email is gone.', status: 404 };
      const s = await send(o.to_email as string, o.template as 'code', o.data as Record<string, string>, o.city as string | null);
      return { ok: true, status: s.status };
    }
  }
  return { ok: false, error: 'Unknown action.', status: 400 };
}

function sceneData(v: unknown): Row {
  if (!v || typeof v !== 'object') return {};
  const o = v as Row, out: Row = {};
  (['name', 'role', 'line', 'picture', 'heading', 'url', 'label'] as const).forEach((k) => { if (typeof o[k] === 'string') out[k] = (o[k] as string).slice(0, k === 'url' || k === 'picture' ? 500 : 120); });
  if (Array.isArray(o.lines)) out.lines = (o.lines as unknown[]).filter((x) => typeof x === 'string').slice(0, 3).map((x) => (x as string).slice(0, 120));
  if (typeof out.url === 'string' && out.url && !/^https?:\/\//.test(out.url as string)) delete out.url;
  return out;
}
