'use client';
import type { PartsCfg } from '@/components/board/config';
import { DayCity, type DayCityCfg } from '@/components/day/day-city';
import { KitFrame } from './day/kit-frame';

/* A city's page on the day, as the real page draws it (components/day/day-city.tsx), starting at
   a moment with the worst content on and voting locally, plus the baseline: today's Tower on the screen kit, framed.
   Save writes saved/day-city.config.json, which the real city pages read. */

export type { CityDir, DayCityCfg } from '@/components/day/day-city';

export function DayCityLab({ saved, parts, q }: { saved: Partial<DayCityCfg>; parts: Partial<PartsCfg>; q: Record<string, string | undefined> }) {
  return <DayCity saved={saved} parts={parts} q={q}
    base={(city, t, worst) => <KitFrame src={'/lab/city?mode=tower&panel=0&city=' + city + '&worst=' + worst + '&ht=' + t.toFixed(5)} title="Today’s city page on the screen kit" />} />;
}
