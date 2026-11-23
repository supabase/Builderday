/* POST /api/auth/claim { email }: "Registered with a different email?" Sends a six-digit code to that address if a
   place is listed under it; the answer is the same either way (lib/server/claim.ts). Needs a signed-in person. */
import { body, no, offline, ok, str } from '@/lib/server/http';
import { authUser } from '@/lib/server/supabase';
import { ensurePerson, personByAuth } from '@/lib/server/people';
import { claimStart } from '@/lib/server/claim';
import { ipOf } from '@/lib/server/env';
import { emailOK } from '@/lib/forms';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const u = await authUser();
  if (!u) return no('Sign in first, with any email.', 401);
  const email = str((await body(req))?.email, 200);
  if (!emailOK(email)) return no('Check the email. It needs an @ and a domain.');
  const p = (await personByAuth(u.id)) || (await ensurePerson(u.email));
  const r = await claimStart(p, email, ipOf(req));
  return r.ok ? ok({ sent: true, wait: r.wait }) : no(r.error, r.status, r.wait ? { wait: r.wait } : undefined);
}
