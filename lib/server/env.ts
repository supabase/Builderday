/* env.ts: what the server is configured with. The backend is on when the Supabase address and both keys are set;
   otherwise every page draws the seeded world and sign-in stays in the browser. Names are listed in env.example.
   Server only (nothing under lib/server is imported by a client component): the service key and the key secret
   never reach a browser. */
import { BASE } from '@/lib/routes';

export function backendOn(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(name + ' is not set. See env.example.');
  return v;
}

/* the site's own address for links in emails and the install line, base path included: SITE_URL (which carries the
   base, e.g. https://supabase.com/builderday), else the request's origin and the base */
export function siteUrl(req?: Request): string {
  const s = process.env.SITE_URL;
  if (s) return s.replace(/\/+$/, '');
  if (req) { const u = new URL(req.url); return u.origin + BASE; }
  return 'http://localhost:4320' + BASE;
}

export const devMail = () => process.env.NODE_ENV !== 'production' && process.env.HACKDAY_DEV_MAIL === '1';

/* signing in (lib/signin.ts): a supabase.com account always; the email and six-digit code only while EMAIL_SIGNIN=on
   (an emergency switch); a stand-in Supabase account only on a dev server with HACKDAY_FAKE_SUPABASE=1 */
export const emailSignIn = () => (process.env.EMAIL_SIGNIN || '').trim().toLowerCase() === 'on';
export const fakeSupabase = () => process.env.NODE_ENV !== 'production' && process.env.HACKDAY_FAKE_SUPABASE === '1';

export function superAdmins(): string[] {
  return (process.env.SUPER_ADMINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/* the caller's address, for the stuffing flags; behind the host's proxy it is the first forwarded one */
export function ipOf(req: Request): string | null {
  const f = req.headers.get('x-forwarded-for');
  const ip = (f ? f.split(',')[0] : req.headers.get('x-real-ip') || '').trim();
  return /^[0-9a-f.:]+$/i.test(ip) ? ip : null;
}

/* the hold on emails sent to many people at once (owner, 2026-11-19). Place emails are gone (owner, 2026-11-25: people
   sign in with Supabase, nothing goes out when they register on Luma); what is left under the hold is Remind me. On
   unless MAIL_HOLD=off: a held email still becomes an outbox row (not sent), so nothing is lost. */
export function mailHeld(): boolean { return (process.env.MAIL_HOLD || '').trim().toLowerCase() !== 'off'; }

/* the test list (MAIL_ALLOW): addresses, or whole domains written as @example.com, that get place emails while the
   hold is on, so the team can try them on themselves before anyone else gets one. */
export function mailAllowList(): string[] {
  return (process.env.MAIL_ALLOW || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}
export function mailAllowed(to: string): boolean {
  const t = to.trim().toLowerCase();
  return mailAllowList().some((a) => (a.startsWith('@') ? t.endsWith(a) : t === a));
}
