/* registrations.ts: what one Luma registration does to a city's list. The webhook,
   the desk's Sync and the check of one email all come through applyGuest, so they agree.
   - approved: the place is made (or brought up to date), matched on the address it is listed under; a registration
     for another city moves it only when it is the later one, and never once the person is checked in. "Your place in
     <city>" goes out once (sent_at), and again when the place moves to another city.
   - anything else (pending, waitlist, declined, invited): no place. A place that came from Luma for that city goes,
     unless the person is checked in. The account always stays. */
import { admin } from './supabase';
import { dropLumaPass, ensurePass, ensurePerson, linkFor, norm, type Pass } from './people';
import { eventOfCity } from './events';
import { send } from './mail';
import { whenLocal } from './time';
import { guestStatus, lumaOn } from './luma';
import { forget } from './snapshot';

export type CityLite = { id: string; name: string; planned_start: string; offset_min: number; luma_event_id?: string | null };
export type Registration = { email: string; name?: string | null; id?: string | null; status: string; registeredAt?: string | null };
export type Applied = 'made' | 'updated' | 'moved' | 'kept-later' | 'kept-held' | 'kept-checked-in' | 'gone' | 'stays-checked-in' | 'none';

const CITY_COLS = 'id, name, planned_start, offset_min, luma_event_id';
export async function cityByLumaEvent(eventId: string): Promise<CityLite | null> {
  const { data } = await admin().from('cities').select(CITY_COLS).eq('luma_event_id', eventId).maybeSingle();
  return data as CityLite | null;
}

/* the email with the link, sent now or handed to the caller to send after its response */
export type Mail = () => Promise<void>;
function placeMail(pass: Pass, to: string, city: CityLite, name: string | null, base: string | undefined): Mail {
  return async () => {
    const link = linkFor(pass, base ? new Request(base) : undefined);
    /* to the account holding the place, since the link signs in as that account */
    const s = await send(to, 'link', { city: city.name, when: whenLocal(city.planned_start, city.offset_min), link, name: name || undefined }, city.id);
    /* only a real send counts: a held or failed email leaves the place unsent, for the catch-up */
    if (s.status === 'sent') await admin().from('passes').update({ sent_at: new Date().toISOString() }).eq('id', pass.id);
  };
}

export async function applyGuest(city: CityLite, g: Registration, how: 'hook' | 'sync' | 'check', opts: { by?: string | null; base?: string; mail?: boolean } = {}): Promise<{ result: Applied; mail: Mail | null; pass: Pass | null }> {
  const db = admin(), email = norm(g.email);
  if (!email || email.indexOf('@') < 1) return { result: 'none', mail: null, pass: null };
  const say = (what: string, target?: string | null, data?: Record<string, unknown>) => db.from('log').insert({ who: opts.by || null, what, city: city.id, target: target || null, data: { how, ...(data || {}) } });

  if (g.status !== 'approved') {
    const r = await dropLumaPass(email, city.id);
    if (r === 'gone') { await say('off the list (Luma: ' + g.status + ')', null, { email }); forget(city.id); return { result: 'gone', mail: null, pass: null }; }
    if (r === 'checked-in') {
      await db.from('passes').update({ luma_status: g.status }).eq('event', await eventOfCity(city.id)).eq('list_email', email);
      await say('kept on the list: checked in (Luma: ' + g.status + ')', null, { email });
      return { result: 'stays-checked-in', mail: null, pass: null };
    }
    return { result: 'none', mail: null, pass: null };
  }

  const p = await ensurePerson(email, g.name || null);
  const r = await ensurePass(p, city.id, 'luma', opts.by || null, { guestId: g.id, status: g.status, registeredAt: g.registeredAt });
  if (r.kept) {
    await say(r.kept === 'held' ? 'second registration under another email; place kept' : r.kept === 'later' ? 'earlier registration; place kept in ' + r.pass.city : 'checked in elsewhere; place kept in ' + r.pass.city, p.id);
    return { result: r.kept === 'held' ? 'kept-held' : r.kept === 'later' ? 'kept-later' : 'kept-checked-in', mail: null, pass: r.pass };
  }
  const result: Applied = r.made ? 'made' : r.moved ? 'moved' : 'updated';
  if (r.made) await say('on the list from Luma', p.id);
  if (r.moved) await say('moved from ' + r.moved + ' (later Luma registration)', p.id);
  if (r.made || r.moved) forget(city.id);
  const wantMail = opts.mail !== false && (r.moved || !r.pass.sent_at);
  return { result, mail: wantMail ? placeMail(r.pass, r.pass.person === p.id ? p.email : r.pass.list_email, city, p.name, opts.base) : null, pass: r.pass };
}

/* Sign-in found no place for this email: ask each city's Luma event about it, once, and make the place from the
   latest approved registration (registered minutes ago, the webhook not here yet). Only with LUMA_API_KEY. */
export async function lookUpOnLuma(email: string, base?: string): Promise<Pass | null> {
  if (!lumaOn()) return null;
  const { data } = await admin().from('cities').select(CITY_COLS).not('luma_event_id', 'is', null);
  const cities = (data || []) as CityLite[];
  if (!cities.length) return null;
  const found = await Promise.all(cities.map(async (c) => ({ c, g: await guestStatus(c.luma_event_id as string, email) })));
  const ok = found.filter((f) => f.g.status === 'approved').sort((a, b) => Date.parse(b.g.registeredAt || '0') - Date.parse(a.g.registeredAt || '0'));
  if (!ok.length) return null;
  const { c, g } = ok[0];
  const a = await applyGuest(c, { email, name: g.name, id: g.id, status: 'approved', registeredAt: g.registeredAt }, 'check', { base });
  if (a.mail) await a.mail();
  return a.pass;
}
