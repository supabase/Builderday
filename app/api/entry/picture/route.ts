/* POST /api/entry/picture: take your entry's picture again from the demo page's share image */
import { no, offline, ok } from '@/lib/server/http';
import { authUser } from '@/lib/server/supabase';
import { entryRowOf } from '@/lib/server/teams';
import { personByAuth } from '@/lib/server/people';
import { refreshPicture } from '@/lib/server/entries';
import { mayBuild } from '@/lib/server/room';

export async function POST() {
  const off = offline(); if (off) return off;
  const u = await authUser(); const p = u ? await personByAuth(u.id) : null;
  if (!p) return no('Sign in first.', 401);
  const e = await entryRowOf(p.id);   // their own entry, or their team's
  if (!e) return no('You have no entry yet.', 404);
  const gate = await mayBuild(p, e.city as string);   // an edit like any other: on the list and in the room
  if (!gate.ok) return no(gate.error, gate.status, { field: gate.field });
  const r = await refreshPicture(e.id as string);
  return r.ok ? ok(r) : no(r.error, 422);
}
