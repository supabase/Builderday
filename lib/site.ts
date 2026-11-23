/* site.ts: the site's own address, for share images, the canonical link, robots and the sitemap. NEXT_PUBLIC_SITE_URL
   wins once a real domain is set; on Vercel the production address is read from the platform; locally, the dev server.
   PLACEHOLDER, not confirmed: the domain. */
const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || fromVercel || 'http://localhost:4320').replace(/\/$/, '');
