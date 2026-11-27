/* GET /in/<key>: the personal link the old place emails carried. People sign in with their Supabase account now, so
   the link only lands on the site, with a word on how. */
import { NextResponse } from 'next/server';
import { siteUrl } from '@/lib/server/env';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return NextResponse.redirect(siteUrl(req) + '/in?e=supabase', 303);
}
