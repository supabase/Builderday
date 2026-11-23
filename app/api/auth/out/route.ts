/* POST /api/auth/out: sign out this browser ("Not you? Sign out") */
import { offline, ok } from '@/lib/server/http';
import { cookies } from 'next/headers';
import { asUser } from '@/lib/server/supabase';
import { DESK_COOKIE } from '@/lib/server/keys';

export async function POST() {
  const off = offline(); if (off) return off;
  const sb = await asUser();
  await sb.auth.signOut({ scope: 'local' });
  (await cookies()).delete(DESK_COOKIE);
  return ok({ signedOut: true });
}
