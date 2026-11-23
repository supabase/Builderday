/* GET /api/city/<id>/snapshot: the city's times, its visible entries with their counts, and the vote steps for the
   chart, as the public may see them (frozen while the city's counts are hidden). Cached at the edge for two seconds,
   then served stale while a fresh one is fetched; not cached near a freeze or a close. */
import { cacheFor, publicCity } from '@/lib/server/snapshot';
import { no, offline } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = offline(); if (off) return off;
  const { id } = await params, ms = Date.now();
  const snap = await publicCity(id, ms);
  if (!snap) return no('No such city, or the data cannot be read right now.', 404);
  return Response.json(snap, { headers: { 'Cache-Control': cacheFor([snap.city], ms) } });
}
