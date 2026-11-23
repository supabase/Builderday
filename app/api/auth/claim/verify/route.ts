/* POST /api/auth/claim/verify { email, code }: the code sent to the listed address; right, the place moves to the
   signed-in account and keeps its listed address and its check-in (lib/server/claim.ts) */
import { body, no, offline, ok, str } from '@/lib/server/http';
import { authUser } from '@/lib/server/supabase';
import { ensurePerson, personByAuth } from '@/lib/server/people';
import { claimVerify } from '@/lib/server/claim';
import { forget } from '@/lib/server/snapshot';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const u = await authUser();
  if (!u) return no('Sign in first, with any email.', 401);
  const b = await body(req);
  const p = (await personByAuth(u.id)) || (await ensurePerson(u.email));
  const r = await claimVerify(p, str(b?.email, 200), str(b?.code, 12));
  if (!r.ok) return no(r.error, r.status, r.field ? { field: r.field } : undefined);
  forget(r.city);
  return ok({ claimed: true, city: r.city, cityName: r.cityName, replaced: r.replaced });
}
