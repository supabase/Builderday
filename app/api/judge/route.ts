/* POST /api/judge { city, entry (its number), delta }: a judge's press, several votes at once or some taken back.
   The budget and the rest are the database's (judge_vote). */
import { body, no, offline, ok, said, str } from '@/lib/server/http';
import { asUser } from '@/lib/server/supabase';
import { entryIdOf } from '@/lib/server/entry-id';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const b = await body(req); const city = str(b?.city, 40), n = Number(b?.entry), delta = Math.trunc(Number(b?.delta));
  const id = await entryIdOf(city, n);
  if (!id) return no('That project is not in the list.', 404);
  const sb = await asUser();
  /* the session from the cookie, read here without asking the auth server: the database checks the token's signature
     and who it belongs to (public.me()) inside the vote function, so a second check per press only added a round
     trip, and under load a busy auth server turned it into a false "Sign in" (load.mjs) */
  if (!(await sb.auth.getSession()).data.session) return no('Sign in to vote.', 401);
  const r = await sb.rpc('judge_vote', { entry_id: id, delta });
  if (r.error) return no(said(r.error), r.error.code === '28000' || /^PGRST30/.test(r.error.code || '') ? 401 : r.error.code === '42501' ? 403 : 409);
  const m = await sb.rpc('my_judging', { c: city });
  return ok({ votes: (r.data as { votes: number }).votes, judging: Array.isArray(m.data) ? m.data[0] : m.data });
}
