/* GET /api/day/snapshot: the cities' snapshots in one answer, for the home's rows and the other cities on a city page,
   as the public may see them (frozen where a city's counts are hidden). Without the vote steps (a city's own snapshot
   has them), so it stays small. Cached like a city's. */
import { cacheFor, publicDay } from '@/lib/server/snapshot';
import { no, offline } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const off = offline(); if (off) return off;
  const ms = Date.now(), snap = await publicDay(ms);
  if (!snap) return no('The data cannot be read right now.', 503);
  return Response.json(snap, { headers: { 'Cache-Control': cacheFor(snap.cities.map((c) => c.city), ms) } });
}
