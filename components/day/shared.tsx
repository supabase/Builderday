'use client';
import { useEffect, useMemo, useState } from 'react';
import screenCfg from '@/saved/screen.config.json';
import { clampScreen, type ScreenCfg } from '@/components/screen/config';
import { Screen } from '@/components/screen/screen';
import { createClock, useSecond, type DayClock } from '@/components/board/clock';
import { Segment } from '@/components/board/segment';
import { countdown } from '@/components/board/day-model';
export { dayOf } from './day';
import { usePref } from '@/components/board/prefs';

/* What the day pages share: the day (day.ts), the clock, the screen kit as saved in saved/screen.config.json
   (with the visitor's Screen switch), and the segment countdown that ticks on the clock's own step. */

/* the clock: it starts at the minute asked for and, when live, runs at `speed` seconds a second */
export function useLabClock(minute: number, live: boolean, speed: number): DayClock {
  const [clock] = useState(() => createClock(minute, live, speed));
  useEffect(() => { clock.set(minute); }, [clock, minute]);
  useEffect(() => { clock.setLive(live, speed); }, [clock, live, speed]);
  return clock;
}

/* the screen kit as saved (depth: big type only). The Screen switch turns it off: same page, plain. */
export function DayScreen() {
  const [on] = usePref('screen');
  const cfg = useMemo<ScreenCfg>(() => { const s = clampScreen(screenCfg); return on ? s : { ...s, depth: 'none', fringe: 0, grain: 0, corners: 0 }; }, [on]);
  useEffect(() => { document.documentElement.toggleAttribute('data-screen-off', !on); }, [on]);
  return <Screen cfg={cfg} />;
}

/* the segment countdown for a city, ticking with the clock */
export function LiveSegment({ clock, first, x, withSecs, name, className }: { clock: DayClock; first: number; x: { state: string; start: number; buildEnd: number; end: number }; withSecs: boolean; name: string; className?: string }) {
  const s = useSecond(clock, first), cd = countdown(x, s / 60);
  const label = cd.lit === 'CLOSED' ? name + ' has closed.' : name + ' ' + cd.what + ' in ' + Math.max(0, Math.round(cd.secs / 60)) + ' minutes.';
  return <Segment secs={cd.secs} lit={cd.lit} label={label} withSecs={withSecs} className={className} />;
}
