/* supabase.ts: the two ways the server talks to the database.
   - admin(): the service role. Bypasses row security, so every caller checks the role first (lib/server/roles.ts).
   - asUser(): the signed-in person, from the session cookies. Database functions (cast_vote, judge_vote, the clock)
     run as them, so the rules in the database hold whatever the route does.
   Sessions are Supabase Auth cookies, set and refreshed by @supabase/ssr in route handlers. */
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { need } from './env';

let adminClient: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (!adminClient) adminClient = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/* a client acting as whoever's cookies came with the request; in a route handler it can set refreshed cookies */
export async function asUser(): Promise<SupabaseClient> {
  const jar = await cookies();
  return createServerClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* a server component cannot set cookies; the next route call will */ } },
    },
  });
}

/* the Auth user behind the cookies, checked with the Auth server (never trusted from the cookie alone) */
export async function authUser(): Promise<{ id: string; email: string } | null> {
  const sb = await asUser();
  const { data } = await sb.auth.getUser();
  return data.user && data.user.email ? { id: data.user.id, email: data.user.email.toLowerCase() } : null;
}
