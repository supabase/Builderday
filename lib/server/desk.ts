/* desk.ts: what the desk reads and does. Every action names what it needs (roles.ts) and is written to the log.
   The guest list holds emails, so it is only ever read here, by the server, after the role check. */
import { admin, asUser } from './supabase';
import { allowed, type Desk, type Need } from './roles';
import { EVENT_ID, ensurePass, ensurePerson, linkFor, norm, passOf } from './people';
import { checkIn, uncheck } from './room';
import { send } from './mail';
import { forget } from './snapshot';
import { refreshPicture } from './entries';
import { whenLocal } from './time';
import { parseGuests, type Parsed } from '@/lib/luma';
import { approvedGuests, lumaOn } from './luma';
import { emailOK } from '@/lib/forms';
import { mailDriver } from './mail';
import { devMail, mailAllowList, mailHeld } from './env';
import { dayGate, forgetGate } from './gate';
import { replaceEditorKey } from './repo-key';
import { applyGuest, type CityLite } from './registrations';
import type { DeskState, DeskGuest, DeskEntry, DeskCity, DeskPerson, DeskOutbox, DeskLog, DeskScene } from '@/lib/event/desk';

type Row = Record<string, unknown>;
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);
const THROWAWAY = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc'];

async function log(d: Desk, what: string, city: string | null, target?: string | null, data?: Record<string, unknown>) {
  await admin().from('log').insert({ who: d.person.id, what, city, target: target || null, data: data || {} });
}

function cityOf(r: Row): DeskCity {
  return {
    id: r.id as string, name: r.name as string, offset: r.offset_min as number, zone: r.zone as string, venue: (r.venue as string) || '', luma: (r.luma_url as string) || '', lumaEvent: (r.luma_event_id as string) || '', editor: (r.editor_name as string) || '',
    planned: ms(r.planned_start)!, buildMin: r.build_min as number, voteAfter: r.vote_after as number,
    buildStart: ms(r.build_start), buildEnd: ms(r.build_end), voteEnd: ms(r.vote_end),
    roomCode: (r.room_code as string) || '', submissionsPaused: !!r.submissions_paused, votingPaused: !!r.voting_paused,
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

export async function deskState(d: Desk, city: string | null): Promise<DeskState> {
  const db = admin();
  const { data: cities } = await db.from('cities').select('*').order('i');
  const mine = (cities || []).filter((c: Row) => d.cities === 'all' || d.cities.indexOf(c.id as string) >= 0).map(cityOf);
  const cur = city && mine.some((c) => c.id === city) ? city : (mine[0]?.id ?? null);
  const host = cur ? d.hosts(cur) : false, judge = cur ? d.judges(cur) : false;
  const state: DeskState = {
    me: { email: d.person.email, name: d.person.name, super: d.super, roles: d.roles.map((r) => ({ role: r.role, city: r.city, budget: r.budget })) },
    city: cur, cities: mine, can: { host, judge, super: d.super },
    counts: null, guests: [], entries: [], scenes: [], people: [], outbox: [], log: [], pick: null,
    mail: mailDriver(), mailHeld: mailHeld(), mailTest: process.env.RESEND_API_KEY ? mailAllowList().length : 0, devCodes: devMail(), luma: lumaOn(), hook: !!process.env.LUMA_WEBHOOK_SECRET,
    gate: d.super ? await dayGate() : null,
  };
  if (!cur) return state;

  if (host || judge) {
    const [{ count: listed }, { count: opened }, { data: entries }, { data: votes }] = await Promise.all([
      db.from('passes').select('id', { count: 'exact', head: true }).eq('city', cur),
      db.from('passes').select('id', { count: 'exact', head: true }).eq('city', cur).not('opened_at', 'is', null),
      db.from('entries').select('id, no, slug, name, pitch, url, repo, picture, picture_from, via, flags, hidden_at, created_at, people!entries_owner_fkey(name, email), tally(votes, judge_votes)').eq('city', cur).order('created_at', { ascending: false }),
      db.from('votes').select('entry, ip, created_at, people!inner(email), entries!inner(city)').eq('entries.city', cur).eq('kind', 'public').limit(20000),
    ]);
    const stuffed = stuffing((votes || []) as Row[]);
    state.entries = (entries || []).map((e: Row): DeskEntry => {
      const t = (Array.isArray(e.tally) ? e.tally[0] : e.tally) as Row | null, p = e.people as Row | null;
      return { no: e.no as number, slug: e.slug as string, name: e.name as string, pitch: e.pitch as string, url: e.url as string, repo: (e.repo as string) || '', picture: (e.picture as string) || null,
        pictureFrom: (e.picture_from as string) || null, via: e.via as string, by: (p?.name as string) || '', byEmail: host ? String(p?.email || '') : '',
        flags: ((e.flags as string[]) || []).concat(stuffed.get(e.id as string) || []), hidden: !!e.hidden_at, created: ms(e.created_at)!, votes: (t?.votes as number) || 0, judge: (t?.judge_votes as number) || 0 };
    });
    const signedIn = await db.from('passes').select('people!inner(auth_user)', { count: 'exact', head: true }).eq('city', cur).not('people.auth_user', 'is', null);
    const inRoom = await db.from('passes').select('id', { count: 'exact', head: true }).eq('city', cur).not('checked_in_at', 'is', null);
    const editors = await db.from('passes').select('id', { count: 'exact', head: true }).eq('city', cur).not('editor_seen_at', 'is', null);
    const unsent = await db.from('passes').select('id', { count: 'exact', head: true }).eq('city', cur).is('sent_at', null);
    state.counts = { listed: listed || 0, opened: opened || 0, signedIn: signedIn.count || 0, inRoom: inRoom.count || 0, entries: state.entries.filter((e) => !e.hidden).length, votes: state.entries.reduce((a, e) => a + e.votes, 0), editors: editors.count || 0, unsent: unsent.count || 0 };
  }
  if (host) {
    const [{ data: guests }, { data: scenes }] = await Promise.all([
      db.from('passes').select('id, source, sent_at, opened_at, created_at, checked_in_at, checked_in_how, list_email, editor_seen_at, people!passes_person_fkey(id, email, name, auth_user, entries!entries_owner_fkey(no))').eq('city', cur).order('created_at', { ascending: false }).limit(5000),
      db.from('scenes').select('id, position, kind, title, data, notes, hidden, event').eq('city', cur).order('position'),
    ]);
    state.guests = (guests || []).map((g: Row): DeskGuest => {
      const p = g.people as Row, en = p.entries as Row[] | Row | null;
      const listed = String(g.list_email || '');
      return { person: p.id as string, email: p.email as string, name: (p.name as string) || '', source: g.source as DeskGuest['source'], sent: ms(g.sent_at), opened: ms(g.opened_at), signedIn: !!p.auth_user, inRoom: ms(g.checked_in_at), inRoomHow: (g.checked_in_how as DeskGuest['inRoomHow']) || null, entry: Array.isArray(en) ? en.length > 0 : !!en,
        listedAs: listed && listed !== p.email ? listed : null, editor: ms(g.editor_seen_at) };
    });
    state.scenes = (scenes || []) as DeskScene[];
  }
  if (d.super) {
    const [{ data: roles }, { data: out }, { data: lg }, { data: pk }, { data: jv }] = await Promise.all([
      db.from('roles').select('id, role, city, budget, created_at, people!roles_person_fkey(id, email, name, auth_user)').order('created_at', { ascending: false }),
      db.from('outbox').select('id, to_email, template, city, data, status, error, created_at').order('created_at', { ascending: false }).limit(200),
      db.from('log').select('id, what, city, target, data, at, people(name, email)').order('at', { ascending: false }).limit(200),
      db.from('pick').select('at, entries(no, name, city)').maybeSingle(),
      db.from('votes').select('person, n').eq('kind', 'judge'),
    ]);
    const used = new Map<string, number>(); (jv || []).forEach((v: Row) => used.set(v.person as string, (used.get(v.person as string) || 0) + (v.n as number)));
    state.people = (roles || []).map((r: Row): DeskPerson => { const p = r.people as Row; return { role: r.id as string, kind: r.role as DeskPerson['kind'], city: (r.city as string) || null, budget: r.budget as number, person: p.id as string, email: p.email as string, name: (p.name as string) || '', signedIn: !!p.auth_user, used: used.get(p.id as string) || 0 }; });
    state.outbox = (out || []).map((o: Row): DeskOutbox => ({ id: o.id as string, to: o.to_email as string, template: o.template as string, city: (o.city as string) || null, status: o.status as string, error: (o.error as string) || '', at: ms(o.created_at)!,
      link: ((o.data as Row)?.link as string) || '', code: state.devCodes ? (((o.data as Row)?.code as string) || '') : '' }));
    state.log = (lg || []).map((l: Row): DeskLog => { const p = l.people as Row | null; return { id: l.id as number, what: l.what as string, city: (l.city as string) || null, target: (l.target as string) || '', at: ms(l.at)!, who: (p?.name as string) || (p?.email as string) || '' }; });
    const pe = pk?.entries as unknown as Row | null;
    state.pick = pe ? { no: pe.no as number, name: pe.name as string, city: pe.city as string, at: ms(pk!.at)! } : null;
  } else if (host) {
    /* a host sees their own city's outbox, so they can copy a link that did not arrive */
    const { data: out } = await db.from('outbox').select('id, to_email, template, city, data, status, error, created_at').eq('city', cur).order('created_at', { ascending: false }).limit(100);
    state.outbox = (out || []).filter((o: Row) => o.template !== 'code').map((o: Row): DeskOutbox => ({ id: o.id as string, to: o.to_email as string, template: o.template as string, city: (o.city as string) || null, status: o.status as string, error: (o.error as string) || '', at: ms(o.created_at)!, link: ((o.data as Row)?.link as string) || '', code: '' }));
  }
  return state;
}

/* ---------------- actions ---------------- */
type Act = { action: string; city?: string | null; [k: string]: unknown };
export type ActResult = { ok: true; [k: string]: unknown } | { ok: false; error: string; status?: number };
const NEEDS: Record<string, Need> = {
  'import.preview': 'host', 'import.commit': 'host', 'guest.add': 'host', 'guest.again': 'host', 'guest.link': 'host', 'guest.remove': 'host', 'guest.in': 'host', 'guest.out': 'host',
  'guest.editor': 'host', 'guest.unsent': 'host', 'import.all': 'super', 'gate.set': 'super',
  'entry.hide': 'host', 'entry.show': 'host', 'entry.picture': 'host', 'door.code': 'host', 'clock.add': 'host', 'clock.start': 'host',
  'scene.add': 'host', 'scene.update': 'host', 'scene.move': 'host', 'scene.remove': 'host',
  'clock.end': 'super', 'city.update': 'super', 'role.add': 'super', 'role.remove': 'super', 'role.again': 'super', 'switch': 'super', 'pick.set': 'super', 'outbox.retry': 'super',
};
const ALPHA = 'ACDEFHJKMNPQRTUVWXY34679';
const roomCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

async function passLink(person: string, req: Request): Promise<{ link: string; email: string; name: string | null; city: string } | null> {
  const { data } = await admin().from('passes').select('id, key_version, city, people!passes_person_fkey(email, name)').eq('event', EVENT_ID).eq('person', person).maybeSingle();
  if (!data) return null;
  const p = data.people as unknown as Row;
  return { link: linkFor(data as { id: string; key_version: number }, req), email: p.email as string, name: (p.name as string) || null, city: data.city as string };
}
async function cityRow(id: string): Promise<Row | null> { const { data } = await admin().from('cities').select('*').eq('id', id).maybeSingle(); return data as Row | null; }

export async function deskAct(d: Desk, a: Act, req: Request): Promise<ActResult> {
  const need = NEEDS[a.action];
  if (!need) return { ok: false, error: 'Unknown action.', status: 400 };
  const city = typeof a.city === 'string' && a.city ? a.city : null;
  if (!allowed(d, need, need === 'super' && !city ? null : city)) return { ok: false, error: need === 'super' ? 'Only a super admin can do that.' : 'Only a host for this city can do that.', status: 403 };
  const db = admin();

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
      const { data: known } = emails.length ? await db.from('passes').select('list_email, city').eq('event', EVENT_ID).in('list_email', emails) : { data: [] };
      const here = new Set<string>(), elsewhere = new Map<string, string>();
      (known || []).forEach((p: Row) => { if (p.city === city) here.add(p.list_email as string); else elsewhere.set(p.list_email as string, p.city as string); });
      const fresh = parsed.guests.filter((g) => !here.has(g.email));
      const preview = { fresh: fresh.length, already: here.size, elsewhere: fresh.filter((g) => elsewhere.has(g.email)).length, bad: parsed.bad.length, badList: parsed.bad.slice(0, 5), skipped: parsed.skipped, repeats: parsed.repeats };
      if (a.action === 'import.preview') return { ok: true, preview };
      const c = await cityRow(city!), sendNow = a.send === true;
      let added = 0, sent = 0;
      for (const g of fresh) {
        /* on another city's list: a CSV never moves it; a Luma sync moves it only when this registration is the later one */
        if (elsewhere.has(g.email) && !(a.from === 'luma' && g.registeredAt)) continue;
        const p = await ensurePerson(g.email, g.name);
        const { pass, made, kept } = await ensurePass(p, city!, 'luma', d.person.id, { status: 'approved', guestId: g.id, registeredAt: g.registeredAt });
        if (kept === 'held') await log(d, 'second registration under another email; place kept', city, p.id);
        if (made) added++;
        if (sendNow && made) {
          const s = await send(p.email, 'link', { city: c?.name as string, when: whenLocal(c?.planned_start as string, c?.offset_min as number), link: linkFor(pass, req), name: p.name || undefined }, city);
          if (s.status === 'sent') { await db.from('passes').update({ sent_at: new Date().toISOString() }).eq('id', pass.id); sent++; }
        }
      }
      await log(d, 'import guests', city, null, { added, sent, ...preview });
      return { ok: true, added, sent, preview };
    }
    case 'guest.add': {
      const email = norm(String(a.email || '')), name = String(a.name || '').trim().slice(0, 60) || null;
      if (!emailOK(email)) return { ok: false, error: 'Check the email. It needs an @ and a domain.' };
      const p = await ensurePerson(email, name);
      const { pass, moved, kept } = await ensurePass(p, city!, 'host', d.person.id);
      if (kept === 'held') return { ok: false, error: email + ' already holds a place listed under another email (in ' + ((await cityRow(pass.city))?.name || pass.city) + '). Remove that one first.' };
      if (kept === 'checked-in') return { ok: false, error: email + ' is already checked in at ' + ((await cityRow(pass.city))?.name || pass.city) + ', so the place was not moved.' };
      const c = await cityRow(city!);
      if (a.send !== false) {
        const s = await send(p.email, 'link', { city: c?.name as string, when: whenLocal(c?.planned_start as string, c?.offset_min as number), link: linkFor(pass, req), name: p.name || undefined }, city);
        if (s.status === 'sent') await db.from('passes').update({ sent_at: new Date().toISOString() }).eq('id', pass.id);
      }
      await log(d, 'add guest', city, p.id, { moved });
      return { ok: true, moved };
    }
    case 'guest.again': {
      const l = await passLink(String(a.person || ''), req);
      if (!l || l.city !== city) return { ok: false, error: 'That person is not on this city’s list.', status: 404 };
      const c = await cityRow(city!);
      const s = await send(l.email, 'again', { city: c?.name as string, link: l.link, name: l.name || undefined }, city);
      if (s.status === 'sent') await db.from('passes').update({ sent_at: new Date().toISOString() }).eq('event', EVENT_ID).eq('person', String(a.person));
      await log(d, 'send link again', city, String(a.person));
      return { ok: true, status: s.status };
    }
    case 'guest.link': {
      const l = await passLink(String(a.person || ''), req);
      if (!l || l.city !== city) return { ok: false, error: 'That person is not on this city’s list.', status: 404 };
      await log(d, 'copy link', city, String(a.person));
      return { ok: true, link: l.link };
    }
    /* a host marks a guest as in the room by hand (a phone that will not load must not lock a builder out), or takes
       the mark back; both go in the log (lib/server/room.ts) */
    case 'guest.in':
    case 'guest.out': {
      const pass = await passOf(String(a.person || ''));
      if (!pass || pass.city !== city) return { ok: false, error: 'That person is not on this city’s list.', status: 404 };
      if (a.action === 'guest.in') await checkIn(pass, 'host', d.person.id);
      else if (pass.checked_in_at) await uncheck(pass, d.person.id);
      return { ok: true };
    }
    case 'guest.remove': {
      const person = String(a.person || '');
      const { data: pass } = await db.from('passes').select('id, city').eq('event', EVENT_ID).eq('person', person).maybeSingle();
      if (!pass || pass.city !== city) return { ok: false, error: 'That person is not on this city’s list.', status: 404 };
      /* off the list, and their links end; their entry (if any) stays for the host to hide */
      await db.from('passes').delete().eq('id', pass.id);
      await log(d, 'remove guest', city, person);
      return { ok: true };
    }
    /* a host ends one person's editor line (a lost laptop, a line posted somewhere); their emailed link still works */
    case 'guest.editor': {
      const pass = await passOf(String(a.person || ''));
      if (!pass || pass.city !== city) return { ok: false, error: 'That person is not on this city’s list.', status: 404 };
      await replaceEditorKey(pass, 'editor line ended at the desk', d.person.id);
      return { ok: true };
    }
    /* the places whose link has not gone out yet: send each its email now */
    case 'guest.unsent': {
      const c = await cityRow(city!);
      const { data: rows } = await db.from('passes').select('id, key_version, list_email, people!passes_person_fkey(name, email)').eq('city', city!).eq('event', EVENT_ID).is('sent_at', null).limit(2000);
      let sent = 0;
      for (const r of (rows || []) as Row[]) {
        const p = r.people as Row | null;
        /* to the account holding the place: its link signs in as that account */
        const s = await send(String(p?.email || r.list_email), 'link', { city: c?.name as string, when: whenLocal(c?.planned_start as string, c?.offset_min as number), link: linkFor(r as { id: string; key_version: number }, req), name: (p?.name as string) || undefined }, city);
        if (s.status === 'sent') { await db.from('passes').update({ sent_at: new Date().toISOString() }).eq('id', r.id); sent++; }
      }
      await log(d, 'send unsent links', city, null, { sent });
      return { ok: true, sent };
    }
    /* every city with a Luma event, synced at once: the same rules as the webhook (the later registration wins) */
    case 'import.all': {
      if (!lumaOn()) return { ok: false, error: 'Luma is not connected on this server.' };
      const { data: cs } = await db.from('cities').select('id, name, planned_start, offset_min, luma_event_id').not('luma_event_id', 'is', null).order('i');
      const per: { city: string; added: number; error?: string }[] = [];
      for (const cr of (cs || []) as CityLite[]) {
        try {
          const guests = await approvedGuests(cr.luma_event_id as string);
          let added = 0;
          for (const g of guests) {
            if (!emailOK(g.email)) continue;
            const r = await applyGuest(cr, { email: g.email, name: g.name, id: g.id, status: 'approved', registeredAt: g.registeredAt }, 'sync', { by: d.person.id, mail: a.send === true, base: new URL(req.url).origin });
            if (r.result === 'made' || r.result === 'moved') added++;
            if (r.mail) await r.mail();
          }
          per.push({ city: cr.name, added });
        } catch (e) { per.push({ city: cr.name, added: 0, error: e instanceof Error ? e.message : 'Luma did not answer.' }); }
      }
      await log(d, 'sync every city from Luma', null, null, { per });
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
      await log(d, 'day pages: ' + (patch.open || 'time') , null, null, patch);
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
    case 'door.code': {
      const c = await cityRow(city!); let code = roomCode();
      while (code === c?.room_code) code = roomCode();
      await db.from('cities').update({ room_code: code, room_code_prev: c?.room_code || null, room_code_at: new Date().toISOString() }).eq('id', city!);
      await log(d, 'new room code', city);
      return { ok: true, code };
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
      const kind = ['speaker', 'words', 'link'].indexOf(String(a.kind)) >= 0 ? String(a.kind) : 'words';
      const { data: last } = await db.from('scenes').select('position').eq('city', city!).order('position', { ascending: false }).limit(1);
      /* new slides go after Welcome by default, where speakers come in the evening */
      const at = Number.isInteger(a.position) ? Number(a.position) : (last?.[0]?.position ?? 0) + 1;
      const { data: rows } = await db.from('scenes').select('id, position').eq('city', city!).gte('position', at).order('position', { ascending: false });
      for (const r of rows || []) await db.from('scenes').update({ position: (r.position as number) + 1 }).eq('id', r.id);
      const title = String(a.title || '').slice(0, 80) || (kind === 'speaker' ? 'Speaker' : kind === 'link' ? 'Link' : 'Words');
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
      if (a.buildMin != null) { const n = Math.trunc(Number(a.buildMin)); if (!(n >= 15 && n <= 600)) return { ok: false, error: 'Building lasts between 15 and 600 minutes.' }; patch.build_min = n; }
      if (a.voteAfter != null) { const n = Math.trunc(Number(a.voteAfter)); if (!(n >= 0 && n <= 240)) return { ok: false, error: 'Voting runs on between 0 and 240 minutes.' }; patch.vote_after = n; }
      if (typeof a.planned === 'string') { const t = new Date(a.planned); if (isNaN(t.getTime())) return { ok: false, error: 'Check the start time.' }; patch.planned_start = t.toISOString(); }
      await db.from('cities').update(patch).eq('id', city!);
      forget(city!); await log(d, 'edit city', city, null, { fields: Object.keys(patch) });
      return { ok: true };
    }
    case 'role.add': {
      const email = norm(String(a.email || '')), kind = String(a.role), rc = a.roleCity ? String(a.roleCity) : null;
      if (!emailOK(email)) return { ok: false, error: 'Check the email. It needs an @ and a domain.' };
      if (['host', 'judge', 'super'].indexOf(kind) < 0) return { ok: false, error: 'Choose host, judge or super admin.' };
      if (kind === 'super' && rc) return { ok: false, error: 'A super admin is for every city.' };
      const p = await ensurePerson(email, String(a.name || '').trim() || null);
      const budget = kind === 'judge' ? Math.max(0, Math.min(1000, Math.trunc(Number(a.budget) || 50))) : 50;
      const { error } = await db.from('roles').insert({ person: p.id, role: kind, city: rc, budget, added_by: d.person.id });
      if (error) return { ok: false, error: error.code === '23505' ? email + ' already has that role.' : 'The role was not added. Try again.' };
      const cn = rc ? ((await cityRow(rc))?.name as string) : undefined, base = new URL(req.url).origin;
      await send(p.email, 'role', { role: kind as 'host' | 'judge' | 'super', city: cn, name: p.name || undefined, link: kind === 'judge' ? base + (rc ? '/city/' + rc : '/') : base + '/desk' + (rc ? '?city=' + rc : '') }, rc);
      await log(d, 'add ' + kind, rc, p.id);
      return { ok: true };
    }
    case 'role.remove': {
      const { data } = await db.from('roles').select('id, role, city, person').eq('id', String(a.id)).maybeSingle();
      if (!data) return { ok: false, error: 'That role is already gone.', status: 404 };
      if (data.person === d.person.id && data.role === 'super') return { ok: false, error: 'You can’t remove your own super admin role.' };
      await db.from('roles').delete().eq('id', data.id);
      await log(d, 'remove ' + data.role, data.city as string | null, data.person as string);
      return { ok: true };
    }
    case 'role.again': {
      const { data } = await db.from('roles').select('role, city, people!roles_person_fkey(email, name)').eq('id', String(a.id)).maybeSingle();
      if (!data) return { ok: false, error: 'That role is gone.', status: 404 };
      const p = data.people as unknown as Row, rc = data.city as string | null, base = new URL(req.url).origin;
      await send(p.email as string, 'role', { role: data.role as 'host', city: rc ? ((await cityRow(rc))?.name as string) : undefined, name: (p.name as string) || undefined, link: data.role === 'judge' ? base + (rc ? '/city/' + rc : '/') : base + '/desk' }, rc);
      return { ok: true };
    }
    case 'switch': {
      const patch: Row = {};
      if (typeof a.submissionsPaused === 'boolean') patch.submissions_paused = a.submissionsPaused;
      if (typeof a.votingPaused === 'boolean') patch.voting_paused = a.votingPaused;
      if (!Object.keys(patch).length) return { ok: false, error: 'Nothing to switch.' };
      let q = db.from('cities').update(patch);
      q = a.all === true ? q.neq('id', '') : q.eq('id', city!);
      await q;
      forget(a.all === true ? undefined : city!); await log(d, 'switch', a.all === true ? null : city, null, patch);
      return { ok: true };
    }
    case 'pick.set': {
      const { data: cv } = await db.from('cities').select('vote_end').eq('id', city!).maybeSingle();
      if (!cv?.vote_end || Date.parse(cv.vote_end as string) > Date.now()) return { ok: false, error: 'Voting is still open in this city, so its top 3 is not final yet.', status: 409 };
      const { data: e } = await db.from('entries').select('id, name').eq('city', city!).eq('no', Number(a.no)).maybeSingle();
      if (!e) return { ok: false, error: 'That entry is not in this city.', status: 404 };
      await db.from('pick').upsert({ one: true, entry: e.id, set_by: d.person.id, at: new Date().toISOString() });
      forget(); await log(d, 'enter the pick', city, e.id, { name: e.name });
      return { ok: true };
    }
    case 'outbox.retry': {
      const { data: o } = await db.from('outbox').select('to_email, template, city, data').eq('id', String(a.id)).maybeSingle();
      if (!o) return { ok: false, error: 'That email is gone.', status: 404 };
      const s = await send(o.to_email as string, o.template as 'link', o.data as Record<string, string>, o.city as string | null);
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
