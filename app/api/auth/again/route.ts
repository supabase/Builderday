/* POST /api/auth/again { email }: send my link again. The same answer whether or not the address is on a list. */
import { body, no, offline, ok, str } from '@/lib/server/http';
import { sendLinkAgain } from '@/lib/server/auth';
import { emailOK } from '@/lib/forms';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const b = await body(req); const email = str(b?.email, 200);
  if (!emailOK(email)) return no('Check the email. It needs an @ and a domain.');
  await sendLinkAgain(email, req);
  return ok({ sent: true });
}
