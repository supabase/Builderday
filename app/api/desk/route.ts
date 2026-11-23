/* POST /api/desk { action, city, … }: every desk action, checked by role (lib/server/roles.ts) and logged */
import { body, no, offline, ok } from '@/lib/server/http';
import { deskUser } from '@/lib/server/roles';
import { deskAct } from '@/lib/server/desk';

export async function POST(req: Request) {
  const off = offline(); if (off) return off;
  const d = await deskUser();
  if ('error' in d) return no(d.error, d.status);
  const b = await body<{ action: string; city?: string }>(req);
  if (!b || typeof b.action !== 'string') return no('Say which action.');
  const r = await deskAct(d, b, req);
  return r.ok ? ok(r) : no(r.error, r.status || 400);
}
