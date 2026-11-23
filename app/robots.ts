import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/* Search engines read the public pages. The tuning pages, the desk, the stage, the sign-in links and the API stay out
   of the index (they are still reachable by address). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/lab/', '/desk', '/api/', '/in/', '/city/*/stage'] }],
    sitemap: SITE_URL + '/sitemap.xml',
    host: SITE_URL,
  };
}
