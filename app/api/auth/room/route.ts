/* POST /api/auth/room { email, code, city }: the four characters on the screen. For an email on the city's list it
   signs in at once and checks in (which unlocks Submit); any other email is refused in words (rule 7c). */
import { body, no, offline, ok, str } from '@/lib/server/http';
import { roomSignIn } from '@/lib/server/auth';
import { emailOK } from '@/lib/forms';
import { ipOf } from '@/lib/server/env';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const b = await body(req); const email = str(b?.email, 200);
  if (!emailOK(email)) return no('Check the email. It needs an @ and a domain.');
  const r = await roomSignIn(email, str(b?.code, 12), str(b?.city, 40), ipOf(req));
  return r.ok ? ok({ signedIn: true, checkedIn: true }) : no(r.error, r.field === 'email' ? 403 : 401, { field: r.field });
}
