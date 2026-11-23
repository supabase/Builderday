/* POST /api/checkin { code }: the signed-in person types the code on the screen in their city's room. On their
   city's list, that checks them in for the day, which unlocks Submit (rule 7c). */
import { body, no, offline, ok, str } from '@/lib/server/http';
import { authUser } from '@/lib/server/supabase';
import { personByAuth } from '@/lib/server/people';
import { checkInWithCode } from '@/lib/server/room';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const u = await authUser(); const p = u ? await personByAuth(u.id) : null;
  if (!p) return no('Sign in first.', 401);
  const b = await body(req);
  const r = await checkInWithCode(p, str(b?.code, 12));
  return r.ok ? ok({ checkedIn: true }) : no(r.error, r.field === 'list' ? 403 : 401, { field: r.field });
}
