import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { at } from '@/lib/routes';

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: at('/') }], sitemap: SITE_URL + '/sitemap.xml', host: SITE_URL };
}
