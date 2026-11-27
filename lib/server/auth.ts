/* auth.ts: proving who someone is, with no password here.
   - a supabase.com account (always): the browser sends the token of the login it shares with supabase.com, the
     server asks supabase.com whose it is (platform.ts) and signs in that confirmed email;
   - a six-digit code by email: only while EMAIL_SIGNIN=on, an emergency switch. Supabase Auth makes it with
     generateLink, we send it (mail.ts).
   Each ends with our own Supabase Auth session in the browser's cookies: generateLink gives a one-use hashed token for
   the email, and verifyOtp on the cookie client turns it into a session. Auth sends no mail of its own.
   Being on a city's list comes from Luma (or a host); being in the room comes from a host at the door (room.ts). */
import { cookies } from 'next/headers';
import { COOKIE_PATH, admin, asUser } from './supabase';
import { DESK_COOKIE, deskMark } from './keys';
import { send } from './mail';
import { bootstrapSuper, ensurePerson, norm, passOf, type Person } from './people';
import { siteUrl } from './env';
import { RESEND_S } from '@/lib/forms';
import { lookUpOnLuma } from './registrations';
import { platformUser } from './platform';

/* make (if new) the Auth user for this email and put its session in the cookies. Auth keeps one token per user, so
   two sign-ins for one email in the same instant (one person, two devices) can spend each other's token: try twice. */
export async function signInAs(email: string): Promise<{ ok: true; user: string } | { ok: false; error: string }> {
  let last = '';
  for (let k = 0; k < 2; k++) {
    if (k) await new Promise((r) => setTimeout(r, 250 + Math.random() * 500));   // spread out when Auth is busy
    const { data, error } = await admin().auth.admin.generateLink({ type: 'magiclink', email: norm(email) });
    if (error || !data?.properties?.hashed_token) { last = error?.message || 'no token'; continue; }
    const sb = await asUser();
    const v = await sb.auth.verifyOtp({ type: 'email', token_hash: data.properties.hashed_token });
    if (!v.error && v.data.user) { await clearDesk(); return { ok: true, user: v.data.user.id }; }
    if (!v.error) { last = 'no user'; continue; }
    last = v.error.message;
  }
  console.error('sign-in failed:', last);
  return { ok: false, error: 'Signing in did not go through. Try again in a moment.' };
}

/* a Supabase account or the code proves the email at this moment: it may open the desk */
async function markDesk(authUser: string) {
  const jar = await cookies();
  jar.set(DESK_COOKIE, deskMark(authUser), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: COOKIE_PATH, maxAge: 60 * 60 * 24 * 14 });
}
async function clearDesk() { (await cookies()).delete({ name: DESK_COOKIE, path: COOKIE_PATH }); }

/* after any sign-in: the person row is linked to the Auth user by the database trigger; give SUPER_ADMINS their role */
async function afterSignIn(email: string, lookUp = false, name?: string | null): Promise<Person> {
  const p = await ensurePerson(email, name);
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

/* ---------------- a supabase.com account ---------------- */
/* the token of the supabase.com login: its confirmed email signs in here and may open the desk (it proves the inbox
   as well as a code does) */
export async function supabaseSignIn(token: string): Promise<{ ok: true; person: Person } | { ok: false; error: string; status: number }> {
  const u = await platformUser(token);
  if (!u.ok) return u;
  const s = await signInAs(u.user.email);
  if (!s.ok) return { ok: false, status: 502, error: s.error };
  await markDesk(s.user);
  return { ok: true, person: await afterSignIn(u.user.email, true, u.user.name) };
}
