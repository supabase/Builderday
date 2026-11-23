/* GET /team/<code>: a team's link, sent by whoever made it. Opens the page of the team's city (the preview page on
   that city before the day pages open) with the account sheet ready to join: ?team=<code>. A code no team has opens
   the same way, and the sheet says so when it is tried. */
import { NextResponse } from 'next/server';
import { backendOn, siteUrl } from '@/lib/server/env';
import { landing } from '@/lib/server/gate';
import { teamByCode } from '@/lib/server/teams';
import { teamKey } from '@/lib/team';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const base = siteUrl(req), code = teamKey((await params).code).slice(0, 6);
  const t = backendOn() ? await teamByCode(code) : null;
  const to = await landing(t?.city || null).catch(() => '/preview');
  return NextResponse.redirect(base + to + (to.indexOf('?') >= 0 ? '&' : '?') + 'team=' + encodeURIComponent(code), 303);
}
