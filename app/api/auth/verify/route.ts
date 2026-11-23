/* POST /api/auth/verify { email, code }: the six digits; on a match the session is in the cookies */
import { body, no, offline, ok, str } from '@/lib/server/http';
import { verifyCode } from '@/lib/server/auth';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const b = await body(req);
  const r = await verifyCode(str(b?.email, 200), str(b?.code, 12));
  return r.ok ? ok({ signedIn: true }) : no(r.error, 401);
}
