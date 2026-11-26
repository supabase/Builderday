/* The site lives under a base path (supabase.com/builderday; NEXT_PUBLIC_BASE_PATH, empty on the dev server): a plain
   href, fetch and an image's src do not add it by themselves, so at() does. Pure. */

export const BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
/* the base added to a path on this site; an outside address, an anchor or a path that has it already is left alone */
export const at = (p: string): string => (!BASE || !p.startsWith('/') || p.startsWith('//') || p === BASE || p.startsWith(BASE + '/') || p.startsWith(BASE + '?') ? p : BASE + p);
/* a link that leaves the site (Luma) opens in a new tab, so the page stays where the visitor was */
export const away = (href?: string | null): { target?: '_blank'; rel?: string } => (href && /^https?:\/\//.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {});
