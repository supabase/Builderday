'use client';
import { Fragment, useRef } from 'react';
import clsx from 'clsx';
import { view } from '@/lib/home';
import { useDay } from '@/components/home/day-context';
import { Ruler } from '@/components/home/timetable';
import { ActionLink, CityName, DateLine, Facts, HoverPreview, JoinLine, SheetMasthead, LeadPic, Live, LocalTime, MiniDay, PhoneNow, StripAxis, StripNow, TopKey, TopLines, Trunk, nowIndex, useHoverPreview, useLabHome, zoomView } from './parts';
import { EVENT, CITY_WORD } from '@/lib/day-data';

/* Front page: the first viewport is a front page, not a table. Left (7 columns): the name very large on two lines,
   the date, the facts and the one action. Right (5): the live sentence large, the wire, and a small day. The full
   timetable starts under the fold, on 3 / 5 / 4 columns with bigger names and taller rows. */
export function FrontPage() {
  const { cfg, W } = useDay(), { zoom } = useLabHome(), V = zoomView(W, view(cfg, W), zoom);
  const box = useRef<HTMLDivElement>(null), { at, handlers } = useHoverPreview(box), ni = nowIndex(W);
  const pi = W.picked ? W.final.city.i : -1;
  return (
    <>
      <SheetMasthead quiet />
      <section className="lf-hero relative grid grid-cols-[var(--c7)_var(--c5)] gap-x-(--g) px-(--m) pt-12 pb-10 phone:grid-cols-1 phone:gap-y-8 phone:pt-8" aria-label={EVENT.name}>
        <div className="flex min-w-0 flex-col">
          <h1 className="lf-title font-semibold">Supabase<br />Builder Day</h1>
          <DateLine cls="mt-6 text-xl text-ink phone:mt-4 phone:text-lg" />
          <Facts cls="mt-auto grid-cols-4 gap-x-(--g) pt-8 rule-b pb-6 phone:mt-6 phone:grid-cols-2 phone:gap-y-4 phone:pt-0 phone:pb-5" vCls="text-lg phone:text-md" />
          <ActionLink cls="mt-6 h-11 self-start px-5 text-md" />
        </div>
        <div className="flex min-w-0 flex-col">
          <Live sCls="lf-sentence font-medium tracking-tight" lCls="mt-6" n={5} />
          <MiniDay V={V} cls="mt-auto pt-8 phone:pt-6" />
        </div>
      </section>
      <section id="cities" className="relative px-(--m) pt-6 pb-6" aria-label={`The ${CITY_WORD} cities, east to west`}>
        <div ref={box} className="relative" {...handlers}>
          <div className="h-7 phone:hidden" />
          <StripAxis V={V} W={W} cls="hs-stripcol top-0 bottom-0" />
          <ol className="relative">
            {W.cs.map((x) => (
              <Fragment key={x.i}>
                {ni === x.i ? <PhoneNow /> : null}
                <li className={clsx('hs-row hs-cols relative items-center rule-t hover:bg-tint-1', 'is-' + x.state)} data-ci={x.i}>
                  <span className="hs-c1 hs-namecell flex min-w-0 items-center justify-between gap-3">
                    <CityName x={x} cls="hs-rowname tracking-d48" />
                    <LocalTime x={x} cls="flex-none" />
                  </span>
                  <span className="hs-c2 hs-strip relative block h-full"><Ruler x={x} V={V} /></span>
                  <span className="hs-c3 hs-slot grid min-w-0 items-center gap-x-4">
                    <LeadPic x={x} cls="hs-pic" />
                    <span className="grid min-w-0 content-center gap-y-1">
                      <TopKey x={x} />
                      <TopLines x={x} line="text-sm/[20px]" tie />
                    </span>
                  </span>
                </li>
              </Fragment>
            ))}
            {ni === 10 ? <PhoneNow /> : null}
          </ol>
          <Trunk cls="top-7 bottom-0" pickTop={pi >= 0 ? 'calc(28px + var(--rh) * ' + pi + ')' : undefined} />
          <StripNow V={V} W={W} cls="hs-stripcol top-0 bottom-0" />
          <HoverPreview at={at} cls="hs-stripcol" />
        </div>
        <JoinLine cls="mt-3 mr-[calc(-1*var(--m)/2-10px)] phone:mr-0" />
      </section>
    </>
  );
}
