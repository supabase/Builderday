/* Every address the pages write by hand, in one place. The site lives under a base path (supabase.com/builderday;
   NEXT_PUBLIC_BASE_PATH, empty on the dev server): a <Link>, the router and redirect() add it by themselves, but a plain
   href, fetch, window.location, history and an image's src do not. Paths are kept without the base and at() adds it
   where one of those uses it; routes.* already carry it. Pure. */

export const BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
/* the base added to a path on this site; an outside address, an anchor or a path that has it already is left alone */
export const at = (p: string): string => (!BASE || !p.startsWith('/') || p.startsWith('//') || p === BASE || p.startsWith(BASE + '/') || p.startsWith(BASE + '?') ? p : BASE + p);
/* the path without the base, for a <Link> or the router */
export const unbase = (p: string): string => (BASE && (p === BASE || p.startsWith(BASE + '/') || p.startsWith(BASE + '?')) ? p.slice(BASE.length) || '/' : p);
export const routes = {
  home: () => BASE + '/',
  city: (id: string) => BASE + '/city/' + id,
  stage: (id: string) => BASE + '/city/' + id + '/stage',
  project: (id: string, slug: string) => BASE + '/city/' + id + '/p/' + slug,
  labHome: () => BASE + '/lab/day-home',
  labCity: (id: string) => BASE + '/lab/day-city?city=' + id,
};
/* the project's slug from an address (/city/<id>/p/<slug>), with or without the base */
export const projectSlugIn = (path: string): string | null => { const m = path.slice(BASE.length).match(/^\/city\/[^/]+\/p\/([^/]+)/); return m ? decodeURIComponent(m[1]) : null; };
