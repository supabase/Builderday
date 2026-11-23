/* POST /api/auth/confirm (form): the button on /in/confirm, from the link in the code email. With no page asked for, it
   lands where the personal link would: the preview page on the person's city before the day, their city after. */
import { NextResponse } from 'next/server';
import { confirmToken } from '@/lib/server/auth';
import { backendOn, siteUrl } from '@/lib/server/env';
import { passOf } from '@/lib/server/people';
import { landing } from '@/lib/server/gate';

export async function POST(req: Request) {
  const base = siteUrl(req);
  if (!backendOn()) return NextResponse.redirect(base + '/in?e=offline', 303);
  const f = await req.formData().catch(() => null);
  const th = String(f?.get('th') || ''), next = String(f?.get('next') || '');
  const r = await confirmToken(th);
  if (!r.ok) return NextResponse.redirect(base + '/in?e=' + encodeURIComponent(r.error), 303);
  if (next.startsWith('/') && !next.startsWith('//') && next !== '/') return NextResponse.redirect(base + next, 303);
  const pass = await passOf(r.person.id);
  return NextResponse.redirect(base + await landing(pass?.city || null), 303);
}
