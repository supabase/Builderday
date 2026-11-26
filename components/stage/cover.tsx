'use client';
import type { ReactNode } from 'react';
import { EVENT } from '@/lib/day-data';
import { PRIZES } from '@/lib/prizes';
import { CODE } from '@/lib/places';
import { CITIES } from '@/lib/day-data';
import { RULES, TO_SUBMIT } from '@/lib/stage/deck';
import { placeTime } from '@/lib/stage/rows';
import { NeoPrize, clampNeo, type NeoLook } from '@/components/day/neo';
import savedNeo from '@/saved/neo.config.json';
import { Cells, Guide, Hosted, Mark } from './brand';
import { DotWord } from './dot-word';
import { Door, In, Num, Others } from './parts';
import { useWall } from './use';
import type { SceneProps } from './intro';

/* The intro on the Builder Day cover's look (the Cover, Orbit and Print directions): the Figma frames' system. The
   cover is the mark in the middle over the globe; every other scene sits in a frame (the small mark and the scene's
   label along the top, Hosted by along the bottom; the wall draws those), its words on the left, large, the second
   line in the second ink, numbers in green, facts in mono cells. Print draws a scene's one line in the globe's
   characters. */

const DAY = new Date(Date.UTC(EVENT.year, EVENT.month - 1, EVENT.day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/(\d+) (\w+)/, '$2 $1');
const cap = (s: string) => s.replace(/^an? /, '').replace(/^./, (c) => c.toUpperCase());
const NEO = clampNeo(savedNeo as Partial<NeoLook>);

/* a scene's big line: words, or in Print the picture of them (the words stay, for a screen reader) */
function Big({ v, cls = 'stc-d1', children }: { v: string; cls?: string; children?: ReactNode }) {
  const { cfg, fresh, reduced } = useWall();
  if (cfg.dir === 'print') return <h1 className={cls + ' stc-printed'}><span className="sr-only">{v}</span><DotWord text={v} fresh={fresh(0)} reduced={reduced} ms={cfg.enterMs * 2.4} /></h1>;
  return <h1 className={cls}>{children ?? v}</h1>;
}

/* the cover: the mark in the middle of the globe, the day's cells, Hosted by */
export function CoverWelcome({ s, city }: SceneProps) {
  const { name } = useWall(), h = s.data.hosts?.filter(Boolean) ?? [];
  return (
    <div className="stc-cover">
      <Guide />
      <div className="stc-cover-m"><Mark /></div>
      <div className="stc-cover-c">
        <Cells items={[DAY, name, city.build_min + ' minutes']} />
        {h.length ? <p className="stc-hosts">With {h.length > 1 ? h.slice(0, -1).join(', ') + ' and ' + h[h.length - 1] : h[0]}</p> : null}
      </div>
      <div className="stc-cover-h"><Hosted /></div>
    </div>
  );
}

/* Doors: the city and when it starts on the left; the door on the right; the other cities along the bottom */
export function CoverDoors({ city, world, now, url }: SceneProps) {
  const { name } = useWall();
  const starts = city.build_start ? 'Started at ' + placeTime(city, city.build_start) : now < city.planned_start ? 'Starts at ' + placeTime(city, city.planned_start) : 'Starts soon';
  return (
    <div className="stc-sc stc-doors">
      <div className="stc-doors-l">
        <h1 className="stc-d1"><span>{name}</span><span className="stc-2 stc-sub">{starts}</span></h1>
        <Cells items={[<>It is <Num v={placeTime(city, now)} width={5} /></>, ...(city.listed !== null ? [city.listed + ' on the list'] : []), ...(city.here !== null ? [city.here + ' here'] : [])]} />
        <p className="stc-b">{TO_SUBMIT}</p>
      </div>
      <Door url={url} code={city.room_code} />
      <Others others={world.others} />
    </div>
  );
}

/* a speaker: the name in two lines, what they do, their line; the picture on the right */
export function CoverSpeaker({ s }: SceneProps) {
  const d = s.data, init = (d.name ?? '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="stc-sc stc-speaker">
      <div className="stc-speaker-t">
        <h1 className="stc-d1 stc-name">{d.name ?? s.title}</h1>
        {d.role ? <p className="stc-h stc-2">{d.role}</p> : null}
        {d.line ? <p className="stc-h stc-quote">“{d.line}”</p> : null}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a speaker's picture from the deck, any address */}
      {d.picture ? <img className="stc-photo st-glass" src={d.picture} alt="" /> : <span className="stc-photo stc-init" aria-hidden="true">{init}</span>}
    </div>
  );
}

export function CoverWords({ s }: SceneProps) {
  const l = (s.data.lines ?? []).slice(0, 3);
  return (
    <div className="stc-sc stc-mid">
      <Big v={s.data.heading ?? s.title} />
      {l.length ? <ol className="stc-rows">{l.map((x, i) => <li key={i}><span className="stc-n">{String(i + 1).padStart(2, '0')}</span><span className="stc-h">{x}</span></li>)}</ol> : null}
    </div>
  );
}

/* one line alone: the question, the tour's card, Questions? */
export function CoverQuestion({ s }: SceneProps) {
  return <div className="stc-sc stc-mid stc-one"><Big v={s.title} cls="stc-d0" /></div>;
}
export function CoverTour() {
  return <div className="stc-sc stc-mid stc-one"><Big v="Platform tour" cls="stc-d0" /><p className="stc-h stc-2">On the next tab.</p></div>;
}
export function CoverSay() {
  return (
    <div className="stc-sc stc-mid stc-one">
      <p className="stc-d2 stc-2">You don’t need to know how.</p>
      <Big v="Say what you want to build." cls="stc-d1" />
    </div>
  );
}
export function CoverQuestions({ city, url }: SceneProps) {
  return (
    <div className="stc-sc stc-questions">
      <Big v="Questions?" cls="stc-d0" />
      <Door url={url} code={city.room_code} size="small" />
    </div>
  );
}

/* the deadline, as the frame "90 minutes to build": the minutes in green, the day's line under them (build, then
   vote, a tick each half hour in the city's time); the second press lights the deadline on the line and in its cell */
export function CoverDeadline({ step, city }: SceneProps & { deadline?: number | null }) {
  const { fresh } = useWall();
  const start = city.build_start ?? city.planned_start, end = city.build_end ?? start + city.build_min * 60000, close = end + city.vote_after * 60000;
  const span = close - start, ticks: number[] = [];
  for (let t = start; t <= close + 1; t += 30 * 60000) ticks.push(t);
  const at = (t: number) => ((t - start) / span) * 100 + '%';
  return (
    <div className="stc-sc stc-deadline">
      <h1 className="stc-big"><span className="stc-g stc-huge">{city.build_min}</span><span className="stc-d2">minutes <span className="stc-2">to build</span></span></h1>
      <div className="stc-time" aria-hidden="true">
        <p className="stc-time-k"><span style={{ left: 0 }}>Build · {city.build_min} minutes</span><span style={{ left: at(end) }}>Vote · {city.vote_after} more</span></p>
        <div className="stc-time-l"><span className="stc-time-b" style={{ width: at(end) }} />{step >= 1 ? <span className={'stc-time-d' + (fresh(1) ? ' st-in' : '')} style={{ left: at(end) }} /> : null}</div>
        <p className="stc-time-t">{ticks.map((t) => <span key={t} style={{ left: at(t) }}>{placeTime(city, t)}</span>)}</p>
      </div>
      <Cells items={[{ v: <>Starts <Num v={placeTime(city, start)} width={5} /></> }, { v: step >= 1 ? <>Deadline <Num v={placeTime(city, end)} width={5} /></> : <>Deadline <span className="stc-2">--:--</span></>, on: step >= 1 }]} />
    </div>
  );
}

/* the rules, numbered rows with rules between them, one per press; the last press: who may submit, who may vote */
export function CoverRules({ step }: SceneProps) {
  return (
    <div className="stc-sc stc-mid">
      <ol className="stc-rows stc-rules">{RULES.slice(0, step + 1).map((r, i) => <In key={r} i={i} as="li"><span className="stc-n">{String(i + 1).padStart(2, '0')}</span><span className="stc-d3">{r}</span></In>)}</ol>
      {step >= RULES.length ? (
        <In i={RULES.length} as="dl" className="stc-who">
          <div><dt className="stc-k">Submit</dt><dd className="stc-b">People on the Luma list, signed in with Supabase and checked in at the door.</dd></div>
          <div><dt className="stc-k">Vote</dt><dd className="stc-b">Anyone: give an email and confirm it once.</dd></div>
        </In>
      ) : null}
    </div>
  );
}

/* the prizes: the laptop for each city's 1st, then the amount for the pick, in green */
export function CoverPrizes({ step }: SceneProps) {
  const { ev } = useWall(), item = cap(PRIZES.city.what ?? 'To be announced'), amount = cap(PRIZES.global.what ?? 'To be announced');
  const n = CITIES.length * EVENT.finalists;
  return (
    <div className="stc-sc stc-prizes">
      <div className="stc-prize">
        {ev.bd ? <div className="stc-neo st-glass"><NeoPrize cfg={NEO} cities={CITIES.map((c) => CODE[c.id])} /></div> : null}
        <p className="stc-d2">{ev.bd ? item : cap(ev.placePrize || 'To be announced')}</p>
        <p className="stc-h stc-2">For 1st place in each city</p>
      </div>
      {step >= 1 ? (
        <In i={1} className="stc-prize stc-prize-g">
          <p className="stc-g stc-amount">{ev.bd ? amount : cap(ev.prize || 'To be announced')}</p>
          <p className="stc-h stc-2">For the pick from the {n} finalists</p>
        </In>
      ) : null}
      {step >= 1 ? <In i={1} as="p" className="stc-h stc-prizes-cut"><span className="stc-g">The top {ev.finalists}</span> in each city go to the final.</In> : null}
    </div>
  );
}
