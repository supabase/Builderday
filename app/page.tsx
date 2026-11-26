import saved from '@/saved/fold.config.json';
import wheel from '@/saved/wheel.config.json';
import { clampWheel } from '@/components/wheel/config';
import { ourWheel } from '@/components/preview/facts';
import type { FoldCfg } from '@/components/preview/fold/config';
import { FoldPreview } from '@/components/preview/fold/preview-page';
import { BACK_SCRIPT } from '@/components/preview/fold/arrive';
import { pageMeta } from '@/lib/meta';
import { EVENT, CITY_WORD, CITY_WORD_CAP } from '@/lib/day-data';
import { signups } from '@/lib/server/signups';
import { headers } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/site';
import { previewLd } from '@/lib/structured';

const TITLE = `${EVENT.name}: ${CITY_WORD} cities, one day`;
const DESCRIPTION = `${CITY_WORD_CAP} cities, east to west on 10 December 2026. Build for 90 minutes from your city’s local start. Register for your city on Luma.`;
/* one address for every ?city= and ?at= variant (the site's own, with no trailing slash: that one redirects); the share
   image is opengraph-image.tsx beside this file */
const meta = pageMeta(TITLE, DESCRIPTION);
export const metadata: Metadata = { ...meta, alternates: { canonical: SITE_URL }, openGraph: { ...meta.openGraph, url: SITE_URL }, twitter: { card: 'summary_large_image' } };
/* the status bar takes the page's own paper (fold.tsx PaperStyle: rgb(p, p+1, p+1)), not the site-wide ground */
const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const P = clampWheel(wheel).paper;
export const viewport: Viewport = { themeColor: '#' + hex(P) + hex(P + 1) + hex(P + 1) };
const LD = previewLd({ url: SITE_URL, description: DESCRIPTION });

/* The page: the city wheel, one screen (saved/fold.config.json). ?city= opens on a city by its place in the list (from
   0), ?gl=0 draws without WebGL. */

/* where the visitor is: the host's IP lookup (Vercel sends the position as headers), or ?at=lat,lon to try one. With
   neither, the nearest city is found by time zone. */
function whereFrom(h: Headers, at?: string) {
  const [a, b] = at ? at.split(',').map(Number) : [Number(h.get('x-vercel-ip-latitude')), Number(h.get('x-vercel-ip-longitude'))];
  return h.get('x-vercel-ip-latitude') || at ? (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lon: b } : null) : null;
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams, here = whereFrom(await headers(), q.at), ours = ourWheel(await signups());
  /* the line before the first paint that marks a return in the same tab, so the first screen plays its quiet arrival */
  return <><script dangerouslySetInnerHTML={{ __html: BACK_SCRIPT }} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: LD }} /><FoldPreview saved={saved as Partial<FoldCfg>} wheel={clampWheel(wheel)} ours={ours} here={here} q={q} /></>;
}
