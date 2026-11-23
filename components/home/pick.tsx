'use client';
import clsx from 'clsx';
import { EVENT, CITIES } from '@/lib/day-data';
import { NB, hhmm, plural } from '@/lib/format';
import { Picture } from '@/components/pictures/picture';
import { MergedSeal } from '@/components/seal/seal-config';
import { BELOW, LABEL } from '@/components/shared/page-parts';
import { useDay } from './day-context';

/* The pick: Ant and Copple's one of the ten, once it is made; until then, how many winners are in. */
export function Pick() {
  const { cfg: c, W } = useDay(), pc = W.pick, p = pc.win.p;
  return (
    <section className={clsx('pk', BELOW, 'grid grid-cols-[var(--c5)_var(--c5)_var(--c2)] items-center gap-x-(--g) py-8 phone:grid-cols-[minmax(0,1fr)] phone:gap-y-4', W.picked && 'is-picked')} id="pick" aria-labelledby="pk-h">
      <i className="pk-line" aria-hidden="true" />
      <div className="pk-pic aspect-video">{W.picked ? <Picture p={p} /> : <i className="pic pic-empty" />}</div>
      <div className="pk-tx min-h-[168px] phone:min-h-0">
        <h2 className={clsx(LABEL, 'mb-4')} id="pk-h">The pick</h2>
        <p className={clsx('pk-name truncate text-[length:min(calc(var(--fact)*1px),var(--t-d48))] leading-[1.05] font-medium tracking-d48', W.picked ? 'text-ink' : 'text-ink-2')}>
          {W.picked ? p.name : W.allDone ? 'Ten winners. One pick.' : W.done.length + ' of 10 winners in'}
        </p>
        <p className="mt-3 text-lg text-ink">
          {W.picked ? pc.name + '’s winner, @' + p.handle + '. ' + plural(pc.win.v, 'vote') + ' of ' + pc.entries + NB + 'entries.' : EVENT.pickers + ' pick one of the ' + CITIES.length + ' city winners at ' + hhmm(W.S.pickAt) + ' UTC.'}
        </p>
        <p className="mt-2 min-h-[3em] max-w-[48ch] text-md text-pretty text-ink-2 phone:min-h-[4.5em]">{W.picked ? p.pitch : 'The pick is announced here.'}</p>
      </div>
      <div className="pk-seal size-40 justify-self-end text-accent phone:hidden" aria-hidden="true">{W.picked && c.seal ? <MergedSeal ids={W.cs.map((x) => x.id)} size={160} /> : null}</div>
    </section>
  );
}
