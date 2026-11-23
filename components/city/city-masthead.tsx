'use client';
import type { CSSProperties, MouseEvent } from 'react';
import { EPOCH, EVENT } from '@/lib/day-data';
import { action, cityHref, facts, homeHref, local, miniDay, r2, status } from '@/lib/city';
import clsx from 'clsx';
import { MastheadMark } from '@/components/shared/page-parts';
import { MH, MH_ACT, MH_ACT_G, MH_BAND } from '@/components/home/home-masthead';
import { useForms } from '@/components/forms/forms-provider';
import { useCity } from './city-context';
import { useYours } from './final-parts';

/* The masthead: the mark (home), the whole day in miniature (every bar a link to its city), the status line and the
   one main action, which follows who is looking: Remind me before the day, Submit while building, Share your project
   once a builder has one in, Vote for everyone else, then the finalists or the pick. A judge sees the votes left
   instead. Remind me and Submit open forms; the rest are links. */
export function CityMasthead() {
  const { W, cfg: c, L, mainRef, cur: curRef, who, judge, setShare } = useCity(), forms = useForms(), a = action(W, L), m = miniDay(W), yours = useYours();
  const shareAct = !!yours && W.voting;
  const at = (min: number) => new Date(EPOCH + min * 60000);
  const formAct = () => {
    if (!forms) return;
    if (a.act === 'submit') forms.submit({ city: W.city.id, cityName: W.city.name, deadline: at(W.x.buildEnd), off: W.off });
    if (a.act === 'remind') forms.remind({ city: W.city.id, cityName: W.city.name, when: at(W.x.start), off: W.off });
  };
  /* Vote takes you to the first row of the sheet */
  const onVote = (e: MouseEvent) => { e.preventDefault(); const f = mainRef.current?.querySelector<HTMLElement>('.cl-sheet a[data-row]'); if (f) { f.focus(); curRef.current = 0; } };
  return (
    <header className={clsx(MH, MH_BAND, 'cl-mh')}>
      <MastheadMark href={homeHref(W, '', L)} label={EVENT.name + ', the whole day'} />
      <nav className="mini grid h-11 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 tablet:grid-cols-[minmax(0,1fr)]" data-style={c.mini || undefined} aria-label="The whole day">
        <a className="mini-home grid h-11 content-center tablet:hidden" href={homeHref(W, '', L)}><span className="type-label text-ink-2">The day</span><span className="mini-v text-xs leading-[1.3] whitespace-nowrap text-ink tabular-nums">{EVENT.date}</span></a>
        <span className="mini-plot relative h-10">
          {m.bars.map((b) => (
            <a key={b.y.id} className={'mini-b is-' + b.y.state + (b.me ? ' is-me' : '')} href={cityHref(W, b.y.id, L)}
              style={{ '--l': b.l + '%', '--w': b.w + '%', '--j': b.j, '--fill': b.fill + '%' } as CSSProperties} aria-current={b.me ? 'page' : undefined} aria-label={b.y.name}><i /></a>
          ))}
          {m.now != null ? <i className="pointer-events-none absolute -top-0.5 -bottom-0.5 w-px bg-accent" style={{ left: m.now + '%' }} data-g="1" /> : null}
        </span>
      </nav>
      <p className="mh-status max-w-none truncate text-lg leading-[1.25] tracking-snug text-pretty text-ink phone:min-h-[2.5em] phone:whitespace-normal tablet:text-md">{status(W)}</p>
      {who === 'judge'
        ? <p className={clsx(MH_ACT, 'justify-self-end text-ink tabular-nums')} data-act="judge">{W.voting ? judge.left + ' of ' + EVENT.judgeVotes + ' votes left' : W.state === 'next' ? 'Judging opens at ' + local(W, W.x.start) : 'Judging has closed'}</p>
        : shareAct
        ? <button type="button" className={clsx(MH_ACT, MH_ACT_G, 'cursor-pointer')} data-g="1" data-act="share" onClick={() => setShare(true)}>Share your project</button>
        : a.act
        ? <button type="button" className={clsx(MH_ACT, MH_ACT_G, 'cursor-pointer')} data-g="1" data-act={a.act} onClick={formAct}>{a.t}</button>
        : <a className={clsx(MH_ACT, MH_ACT_G)} data-g="1" href={a.href} data-act={W.state} onClick={W.state === 'vote' ? onVote : undefined}>{a.t}</a>}
    </header>
  );
}

/* The title: the city's name, the largest thing on its page, and four facts */
export function CityTitle() {
  const { W, cfg: c } = useCity(), nm = W.city.name, tem = r2(nm.length * 0.5 + 0.3);
  return (
    <section className="cl-title relative grid grid-cols-[var(--c7)_var(--c5)] items-end gap-x-(--g) px-(--m) pt-6 pb-4 phone:grid-cols-[minmax(0,1fr)] phone:gap-y-4 phone:pt-4 phone:pb-3" data-title={c.title || undefined} aria-label={nm}>
      <h1 className="cl-city flex w-fit items-end leading-[0.92] font-regular tracking-d128 whitespace-nowrap [font-kerning:normal]" style={{ '--tem': tem } as CSSProperties}>{nm}</h1>
      <dl className="cl-facts grid grid-cols-[1fr_1fr] gap-x-(--g) gap-y-4 phone:gap-y-3">
        {facts(W).map((f, j) => (
          <div key={j} className="fact min-w-0">
            <dt className="type-label truncate text-ink-2">{f[0]}</dt>
            <dd className={clsx('mt-2 truncate text-h1 leading-none tracking-tight tabular-nums phone:mt-1 phone:text-xl tablet:text-xl', j === 0 && (W.state === 'next' || W.last) ? 'font-semibold' : 'font-medium')}>{f[1]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
