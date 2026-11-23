import saved from '@/saved/fold.config.json';
import wheel from '@/saved/wheel.config.json';
import { clampWheel } from '@/components/wheel/config';
import { ourWheel } from '@/components/preview/facts';
import type { FoldCfg } from '@/components/preview/fold/config';
import { FoldPreview } from '@/components/preview/fold/preview-page';
import { BACK_SCRIPT } from '@/components/preview/fold/arrive';
import { pageMeta } from '@/lib/meta';
import { EVENT, CITY_WORD, CITY_WORD_CAP, USUAL_START, cityStartLocal } from '@/lib/day-data';
import { backendOn } from '@/lib/server/env';
import { signups } from '@/lib/server/signups';
import { headers } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/site';
import { previewLd } from '@/lib/structured';
import { FormsProvider } from '@/components/forms/forms-provider';

const TITLE = `${EVENT.name}: ${CITY_WORD} cities, one day`;
const DESCRIPTION = `${CITY_WORD_CAP} cities, east to west on 10 December 2026. Most build for 90 minutes from ${cityStartLocal({ start: USUAL_START })} local time, and voting closes 30 minutes after. The top 3 in each city go to the final, and one winner gets $10,000.`;
/* one address for every ?city= and ?at= variant; the share image is opengraph-image.tsx beside this file */
export const metadata: Metadata = { ...pageMeta(TITLE, DESCRIPTION), alternates: { canonical: '/preview' }, twitter: { card: 'summary_large_image' } };
/* the status bar takes the page's own paper (fold.tsx PaperStyle: rgb(p, p+1, p+1)), not the site-wide ground */
const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const P = clampWheel(wheel).paper;
export const viewport: Viewport = { themeColor: '#' + hex(P) + hex(P + 1) + hex(P + 1) };
const LD = previewLd({ url: SITE_URL + '/preview', description: DESCRIPTION, how: ourWheel().how });

/* The preview home, until the day: the wheel, then the day under the fold (saved/fold.config.json, tuned at
   /lab/fold). ?city= opens on a city by its place in the list (from 0), ?gl=0 draws without WebGL, ?mark= and ?globe= try the wheel's others, ?admin shows the page's knobs. */
/* the time of the request: the end board is drawn at it */
function requestTime() { return Date.now(); }

/* ?mark= and ?globe= try the wheel's other marks and globes without saving (the admin panel holds them too) */
const pick = (q: Record<string, string | undefined>) => ({ ...(q.mark ? { mark: q.mark } : {}), ...(q.globe ? { globe: q.globe } : {}) });

/* where the visitor is: the host's IP lookup (Vercel sends the position as headers), or ?at=lat,lon to try one. With
   neither, the nearest city is found by time zone. */
function whereFrom(h: Headers, at?: string) {
  const [a, b] = at ? at.split(',').map(Number) : [Number(h.get('x-vercel-ip-latitude')), Number(h.get('x-vercel-ip-longitude'))];
  return h.get('x-vercel-ip-latitude') || at ? (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lon: b } : null) : null;
}

export default async function PreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams, here = whereFrom(await headers(), q.at), ours = ourWheel(backendOn() ? await signups() : undefined);
  /* the line before the first paint that marks a return in the same tab, so the first screen plays its quiet arrival */
  return <FormsProvider live={backendOn()}><script dangerouslySetInnerHTML={{ __html: BACK_SCRIPT }} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: LD }} /><FoldPreview saved={saved as Partial<FoldCfg>} wheel={clampWheel({ ...wheel, ...pick(q) })} ours={ours} here={here} q={q} nowMs={requestTime()} /></FormsProvider>;
}
