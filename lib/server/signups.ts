/* signups.ts: each city's state for the wheel, from its Luma event, at most five minutes old: Sold out while its
   registration is closed (Luma shows it so), Waiting list when it is full, Filling up under 15% of the spots left, else
   Open. Without the Luma key, or when Luma does not answer, Open. */
import { unstable_cache } from 'next/cache';
import type { WheelStatus } from '@/components/wheel/click';
import { CITIES } from '@/lib/day-data';
import { lumaId } from '@/lib/luma';

type LumaEvent = { registration_open?: boolean; max_capacity?: number | null; spots_remaining?: number | null };
async function lumaStatus(eventId: string, key: string): Promise<WheelStatus> {
  try {
    const r = await fetch('https://public-api.luma.com/v1/event/get?api_id=' + encodeURIComponent(eventId), { headers: { accept: 'application/json', 'x-luma-api-key': key }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return 'open';
    const e = ((await r.json()) as { event?: LumaEvent }).event || {};
    if (e.registration_open === false) return 'sold';
    const cap = e.max_capacity ?? null, left = e.spots_remaining ?? null;
    if (cap && left != null) { if (left <= 0) return 'full'; if (left / cap < 0.15) return 'nearing'; }
    return 'open';
  } catch { return 'open'; }
}

async function read(): Promise<Record<string, WheelStatus> | null> {
  const key = process.env.LUMA_API_KEY;
  if (!key) return null;
  const out: Record<string, WheelStatus> = {};
  await Promise.all(CITIES.map(async (c) => { const id = lumaId(c.id); out[c.id] = id ? await lumaStatus(id, key) : 'open'; }));
  return out;
}

export const signups = unstable_cache(async () => { try { return await read(); } catch { return null; } }, ['luma-status'], { revalidate: 300 });
