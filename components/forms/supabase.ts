'use client';
/* supabase.ts (browser): the supabase.com login this page shares with supabase.com and its dashboard.
   On supabase.com (lib/signin.ts, SIGNIN_HOSTS) it runs the same auth client as Supabase's own pages: the same auth
   server, storage key and lock, so a token refresh here and one in a dashboard tab never collide. It only reads the
   session; signing in and out of supabase.com happens on supabase.com. Elsewhere there is no shared login, except the
   stand-in on a dev server (FAKE_SUPABASE). */
import { AuthClient, navigatorLock, type AuthChangeEvent } from '@supabase/supabase-js';
import { FAKE_PREFIX, FAKE_SUPABASE, PLATFORM, SIGNIN_HOSTS } from '@/lib/signin';

export type Account = { email: string; token: string };
export type Mode = 'shared' | 'fake' | 'away';

/* where this page is: on supabase.com, on a dev server with the stand-in, or somewhere the login cannot reach */
export function mode(): Mode {
  if (typeof window === 'undefined') return 'away';
  if (SIGNIN_HOSTS.indexOf(location.hostname.toLowerCase()) >= 0) return 'shared';
  return FAKE_SUPABASE ? 'fake' : 'away';
}

type Client = InstanceType<typeof AuthClient>;
let client: Client | null = null;
function auth(): Client {
  if (client) return client;
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { storage = undefined; }
  client = new AuthClient({
    url: PLATFORM.auth, storageKey: PLATFORM.key, detectSessionInUrl: false, autoRefreshToken: true, persistSession: true,
    lock: typeof navigator !== 'undefined' && navigator.locks ? navigatorLock : undefined,
    ...(storage ? { storage, userStorage: storage } : {}),
  });
  return client;
}

/* the stand-in keeps its pretend account apart from the real key */
const FAKE_KEY = 'hackday:v1:fake-supabase';
const FAKE_EVENT = 'hackday-fake-supabase';
function fakeRead(): string | null { try { const v = localStorage.getItem(FAKE_KEY); return v ? String(JSON.parse(v)) : null; } catch { return null; } }
export function fakeSignIn(email: string) { try { localStorage.setItem(FAKE_KEY, JSON.stringify(email.trim().toLowerCase())); } catch { /* storage blocked */ } window.dispatchEvent(new Event(FAKE_EVENT)); }

/* the account signed in on supabase.com right now, or null */
export async function current(): Promise<Account | null> {
  const m = mode();
  if (m === 'fake') { const e = fakeRead(); return e ? { email: e, token: FAKE_PREFIX + e } : null; }
  if (m !== 'shared') return null;
  try {
    const { data } = await auth().getSession();
    const s = data.session, email = s?.user?.email;
    return s?.access_token && email ? { email: email.toLowerCase(), token: s.access_token } : null;
  } catch { return null; }
}

/* calls fn when the login changes here or in another tab (a sign-in on supabase.com, a sign-out there) */
export function watch(fn: () => void): () => void {
  const m = mode();
  if (m === 'away') return () => {};
  let t = 0;
  const later = () => { window.clearTimeout(t); t = window.setTimeout(fn, 50); };
  if (m === 'fake') {
    const onStore = (e: StorageEvent) => { if (e.key === FAKE_KEY) later(); };
    window.addEventListener(FAKE_EVENT, later); window.addEventListener('storage', onStore);
    return () => { window.removeEventListener(FAKE_EVENT, later); window.removeEventListener('storage', onStore); };
  }
  /* the auth client hears the dashboard's tabs on its broadcast channel; the storage event catches the rest. The
     callback must not call the client itself (it holds the lock), so it only schedules fn. */
  const { data } = auth().onAuthStateChange((ev: AuthChangeEvent) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'TOKEN_REFRESHED' || ev === 'USER_UPDATED') later(); });
  const onStore = (e: StorageEvent) => { if (e.key === PLATFORM.key || e.key === PLATFORM.key + '-user') later(); };
  window.addEventListener('storage', onStore);
  return () => { data.subscription.unsubscribe(); window.removeEventListener('storage', onStore); };
}

/* supabase.com's own sign-in or sign-up, in a new tab: it cannot send people back here, so this page waits for the
   login to appear (watch) and carries on by itself */
export function openSupabase(kind: 'in' | 'up') {
  window.open(kind === 'up' ? PLATFORM.signUp : PLATFORM.signIn, '_blank', 'noopener');
}
