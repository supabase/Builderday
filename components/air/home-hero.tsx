'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CITIES, EVENT } from '@/lib/day-data';
import type { HomeCity, HomeWorld } from '@/lib/home';
import { hhmm } from '@/lib/format';
import { Segment } from '@/components/board/segment';
import { useSecond, type DayClock } from '@/components/board/clock';
import { focusCity } from '@/components/board/day-model';
import { finalCount } from '@/components/home/final-parts';
import { LiveSegment } from '@/components/day/shared';
import { Cells, FAMILY, Key } from '@/components/kit/kit';
import { Picture } from '@/components/pictures/picture';
import { slugOf } from '@/lib/city';
import { routes } from '@/lib/routes';

/* The home's first screen on the family's frame: the news as the headline (the event's name is already in the header),
   one strip of cells, the day's clock and one Key; the voting gate is said on the city page. The globe on the right is the
   shell's. `headline: name` keeps the event's name as the h1 and says the news under it. */

const and = (xs: ReactNode[]): ReactNode[] => xs.flatMap((x, i) => (i === 0 ? [x] : [i === xs.length - 1 ? ' and ' : ', ', x]));
const ink = (xs: HomeCity[]) => and(xs.map((x) => <b key={x.id}>{x.name}</b>));

/* the news, one or two sentences true now, cities in ink and the rest dimmed */
export function homeNews(W: HomeWorld): ReactNode {
  const next = W.cs.filter((x) => x.state === 'next').sort((a, b) => a.start - b.start)[0];
  const at = (x: HomeCity) => hhmm(x.start + x.city.offset);
  if (W.picked) return <><b>{W.final.p.name}</b> wins {EVENT.short}.</>;
  if (W.allDone) return <>All {W.cs.length} cities are closed. The final pick is at <b>{hhmm(W.S.pickAt)} UTC</b>.</>;
  if (W.live.length) {
    const b = W.live.filter((x) => x.state === 'build'), v = W.live.filter((x) => x.state === 'vote');
    return (
      <>
        {b.length ? <>{ink(b)} {b.length > 1 ? 'are' : 'is'} building now. </> : null}
        {v.length ? <>{ink(v)} {v.length > 1 ? 'are in their' : 'is in its'} last votes. </> : null}
        {next ? <><b>{next.name}</b> opens next, at {at(next)} local.</> : <>It is the last city of the day.</>}
      </>
    );
  }
  if (!W.done.length) { const f = next ?? W.cs[0]; return <>The day starts at {at(f)} in <b>{f.name}</b>.</>; }
  return <>{W.done.length} of {CITIES.length} cities have closed. {next ? <><b>{next.name}</b> opens next, at {at(next)} local.</> : null}</>;
}

function PickClock({ clock, first, at }: { clock: DayClock; first: number; at: number }) {
  const s = useSecond(clock, first), secs = at * 60 - s;
  return <Segment className="oa-mix-seg" secs={secs} lit="CLOSED" label={'The pick is in ' + Math.max(1, Math.round(secs / 60)) + ' minutes.'} withSecs />;
}

export function HomeHero({ W, clock, first, href, segSecs, mine }: {
  W: HomeWorld; clock: DayClock; first: number; href: (id: string) => string; segSecs: boolean; mine?: string | null;
}) {
  const fx = focusCity(W), live = fx.state === 'build' || fx.state === 'vote';
  const early = live && fx.publicAt != null && W.now < fx.publicAt && mine !== fx.id;
  const fc = finalCount(W);
  const count = (s: HomeCity['state']) => W.cs.filter((x) => x.state === s).length;
  const news = homeNews(W);
  const name = FAMILY.headline === 'name';
  /* the one thing to do now */
  const key = W.picked ? { words: 'See ' + W.final.p.name, href: routes.project(W.final.city.id, slugOf(W.final.p)), link: true }
    : W.allDone ? { words: 'Watch the final', href: '#final', link: false }
    : { words: fx.state === 'next' ? 'See ' + fx.name : early ? 'Watch ' + fx.name : 'Vote in ' + fx.name, href: href(fx.id), link: true };
  const what = fx.state === 'next' ? 'opens' : fx.state === 'build' ? 'entries close' : 'votes close';
  return (
    <div className="oa-hh">
      <p className="oa-face-k">{EVENT.date} · {CITIES.length} cities, east to west</p>
      {name ? <><h1 id="dh-h" className="oa-hh-h" data-name="">{EVENT.name}</h1><p className="oa-hh-sub">{news}</p></>
        : <h1 id="dh-h" className="oa-hh-h"><span className="sr-only">{EVENT.name}: </span>{news}</h1>}
      {W.picked ? (
        /* the winner's picture is the hero at Picked (H8) */
        <a className="oa-hh-pick" href={routes.project(W.final.city.id, slugOf(W.final.p))}>
          <Picture p={W.final.p} cls="oa-just-pic" />
          <span className="oa-hh-pk">{W.final.p.name} · {W.final.city.name} · @{W.final.p.handle}</span>
        </a>
      ) : null}
      {W.picked ? null : <Cells label="The day now" cells={[
        { k: 'Building now', v: W.live.length },
        { k: 'Closed', v: count('done') },
        { k: 'Still to open', v: count('next') },
        { k: 'Finalists in', v: <>{fc.in}<span className="oa-hh-of"> of {fc.of}</span></> },
      ]} />}
      {W.picked ? null : (
        <div className="oa-hh-clock">
          <p className="oa-hh-ck">{W.allDone ? 'The pick' : <>{fx.name} <span>{what} at {hhmm((fx.state === 'next' ? fx.start : fx.state === 'build' ? fx.buildEnd : fx.end) + fx.city.offset)} local</span></>}</p>
          {W.allDone ? <PickClock clock={clock} first={first} at={W.S.pickAt} /> : <LiveSegment className="oa-mix-seg" clock={clock} first={first} x={fx} withSecs={segSecs} name={fx.name} />}
        </div>
      )}
      <div className="oa-face-acts">
        {key.link ? <Link className="k-key" data-kind="primary" href={key.href}>{key.words}</Link> : <Key href={key.href}>{key.words}</Key>}
      </div>
    </div>
  );
}
