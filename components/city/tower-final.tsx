'use client';
import { Fragment, type CSSProperties } from 'react';
import clsx from 'clsx';
import { EVENT, top3, FINALIST_COUNT } from '@/lib/day-data';
import { local, ord, rowCls, sheetLabel, sheetList, view, type CityWorld, type Row } from '@/lib/city';
import { globalPrize } from '@/lib/prizes';
import { Picture } from '@/components/pictures/picture';
import { useCity } from './city-context';
import { FlashTick, NameLink, NowLine, Placeholder, ROW, SealMark, SheetHead, Trace, useRowAttrs } from './sheet-parts';
import { CutRule, Figures, GapLine, JudgeHint, JudgePresses, RowAct, placeLabel, usePlaceholders } from './final-parts';
import { RowOpen } from './project-view';

/* The city's sheet: the Tower with a final zone. The top 3 sit in a zone above one cut line ("Top 3
   go to the final."), the city prize beside the cut, each row's gap measured to the cut, judge votes marked on the
   row and as small squares on the trace. */
export function FinalSlot({ o }: { o: Row }) {
  const { W } = useCity(), g = o === W.lead && W.voting;
  return (
    <div className="slot cl-slot min-w-0 content-center items-center gap-x-3">
      <span className="slot-pic"><Picture p={o.p} /></span>
      <span className={clsx('type-label flex items-center gap-1.5 truncate phone:hidden', g ? 'text-accent' : 'text-ink-2')}>{g ? <i className="size-1.5 flex-none bg-accent" data-g="1" /> : null}{placeLabel(W, o)}</span>
      <Figures o={o} cls="text-sm font-medium phone:col-start-2 phone:row-start-2 phone:text-xs" />
      <span className="grid min-w-0 text-xs leading-[1.35] phone:hidden"><JudgeHint o={o} /><GapLine o={o} /></span>
    </div>
  );
}
/* the founders' pick, which is one of the thirty: its name, place and city, once made */
export function finalPick(W: CityWorld): { name: string; place: number; city: string; here: boolean } | null {
  const f = W.SD.final, fc = W.S.cs[f.city], ft = top3(W.SD.cities[f.city], fc, fc.end)[f.place - 1];
  return ft ? { name: ft.p.name, place: f.place, city: fc.city.name, here: f.city === W.i } : null;
}
/* under the sheet: the pick, and the global prize it wins (named once, here) */
export function FinalFoot() {
  const { W } = useCity(), fp = finalPick(W), g = W.picked && !!fp && fp.here;
  const t = W.picked && fp ? EVENT.pickers + ' picked ' + fp.name + ', ' + ord(fp.place) + ' in ' + fp.city + '.' : EVENT.pickers + ' pick one of the ' + FINALIST_COUNT + ' finalists at ' + local(W, W.S.pickAt) + '.';
  return (
    <p className="mt-2 flex min-h-10 items-center justify-between gap-x-(--g) text-sm text-ink-2 phone:flex-col phone:items-start phone:gap-y-1 phone:py-2">
      <span className={clsx('min-w-0 truncate', g && 'text-accent')} data-g={g ? '1' : undefined}>{t}</span>
      <span className="min-w-0 truncate">{globalPrize(W.picked)}</span>
    </p>
  );
}
export function TowerFinal() {
  const { W, cfg: c, shownIds, openId, pview } = useCity(), V = view(W), list = sheetList(W, shownIds, c.top), attrs = useRowAttrs();
  const zone = W.votesOn && W.arrived.length > 0, ph = usePlaceholders();
  return (
    <section className="cl-sheet cl-tower cf-tower relative px-(--m)" id="sheet" aria-label={sheetLabel(W, c)}>
      <SheetHead W={W} V={V} />
      {zone ? <i className="cf-zone pointer-events-none absolute top-(--headh) right-[calc(var(--m)/2)] left-(--m) h-[calc(var(--rowh)*min(3,var(--n)))] bg-tint-1 phone:hidden" style={{ '--n': Math.min(3, W.arrived.length) } as CSSProperties} aria-hidden="true" /> : null}
      {W.arrived.length === 0 && W.state !== 'next' ? <p className="pointer-events-none absolute top-(--headh) left-(--m) z-3 flex h-(--rowh) items-center text-sm text-ink-2">{ph}</p> : null}
      <ol className="cl-rows relative">
        {list.map((o, j) => {
          if (!o) return <Placeholder key={'e' + j} j={j} />;
          return (
            <Fragment key={'p' + o.p.id}>
              <li {...attrs(o, clsx(rowCls(W, o), ROW, W.votesOn && o.rank <= EVENT.finalists && 'cf-fin'), j)}>
                <NameLink o={o} />
                <span className="cl-strip"><Trace W={W} V={V} o={o} c={c} /><JudgePresses o={o} V={V} /><FlashTick W={W} V={V} o={o} /></span>
                <FinalSlot o={o} /><RowAct o={o} /><SealMark o={o} c={c} />
                {j === EVENT.finalists - 1 || (j === list.length - 1 && j < EVENT.finalists - 1 && W.arrived.length <= j + 1) ? <CutRule /> : null}
              </li>
              {pview === 'row' && openId === o.p.id ? <RowOpen id={o.p.id} /> : null}
            </Fragment>
          );
        })}
      </ol>
      <NowLine W={W} V={V} cls="left-[calc(var(--m)+var(--nameW)+var(--g))] h-[calc(var(--headh)+var(--rowh)*var(--top))] w-(--stripW) phone:hidden" />
      <FinalFoot />
    </section>
  );
}
