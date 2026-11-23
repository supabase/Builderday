/* GET /api/me: the person in this browser, or { signedIn: false }. Also refreshes the session cookies, so a page that
   asks once on load keeps the person signed in. Never cached. */
import { offline, ok } from '@/lib/server/http';
import { authUser } from '@/lib/server/supabase';
import { personByAuth, ensurePerson, bootstrapSuper } from '@/lib/server/people';
import { meOf } from '@/lib/server/me';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const off = offline(); if (off) return off;
  const u = await authUser();
  if (!u) return ok({ signedIn: false }, { headers: { 'Cache-Control': 'no-store' } });
  const p = (await personByAuth(u.id)) || (await ensurePerson(u.email));
  await bootstrapSuper(p);
  return ok(await meOf(p, req), { headers: { 'Cache-Control': 'no-store' } });
}
