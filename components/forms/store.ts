/* store.ts: the one boundary between the forms and a server. Two drivers with the same methods:
   - the stand-in (the labs, and any page on a site without a backend): localStorage and a pretend round trip. Its
     keys are versioned (hackday:v1:…), so a later shape can move to v2 without reading stale data;
   - live (a real page on a site with the backend configured): the site's /api routes, with the person and their
     votes held in memory after one /api/me on load.
   A page picks the driver through FormsProvider's `live`; the sheets and the pages call `store` either way. */
import { useSyncExternalStore } from 'react';
import { slugOf } from '@/lib/forms';
import { at } from '@/lib/routes';
import * as supa from './supabase';

export type Session = { email: string; handle: string; voter: boolean };
/* what the live driver knows about the person (GET /api/me) */
export type Me = {
  signedIn: true; email: string; name: string | null;
  pass: { city: string; cityName: string; source: string; checkedIn: boolean; editorSeen?: string | null; listedAs?: string | null; start?: string; offset?: number } | null;
  roles: { id: string; role: 'super' | 'host' | 'judge'; city: string | null; budget: number }[];
  entry: (Entry & { no: number; url: string; pictureFrom: string | null; hidden: boolean }) | null;
  votes: Record<string, number[]>;
  judging: Record<string, { budget: number; used: number; per: Record<string, number> }>;
  editor: { url: string } | null;
  open?: boolean;
};
export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string; wait?: number; field?: string };
export type Entry = {
  id: string; handle: string; slug: string; name: string; pitch: string; repo: string; demo: string; video: string;
  city: string; cityName: string; deadline: string; picture: string | null; createdAt: string; updatedAt: string;
};
export type EntryFields = Pick<Entry, 'name' | 'pitch' | 'repo' | 'demo' | 'video' | 'city' | 'cityName' | 'deadline'>;
/* editor: the person's own address for the Builder Day MCP server, once they are signed in on a live site */
export type FormsState = Readonly<{ signedIn: boolean; handle: string | null; email: string | null; voter: boolean; entry: Entry | null; editor: string | null }>;

const PREFIX = 'hackday:v1:';
const LATENCY = 600;   /* a round trip, so busy states show */

export function handleOf(email: string): string { return String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15) || 'builder'; }

function read<T>(k: string, d: T): T { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v) as T; } catch { return d; } }
function write(k: string, v: unknown): boolean { try { if (v == null) localStorage.removeItem(PREFIX + k); else localStorage.setItem(PREFIX + k, JSON.stringify(v)); return true; } catch { return false; } }
function wait<T>(v?: T): Promise<T> { return new Promise((r) => { setTimeout(() => r(v as T), LATENCY); }); }

/* the stand-in keeps a 1280-wide JPEG so it fits in localStorage; a real API uploads the file itself */
function shrinkPicture(file: File): Promise<string | null> {
  return new Promise((res) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const w = Math.min(1280, img.naturalWidth), h = Math.round(w * 9 / 16), c = document.createElement('canvas'), x = c.getContext('2d');
      c.width = w; c.height = h; const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      x?.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

const standIn = {
  /* who is here, or null */
  session(): Session | null { return read<Session | null>('session', null); },
  lastEmail(): string { return read('last-email', ''); },
  sendCode(email: string) { write('last-email', email); write('code', { email, at: Date.now() }); return wait({ ok: true }); },
  codeSent(): { email: string; at: number } | null { return read('code', null); },
  forgetCode() { write('code', null); },
  /* the stand-in accepts any six digits */
  verifyCode(email: string, code: string): Promise<{ ok: boolean; session?: Session }> {
    return wait().then(() => {
      if (!/^\d{6}$/.test(code)) return { ok: false };
      const s = { email, handle: handleOf(email), voter: true };
      write('session', s); write('code', null); return { ok: true, session: s };
    });
  },
  /* the stand-in's Supabase sign-in: a pretend account, signed in at once */
  supabaseIn(acct: supa.Account): Promise<{ ok: boolean; session?: Session; error?: string }> {
    return wait().then(() => { const s = { email: acct.email, handle: handleOf(acct.email), voter: true }; write('session', s); write('out-of', null); return { ok: true, session: s }; });
  },
  signOut() { write('session', null); write('code', null); return Promise.resolve(); },

  /* one entry per person, keyed by handle */
  entryFor(handle: string | null): Entry | null { if (!handle) return null; return read<Record<string, Entry>>('entries', {})[handle] || null; },
  saveEntry(handle: string, fields: EntryFields, file: File | null, keepPicture: boolean, by?: string): Promise<Entry> {
    void by;
    return Promise.all([file ? shrinkPicture(file) : Promise.resolve(null), wait()]).then((r) => {
      const all = read<Record<string, Entry>>('entries', {}), old = all[handle], now = new Date().toISOString();
      const e: Entry = {
        ...fields,
        id: old ? old.id : 'e' + Date.now().toString(36), handle,
        slug: old ? old.slug : slugOf(fields.name) + '-' + handle,
        picture: r[0] || (keepPicture && old ? old.picture : null),
        createdAt: old ? old.createdAt : now, updatedAt: now,
      };
      all[handle] = e;
      if (!write('entries', all)) { e.picture = null; all[handle] = e; write('entries', all); }   /* storage full: keep the entry, drop the picture */
      return e;
    });
  },

  reminders(): Record<string, string> { return read('reminders', {}); },
  remind(email: string, city: string) { const r = store.reminders(); r[city] = email; write('reminders', r); write('last-email', email); return wait(true); },

  /* this visitor's own votes, per city and seed */
  votes(key: string): Record<string, 1> { return read<Record<string, Record<string, 1>>>('votes', {})[key] || {}; },
  setVotes(key: string, v: Record<string, 1>) { const all = read<Record<string, Record<string, 1>>>('votes', {}); all[key] = v; write('votes', all); emit(); },
  /* a judge's votes, per city and seed: several may go on one project (by project id) */
  judged(key: string): Record<string, number> { return read<Record<string, Record<string, number>>>('judged', {})[key] || {}; },
  setJudged(key: string, v: Record<string, number>) { const all = read<Record<string, Record<string, number>>>('judged', {}); all[key] = v; write('judged', all); emit(); },

  me(): Me | null { return null; },
  isLive() { return false; },
  refresh(): Promise<void> { return Promise.resolve(); },
  reset() { const drop: string[] = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(PREFIX) === 0) drop.push(k); } drop.forEach((k) => localStorage.removeItem(k)); } catch { /* storage blocked */ } },
};


/* ---------------- live: the site's routes ---------------- */
let me: Me | null = null, loaded = false, loading: Promise<void> | null = null;
async function call<T>(path: string, method: string, data?: unknown): Promise<Result<T>> {
  try {
    const r = await fetch(at(path), { method, headers: data ? { 'Content-Type': 'application/json' } : undefined, body: data ? JSON.stringify(data) : undefined, credentials: 'same-origin', cache: 'no-store' });
    const j = await r.json().catch(() => ({})) as T & { error?: string; wait?: number; field?: string };
    return r.ok ? { ok: true, data: j } : { ok: false, error: j.error || 'Something went wrong (' + r.status + '). Try again.', wait: j.wait, field: j.field };
  } catch { return { ok: false, error: 'No connection. Check you are online and try again.' }; }
}
async function loadMe(): Promise<void> {
  const r = await call<Me | { signedIn: false }>('/api/me', 'GET');
  if (r.ok) { me = r.data.signedIn ? r.data as Me : null; loaded = true; emit(); }
}
const cityOfKey = (key: string) => key.split(':')[0];
const live = {
  session(): Session | null { return me ? { email: me.email, handle: me.name || '', voter: true } : null; },
  lastEmail(): string { return read('last-email', ''); },
  sendCode(email: string): Promise<Result> {
    write('last-email', email);
    return call('/api/auth/code', 'POST', { email, next: location.pathname }).then((r) => { if (r.ok) write('code', { email, at: Date.now() }); else if (r.wait) write('code', { email, at: Date.now() - (RESEND - r.wait) * 1000 }); return r; });
  },
  codeSent(): { email: string; at: number } | null { return read('code', null); },
  forgetCode() { write('code', null); },
  verifyCode(email: string, code: string): Promise<{ ok: boolean; session?: Session; error?: string }> {
    return call('/api/auth/verify', 'POST', { email, code }).then(async (r) => {
      if (!r.ok) return { ok: false, error: r.error };
      write('code', null); await loadMe(); const s = live.session();
      return s ? { ok: true, session: s } : { ok: false, error: 'Signed in, but the page could not read who you are. Reload the page.' };
    });
  },
  /* the supabase.com login this browser shares: the server checks the token and signs in its email here */
  supabaseIn(acct: supa.Account): Promise<{ ok: boolean; session?: Session; error?: string }> {
    return call('/api/auth/supabase', 'POST', { token: acct.token }).then(async (r) => {
      if (!r.ok) return { ok: false, error: r.error };
      write('via', 'supabase'); write('out-of', null); await loadMe(); const s = live.session();
      return s ? { ok: true, session: s } : { ok: false, error: 'Signed in, but the page could not read who you are. Reload the page.' };
    });
  },
  /* "Add the email you used on Luma": a code to the address on the list, then the place moves to this account */
  claim(email: string): Promise<Result<{ sent: boolean; wait: number }>> { return call('/api/auth/claim', 'POST', { email }); },
  claimVerify(email: string, code: string): Promise<Result<{ claimed: boolean; city: string; cityName: string; replaced: string | null }>> {
    return call<{ claimed: boolean; city: string; cityName: string; replaced: string | null }>('/api/auth/claim/verify', 'POST', { email, code }).then(async (r) => { if (r.ok) await loadMe(); return r; });
  },
  /* signing out here leaves supabase.com signed in, so this browser stops following that login until Sign in is pressed */
  signOut() {
    const was = me?.email || null;
    return call('/api/auth/out', 'POST').then(() => { me = null; write('code', null); write('via', null); if (was) write('out-of', was); emit(); });
  },

  entryFor(handle: string | null): Entry | null { void handle; return me ? me.entry : null; },
  /* the server runs the checks; a refusal comes back as an Error with the field it is about */
  async saveEntry(handle: string, fields: EntryFields, file: File | null, keepPicture: boolean, by?: string): Promise<Entry> {
    void handle;
    const f = new FormData();
    (['name', 'pitch', 'repo', 'demo', 'video'] as const).forEach((k) => f.append(k, fields[k] || ''));
    if (by) f.append('by', by);
    if (keepPicture) f.append('keep', '1');
    if (file) f.append('picture', file);
    let r: Response;
    try { r = await fetch(at('/api/entry'), { method: 'POST', body: f, credentials: 'same-origin' }); } catch { throw Object.assign(new Error('No connection. Check you are online and try again.'), { field: '' }); }
    const j = await r.json().catch(() => ({})) as { entry?: Me['entry']; error?: string; field?: string };
    if (!r.ok || !j.entry) throw Object.assign(new Error(j.error || 'Your entry was not saved. Try again.'), { field: j.field || '' });
    if (me) { me = { ...me, entry: j.entry, name: me.name || by || null }; emit(); }
    return j.entry;
  },
  async deleteEntry(): Promise<Result> {
    const r = await call('/api/entry', 'DELETE');
    if (r.ok && me) { me = { ...me, entry: null }; emit(); }
    return r;
  },

  reminders(): Record<string, string> { return read('reminders', {}); },
  remind(email: string, city: string) {
    return call('/api/remind', 'POST', { email, city }).then((r) => { if (r.ok) { const m = live.reminders(); m[city] = email; write('reminders', m); write('last-email', email); } return r.ok; });
  },

  votes(key: string): Record<string, 1> { const o: Record<string, 1> = {}; (me?.votes[cityOfKey(key)] || []).forEach((n) => { o[n] = 1; }); return o; },
  /* the page hands over the whole set it wants; each change goes to the server, shown at once and undone if refused */
  setVotes(key: string, v: Record<string, 1>) {
    if (!me) return;
    const city = cityOfKey(key), was = new Set(me.votes[city] || []), want = new Set(Object.keys(v).map(Number));
    const changes: [number, boolean][] = [];
    want.forEach((n) => { if (!was.has(n)) changes.push([n, true]); });
    was.forEach((n) => { if (!want.has(n)) changes.push([n, false]); });
    me = { ...me, votes: { ...me.votes, [city]: Array.from(want) } }; emit();
    changes.forEach(([n, on]) => {
      call('/api/vote', 'POST', { city, entry: n, on }).then((r) => {
        if (r.ok || !me) return;
        const now = new Set(me.votes[city] || []); if (on) now.delete(n); else now.add(n);
        me = { ...me, votes: { ...me.votes, [city]: Array.from(now) } }; lastError = r.error; emit();
      });
    });
  },
  judged(key: string): Record<string, number> { return me?.judging[cityOfKey(key)]?.per || me?.judging['*']?.per || {}; },
  setJudged(key: string, v: Record<string, number>) {
    if (!me) return;
    const city = cityOfKey(key), j = me.judging[city] || me.judging['*']; if (!j) return;
    const before = j.per, keys = new Set(Object.keys(before).concat(Object.keys(v)));
    keys.forEach((k) => {
      const d = (v[k] || 0) - (before[k] || 0); if (!d) return;
      call<{ used: number }>('/api/judge', 'POST', { city, entry: Number(k), delta: d }).then((r) => { if (!r.ok) lastError = r.error; loadMe(); });
    });
    me = { ...me, judging: { ...me.judging, [city]: { ...j, per: { ...v }, used: j.used + Object.values(v).reduce((a, n) => a + n, 0) - Object.values(before).reduce((a, n) => a + n, 0) } } }; emit();
  },

  me(): Me | null { return me; },
  isLive() { return true; },
  refresh(): Promise<void> { return loadMe(); },
  reset() { live.signOut(); },
};
const RESEND = 30;
/* the last refusal from a vote or a judge's press, for the page to say */
let lastError = '';
export function takeError(): string { const e = lastError; lastError = ''; return e; }

type Driver = typeof standIn & Partial<Pick<typeof live, 'deleteEntry' | 'claim' | 'claimVerify'>>;
let driver: Driver = standIn;
/* FormsProvider sets the driver as it renders, before any child reads the store */
export function useDriver(on: boolean) {
  const next = on ? live as unknown as Driver : standIn;
  if (driver !== next) { driver = next; cached = null; }
  if (on && !loaded && !loading && typeof window !== 'undefined') loading = loadMe().then(follow).finally(() => { loading = null; });
  if (on && typeof window !== 'undefined' && !following) { following = true; supa.watch(() => { follow(); }); }
  if (on && typeof window !== 'undefined' && !watching) { watching = true; window.addEventListener('focus', backAgain); document.addEventListener('visibilitychange', backAgain); }
}
/* The page follows the supabase.com login (owner, 2026-11-25: signed in there means signed in here):
   - a login there, and nobody (or someone else) signed in here: sign in as it, unless this browser signed out here on
     purpose while that same login was on (out-of), which holds until Sign in is pressed;
   - no login there, and this session came from it: sign out here too.
   A session from the email fallback is left alone when there is no login there. */
let following = false, followRun: Promise<void> | null = null;
export function follow(): Promise<void> {
  if (!liveOn() || !loaded) return Promise.resolve();
  if (followRun) return followRun;
  followRun = (async () => {
    const acct = await supa.current();
    if (acct) {
      if (me && me.email === acct.email) return;
      if (read<string | null>('out-of', null) === acct.email) return;
      await live.supabaseIn(acct);
    } else if (me && read<string | null>('via', null) === 'supabase') {
      await call('/api/auth/out', 'POST'); me = null; write('via', null); emit();
    }
  })().finally(() => { followRun = null; });
  return followRun;
}
/* Sign in pressed: follow the login again */
export function followAgain() { write('out-of', null); }

/* A person with an editor line their editor has not called yet: they add it in another app and come back. Coming back
   (the window's focus, the tab shown again) reads /api/me once more, so "Not connected yet" turns to "Editor connected"
   without a reload. Nobody else is asked again; at most once in two seconds. */
let watching = false, askedAt = 0;
function backAgain() {
  if (document.visibilityState !== 'visible' || !liveOn() || loading || !me?.editor || me.pass?.editorSeen) return;
  const t = Date.now(); if (t - askedAt < 2000) return; askedAt = t;
  loading = loadMe().finally(() => { loading = null; });
}
export function liveOn(): boolean { return driver === (live as unknown as Driver); }
export function meNow(): Me | null { return liveOn() ? me : null; }
/* the first /api/me has answered (always true for the stand-in) */
export function meLoaded(): boolean { return !liveOn() || loaded; }
/* every method goes to the driver in use */
type Store = Driver & { deleteEntry: typeof live.deleteEntry; claim: typeof live.claim; claimVerify: typeof live.claimVerify };
export const store: Store = new Proxy({} as Store, {
  get: (_t, k: string) => { const d = driver as unknown as Record<string, unknown>; const v = d[k]; return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(d) : v; },
});

/* ---------------- the state the pages read, as an external store ---------------- */
let cached: FormsState | null = null;
const subs = new Set<() => void>();
function snapshot(): FormsState {
  if (cached) return cached;
  const s = store.session();
  cached = Object.freeze({ signedIn: !!s, handle: s ? s.handle : null, email: s ? s.email : null, voter: !!(s && s.voter), entry: s ? store.entryFor(s.handle) : null, editor: s ? store.me()?.editor?.url ?? null : null });
  return cached;
}
/* after any write the sheets make: everyone reading the state renders again */
export function emit() { cached = null; voteCache.clear(); judgedCache.clear(); subs.forEach((fn) => fn()); }
let listening = false;
function onStorage(e: StorageEvent) { if (e.key && e.key.indexOf(PREFIX) === 0) emit(); }
function subscribe(fn: () => void) {
  subs.add(fn);
  /* one storage listener for the whole page, however many readers */
  if (!listening) { listening = true; window.addEventListener('storage', onStorage); }
  return () => { subs.delete(fn); if (!subs.size && listening) { listening = false; window.removeEventListener('storage', onStorage); } };
}
const SERVER: FormsState = Object.freeze({ signedIn: false, handle: null, email: null, voter: false, entry: null, editor: null });
/* resolves once /api/me has answered (at once without the backend), or after `ms` if it never does: a press on
   Sign in made before then waits, so a signed-in person is not shown the sign-in sheet */
export function meKnown(ms = 3000): Promise<void> {
  if (meLoaded()) return Promise.resolve();
  return new Promise((done) => {
    const end = () => { window.clearTimeout(t); off(); done(); };
    const t = window.setTimeout(end, ms), off = subscribe(() => { if (meLoaded()) end(); });
  });
}
/* the person's sign-in and entry; nothing on the server and in the first render, so hydration matches */
export function useFormsState(): FormsState { return useSyncExternalStore(subscribe, snapshot, () => SERVER); }
export function formsState(): FormsState { return snapshot(); }

/* this visitor's votes for one city and seed ('berlin:17'); none on the server and in the first render */
const voteCache = new Map<string, Readonly<Record<string, 1>>>();
const NO_VOTES: Readonly<Record<string, 1>> = Object.freeze({});
function votesSnapshot(key: string) { let v = voteCache.get(key); if (!v) { v = Object.freeze(store.votes(key)); voteCache.set(key, v); } return v; }
export function useVotes(key: string): Readonly<Record<string, 1>> { return useSyncExternalStore(subscribe, () => votesSnapshot(key), () => NO_VOTES); }
/* a judge's votes for one city and seed; none on the server and in the first render */
const judgedCache = new Map<string, Readonly<Record<string, number>>>();
const NO_JUDGED: Readonly<Record<string, number>> = Object.freeze({});
function judgedSnapshot(key: string) { let v = judgedCache.get(key); if (!v) { v = Object.freeze(store.judged(key)); judgedCache.set(key, v); } return v; }
export function useJudged(key: string, on: boolean): Readonly<Record<string, number>> { return useSyncExternalStore(subscribe, () => (on ? judgedSnapshot(key) : NO_JUDGED), () => NO_JUDGED); }
