/* platform.ts: who a supabase.com access token belongs to.
   The browser sends the token of the supabase.com login it shares with the dashboard (lib/signin.ts). We ask
   supabase.com's auth server (GET /user, the same server the dashboard uses) and keep only the confirmed email and a
   name. The token is never stored, logged or used for anything else. */
import { PLATFORM, FAKE_PREFIX } from '@/lib/signin';
import { emailOK } from '@/lib/forms';
import { fakeSupabase } from './env';

export type PlatformUser = { email: string; name: string | null };
export type PlatformResult = { ok: true; user: PlatformUser } | { ok: false; status: number; error: string };

const RAN_OUT = 'Your Supabase sign-in has run out. Sign in on supabase.com again, then come back.';

export async function platformUser(token: string): Promise<PlatformResult> {
  const t = String(token || '').trim();
  if (fakeSupabase() && t.startsWith(FAKE_PREFIX)) {
    const email = t.slice(FAKE_PREFIX.length).toLowerCase();
    return emailOK(email) ? { ok: true, user: { email, name: null } } : { ok: false, status: 400, error: 'Check the email. It needs an @ and a domain.' };
  }
  if (!/^[A-Za-z0-9._-]{20,8192}$/.test(t)) return { ok: false, status: 401, error: RAN_OUT };
  let r: Response;
  try { r = await fetch(PLATFORM.auth + '/user', { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store', signal: AbortSignal.timeout(8000) }); }
  catch { return { ok: false, status: 502, error: 'supabase.com did not answer. Try again in a moment.' }; }
  if (r.status === 401 || r.status === 403) return { ok: false, status: 401, error: RAN_OUT };
  if (!r.ok) return { ok: false, status: 502, error: 'supabase.com did not answer. Try again in a moment.' };
  const u = await r.json().catch(() => null) as { email?: string; email_confirmed_at?: string | null; confirmed_at?: string | null; user_metadata?: Record<string, unknown> } | null;
  const email = String(u?.email || '').trim().toLowerCase();
  if (!u || !emailOK(email)) return { ok: false, status: 403, error: 'Your Supabase account has no email we can use. Add one on supabase.com.' };
  if (!u.email_confirmed_at && !u.confirmed_at) return { ok: false, status: 403, error: 'Confirm your email on supabase.com first, then come back.' };
  const m = u.user_metadata || {}, pick = (k: string) => (typeof m[k] === 'string' && (m[k] as string).trim() ? (m[k] as string).trim().slice(0, 60) : null);
  return { ok: true, user: { email, name: pick('full_name') || pick('name') || pick('user_name') } };
}
