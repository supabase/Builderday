/* GET /in/<key>: the personal link from the email. Signs this browser in as the person and opens their city: the
   preview page on their city before the day pages open, their city's page after (lib/server/gate.ts, landing).
   It can be opened again (mail scanners open links before people do), until the day after the city closes. */
import { NextResponse } from 'next/server';
import { backendOn, siteUrl } from '@/lib/server/env';
import { openKey } from '@/lib/server/people';
import { signInAs } from '@/lib/server/auth';
import { admin } from '@/lib/server/supabase';
import { landing } from '@/lib/server/gate';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const base = siteUrl(req);
  if (!backendOn()) return NextResponse.redirect(base + '/in?e=offline', 303);
  const { key } = await params;
  const r = await openKey('in', key);
  if ('error' in r) return NextResponse.redirect(base + '/in?e=' + encodeURIComponent(r.error), 303);
  const s = await signInAs(r.person.email);
  if (!s.ok) return NextResponse.redirect(base + '/in?e=' + encodeURIComponent(s.error), 303);
  if (!r.pass.opened_at) await admin().from('passes').update({ opened_at: new Date().toISOString() }).eq('id', r.pass.id);
  return NextResponse.redirect(base + await landing(r.pass.city), 303);
}
