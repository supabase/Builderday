'use client';
import clsx from 'clsx';
import { EVENT, CITY_WORD_CAP } from '@/lib/day-data';
import { NB } from '@/lib/format';
import { Picture } from '@/components/pictures/picture';
import { useDay } from './day-context';
import { PAST_FADED, PAST_NAME, PAST_ROW } from './past-row';

/* the day after: this hackathon joins the past ones, at the top of the list */
export function ArchivedRow() {
  const { W } = useDay();
  if (!W.archived) return null;
  const pc = W.pick, p = pc.win.p;
  return (
    <li className={clsx('ps-fold', PAST_ROW)}>
      <span className={clsx('ps-d', PAST_FADED)}>{EVENT.date}</span><span className={PAST_NAME}>{EVENT.name}</span><span className={clsx('ps-f', PAST_FADED)}>{CITY_WORD_CAP} cities, one day</span>
      <span className={clsx('ps-e', PAST_FADED)}>{W.total.toLocaleString('en-US') + NB + 'entries'}</span><span className="ps-w text-ink tabular-nums">{p.name + ', ' + pc.name}</span>
      <span className="ps-pic aspect-video"><Picture p={p} /></span>
    </li>
  );
}
