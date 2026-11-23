/* POST /api/vote { city, entry (its number), on }: a public vote, or taking it back. The rules are the database's
   (cast_vote, take_back_vote): one per project per email, never your own, only while voting is open. While the city's
   counts are hidden the answer carries no count. */
import { body, no, offline, ok, said, str } from '@/lib/server/http';
import { asUser } from '@/lib/server/supabase';
import { entryIdOf } from '@/lib/server/entry-id';
import { ipOf } from '@/lib/server/env';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const b = await body(req); const city = str(b?.city, 40), n = Number(b?.entry), on = b?.on !== false;
  const id = await entryIdOf(city, n);
  if (!id) return no('That project is not in the list.', 404);
  const sb = await asUser();
  /* the session from the cookie, read here without asking the auth server: the database checks the token's signature
     and who it belongs to (public.me()) inside the vote function, so a second check per press only added a round
     trip, and under load a busy auth server turned it into a false "Sign in" (load.mjs) */
  if (!(await sb.auth.getSession()).data.session) return no('Sign in to vote.', 401);
  const r = on ? await sb.rpc('cast_vote', { entry_id: id, from_ip: ipOf(req) }) : await sb.rpc('take_back_vote', { entry_id: id });
  if (r.error) return no(said(r.error), r.error.code === '28000' || /^PGRST30/.test(r.error.code || '') ? 401 : 409);
  /* the count after the press; null while the city's counts are hidden (the database leaves it out) */
  return ok({ votes: (r.data as { votes: number | null }).votes ?? null });
}
