'use client';
import type { ReactNode } from 'react';
import { BuilderLogo } from '@/components/wheel/builder-logo';
import { StateChip, type StateWord } from '@/components/screen/chip';
import { hms, useSecond, type DayClock } from './clock';
import { EVENT } from '@/lib/day-data';

/* Row 0 of every day page: the mark (home), the page's title, the day's state as a chip, and a burnt-in clock that
   ticks once a second (the one thing that moves at rest). The clock is the only part that reads the second, so nothing
   else draws again while it ticks. */

export function Clock({ clock, first, offset = 0, zone }: { clock: DayClock; first: number; offset?: number; zone: string }) {
  const s = useSecond(clock, first);
  const t = hms(s + offset * 60);
  return <span className="hr-clock"><time dateTime={t}>{t.slice(0, 5)}<span className="hr-sec">{t.slice(5)}</span></time><span className="sr-only">{zone}</span><span className="hr-zone" aria-hidden="true">{zone}</span><span className="hr-zs" aria-hidden="true">{zone.split(' · ').pop()}</span></span>;
}

export function HeaderRow({ title, state, clock, first, offset, zone, homeHref, right }: {
  title: string; state: StateWord; clock: DayClock; first: number; offset?: number; zone: string; homeHref: string; right?: ReactNode;
}) {
  return (
    <header className="hr">
      <a className="hr-mark" href={homeHref} aria-label={EVENT.name + ', home'}><BuilderLogo className="hr-mark-svg" /><span className="hr-mark-name">{EVENT.name}</span></a>
      <span className="hr-title">{title}</span>
      <StateChip s={state} className="hr-chip" />
      <span className="hr-fill" />
      {right}
      <Clock clock={clock} first={first} offset={offset} zone={zone} />
    </header>
  );
}
