/* claim.ts: "Registered with a different email?". A signed-in person with no place types the address
   they registered with; that address gets a six-digit code; typing it moves the place to the signed-in account. The
   place keeps the address it was listed under (so Luma's sync never makes it again for the old address), and its
   check-in stays.
   Rule 7: the answer to "send a code" is the same whether or not the address is on a list, so the sheet cannot be
   used to test addresses. The codes are ours (an HMAC, nothing secret stored), not Supabase Auth's: proving an inbox
   here must not sign anyone in as that address. */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { admin } from './supabase';
import { need } from './env';
import { EVENT_ID, norm, passByListEmail, passOf, type Person } from './people';
import { send } from './mail';
import { nameOfCity } from './room';
import { RESEND_S } from '@/lib/forms';

const LIVE_MIN = 15, TRIES = 5, HOUR = 3600_000;
const LIMIT = { ip: 6, email: 3, person: 6 };
const hash = (id: string, code: string) => createHmac('sha256', need('HACKDAY_KEY_SECRET')).update('claim:' + id + ':' + code).digest('base64url');

export type ClaimSent = { ok: true; wait: number } | { ok: false; error: string; status: number; wait?: number };
export async function claimStart(p: Person, email: string, ip: string | null): Promise<ClaimSent> {
  const db = admin(), e = norm(email), since = new Date(Date.now() - HOUR).toISOString();
  if (e === norm(p.email)) return { ok: false, status: 400, error: 'That is the email you are signed in with. Type the one you registered with on Luma.' };
  const mine = await passOf(p.id), there = await passByListEmail(e);
  if (mine && there && mine.id === there.id) return { ok: false, status: 400, error: 'That place is already yours.' };

  const count = async (col: string, v: string) => (await db.from('claims').select('id', { count: 'exact', head: true }).eq(col, v).gte('created_at', since)).count || 0;
  const [byIp, byEmail, byPerson] = await Promise.all([ip ? count('ip', ip) : 0, count('list_email', e), count('person', p.id)]);
  if (byIp >= LIMIT.ip || byEmail >= LIMIT.email || byPerson >= LIMIT.person) return { ok: false, status: 429, error: 'That is a lot of codes in an hour. Try again later, or ask your host to add you.' };
  const { data: last } = await db.from('claims').select('created_at').eq('person', p.id).eq('list_email', e).order('created_at', { ascending: false }).limit(1);
  if (last && last.length) {
    const wait = Math.ceil((Date.parse(last[0].created_at) + RESEND_S * 1000 - Date.now()) / 1000);
    if (wait > 0) return { ok: false, status: 429, wait, error: 'We just sent a code. Send a new one in ' + wait + ' s.' };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { data: row, error } = await db.from('claims').insert({ person: p.id, list_email: e, pass: there?.id || null, code_hash: 'x', ip }).select('id').single();
  if (error || !row) return { ok: false, status: 500, error: 'The code was not made. Try again in a moment.' };
  await db.from('claims').update({ code_hash: hash(row.id, code) }).eq('id', row.id);
  if (there) await send(e, 'claim', { code, city: await nameOfCity(there.city), account: p.email }, there.city);
  await db.from('log').insert({ who: p.id, what: 'claim code asked', data: { listed: !!there } });
  return { ok: true, wait: RESEND_S };
}

export type Claimed = { ok: true; city: string; cityName: string; replaced: string | null } | { ok: false; error: string; status: number; field?: 'code' | 'email' };
export async function claimVerify(p: Person, email: string, code: string): Promise<Claimed> {
  const db = admin(), e = norm(email);
  if (!/^\d{6}$/.test(String(code || ''))) return { ok: false, status: 400, field: 'code', error: 'Enter all six digits from the email.' };
  const since = new Date(Date.now() - LIVE_MIN * 60000).toISOString();
  const { data: rows } = await db.from('claims').select('id, pass, code_hash, tries, created_at').eq('person', p.id).eq('list_email', e).is('used_at', null).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
  const c = rows?.[0];
  if (!c) return { ok: false, status: 410, field: 'code', error: 'That code has run out. Send a new one.' };
  if (c.tries >= TRIES) return { ok: false, status: 429, field: 'code', error: 'Five wrong codes. Send a new one.' };
  const want = Buffer.from(hash(c.id, String(code))), got = Buffer.from(c.code_hash);
  const right = !!c.pass && want.length === got.length && timingSafeEqual(want, got);
  if (!right) {
    await db.from('claims').update({ tries: c.tries + 1 }).eq('id', c.id);
    return { ok: false, status: 400, field: 'code', error: c.tries + 1 >= TRIES ? 'That code does not match, and that was the fifth try. Send a new one.' : 'That code does not match. Check the email and try again.' };
  }

  const place = await passByListEmail(e);
  if (!place || place.id !== c.pass) return { ok: false, status: 409, error: 'That place is no longer on the list. Ask your host.' };
  if (place.person !== p.id) {
    /* in use: the other account has an entry, has voted, or is in a team */
    const [{ count: entries }, { count: votes }, { count: teams }] = await Promise.all([
      db.from('entries').select('id', { count: 'exact', head: true }).eq('owner', place.person),
      db.from('votes').select('id', { count: 'exact', head: true }).eq('person', place.person),
      db.from('team_members').select('team', { count: 'exact', head: true }).eq('person', place.person),
    ]);
    if ((entries || 0) > 0 || (votes || 0) > 0 || (teams || 0) > 0) return { ok: false, status: 409, error: 'That place is already in use. Ask your host.' };
  }
  const held = await passOf(p.id);
  let replaced: string | null = null;
  if (held && held.id !== place.id) {
    replaced = await nameOfCity(held.city);
    await db.from('passes').delete().eq('id', held.id);
  }
  const from = place.person;
  const { error } = await db.from('passes').update({ person: p.id, claimed_at: new Date().toISOString() }).eq('id', place.id).eq('event', EVENT_ID);
  if (error) return { ok: false, status: 500, error: 'The place did not move. Try again in a moment.' };
  await db.from('claims').update({ used_at: new Date().toISOString() }).eq('id', c.id);
  await db.from('log').insert({ who: p.id, what: 'claimed a place listed under another email', city: place.city, target: from, data: { replaced } });
  return { ok: true, city: place.city, cityName: await nameOfCity(place.city), replaced };
}
