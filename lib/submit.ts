/* submit.ts: the one way an entry gets in, for both doors (the editor through the Builder Day server, and the form on a
   city's page). verify() runs the checks in lib/hackday-server.ts (CHECKS) and says, for each one that blocks, how to
   fix it; submit() verifies, then saves.

   Today there is no server: the form calls submit() with the browser's stand-in store as its saver, and only the
   checks that need no outside reading run here (closed, one entry, the repository's address). The checks that read
   GitHub (can it be read, when it was made, fork, pushes, dates) and the demo fetch run on the server once it exists;
   until then they are "not checked" in the verdict, never passed. When the server opens, submit() becomes one call to
   it, with the same shape in and out, and the form does not change. Pure. */

import { CHECKS, type Check } from './hackday-server';
import { githubOK, atCity } from './forms';

export type Draft = { name: string; pitch: string; repo: string; demo: string; video: string; city: string; cityName: string; deadline: string };
/* what the outside world says about the repository, when something has read it (the server); absent today */
export type RepoFacts = { readable: boolean; createdAt?: string; fork?: boolean; dayStart?: string };
export type Refusal = { check: string; say: string };
export type Verdict = {
  ok: boolean;
  /* blocks: the entry does not go in, and each says how to fix it */
  refused: Refusal[];
  /* flags: for the hosts and judges, never shown on the public page */
  flags: string[];
  /* this entry replaces the person's earlier one */
  replaces: boolean;
  /* the checks that were not run here (they need the server) */
  later: string[];
};

const byId = (id: string): Check => CHECKS.find((c) => c.id === id)!;
const say = (id: string, v: Record<string, string>) => byId(id).say?.(v) ?? byId(id).what;

/* noRepo: the event does not ask for a repository and none was given, so there is nothing to check */
export function verify(d: Draft, ctx: { now: Date; hasEntry: boolean; off?: number; repo?: RepoFacts; noRepo?: boolean }): Verdict {
  const refused: Refusal[] = [], flags: string[] = [], later: string[] = [];
  /* sent after building closed in that city */
  if (d.deadline && ctx.now.getTime() > new Date(d.deadline).getTime()) refused.push({ check: 'closed', say: say('closed', { city: d.cityName, time: atCity(d.deadline, ctx.off) }) });
  /* the repository: its address here, the rest from what the server read */
  const r = ctx.noRepo ? undefined : ctx.repo;
  if (ctx.noRepo) return { ok: refused.length === 0, refused, flags, replaces: ctx.hasEntry, later };
  if (!githubOK(d.repo) || (r && !r.readable)) refused.push({ check: 'repo', say: say('repo', { repo: d.repo }) });
  if (!r) later.push('repo', 'age', 'fork', 'push', 'dates', 'demo', 'supabase');
  else {
    if (r.createdAt && r.dayStart && new Date(r.createdAt).getTime() < new Date(r.dayStart).getTime()) refused.push({ check: 'age', say: say('age', { made: r.createdAt.slice(0, 10) }) });
    if (r.fork) flags.push('fork');
  }
  return { ok: refused.length === 0, refused, flags, replaces: ctx.hasEntry, later };
}

/* verify, then save; save is the stand-in store today and the server's own write later */
export async function submit<E>(d: Draft, ctx: Parameters<typeof verify>[1], save: (d: Draft) => Promise<E>): Promise<{ verdict: Verdict; entry: E | null }> {
  const verdict = verify(d, ctx);
  if (!verdict.ok) return { verdict, entry: null };
  return { verdict, entry: await save(d) };
}
