import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/* Before the day only the preview page is open (the home and the city pages send visitors there), so it is the one
   page listed. When the day pages open, the home and the city pages join it. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL + '/preview', changeFrequency: 'daily', priority: 1 }];
}
