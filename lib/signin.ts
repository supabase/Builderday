/* signin.ts: how people sign in, shared by the browser and the server.
   Builder Day signs people in with their supabase.com account. supabase.com and its dashboard keep that login in the
   browser's local storage on supabase.com (key below, the same as Supabase's own packages/common/gotrue.ts), so a page
   served from supabase.com/builderday reads it and a person already signed in there is signed in here too.
   - SIGNIN_HOSTS: where that shared login exists (supabase.com once it serves /builderday). Anywhere else the sheet
     says so, unless one of the two switches below is on.
   - Email fallback (NEXT_PUBLIC_EMAIL_SIGNIN=on, and EMAIL_SIGNIN=on on the server): the old email and six-digit code,
     only for an emergency, such as the address on supabase.com not being ready on the day.
   - Stand-in (NEXT_PUBLIC_FAKE_SUPABASE=1, and HACKDAY_FAKE_SUPABASE=1 on the server, never in production): a pretend
     Supabase account for the dev server, typed as an email. */

export const PLATFORM = {
  auth: process.env.NEXT_PUBLIC_SUPABASE_PLATFORM_AUTH || 'https://auth.supabase.io/auth/v1',
  key: 'supabase.dashboard.auth.token',
  signIn: 'https://supabase.com/dashboard/sign-in',
  signUp: 'https://supabase.com/dashboard/sign-up',
};

export const SIGNIN_HOSTS = (process.env.NEXT_PUBLIC_SIGNIN_HOSTS || 'supabase.com,www.supabase.com').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
export const EMAIL_FALLBACK = process.env.NEXT_PUBLIC_EMAIL_SIGNIN === 'on';
export const FAKE_SUPABASE = process.env.NEXT_PUBLIC_FAKE_SUPABASE === '1' && process.env.NODE_ENV !== 'production';

/* a stand-in token carries the email it pretends to be */
export const FAKE_PREFIX = 'fake.';

/* the words, in one place */
export const SIGNIN_WITH = 'Sign in with Supabase';
export const SIGNIN_WHY = 'Builder Day uses your supabase.com account. No password to make here.';
export const SIGNIN_ELSEWHERE = 'Signing in works on supabase.com/builderday, with your Supabase account.';
