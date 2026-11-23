/* Every address the pages write by hand, in one place. The site is to move under a base path (supabase.com/builderday):
   a <Link> and the router add it by themselves, but a plain href, window.location and history do not, so new code
   builds its addresses here and the move is one edit (BASE). Pure. */

export const BASE = '';
export const routes = {
  home: () => BASE + '/',
  preview: (hash = '') => BASE + '/preview' + hash,
  city: (id: string) => BASE + '/city/' + id,
  stage: (id: string) => BASE + '/city/' + id + '/stage',
  project: (id: string, slug: string) => BASE + '/city/' + id + '/p/' + slug,
  labHome: () => BASE + '/lab/day-home',
  labCity: (id: string) => BASE + '/lab/day-city?city=' + id,
};
/* the project's slug from an address (/city/<id>/p/<slug>), with or without the base */
export const projectSlugIn = (path: string): string | null => { const m = path.slice(BASE.length).match(/^\/city\/[^/]+\/p\/([^/]+)/); return m ? decodeURIComponent(m[1]) : null; };
