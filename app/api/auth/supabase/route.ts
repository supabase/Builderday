/* POST /api/auth/supabase { token }: sign in with the supabase.com login this browser shares with supabase.com.
   The token is checked with supabase.com and then dropped; our own session goes in the cookies. */
import { body, no, offline, ok, str } from '@/lib/server/http';
import { supabaseSignIn } from '@/lib/server/auth';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const b = await body(req);
  const r = await supabaseSignIn(str(b?.token, 8192));
  return r.ok ? ok({ signedIn: true }) : no(r.error, r.status);
}
