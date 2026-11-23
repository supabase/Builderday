/* luma.ts (server): Luma's API, only when LUMA_API_KEY is set. Two calls: every approved guest of an event (cursor
   paging), and one guest by email. Five seconds each. The current paths (docs.luma.com/reference, read 2026-11-18:
   /v1/events/guests/list?event_id=, /v1/events/guests/get?event_id=&id=<email>) are tried first; the older ones
   (/v1/event/get-guests, /v1/event/get-guest, which Supabase's own hackathon platform calls) answer when the new path
   says 404. A Luma key belongs to one Luma calendar, so the ten city events must be on it. Without the key nothing
   here runs: the CSV import and the room code carry everything. The key never leaves the server. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Guest } from '@/lib/luma';

/* LUMA_API_URL may point at a stand-in on this machine, for tests; any other address is ignored */
const base = () => { const u = (process.env.LUMA_API_URL || '').replace(/\/+$/, ''); return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u + '/') ? u : 'https://public-api.luma.com/v1'; };
const T = 5000;

export const lumaOn = () => !!process.env.LUMA_API_KEY;

export type LumaGuest = { id?: string; api_id?: string; user_email?: string; email?: string; user_name?: string | null; name?: string | null; approval_status?: string; registered_at?: string | null };

async function get(path: string, q: Record<string, string>): Promise<Response> {
  return fetch(base() + path + '?' + new URLSearchParams(q).toString(), {
    headers: { accept: 'application/json', 'x-luma-api-key': process.env.LUMA_API_KEY || '' },
    signal: AbortSignal.timeout(T),
  });
}
export const emailOf = (g: LumaGuest) => String(g.user_email || g.email || '').trim().toLowerCase();
export const nameOf = (g: LumaGuest) => { const n = String(g.user_name || g.name || '').trim(); return n ? n.slice(0, 60) : null; };
const guestOf = (g: LumaGuest): Guest => ({ email: emailOf(g), name: nameOf(g), id: g.id || g.api_id || null, registeredAt: g.registered_at || null });
const fail = (r: Response) => new Error(r.status === 401 || r.status === 403 ? 'Luma refused the key.' : r.status === 404 ? 'Luma does not know that event.' : r.status === 429 ? 'Luma asks us to wait a minute.' : 'Luma answered ' + r.status + '.');

/* every approved guest of the event, as the import's guests; throws with plain words when Luma does not answer */
export async function approvedGuests(eventId: string): Promise<Guest[]> {
  const out: Guest[] = [];
  const page = async (fresh: boolean, cursor: string) => fresh
    ? get('/events/guests/list', { event_id: eventId, approval_status: 'approved', ...(cursor ? { pagination_cursor: cursor } : {}) })
    : get('/event/get-guests', { event_api_id: eventId, approval_status: 'approved', ...(cursor ? { cursor } : {}) });
  let fresh = true, cursor = '';
  for (let n = 0; n < 100; n++) {
    let r = await page(fresh, cursor);
    if (r.status === 404 && fresh && n === 0) { fresh = false; r = await page(false, ''); }
    if (!r.ok) throw fail(r);
    const j = await r.json() as { entries?: (LumaGuest & { guest?: LumaGuest })[]; has_more?: boolean; next_cursor?: string };
    (j.entries || []).forEach((e) => { const g = guestOf(e.guest || e); if (g.email) out.push(g); });
    if (!j.has_more || !j.next_cursor) break;
    cursor = j.next_cursor;
  }
  return out;
}

/* one email on the event: 'approved' with the name Luma has, 'other' (waitlist, pending, declined), 'none', or
   'unknown' when Luma could not be asked. The door treats anything but 'approved' as not listed, never as a block. */
export async function guestStatus(eventId: string, email: string): Promise<{ status: 'approved' | 'other' | 'none' | 'unknown'; name: string | null; raw?: string; id?: string | null; registeredAt?: string | null }> {
  const id = email.trim().toLowerCase();
  try {
    let r = await get('/events/guests/get', { event_id: eventId, id });
    if (r.status === 404) r = await get('/event/get-guest', { event_api_id: eventId, id });
    if (r.status === 404) return { status: 'none', name: null };
    if (!r.ok) return { status: 'unknown', name: null };
    const j = await r.json() as LumaGuest & { guest?: LumaGuest };
    const g = j.guest || j;
    return { status: g.approval_status === 'approved' ? 'approved' : 'other', name: nameOf(g), raw: g.approval_status, id: g.id || g.api_id || null, registeredAt: g.registered_at || null };
  } catch {
    return { status: 'unknown', name: null };
  }
}

/* Luma's webhook signature: "t=<unix seconds>,v1=<hex HMAC-SHA256 of '<t>.<raw body>'>", the secret used as given;
   a delivery more than five minutes from now either way is refused as old */
export function verifyHook(secret: string, header: string | null, raw: string, now = Date.now()): 'ok' | 'bad' | 'old' {
  const parts = Object.fromEntries(String(header || '').split(',').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]; }));
  const t = Number(parts.t), v1 = String(parts.v1 || '');
  if (!Number.isFinite(t) || !/^[0-9a-f]{64}$/i.test(v1)) return 'bad';
  const want = createHmac('sha256', secret).update(parts.t + '.' + raw).digest();
  const got = Buffer.from(v1, 'hex');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return 'bad';
  if (Math.abs(now / 1000 - t) > 300) return 'old';
  return 'ok';
}

/* The calendar's events from a date on (newest last), for picking a place: id, name, start, time zone, address and the
   city Luma knows (often empty). Up to five hundred; a minute's cache. */
export type LumaEvent = { id: string; name: string; start: string; zone: string; url: string; city: string | null; address: string | null; visibility: string; open: boolean };
let cal: { at: number; after: string; list: LumaEvent[] } | null = null;
export async function calendarEvents(after: string): Promise<LumaEvent[]> {
  if (cal && cal.after === after && Date.now() - cal.at < 60_000) return cal.list;
  type Raw = { api_id?: string; name?: string; start_at?: string; timezone?: string; url?: string; visibility?: string; registration_open?: boolean; geo_address_json?: { city?: string | null; address?: string | null; full_address?: string | null } | null };
  const out: LumaEvent[] = [];
  let cursor = '';
  for (let n = 0; n < 10; n++) {
    const r = await get('/calendar/list-events', { after, pagination_limit: '50', ...(cursor ? { pagination_cursor: cursor } : {}) });
    if (!r.ok) throw fail(r);
    const j = await r.json() as { entries?: (Raw & { event?: Raw })[]; has_more?: boolean; next_cursor?: string };
    (j.entries || []).forEach((x) => {
      const e = x.event || x;
      if (!e.api_id || !e.start_at) return;
      const g = e.geo_address_json || null;
      out.push({ id: e.api_id, name: String(e.name || ''), start: e.start_at, zone: e.timezone || 'UTC', url: e.url || '', city: g?.city || null, address: g?.full_address || g?.address || null, visibility: e.visibility || '', open: !!e.registration_open });
    });
    if (!j.has_more || !j.next_cursor) break;
    cursor = j.next_cursor;
  }
  out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  cal = { at: Date.now(), after, list: out };
  return out;
}
