/* POST /api/auth/code { email, next? }: email a six-digit code (and a link that does the same) */
import { body, no, offline, ok, str } from '@/lib/server/http';
import { sendCode } from '@/lib/server/auth';
import { emailOK } from '@/lib/forms';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const b = await body(req); const email = str(b?.email, 200), next = str(b?.next, 200);
  if (!emailOK(email)) return no('Check the email. It needs an @ and a domain.');
  const r = await sendCode(email, req, next.startsWith('/') ? next : undefined);
  return r.ok ? ok({ sent: true, wait: r.wait }) : no(r.error, r.wait ? 429 : 502, { wait: r.wait });
}
