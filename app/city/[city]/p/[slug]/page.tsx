import { notFound } from 'next/navigation';
import saved from '@/saved/day-city.config.json';
import parts from '@/saved/parts.config.json';
import { EVENT, cityById } from '@/lib/day-data';
import { ord, pluralN as plural } from '@/lib/format';
import { pageMeta } from '@/lib/meta';
import type { PartsCfg } from '@/components/board/config';
import { FormsProvider } from '@/components/forms/forms-provider';
import { backendOn } from '@/lib/server/env';
import { pageSnaps, publicCity } from '@/lib/server/snapshot';
import { rankOrder } from '@/lib/event/snapshot';
import { DayCity, type DayCityCfg } from '@/components/day/day-city';
import { flatQuery as flat, projectOnDay } from '@/components/day/day';
import { demoRobots, isDemo } from '@/lib/demo';

/* A project's own address: its city's page, drawn with the project open over it. It is the page a shared link opens,
   so it has its own title, description and share image. */
type Q = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ city: string; slug: string }>; searchParams: Promise<Q> };

export async function generateMetadata({ params, searchParams }: Props) {
  const { city, slug } = await params, c = cityById(city), sq = await searchParams, demo = isDemo(sq);
  if (!c) return {};
  if (backendOn() && !demo) {
    /* live: the entry from the city's snapshot */
    const snap = await publicCity(city), s = decodeURIComponent(slug);
    const ranked = (snap?.entries || []).slice().sort(rankOrder), k = ranked.findIndex((e) => e.slug === s);
    if (k < 0) return {};
    const e = ranked[k], pitch = !e.pitch ? '' : /[.!?…]$/.test(e.pitch) ? e.pitch : e.pitch + '.';
    return pageMeta(e.name + ' · ' + c.name + ' · ' + EVENT.name, (pitch ? pitch + ' ' : '') + (snap!.hidden ? 'In ' + c.name + '. Votes are hidden until minute ' + (EVENT.showAt ?? 60) + '.' : snap!.city.buildStart ? ord(k + 1) + ' in ' + c.name + ' with ' + plural(e.votes, 'vote') + '.' : 'In ' + c.name + '.'));
  }
  const { W, row, listed } = projectOnDay(city, decodeURIComponent(slug), flat(sq), Date.now());
  if (!row) return {};
  const pitch = /[.!?…]$/.test(row.p.pitch) ? row.p.pitch : row.p.pitch + '.';
  const done = W.state === 'done', finalist = done && listed && row.rank <= EVENT.finalists;
  const where = listed && W.hidden ? 'In ' + c.name + '. Votes are hidden until minute ' + (EVENT.showAt ?? 60) + '.' : listed && W.votesOn ? ord(row.rank) + ' in ' + c.name + ' with ' + plural(row.v, 'vote') + (finalist ? ', in the final.' : '.') : 'In ' + c.name + '.';
  const m = pageMeta(row.p.name + ' · ' + c.name + ' · ' + EVENT.name, pitch + ' ' + where + (W.voting ? ' Anyone with the link can vote.' : ''));
  return demo ? { ...m, robots: demoRobots } : m;
}

function requestTime() { return Date.now(); }

export default async function Project({ params, searchParams }: Props) {
  const { city, slug } = await params;
  if (!cityById(city)) notFound();
  const q = flat(await searchParams), nowMs = requestTime(), s = decodeURIComponent(slug);
  /* ?demo: the seeded day, with nothing read from or sent to the backend */
  const on = backendOn() && !isDemo(q);
  const live = on ? await pageSnaps(city) : undefined;
  if (live ? !live.city?.entries.some((e) => e.slug === s) : !projectOnDay(city, s, q, nowMs).row) notFound();
  return (
    <>
      <FormsProvider live={on}><DayCity saved={saved as Partial<DayCityCfg>} parts={parts as Partial<PartsCfg>} q={q} page={{ nowMs, city, slug: s }} live={live} /></FormsProvider>
      <noscript><p className="m-0 p-8 text-lg text-ink-2">This page needs JavaScript to follow the clock and to vote.</p></noscript>
    </>
  );
}
