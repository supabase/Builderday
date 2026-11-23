import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { backendOn } from '@/lib/server/env';
import { dayGate, seesEarly } from '@/lib/server/gate';
import { CITY_IDS } from '@/lib/day-data';

/* Two jobs.
   1. The old city address: /city.html?city=<id>&moment=vote becomes /city/<id>?moment=vote, every other parameter
      kept. Without a city it goes to Berlin, as the old page did.
   2. The gate. Before the day pages open, the home and the city pages (a project's own address
      too) send visitors to the preview page with a temporary redirect, the wheel on that city. A signed-in host, judge
      or super admin passes; so does ?admin on a site without the backend, and on the local dev server. The desk, the
      stage, /in, the labs and the API are not gated. */
const GATED = /^\/(?:city\/([^/]+)(?:\/p\/[^/]+)?\/?)?$/;

export async function proxy(req: NextRequest) {
  const url = req.nextUrl.clone();
  if (url.pathname === '/city.html') {
    const id = url.searchParams.get('city') || 'berlin';
    url.searchParams.delete('city');
    url.pathname = '/city/' + encodeURIComponent(id);
    return NextResponse.redirect(url, 308);
  }

  const m = GATED.exec(url.pathname);
  if (!m) return NextResponse.next();
  const on = backendOn();
  if (url.searchParams.has('admin') && (!on || process.env.NODE_ENV !== 'production')) return NextResponse.next();
  if ((await dayGate()).open) return NextResponse.next();

  /* a session's cookies are read, and refreshed ones passed on, as @supabase/ssr asks of a proxy */
  let res = NextResponse.next({ request: req });
  if (on && req.cookies.getAll().some((c) => c.name.startsWith('sb-'))) {
    try {
      const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (list) => {
            list.forEach(({ name, value }) => req.cookies.set(name, value));
            res = NextResponse.next({ request: req });
            list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
          },
        },
      });
      const { data } = await sb.auth.getUser();
      if (data.user?.email && await seesEarly(data.user.id, data.user.email)) return res;
    } catch { /* the Auth server does not answer: treat as signed out */ }
  }

  const to = req.nextUrl.clone();
  to.pathname = '/preview';
  to.search = '';
  const i = m[1] ? CITY_IDS.indexOf(decodeURIComponent(m[1])) : -1;
  if (i >= 0) to.searchParams.set('city', String(i));
  const out = NextResponse.redirect(to, 307);
  res.cookies.getAll().forEach((c) => out.cookies.set(c));
  return out;
}

export const config = { matcher: ['/', '/city.html', '/city/:path*'] };
