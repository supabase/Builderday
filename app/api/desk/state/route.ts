/* GET /api/desk/state?event=<id>&city=<id>: what the desk shows, by role: the events, one event, or one of its
   places. Never cached. */
import { no, offline, ok } from '@/lib/server/http';
import { deskUser } from '@/lib/server/roles';
import { deskState } from '@/lib/server/desk';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const off = offline(); if (off) return off;
  const d = await deskUser();
  if ('error' in d) return no(d.error, d.status);
  const q = new URL(req.url).searchParams;
  return ok(await deskState(d, { event: q.get('event'), city: q.get('city') }), { headers: { 'Cache-Control': 'no-store' } });
}
