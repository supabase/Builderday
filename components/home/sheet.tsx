'use client';
import { Fragment, useRef } from 'react';
import clsx from 'clsx';
import { view } from '@/lib/home';
import { useDay } from './day-context';
import { Ruler } from './timetable';
import { useLook } from './look';
import { CityName, DateLine, Facts, HoverPreview, JoinLine, SheetMasthead, LeadPic, Live, LocalTime, PhoneNow, StripAxis, StripNow, TopKey, TopLines, Trunk, nowIndex, useHoverPreview, zoomView } from './sheet-parts';
import { EVENT, CITY_WORD } from '@/lib/day-data';

/* Sheet: the home is one dense sheet that fits the first viewport. A title band on the table's own columns (the name
   over the names, the live sentence and the wire over the strip, the facts over the slot), then the ten rows with a
   wider slot that holds the leader's picture and the top 3 with judge marks. Closed cities tie their three to a trunk
   at the right edge. Columns: name (7 - sw), strip 5, slot sw; the sizes come from the saved look (--hs-nm, --hs-rh,
   --hs-sw on the page). */
export function Sheet() {
  const { cfg, W } = useDay(), { zoom } = useLook(), V = zoomView(W, view(cfg, W), zoom);
  const box = useRef<HTMLDivElement>(null), { at, handlers } = useHoverPreview(box), ni = nowIndex(W);
  const pi = W.picked ? W.final.city.i : -1;
  return (
    <>
      <SheetMasthead />
      <section className="hs-cols relative items-start px-(--m) pt-6 pb-5 phone:pt-5 phone:pb-6" aria-label={EVENT.name}>
        <div className="hs-c1 min-w-0">
          <h1 className="hs-title font-semibold whitespace-nowrap">{EVENT.name}</h1>
          <DateLine cls="mt-2 text-sm text-pretty text-ink-2" />
        </div>
        <div className="hs-c2 min-w-0">
          <Live sCls="text-h1/[1.15] tracking-tight phone:text-xl/[1.25]" lCls="mt-3 phone:hidden" n={2} />
        </div>
        <Facts cls="hs-c3 grid-cols-2 gap-x-(--g) gap-y-3 phone:grid-cols-2" vCls="text-sm" />
      </section>
      <section id="cities" className="relative px-(--m) pb-6" aria-label={`The ${CITY_WORD} cities, east to west`}>
        <div ref={box} className="relative" {...handlers}>
          <div className="h-7 phone:hidden" />
          <StripAxis V={V} W={W} cls="hs-stripcol top-0 bottom-0" />
          <ol className="relative">
            {W.cs.map((x) => (
              <Fragment key={x.i}>
                {ni === x.i ? <PhoneNow /> : null}
                <li className={clsx('hs-row hs-cols relative items-center rule-t wash hover:bg-tint-1 has-[a:focus-visible]:focus-row', 'is-' + x.state)} data-ci={x.i}>
                  <span className="hs-c1 hs-namecell flex min-w-0 items-center justify-between gap-3">
                    <CityName x={x} cls="hs-rowname tracking-d48 focus-visible:outline-none" />
                    <LocalTime x={x} cls="flex-none" />
                  </span>
                  <span className="hs-c2 hs-strip relative block h-full"><Ruler x={x} V={V} /></span>
                  <div className="hs-c3 hs-slot grid min-w-0 items-center gap-x-3">
                    <LeadPic x={x} cls="hs-pic" />
                    <div className="grid min-w-0 content-center gap-y-0.5">
                      <TopKey x={x} />
                      <TopLines x={x} line="text-xs/[15px]" tie />
                    </div>
                  </div>
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
