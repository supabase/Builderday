/* signups.ts: each city's sign-up facts for the preview's board and the wheel, at most five minutes old.
   - people: the places on the city's list in our database (the Luma webhook, the desk's Sync and the hosts fill it;
     a place goes when Luma says cancelled or declined).
   - status, from the city's Luma event: Opens soon while its registration is closed, Waiting list when it is full,
     Filling up under 15% of the spots left, else Open. Without the Luma key, or when Luma does not answer, Open. */
import { unstable_cache } from 'next/cache';
import type { WheelStatus } from '@/components/wheel/click';
import { EVENT } from '@/lib/day-data';
import { admin } from './supabase';
import { lumaOn } from './luma';

export type Signup = { people: number; status: WheelStatus };

type LumaEvent = { registration_open?: boolean; max_capacity?: number | null; spots_remaining?: number | null; waitlist_status?: string };
async function lumaStatus(eventId: string): Promise<WheelStatus> {
  try {
    const r = await fetch('https://public-api.luma.com/v1/event/get?api_id=' + encodeURIComponent(eventId), { headers: { accept: 'application/json', 'x-luma-api-key': process.env.LUMA_API_KEY || '' }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return 'open';
    const e = ((await r.json()) as { event?: LumaEvent }).event || {};
    if (e.registration_open === false) return 'soon';
    const cap = e.max_capacity ?? null, left = e.spots_remaining ?? null;
    if (cap && left != null) { if (left <= 0) return 'full'; if (left / cap < 0.15) return 'nearing'; }
    return 'open';
  } catch { return 'open'; }
}

async function read(): Promise<Record<string, Signup>> {
  const db = admin();
  const { data: cities, error: cityError } = await db.from('cities').select('id, luma_event_id').eq('event', EVENT.id);
  if (cityError) throw new Error(cityError.message);
  /* one exact count per city, in parallel: no rows come back, so it holds past the API's 1000-row page */
  const out: Record<string, Signup> = {};
  await Promise.all((cities || []).map(async (c: { id: string; luma_event_id: string | null }) => {
    const [{ count, error }, status] = await Promise.all([
      db.from('passes').select('id', { count: 'exact', head: true }).eq('event', EVENT.id).eq('city', c.id),
      lumaOn() && c.luma_event_id ? lumaStatus(c.luma_event_id) : Promise.resolve<WheelStatus>('open'),
    ]);
    if (error) throw new Error(error.message);
    out[c.id] = { people: count || 0, status };
  }));
  return out;
}

export const signups = unstable_cache(async () => { try { return await read(); } catch { return null; } }, ['signups'], { revalidate: 300 });
