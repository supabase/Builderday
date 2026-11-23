/* auth.ts: the three ways to prove an email, none with a password.
   - the personal link: our own key (keys.ts), opened as many times as needed until the day after;
   - the room code on the stage: email plus the four characters, for an email on that city's list only (no walk-ins);
     it also checks the person in, which is what unlocks Submit (rule 7c, lib/server/room.ts);
   - a six-digit code by email: Supabase Auth makes it with generateLink, we send it (mail.ts).
   Each ends with a Supabase Auth session in the browser's cookies: generateLink gives a one-use hashed token for the
   email, and verifyOtp on the cookie client turns it into a session. Auth sends no mail of its own. */
import { cookies } from 'next/headers';
import { admin, asUser } from './supabase';
import { DESK_COOKIE, deskMark } from './keys';
import { send } from './mail';
import { bootstrapSuper, ensurePass, ensurePerson, linkFor, norm, passOf, personByEmail, rolesOf, type Person } from './people';
import { siteUrl, superAdmins } from './env';
import { RESEND_S } from '@/lib/forms';
import { whenLocal } from './time';
import { guestStatus, lumaOn } from './luma';
import { lookUpOnLuma } from './registrations';
import { checkIn, codeOK, nameOfCity } from './room';
import { otherCity, roomNotListed, wrongCode } from '@/lib/event/rule';

/* make (if new) the Auth user for this email and put its session in the cookies. Auth keeps one token per user, so
   two sign-ins for one email in the same instant (one person, two devices) can spend each other's token: try twice. */
export async function signInAs(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let last = '';
  for (let k = 0; k < 2; k++) {
    if (k) await new Promise((r) => setTimeout(r, 250 + Math.random() * 500));   // spread out when Auth is busy
    const { data, error } = await admin().auth.admin.generateLink({ type: 'magiclink', email: norm(email) });
    if (error || !data?.properties?.hashed_token) { last = error?.message || 'no token'; continue; }
    const sb = await asUser();
    const v = await sb.auth.verifyOtp({ type: 'email', token_hash: data.properties.hashed_token });
    if (!v.error) { await clearDesk(); return { ok: true }; }
    last = v.error.message;
  }
  console.error('sign-in failed:', last);
  return { ok: false, error: 'Signing in did not go through. Try again in a moment.' };
}

/* the code (or its link) proves the email at this moment: it may open the desk; links and the room code may not */
async function markDesk(authUser: string) {
  const jar = await cookies();
  jar.set(DESK_COOKIE, deskMark(authUser), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 14 });
}
async function clearDesk() { (await cookies()).delete(DESK_COOKIE); }

/* after any sign-in: the person row is linked to the Auth user by the database trigger; give SUPER_ADMINS their role */
async function afterSignIn(email: string, lookUp = false): Promise<Person> {
  const p = await ensurePerson(email);
  await bootstrapSuper(p);
  /* no place yet: the webhook may not have arrived for someone who registered minutes ago, so ask Luma once */
  if (lookUp && !(await passOf(p.id))) { try { await lookUpOnLuma(p.email); } catch (e) { console.error('Luma look-up failed:', e instanceof Error ? e.message : e); } }
  return p;
}

/* ---------------- the six-digit code ---------------- */
export type CodeResult = { ok: true; wait: number } | { ok: false; error: string; wait?: number };
export async function sendCode(email: string, req: Request, next?: string): Promise<CodeResult> {
  const e = norm(email), db = admin();
  /* one code each RESEND_S seconds per address, counted from the outbox */
  const since = new Date(Date.now() - RESEND_S * 1000).toISOString();
  const { data: recent } = await db.from('outbox').select('created_at').eq('to_email', e).eq('template', 'code').gte('created_at', since).order('created_at', { ascending: false }).limit(1);
  if (recent && recent.length) {
    const wait = Math.ceil((new Date(recent[0].created_at).getTime() + RESEND_S * 1000 - Date.now()) / 1000);
    return { ok: false, error: 'We just sent a code. Send a new one in ' + wait + ' s.', wait };
  }
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: e });
  if (error || !data?.properties?.email_otp) return { ok: false, error: 'We could not make a code: ' + (error?.message || 'no code') };
  const link = siteUrl(req) + '/in/confirm?th=' + encodeURIComponent(data.properties.hashed_token) + (next ? '&next=' + encodeURIComponent(next) : '');
  const s = await send(e, 'code', { code: data.properties.email_otp, link });
  if (s.status === 'failed') return { ok: false, error: 'The email did not go out: ' + (s.error || 'unknown') + '. Try again in a minute.' };
  return { ok: true, wait: RESEND_S };
}

export async function verifyCode(email: string, code: string): Promise<{ ok: true; person: Person } | { ok: false; error: string }> {
  if (!/^\d{6}$/.test(code)) return { ok: false, error: 'Enter all six digits from the email.' };
  const sb = await asUser();
  const v = await sb.auth.verifyOtp({ type: 'email', email: norm(email), token: code });
  if (v.error || !v.data.user) return { ok: false, error: 'That code does not match. Check the email and try again, or send a new code.' };
  await markDesk(v.data.user.id);
  return { ok: true, person: await afterSignIn(email, true) };
}

/* the link in the code email, after the person presses the button on /in/confirm (so a mail scanner opening the
   link uses nothing up) */
export async function confirmToken(tokenHash: string): Promise<{ ok: true; person: Person } | { ok: false; error: string }> {
  const sb = await asUser();
  const v = await sb.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
  if (v.error || !v.data.user?.email) return { ok: false, error: 'That link has been used or has run out. Ask for a new code.' };
  await markDesk(v.data.user.id);
  return { ok: true, person: await afterSignIn(v.data.user.email, true) };
}

/* ---------------- the room code ---------------- */
/* Email plus the code on the screen: signs in and checks in, for an email on this city's list. An email we do not
   have is asked about once on the city's Luma event, where a key exists (approved: on the list with Luma's name);
   anything else is refused in words, with no place made. A place in another city is never moved by a code. */
export type RoomResult = { ok: true } | { ok: false; error: string; field: 'code' | 'email' };
export async function roomSignIn(email: string, code: string, city: string, ip: string | null): Promise<RoomResult> {
  const { data: row } = await admin().from('cities').select('id, name, room_code, room_code_prev, room_code_at, luma_event_id').eq('id', city).maybeSingle();
  if (!row) return { ok: false, field: 'code', error: 'That city is not one of ours.' };
  if (!codeOK(row, code)) return { ok: false, field: 'code', error: wrongCode(row.name as string) };
  const e = norm(email);
  let p = await personByEmail(e), pass = p ? await passOf(p.id) : null;
  if (pass && pass.city !== city) return { ok: false, field: 'email', error: otherCity(await nameOfCity(pass.city), row.name as string) };
  if (!pass && lumaOn() && row.luma_event_id) {
    const g = await guestStatus(row.luma_event_id as string, e);
    if (g.status === 'approved') {
      p = await ensurePerson(e, g.name, ip);
      const r = await ensurePass(p, city, 'luma', null, { status: 'approved', guestId: g.id, registeredAt: g.registeredAt });
      pass = r.kept === 'held' ? null : r.pass;
      if (pass) await admin().from('log').insert({ who: p.id, what: 'on the list from Luma (room code)', city });
    }
  }
  if (!p || !pass) return { ok: false, field: 'email', error: roomNotListed(e, row.name as string) };
  /* the room code proves a seat in the room, not the inbox: an email with a desk role (or one SUPER_ADMINS names) would
     get that role's database rights with no code, so it signs in by the code from its email, then types the room code */
  if (superAdmins().indexOf(e) >= 0 || (await rolesOf(p.id)).length) return { ok: false, field: 'email', error: 'This email runs the desk, so it signs in with the code we email you. Then type the room code.' };
  await checkIn(pass, 'room', null);
  const s = await signInAs(p.email);
  if (!s.ok) return { ok: false, field: 'code', error: s.error };
  await afterSignIn(p.email);
  return { ok: true };
}

/* ---------------- the personal link ---------------- */
export async function sendLinkAgain(email: string, req: Request): Promise<void> {
  /* the same answer whether or not the address is on a list, so the sheet cannot be used to test addresses */
  const p = await personByEmail(email);
  if (!p) return;
  const pass = await passOf(p.id);
  if (!pass) return;
  const { data: city } = await admin().from('cities').select('name, planned_start, offset_min').eq('id', pass.city).single();
  await send(p.email, 'again', { city: city?.name, link: linkFor(pass, req), name: p.name || undefined, when: city ? whenLocal(city.planned_start, city.offset_min) : undefined }, pass.city);
}
