'use client';
import { Fragment } from 'react';
import clsx from 'clsx';
import { EVENT, type Top } from '@/lib/day-data';
import { dur, fmtN, hhmm, ord } from '@/lib/format';
import { cityHref, localSpan, type HomeCity, type HomeWorld } from '@/lib/home';
import { PRIZES, globalPrize } from '@/lib/prizes';
import { LABEL } from '@/components/shared/page-parts';
import { useDay } from './day-context';
import { JudgeMark, liveOf } from './sheet-parts';

/* What the final below the Sheet is drawn from: a city's three places in the final and how sure each one is, the
   sentence over the final, the questions in the new format, and the footer with the ten cities. The home's tuning page
   draws its other ways to show the final from these too. */

/* how sure a place is: 'none' before a city starts or when it has no one there, 'now' while it is live, 'in' once
   voting has closed, 'pick' for the one Ant and Copple picked */
export type Sure = 'none' | 'now' | 'in' | 'pick';
export type Place = { k: number; t: Top | null; sure: Sure };
export function places(x: HomeCity, W: HomeWorld): Place[] {
  return [0, 1, 2].map((k) => {
    const t = x.top[k] || null;
    if (!t || x.state === 'next') return { k, t: null, sure: 'none' };
    if (x.state !== 'done') return { k, t, sure: 'now' };
    return { k, t, sure: W.picked && W.final.city.i === x.i && W.final.place === k + 1 ? 'pick' : 'in' };
  });
}
/* how many finalists are in, and how many there will be (a city with fewer than three entries sends fewer) */
export function finalCount(W: HomeWorld): { in: number; of: number } {
  const of = W.cs.reduce((a, x) => a + (x.state === 'done' ? x.top.length : EVENT.finalists), 0);
  return { in: W.finalists.length, of };
}
/* the final's one sentence, at the moment */
export function finalLine(W: HomeWorld): string {
  const f = W.final, c = finalCount(W);
  if (W.picked) return EVENT.pickers + ' picked ' + f.p.name + ', ' + ord(f.place) + ' in ' + f.city.name + '.';
  if (W.allDone) return 'All ' + c.of + ' finalists are in. ' + EVENT.pickers + ' pick one at ' + hhmm(W.S.pickAt) + ' UTC.';
  if (!c.in) return 'The top 3 in each city go to the final. ' + EVENT.pickers + ' pick one at ' + hhmm(W.S.pickAt) + ' UTC.';
  return c.in + ' of ' + c.of + ' finalists are in. ' + EVENT.pickers + ' pick one at ' + hhmm(W.S.pickAt) + ' UTC.';
}
/* a city's state in a few words, for the column beside its name */
export function cityNote(x: HomeCity): string {
  if (x.state === 'next') return 'Opens in ' + dur(x.wait!, true);
  if (x.state === 'build') return 'Building · ' + dur(x.left!, true) + ' left';
  if (x.state === 'vote') return 'Voting · ' + dur(x.left!, true) + ' left';
  return x.top.length ? 'Finalists' : 'Closed';
}
/* the city prize as a value, without the article */
export function cityPrizeName(): string { const w = PRIZES.city.what; return w ? w.replace(/^an? /, '').replace(/^./, (s) => s.toUpperCase()) : 'To be announced'; }
export function globalPrizeName(): string { const w = PRIZES.global.what; return w ? w.replace(/^an? /, '').replace(/^./, (s) => s.toUpperCase()) : 'To be announced'; }

/* one place: rank, name, votes with the judge mark */
export function PlaceText({ p, cls }: { p: Place; cls?: string }) {
  const t = p.t;
  return (
    <span className={clsx('grid min-w-0 grid-cols-[16px_minmax(0,1fr)_auto] items-baseline gap-x-2 tabular-nums', cls)}>
      <span className={clsx('text-xs', p.sure === 'pick' ? 'text-accent' : 'text-ink-2')} data-g={p.sure === 'pick' ? '1' : undefined}>{p.k + 1}</span>
      {t ? <span className={clsx('truncate', p.sure === 'now' ? 'text-ink-2' : 'text-ink', p.k === 0 && p.sure !== 'now' && 'font-medium')}>{t.p.name}</span> : <span className="text-ink-3">—</span>}
      {t ? <span className="flex items-baseline gap-2 text-xs text-ink-2"><JudgeMark j={t.j} />{fmtN(t.v)}<span className="sr-only"> votes</span></span> : <span />}
    </span>
  );
}

/* the city's name as its link, with its time */
export function CityCell({ x, big, cls }: { x: HomeCity; big?: boolean; cls?: string }) {
  const { cfg, W, carry } = useDay();
  return (
    <span className={clsx('grid min-w-0 content-start', cls)}>
      <a className={clsx('truncate tracking-snug', big ? 'text-xl' : 'text-lg', liveOf(x) ? 'font-semibold text-ink' : 'text-ink')} href={cityHref(x, cfg, W, carry)}>{x.name}</a>
      <span className="truncate text-xs text-ink-2 tabular-nums">{localSpan(x)} local</span>
      <span className="truncate text-xs text-ink-2 tabular-nums">{cityNote(x)}</span>
    </span>
  );
}

/* the pick, where the final ends: its picture, name and city once made; the time and the prize before */
export function PickBlock({ cls, big, bare }: { cls?: string; big?: boolean; bare?: boolean }) {
  const { W } = useDay(), f = W.final;
  return (
    <div className={clsx('grid min-w-0 content-start gap-y-2', cls)}>
      {bare ? null : <p className={LABEL}>The pick</p>}
      {W.picked ? (
        <>
          <p className={clsx('truncate leading-[1.05] font-medium tracking-d48 text-ink', big ? 'text-h1' : 'text-h2')}>{f.p.name}</p>
          <p className="text-sm text-ink-2">{ord(f.place)} in {f.city.name} · {fmtN(f.v)} votes</p>
        </>
      ) : (
        <p className={clsx('leading-[1.1] tracking-snug text-ink-2', big ? 'text-h1' : 'text-h2')}>One of {finalCount(W).of}, at {hhmm(W.S.pickAt)} UTC</p>
      )}
      <p className="text-sm text-ink-2">{globalPrize(W.picked)}</p>
    </div>
  );
}
