import saved from '@/saved/day-home.config.json';
import parts from '@/saved/parts.config.json';
import type { PartsCfg } from '@/components/board/config';
import { DayHome, type DayHomeCfg } from '@/components/day/day-home';
import { pageMeta } from '@/lib/meta';
import { flatQuery as flat } from '@/components/day/day';
import { backendOn } from '@/lib/server/env';
import { pageSnaps } from '@/lib/server/snapshot';
import { EVENT, CITY_WORD, CITY_WORD_CAP, FINALIST_COUNT } from '@/lib/day-data';
import { FormsProvider } from '@/components/forms/forms-provider';
import { demoRobots, isDemo } from '@/lib/demo';

const META = pageMeta(
  `${EVENT.name}: ${CITY_WORD} cities, one day`,
  `${CITY_WORD_CAP} cities, east to west on one day. Each builds for 90 minutes, with the votes shown from minute 60. The top 3 in each city go to the global final, where the Supabase team picks 1st, 2nd and 3rd from the ${FINALIST_COUNT}.`,
);
/* the sample day (?demo) is never indexed */
export async function generateMetadata({ searchParams }: { searchParams: Promise<Q> }) {
  return isDemo(await searchParams) ? { ...META, robots: demoRobots } : META;
}

/* Dynamic: the first frame is drawn at the real time of the request (or the moment the URL asks for: ?moment=, ?m=,
   ?t=), so the page arrives finished. ?still=1 stops the clock; ?admin shows the panel. */
function requestTime() { return Date.now(); }
type Q = Record<string, string | string[] | undefined>;

export default async function Home({ searchParams }: { searchParams: Promise<Q> }) {
  /* ?demo: the seeded day, with nothing read from or sent to the backend */
  const q = await searchParams, on = backendOn() && !isDemo(q);
  const live = on ? { day: (await pageSnaps(null)).day } : undefined;
  return (
    <>
      <FormsProvider live={on}><DayHome saved={saved as Partial<DayHomeCfg>} parts={parts as Partial<PartsCfg>} q={flat(q)} page={{ nowMs: requestTime() }} live={live} /></FormsProvider>
      <noscript><p className="m-0 p-8 text-lg text-ink-2">The day needs JavaScript to follow the clock. {EVENT.name} runs in {CITY_WORD} cities on Dec 10, 2026.</p></noscript>
    </>
  );
}
