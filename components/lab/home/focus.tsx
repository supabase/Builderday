'use client';
import { Fragment, useRef } from 'react';
import clsx from 'clsx';
import { fmtN, ord } from '@/lib/format';
import { cityHref, view, type HomeCity, type HomeWorld } from '@/lib/home';
import { useDay } from '@/components/home/day-context';
import { MH_ACT, MH_ACT_LINE } from '@/components/home/home-masthead';
import { Ruler } from '@/components/home/timetable';
import { CityName, DateLine, Facts, HoverPreview, JoinLine, JudgeMark, SheetMasthead, LeadPic, Live, LocalTime, PhoneNow, StripAxis, StripNow, TopKey, TopLines, Trunk, liveOf, nowIndex, pickedPlace, stateLine, useHoverPreview, useLabHome, zoomView } from './parts';
import { EVENT, CITY_WORD } from '@/lib/day-data';

/* Focus: the cities that matter now open up; the rest stay compact. An open row is tall: the name, its state and its
   own action; the bar with the three contenders under it; a big picture of first place. A compact row is one line.
   Which rows open: the live cities; with none live, your city or the next to open; once the pick is made, the picked
   city. Rows that have not started are dashed. */
export function openRows(W: HomeWorld, you: number): Set<number> {
  if (W.picked) return new Set([W.final.city.i]);
  if (W.live.length) return new Set(W.live.map((x) => x.i));
  if (you >= 0) return new Set([you]);
  const next = W.cs.filter((x) => x.state === 'next').sort((a, b) => a.start - b.start)[0];
  return new Set(next ? [next.i] : []);
}
function rowAction(x: HomeCity): string {
  if (x.state === 'next') return 'Join in ' + x.name;
  if (x.state === 'build') return 'Join or vote in ' + x.name;
  if (x.state === 'vote') return 'Vote in ' + x.name;
  return 'See ' + x.name + '’s finalists';
}
/* the three contenders, side by side under the bar */
function Contenders({ x }: { x: HomeCity }) {
  const { W } = useDay(), pk = pickedPlace(x, W);
  if (!x.top.length) return <div className="self-start pt-1"><TopLines x={x} line="text-sm/[20px]" /></div>;
  return (
    <ol className="lo-cont grid grid-cols-3 gap-x-(--g)">
      {x.top.map((t) => (
        <li key={t.p.id} className="grid min-w-0 content-start gap-y-0.5 pt-2 rule-t">
          <span className={clsx('type-label', (t.place === 1 && liveOf(x)) || pk === t.place ? 'text-accent' : 'text-ink-2')}>{ord(t.place)}{x.state === 'done' ? ' · finalist' : ''}</span>
          <span className={clsx('truncate text-sm/[20px] font-medium', pk === t.place ? 'text-accent' : 'text-ink')} title={t.p.name} data-g={pk === t.place ? '1' : undefined}>{t.p.name}</span>
          <span className="flex items-baseline gap-2 text-xs text-ink-2 tabular-nums">{fmtN(t.v)} votes<JudgeMark j={t.j} long /></span>
        </li>
      ))}
    </ol>
  );
}
export function Focus() {
  const { cfg, W, carry } = useDay(), { zoom } = useLabHome(), V = zoomView(W, view(cfg, W), zoom);
  const box = useRef<HTMLDivElement>(null), { at, handlers } = useHoverPreview(box), ni = nowIndex(W);
  const open = openRows(W, cfg.you);
  return (
    <>
      <SheetMasthead />
      <section className="hs-cols relative items-end px-(--m) pt-8 pb-6 phone:pt-5" aria-label={EVENT.name}>
        <div className="hs-c12 min-w-0">
          <h1 className="lo-title font-semibold whitespace-nowrap">{EVENT.name}</h1>
          <Live sCls="mt-3 text-xl/[1.3] tracking-snug" lCls="mt-2 max-w-(--c7) phone:hidden" n={2} />
        </div>
        <div className="hs-c3 min-w-0">
          <DateLine cls="mb-4 text-sm text-ink-2" />
          <Facts cls="grid-cols-2 gap-x-(--g) gap-y-3" vCls="text-sm" />
        </div>
      </section>
      <section id="cities" className="relative px-(--m) pb-6" aria-label={`The ${CITY_WORD} cities, east to west`}>
        <div ref={box} className="relative" {...handlers}>
          <div className="h-7 phone:hidden" />
          <StripAxis V={V} W={W} cls="hs-stripcol top-0 bottom-0" />
          <ol className="relative">
            {W.cs.map((x) => {
              const o = open.has(x.i);
              return (
                <Fragment key={x.i}>
                  {ni === x.i ? <PhoneNow /> : null}
                  <li className={clsx('hs-cols relative rule-t hover:bg-tint-1', o ? 'lo-open items-stretch' : 'lo-row items-center', 'is-' + x.state, x.state === 'next' && !o && 'lo-next')} data-ci={x.i}>
                    {o ? (
                      <>
                        <span className="hs-c1 lo-namecell grid min-w-0 content-between py-4">
                          <span className="flex min-w-0 items-start justify-between gap-3">
                            <CityName x={x} cls="lo-name tracking-d48" />
                            <LocalTime x={x} cls="flex-none pt-1" />
                          </span>
                          <span className="flex min-w-0 items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-sm text-ink-2">{stateLine(x, W)}</span>
                            <a className={clsx(MH_ACT, MH_ACT_LINE, 'relative z-2 flex-none')} href={cityHref(x, cfg, W, carry)}>{rowAction(x)}</a>
                          </span>
                        </span>
                        <span className="hs-c2 grid min-w-0 grid-rows-[48px_minmax(0,1fr)] pb-4">
                          <span className="lo-strip relative block"><Ruler x={x} V={V} /></span>
                          <Contenders x={x} />
                        </span>
                        <span className="hs-c3 lo-slot grid min-w-0 content-center py-3">
                          <LeadPic x={x} cls="lo-pic" />
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="hs-c1 flex min-w-0 items-center justify-between gap-3">
                          <CityName x={x} cls="lo-cname" />
                          <LocalTime x={x} cls="lo-loc flex-none" />
                        </span>
                        <span className="hs-c2 lo-cstrip relative block h-full"><Ruler x={x} V={V} /></span>
                        <span className="hs-c3 flex min-w-0 items-center gap-2 text-sm">
                          <TopKey x={x} cls="max-w-[62%] flex-none" />
                          <span className="min-w-0 truncate">{x.state === 'next' ? '' : x.top[0] ? x.top[0].p.name : ''}</span>
                          {x.state === 'next' ? <span className="text-ink-2 tabular-nums">{stateLine(x, W).replace('Opens in ', '')}</span> : null}
                        </span>
                      </>
                    )}
                  </li>
                </Fragment>
              );
            })}
            {ni === 10 ? <PhoneNow /> : null}
          </ol>
          <Trunk cls="top-7 bottom-0" />
          <StripNow V={V} W={W} cls="hs-stripcol top-0 bottom-0" />
          <HoverPreview at={at} cls="hs-stripcol" />
        </div>
        <JoinLine cls="mt-3 mr-[calc(-1*var(--m)/2-10px)] phone:mr-0" />
      </section>
    </>
  );
}
