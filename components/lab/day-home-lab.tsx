'use client';
import type { PartsCfg } from '@/components/board/config';
import { DayHome, type DayHomeCfg } from '@/components/day/day-home';
import { KitFrame } from './day/kit-frame';

/* The home on the day, as the real home draws it (components/day/day-home.tsx), starting at a
   moment with the worst content on, plus the baseline: today's home on the screen kit, framed. Save writes
   saved/day-home.config.json, which the real home reads. */

export type { DayHomeCfg, HomeDir } from '@/components/day/day-home';

export function DayHomeLab({ saved, parts, q }: { saved: Partial<DayHomeCfg>; parts: Partial<PartsCfg>; q: Record<string, string | undefined> }) {
  return <DayHome saved={saved} parts={parts} q={q}
    base={(t, worst) => <KitFrame src={'/lab/home?round=final&below=diagram&panel=0&worst=' + worst + '&t=' + t.toFixed(5)} title="Today’s home on the screen kit" />} />;
}
