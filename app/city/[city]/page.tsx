import { notFound, redirect } from 'next/navigation';
import saved from '@/saved/day-city.config.json';
import parts from '@/saved/parts.config.json';
import { CITY_IDS, cityById, cityStartLocal, type City } from '@/lib/day-data';
import { pageMeta } from '@/lib/meta';
import { flatQuery as flat } from '@/components/day/day';
import type { PartsCfg } from '@/components/board/config';
import { FormsProvider } from '@/components/forms/forms-provider';
import { backendOn } from '@/lib/server/env';
import { pageSnaps } from '@/lib/server/snapshot';
import { DayCity, type DayCityCfg } from '@/components/day/day-city';
import { EVENT } from '@/lib/day-data';

const DESCRIPTION = (c: City) => 'Build for 90 minutes from ' + cityStartLocal(c) + ' local time. Voting is open from the start until 30 minutes after building ends, and the top 3 by votes go to the final.';

/* The ten cities are known, so any other id is a 404 */
export const dynamicParams = false;
export function generateStaticParams() { return CITY_IDS.map((city) => ({ city })); }

type Q = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ city: string }>; searchParams: Promise<Q> };
export async function generateMetadata({ params }: Props) {
  const c = cityById((await params).city);
  return c ? pageMeta(c.name + ' · ' + EVENT.name, DESCRIPTION(c)) : {};
}

/* Dynamic: the first frame is drawn at the real time of the request (or the moment the URL asks for: ?moment=, ?m=),
   so the page arrives finished. ?still=1 stops the clock; ?admin shows the panel. */
function requestTime() { return Date.now(); }

export default async function City({ params, searchParams }: Props) {
  const { city } = await params;
  if (!cityById(city)) notFound();
  const q = flat(await searchParams);
  /* the old project address (?p=<slug>) moved to /city/<city>/p/<slug> */
  if (q.p) {
    const rest = new URLSearchParams(); Object.entries(q).forEach(([k, v]) => { if (k !== 'p' && v != null) rest.set(k, v); });
    redirect('/city/' + city + '/p/' + encodeURIComponent(q.p) + (rest.size ? '?' + rest : ''));
  }
  /* with a backend, the page arrives with the city's real numbers (lib/source.ts) */
  const live = backendOn() ? await pageSnaps(city) : undefined;
  return (
    <>
      <FormsProvider live={backendOn()}><DayCity saved={saved as Partial<DayCityCfg>} parts={parts as Partial<PartsCfg>} q={q} page={{ nowMs: requestTime(), city }} live={live} /></FormsProvider>
      <noscript><p className="m-0 p-8 text-lg text-ink-2">This page needs JavaScript to follow the clock and to vote.</p></noscript>
    </>
  );
}
