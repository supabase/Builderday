'use client';
import { useLayoutEffect, useRef } from 'react';
import clsx from 'clsx';
import { EVENT } from '@/lib/day-data';
import { hhmm } from '@/lib/format';
import { showNow, type HomeCity, type HomeWorld } from '@/lib/home';
import { sentence, wire, wireTime } from '@/lib/wire';
import { prizeFacts } from '@/lib/prizes';
import { play, tokEase, tokMs } from '@/components/shared/motion';
import { NOW_TAG } from './timetable';
import { useDay } from './day-context';
import { useLook } from './look';

/* The Sheet's parts: the strip's zoom, the slim masthead, the live sentence and the wire, the facts, a city's top 3
   with the judge mark, the strip's ticks and now line, the trunk and the join, and the one shared hover preview. The
   home's tuning page draws its other directions from these too. */

/* ---------------- the strip's zoom ----------------
   day: the whole day, as today. fitted: from the first start to the last close, half an hour each side. folded: as
   fitted, and every stretch with no session longer than 45 minutes folds to 20, with a break on the axis. With the
   sun schedule the sessions spread across the whole day, so fitted gains little and folded a little more. */
export type Fold = { a: number; b: number };

/* phone: time runs down, so now is a line between the cities that have started and those that have not. It is a list
   item of no height, placed by the rows that render it. */
export function PhoneNow() {
  const { W } = useDay();
  if (!showNow(W)) return null;
  return (
    <li className="relative z-4 hidden h-6 phone:block" aria-hidden="true">
      <i className="absolute top-0 right-0 left-0 h-0.5 bg-accent" data-g="1" /><span className={NOW_TAG + ' top-0.5 left-0'}>Now {hhmm(W.now)} UTC</span>
    </li>
  );
}

/* ---------------- the live sentence and the wire ---------------- */
export function Sentence({ cls }: { cls?: string }) {
  const { W } = useDay();
  /* two lines held open whatever the moment, so the table under it never moves when the sentence wraps (rule 4) */
  return <p className={clsx('min-h-[2lh] text-pretty text-ink', cls)}>{sentence(W)}</p>;
}
/* n lines, newest first: the time, then the event. Before the day, one line says when it starts.
   A new line slides in from the top (the others move down one line, in --dur-slide) and stays lit for --dur-flash.
   Not on the first draw, and not while the pointer is on the list (it would move under the reader). */
export function WireList({ n, cls, city }: { n: number; cls?: string; city?: number }) {
  const { W } = useDay(), ev = wire(W, n, city), ref = useRef<HTMLOListElement>(null), seen = useRef<string | null>(null);
  const head = ev.length ? ev[0].m + ev[0].text : '';
  useLayoutEffect(() => {
    const ol = ref.current, was = seen.current; seen.current = head;
    if (!ol || was == null || !head || was === head || ol.matches(':hover')) return;
    const d = tokMs('--dur-slide'), f = tokMs('--dur-flash'), e = tokEase('--ease-out'), items = Array.from(ol.children);
    items.forEach((li) => play(li, [{ transform: 'translateY(-24px)' }, { transform: 'none' }], d, { ease: e }));
    if (items[0]) play(items[0], [{ opacity: 0 }, { opacity: 1 }], d, { ease: e });
    if (items[0] && f > 0) items[0].classList.add('hs-new');
  }, [head]);
  return (
    <ol ref={ref} className={clsx('grid content-start overflow-clip', cls)} style={{ minHeight: n * 24 + 'px' }} aria-label="What just happened" aria-live="polite">
      {ev.length ? ev.map((e, j) => (
        <li key={e.m + e.text} className="grid h-6 grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3 text-sm/none rule-t">
          <span className={clsx('text-xs/none tabular-nums', j === 0 ? 'text-ink' : 'text-ink-2')}>{wireTime(e)}</span>
          <span className={clsx('min-w-0 truncate', j === 0 ? 'text-ink' : 'text-ink-2')} title={e.text}>{e.text}</span>
        </li>
      )) : <li className="flex h-6 items-center text-sm/none text-ink-2 rule-t">Nothing yet. The first city opens at {hhmm(W.S.first)} UTC.</li>}
    </ol>
  );
}
/* the sentence, the sentence and the list, or neither, as the knob says */
export function Live({ sCls, lCls, n }: { sCls: string; lCls?: string; n: number }) {
  const { wire: mode } = useLook();
  if (mode === 'off') return null;
  return <><Sentence cls={sCls} />{mode === 'list' ? <WireList n={n} cls={lCls} /> : null}</>;
}

/* ---------------- the facts: the format and the prizes; the date stands on its own ---------------- */
export function factCells(W: HomeWorld, prizes = true): [string, string][] {
  const fin = W.cs.reduce((t, x) => t + (x.state === 'done' ? Math.min(EVENT.finalists, x.entries) : EVENT.finalists), 0);
  return [['Cities', '10, one day'], ['Finalists', fin + ', top 3 each'], ...(prizes ? prizeFacts() : [])];
}
/* the facts; the prizes join them when the look says so (the final below names them too) */
export function Facts({ cls, vCls }: { cls?: string; vCls?: string }) {
  const { W } = useDay(), { factPrizes } = useLook();
  return (
    <dl className={clsx('grid', cls)}>
      {factCells(W, factPrizes).map((f) => <div key={f[0]} className="min-w-0"><dt className="type-label truncate text-ink-2">{f[0]}</dt><dd className={clsx('mt-1 truncate tabular-nums', vCls)}>{f[1]}</dd></div>)}
    </dl>
  );
}

/* ---------------- a city's top 3 ---------------- */
/* a judge's mark: a small outlined square and how many of the votes are judges' */
export function JudgeMark({ j, long }: { j: number; long?: boolean }) {
  if (!j) return null;
  return (
    <span className="inline-flex flex-none items-center gap-1 text-ink-2 tabular-nums" title={j + ' from judges'}>
      <i className="inline-block size-[7px] edge-ink-2" aria-hidden="true" />
      {long ? <span>{j} from judges</span> : <><span aria-hidden="true">{j}</span><span className="sr-only">{j} from judges</span></>}
    </span>
  );
}
export function liveOf(x: HomeCity): boolean { return x.state === 'build' || x.state === 'vote'; }

/* ---------------- the trunk and the join: thirty become one ---------------- */
/* the trunk runs down the right edge, beside the rows: dashed until every city has closed, then solid, and green from
   the picked city down once the pick is made. cls places it; pickTop is where the green starts. */
export function Trunk({ pickTop, cls }: { pickTop?: string; cls?: string }) {
  const { W } = useDay();
  return (
    <>
      <i className={clsx('absolute right-[calc(-1*var(--m)/2)] w-(--hair) phone:hidden', W.allDone ? 'bg-ink-3' : 'dash-y', cls)} aria-hidden="true" />
      {W.picked && pickTop ? <i className="absolute right-[calc(-1*var(--m)/2-1px)] bottom-0 w-(--line-thick) bg-accent phone:hidden" style={{ top: pickTop }} data-g="1" aria-hidden="true" /> : null}
    </>
  );
}

