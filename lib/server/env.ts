/* env.ts: what the server is configured with. The backend is on when the Supabase address and both keys are set;
   otherwise every page draws the seeded world and sign-in stays in the browser. Names are listed in env.example.
   Server only (nothing under lib/server is imported by a client component): the service key and the key secret
   never reach a browser. */

export function backendOn(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(name + ' is not set. See env.example.');
  return v;
}

/* the site's own address for links in emails and the install line: SITE_URL, else the request's origin */
export function siteUrl(req?: Request): string {
  const s = process.env.SITE_URL;
  if (s) return s.replace(/\/+$/, '');
  if (req) { const u = new URL(req.url); return u.origin; }
  return 'http://localhost:4320';
}

export const devMail = () => process.env.NODE_ENV !== 'production' && process.env.HACKDAY_DEV_MAIL === '1';

export function superAdmins(): string[] {
  return (process.env.SUPER_ADMINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/* the caller's address, for the stuffing flags; behind the host's proxy it is the first forwarded one */
export function ipOf(req: Request): string | null {
  const f = req.headers.get('x-forwarded-for');
  const ip = (f ? f.split(',')[0] : req.headers.get('x-real-ip') || '').trim();
  return /^[0-9a-f.:]+$/i.test(ip) ? ip : null;
}

/* the hold on place emails (owner, 2026-11-19, narrowed 2026-11-23: sign-in codes and other emails a person asks for
   go out; the place emails sent to the whole list, by Luma's webhook or the desk, wait). On unless MAIL_HOLD=off: a
   held email still becomes an outbox row (not sent), so nothing is lost; once lifted, the desk's "send unsent links"
   catches up the places whose link never went out. */
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
