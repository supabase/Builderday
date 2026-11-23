/* POST /api/team { action: 'make' | 'join' | 'leave', code? }: make a team, join one by its code, or leave yours.
   Answers { team } (null after leaving). The rules are the database's (lib/server/teams.ts). */
import { body, no, offline, ok, str } from '@/lib/server/http';
import { authUser } from '@/lib/server/supabase';
import { ensurePerson, personByAuth } from '@/lib/server/people';
import { joinTeam, leaveTeam, makeTeam } from '@/lib/server/teams';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const u = await authUser();
  const p = u ? (await personByAuth(u.id)) || (await ensurePerson(u.email)) : null;
  if (!p) return no('Sign in first.', 401);
  const b = await body(req); if (!b) return no('Send the team action as JSON.');
  const action = str(b.action, 10);
  const r = action === 'make' ? await makeTeam(p, undefined, req)
    : action === 'join' ? await joinTeam(p, str(b.code, 20), undefined, req)
    : action === 'leave' ? await leaveTeam(p, undefined, req)
    : null;
  if (!r) return no('Make, join or leave a team.');
  return r.ok ? ok({ team: r.team }, { headers: { 'Cache-Control': 'no-store' } }) : no(r.error, r.status, r.field ? { field: r.field } : undefined);
}
