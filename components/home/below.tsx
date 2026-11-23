/* The parts of the home that do not follow the clock: how it works, the questions, past hackathons and the footer.
   Server components. */
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { EVENT, pastEvents, CITIES } from '@/lib/day-data';
import { FAQ } from '@/lib/data';
import { NB, dur, hhmm } from '@/lib/format';
import type { HomeCfg } from '@/lib/home';
import { BELOW, HowItWorksList, LABEL, PageFooter } from '@/components/shared/page-parts';
import { PAST_FADED, PAST_NAME, PAST_ROW } from './past-row';

export function HowItWorks({ c }: { c: Pick<HomeCfg, 'buildMin' | 'startHour' | 'schedule' | 'voteAfter'> }) {
  return (
    <HowItWorksList id="how-h" title="How it works" first="c2" steps={[
      ['Build', 'Each city builds for ' + dur(c.buildMin) + ', starting ' + hhmm(c.startHour * 60) + ' local' + (c.schedule === 'same' ? ' UTC' : '') + '.'],
      ['Vote', 'Voting opens when building starts' + (c.voteAfter ? ' and closes ' + dur(c.voteAfter) + ' after it ends' : ' and closes when it ends') + '. The project with the most votes wins its city.'],
      ['Pick', EVENT.pickers + ' pick one of the ' + CITIES.length + ' city winners.'],
    ]} />
  );
}

export function Questions() {
  if (!FAQ.length) return null;
  return (
    <section className={clsx(BELOW, 'py-8')} aria-labelledby="qa-h">
      <h2 className={clsx(LABEL, 'mb-4')} id="qa-h">Questions</h2>
      <dl>{FAQ.map((f, j) => (
        <div key={f[0]} className={clsx('grid grid-cols-[var(--c5)_minmax(0,1fr)] gap-x-(--g) py-4 text-md leading-[1.45] phone:grid-cols-[minmax(0,1fr)] phone:gap-y-1', j > 0 && 'rule-t')}>
          <dt className="font-medium text-balance text-ink">{f[0]}</dt><dd className="max-w-[60ch] text-pretty text-ink-2">{f[1]}</dd>
        </div>
      ))}</dl>
    </section>
  );
}

/* first: the row this hackathon adds to the list once it is over (it follows the clock, so it is passed in) */
export function PastHackathons({ first }: { first: ReactNode }) {
  return (
    <section className={clsx(BELOW, 'py-8')} aria-labelledby="past-h">
      <h2 className={clsx(LABEL, 'mb-4')} id="past-h">Past hackathons</h2>
      <ol>
        {first}
        {pastEvents().map((e) => (
          <li key={e.name} className={PAST_ROW}>
            <span className={clsx('ps-d', PAST_FADED)}>{e.date}</span><span className={PAST_NAME}>{e.name}</span><span className={clsx('ps-f', PAST_FADED)}>{e.format}</span>
            <span className={clsx('ps-e', PAST_FADED)}>{e.submissions ? e.submissions + NB + 'entries' : 'Not listed'}</span><span className={clsx('ps-w', PAST_FADED)} /><span className="ps-pic aspect-video" />
          </li>
        ))}
      </ol>
    </section>
  );
}

export function HomeFooter() {
  return <PageFooter><span>{EVENT.name}</span><span>Times are UTC on the strip and local in each row.</span></PageFooter>;
}
