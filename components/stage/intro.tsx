'use client';
import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { NEEDS, ONE, RULES, TO_SUBMIT, editorOf } from '@/lib/stage/deck';
import { placeTime } from '@/lib/stage/rows';
import { CITIES, EVENT } from '@/lib/day-data';
import { PRIZES } from '@/lib/prizes';
import { sayIt } from '@/lib/hackday-server';
import { CODE } from '@/lib/places';
import type { CityLive, SceneRow } from '@/lib/stage/types';
import type { World } from '@/lib/stage/world';
import { NeoPrize, clampNeo, type NeoLook } from '@/components/day/neo';
import { PrizeGlass } from '@/components/day/prize-glass';
import { clampScope, type ScopeCfg } from '@/components/day/scope';
import { dayFacts } from '@/components/day/explain-facts';
import savedNeo from '@/saved/neo.config.json';
import savedScope from '@/saved/explain.config.json';
import type { Pen } from '@/components/day/pen';
import { hasFinal } from '@/lib/stage/event';
import { BeamLayer, SW, eio, eo } from './beam-layer';
import { Door, In, Num, Others, Words } from './parts';
import { useWall } from './use';

/* The intro, scenes 1 to 13, and a host's own slides. White on black, at most twelve words a scene, every size in
   the wall's pixels (stage.css). Each scene reads its step; a step a press added lands (In), a step the wall arrived
   at is simply there. */

export type SceneProps = { s: SceneRow; step: number; city: CityLive; world: World; now: number; url: string };
const INK = '#f4f4f2';
const cap = (s: string) => s.replace(/^an? /, '').replace(/^./, (c) => c.toUpperCase());

/* 1. Doors: the city, its time, when it starts, the door, and the other nine */
export function Doors({ city, world, now, url }: SceneProps) {
  const { name, ev } = useWall();
  return (
    <div className="st-sc st-doors">
      <div className="st-doors-l">
        <p className="st-k">{ev.bd ? EVENT.name : ev.name}</p>
        <h1 className="st-d1"><Words v={name} /></h1>
        <p className="st-h"><span className="st-2">It is </span><Num v={placeTime(city, now)} width={5} /><span className="st-2"> here.</span></p>
        <p className="st-b">{city.build_start ? 'Building started at ' + placeTime(city, city.build_start) + '.' : now < city.planned_start ? 'Building starts at ' + placeTime(city, city.planned_start) + '.' : 'Building starts soon.'}</p>
        {city.listed !== null ? <p className="st-b st-2">{city.listed} on the list{city.here !== null ? ', ' + city.here + ' here' : ''}</p> : null}
        <p className="st-b st-key">{TO_SUBMIT}</p>
      </div>
      <Door url={url} code={city.room_code} />
      <Others others={world.others} />
    </div>
  );
}

/* 2. Welcome */
export function Welcome({ s }: SceneProps) {
  const { name, ev } = useWall(), h = s.data.hosts?.filter(Boolean) ?? [];
  return (
    <div className="st-sc st-mid">
      <p className="st-h st-2">{ev.bd ? EVENT.name : ev.name}</p>
      <h1 className="st-d1"><Words v={name} /></h1>
      {h.length ? <p className="st-b st-2">Hosted by {h.length > 1 ? h.slice(0, -1).join(', ') + ' and ' + h[h.length - 1] : h[0]}</p> : null}
    </div>
  );
}

/* 3. A speaker: the name, what they do, one line, a picture (or their initials in a cell) */
export function Speaker({ s }: SceneProps) {
  const d = s.data, init = (d.name ?? '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="st-sc st-speaker">
      <div className="st-speaker-t">
        <h1 className="st-d2"><Words v={d.name ?? s.title} /></h1>
        {d.role ? <p className="st-b st-2">{d.role}</p> : null}
        {d.line ? <p className="st-h st-quote">“{d.line}”</p> : null}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a speaker's picture from the deck, any address */}
      {d.picture ? <img className="st-speaker-p" src={d.picture} alt="" /> : <span className="st-speaker-p st-speaker-i" aria-hidden="true">{init}</span>}
    </div>
  );
}
/* a host's words: a heading and up to three lines */
export function WordsSlide({ s }: SceneProps) {
  const l = (s.data.lines ?? []).slice(0, 3);
  return (
    <div className="st-sc st-mid">
      <h1 className="st-d2"><Words v={s.data.heading ?? s.title} /></h1>
      {l.length ? <ul className="st-list">{l.map((x, i) => <li key={i} className="st-h">{x}</li>)}</ul> : null}
    </div>
  );
}
/* a host's link: it opens on the laptop in a new tab; the wall holds a card */
export function LinkSlide({ s }: SceneProps) {
  return (
    <div className="st-sc st-mid">
      <h1 className="st-d2"><Words v={s.data.label ?? s.title} /></h1>
      {s.data.url ? <p className="st-b st-2">{s.data.url.replace(/^https?:\/\//, '')}</p> : null}
    </div>
  );
}

/* a host's product slide: a Supabase product's name, one line, a picture, and its link as a QR the room can scan.
   With a picture, the words and the QR sit on the left and the picture on the right; without one, the QR takes the
   right. */
export function ProductSlide({ s }: SceneProps) {
  const d = s.data, name = d.heading || s.title;
  const words = (
    <div className="st-product-t">
      <h1 className="st-d2"><Words v={name} /></h1>
      {d.line ? <p className="st-h st-2">{d.line}</p> : null}
    </div>
  );
  if (d.picture) return (
    <div className="st-sc st-product st-product-pic">
      <div className="st-product-l">
        {words}
        {d.url ? <Door url={d.url} code={null} size="small" /> : null}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a product picture from the deck, any address */}
      <img className="st-product-p" src={d.picture} alt="" />
    </div>
  );
  return (
    <div className="st-sc st-product">
      {words}
      {d.url ? <Door url={d.url} code={null} /> : null}
    </div>
  );
}

/* 4. What is a backend? */
export function Question({ s }: SceneProps) {
  return <div className="st-sc st-mid"><h1 className="st-d2"><Words v={s.title} /></h1></div>;
}

/* 5. A handful of things: the seven needs, one per press, each wired to what you would otherwise set up yourself; the
   last press folds six of them into one project (the editor stays the editor). Tube draws the wires with the beam;
   Board turns the right-hand cells on its flaps; Plain swaps the words. */
const ROW_Y = [372, 500, 586, 672, 758, 844, 930], WIRE: [number, number] = [790, 980], BOX = { x0: 1000, x1: 1824, y0: 444, y1: 998 };
export function Needs({ s, step }: SceneProps) {
  const { cfg, reduced, fresh } = useWall(), folded = step > NEEDS.length, shown = Math.min(step, NEEDS.length);
  const editor = editorOf(s), times = useRef<Map<number, number>>(new Map());
  /* when each wire appeared, and the fold: stamped as they mount, so a press draws only its own line */
  useEffect(() => {
    const now = performance.now(), m = times.current;
    for (let i = 1; i <= step; i++) if (!m.has(i)) m.set(i, fresh(i) ? now : -Infinity);
    for (const k of [...m.keys()]) if (k > step) m.delete(k);
  }, [step, fresh]);
  const draw = useCallback((pen: Pen, now: number) => {
    let moving = false;
    const t = (i: number, ms: number) => { const a = times.current.get(i); if (a === undefined) return 0; if (a === -Infinity || reduced || ms <= 0) return 1; const u = (now - a) / ms; if (u < 1) moving = true; return Math.min(1, Math.max(0, u)); };
    const fold = folded ? eio(t(NEEDS.length + 1, cfg.foldMs)) : 0;
    for (let i = 0; i < shown; i++) {
      const y = ROW_Y[i], u = eo(t(i + 1, cfg.drawMs)), x1 = WIRE[0] + (WIRE[1] - WIRE[0]) * u;
      /* a wire to its vendor; folded, the six run on into the one box */
      const end = i > 0 ? x1 + (BOX.x0 - WIRE[1]) * fold : x1;
      pen.stroke([[[WIRE[0], y], [end, y]]], INK, 0.9, 1, 1);
      if (u > 0) pen.dot([WIRE[0], y], 2.2, INK, 1, 1.2);
      if (u >= 1 && (i === 0 || fold < 1)) pen.dot([x1, y], 2.2, INK, (i === 0 ? 1 : 1 - fold), 1.2);
    }
    if (fold > 0) {
      /* the box draws on round its edge from the top left, the top edge broken where its label sits */
      const { x0, x1, y0, y1 } = BOX, gap: [number, number] = [x0 + 24, x0 + 24 + 452];
      const edge: [number, number][] = [[gap[1], y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0], [gap[0], y0]];
      let L = 0; for (let j = 1; j < edge.length; j++) L += Math.hypot(edge[j][0] - edge[j - 1][0], edge[j][1] - edge[j - 1][1]);
      let left = L * fold; const out: [number, number][] = [edge[0]];
      for (let j = 1; j < edge.length && left > 0; j++) {
        const a = edge[j - 1], b = edge[j], d = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.min(1, left / d);
        out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); left -= d;
      }
      pen.stroke([out], INK, 0.95, 1.2, 1.2);
    }
    return moving;
  }, [shown, folded, reduced, cfg.drawMs, cfg.foldMs]);
  return (
    <div className="st-sc st-needs" data-folded={folded ? '' : undefined}>
      <h1 className="st-d3 st-needs-h"><Words v="Every app needs a handful of things behind it" /></h1>
      <p className="st-k st-needs-a">Your app needs to</p>
      <p className="st-k st-needs-b">{folded ? '' : 'or you wire it yourself'}</p>
      {cfg.dir === 'tube' ? <BeamLayer draw={draw} k={'needs:' + step} /> : null}
      <ol className="st-needs-l">
        {NEEDS.slice(0, shown).map(([need, vendor], i) => (
          <li key={need} className="st-need" style={{ top: `calc(${ROW_Y[i] - 46} * var(--px))` }}>
            <In i={i + 1} className="st-need-n"><span>{need}</span></In>
            <In i={i + 1} className="st-need-v">
              {i === 0 ? <span>{cap(editor)}</span> : cfg.dir === 'board' ? <Words v={folded ? ONE[i - 1] : vendor} /> : <span key={folded ? 'one' : 'v'} className={folded ? 'st-need-one' + (fresh(NEEDS.length + 1) ? ' st-in' : '') : undefined}>{folded ? ONE[i - 1] : vendor}</span>}
            </In>
          </li>
        ))}
      </ol>
      {folded ? <In i={NEEDS.length + 1} className="st-needs-one"><span>One Supabase project</span></In> : null}
      {cfg.dir !== 'tube' && folded ? <span className="st-needs-box" aria-hidden="true" /> : null}
    </div>
  );
}

/* 6. The tour: a holding card while the host shows it in the next tab */
export function Tour() {
  return (
    <div className="st-sc st-mid">
      <h1 className="st-d2"><Words v="Platform tour" /></h1>
      <p className="st-h st-2">On the next tab.</p>
    </div>
  );
}

/* 7. Say what you want */
export function Say() {
  return (
    <div className="st-sc st-mid">
      <p className="st-d3 st-2">You don’t need to know how.</p>
      <h1 className="st-d2"><Words v="Say what you want to build." /></h1>
    </div>
  );
}

/* 8. Prototype to Petabyte: the line draws from one to the other, then the captions, then the heading */
export function Line({ step }: SceneProps) {
  const { cfg, reduced, fresh } = useWall(), a = useRef<HTMLSpanElement>(null), b = useRef<HTMLSpanElement>(null), t0 = useRef(-Infinity);
  useEffect(() => { if (step >= 1 && t0.current === -Infinity) t0.current = fresh(1) ? performance.now() : -1; if (step < 1) t0.current = -Infinity; }, [step, fresh]);
  const draw = useCallback((pen: Pen, now: number) => {
    if (step < 1 || !a.current || !b.current) return false;
    const wall = a.current.closest('.sw-in')!.getBoundingClientRect(), k = SW / wall.width;
    const ra = a.current.getBoundingClientRect(), rb = b.current.getBoundingClientRect();
    const y = ((ra.top + ra.bottom) / 2 - wall.top) * k + 6, x0 = (ra.right - wall.left) * k + 40, x1 = (rb.left - wall.left) * k - 40;
    const u = t0.current < 0 || reduced || cfg.lineMs <= 0 ? 1 : Math.min(1, (now - t0.current) / cfg.lineMs), e = eio(u);
    pen.stroke([[[x0, y], [x0 + (x1 - x0) * e, y]]], INK, 0.9, 1.1, 1);
    /* the beam's head is hot while it travels */
    if (u < 1) pen.dot([x0 + (x1 - x0) * e, y], 3, INK, 1, 1.6);
    return u < 1;
  }, [step, reduced, cfg.lineMs]);
  return (
    <div className="st-sc st-line">
      {/* every part is laid out from the first step and hidden until its press, so nothing moves when one arrives */}
      <p className={'st-h st-2 st-line-top' + (step >= 3 ? (fresh(3) ? ' st-in' : '') : ' st-hide')} aria-hidden={step < 3}>Same experience, every stage</p>
      <div className="st-line-row">
        <span ref={a} className="st-d2"><Words v="Prototype" /></span>
        {step >= 1 ? <In i={1} as="span" className="st-line-b"><span ref={b} className="st-d2"><Words v="Petabyte" /></span></In> : <span ref={b} className="st-line-b st-line-ghost" aria-hidden="true">Petabyte</span>}
      </div>
      {cfg.dir === 'tube' ? <BeamLayer draw={draw} k={'line:' + step} /> : step >= 1 ? <In i={1} as="span" className="st-line-css"><span /></In> : null}
      <div className={'st-line-cap' + (step >= 2 ? (fresh(2) ? ' st-in' : '') : ' st-hide')} aria-hidden={step < 2}><span className="st-b st-2">A weekend project</span><span className="st-b st-2">A public company</span></div>
    </div>
  );
}

/* 9. The deadline: the wall says how long; the second press turns the board to the deadline in the city's time. The
   deadline is the one the flip wrote on the stage row (so the clock keeps to what the wall said), or, once building has
   started, the real close. */
export const DeadlineCtx = createContext<{ deadline: number | null }>({ deadline: null });
export function Deadline({ step, city }: SceneProps) {
  const { deadline } = useContext(DeadlineCtx), start = city.build_start ?? city.planned_start;
  const at = step ? (city.build_end ?? deadline ?? start + city.build_min * 60000) : start;
  return (
    <div className="st-sc st-mid st-deadline">
      <h1 className="st-d2"><Words v={'You have ' + city.build_min + ' minutes.'} /></h1>
      <p className="st-flap-row"><Num v={(step ? 'Deadline ' : 'Starts   ') + placeTime(city, at)} width={14} className="st-flap" /></p>
    </div>
  );
}

/* 10. The rules, one per press; the earlier ones stay */
export function Rules({ step }: SceneProps) {
  return (
    <div className="st-sc st-mid">
      <ol className="st-rules">{RULES.slice(0, step + 1).map((r, i) => <In key={r} i={i} as="li" className="st-d3"><span className="st-rule-n">{i + 1}</span><span>{r}</span></In>)}</ol>
      {/* the last press: who may submit and who may vote, side by side so the room does not mix them up */}
      {step >= RULES.length ? (
        <In i={RULES.length} as="dl" className="st-who">
          <div><dt className="st-k">Submit</dt><dd className="st-b">People on the Luma list, signed in with Supabase and checked in at the door.</dd></div>
          <div><dt className="st-k">Vote</dt><dd className="st-b">Anyone: give an email and confirm it once.</dd></div>
        </In>
      ) : null}
    </div>
  );
}

/* 11. The prizes: the city prize, then the pick; the drawings already built (the laptop, the glass) */
const NEO = clampNeo(savedNeo as Partial<NeoLook>), SCOPE = clampScope(savedScope as Partial<ScopeCfg>);
export function Prizes(props: SceneProps) {
  const { ev } = useWall();
  return ev.bd ? <BuilderPrizes {...props} /> : <EventPrizes {...props} />;
}
/* another event's prizes, in words: the place prize, then (where there is one) the final's prize. No drawings: they
   are Builder Day's laptop and ten-city glass. */
function EventPrizes({ step }: SceneProps) {
  const { ev } = useWall(), final = hasFinal(ev);
  const place = ev.placePrize ? cap(ev.placePrize) : 'To be announced';
  const who = ev.decide === 'apart' ? 'For the judges’ pick here' : ev.decide === 'judges' ? 'For the judges’ 1st place here' : 'For 1st place here';
  return (
    <div className="st-sc st-prizes">
      <div className="st-prize">
        <p className="st-d3"><Num v={place} /></p>
        <p className="st-b st-2">{who}</p>
      </div>
      {final && step >= 1 ? (
        <In i={1} className="st-prize">
          <p className="st-d3"><Num v={ev.prize ? cap(ev.prize) : 'To be announced'} /></p>
          <p className="st-b st-2">For the pick from the final</p>
        </In>
      ) : null}
      {final && step >= 1 ? <In i={1} as="p" className="st-h st-prizes-cut"><span className="st-g" data-g="">The top {ev.finalists}</span> of each place go to the final.</In> : null}
    </div>
  );
}
function BuilderPrizes({ step }: SceneProps) {
  const { cfg } = useWall(), item = cap(PRIZES.city.what ?? 'To be announced'), amount = cap(PRIZES.global.what ?? 'To be announced');
  const cities = dayFacts().cities, n = CITIES.length * EVENT.finalists;
  return (
    <div className="st-sc st-prizes">
      <div className="st-prize">
        {cfg.dir === 'tube' ? <div className="st-prize-d st-glass"><NeoPrize cfg={NEO} cities={CITIES.map((c) => CODE[c.id])} /></div> : null}
        <p className="st-d3"><Num v={item} /></p>
        <p className="st-b st-2">For 1st place in each city</p>
      </div>
      {step >= 1 ? (
        <In i={1} className="st-prize">
          {cfg.dir === 'tube'
            ? <div className="st-prize-d st-glass"><PrizeGlass amount={amount} cities={cities} cfg={{ mirror: SCOPE.gMirror, through: SCOPE.gThrough, fringe: SCOPE.gFringe, turn: SCOPE.gTurn, size: SCOPE.gSize, row: !!SCOPE.gRow, on: !!SCOPE.gOn, big: SCOPE.gBig, touch: SCOPE.gTouch }} /></div>
            : <p className="st-d3"><Num v={amount} /></p>}
          {cfg.dir === 'tube' ? <p className="sr-only">{amount}</p> : null}
          <p className="st-b st-2">For the pick from the {n} finalists</p>
        </In>
      ) : null}
      {step >= 1 ? <In i={1} as="p" className="st-h st-prizes-cut"><span className="st-g" data-g="">The top {EVENT.finalists}</span> in each city go to the final.</In> : null}
    </div>
  );
}

/* 12. How to submit: from the editor, then on the web */
export function Submit({ s, step, city, url }: SceneProps) {
  const { name, fresh } = useWall();
  return (
    <div className="st-sc st-submit">
      <div className="st-submit-l">
        <h1 className="st-d3">From {editorOf(s)}, say:</h1>
        <p className="st-d3 st-say">“{sayIt(name)}”</p>
        <p className="st-b st-2">It works once a host has checked you in at the door.</p>
      </div>
      {/* the web half holds its place from the first step, so the second press lands it without moving the first */}
      <div className={'st-submit-r' + (step >= 1 ? (fresh(1) ? ' st-in' : '') : ' st-hide')} aria-hidden={step < 1}><p className="st-h">{url ? 'Or on the web' : 'At the door'}</p><Door url={url} code={city.room_code} /><p className="st-l st-key">{TO_SUBMIT}</p></div>
    </div>
  );
}

/* 13. Questions? */
export function Questions({ city, url }: SceneProps) {
  return (
    <div className="st-sc st-questions">
      <h1 className="st-d1"><Words v="Questions?" /></h1>
      <Door url={url} code={city.room_code} size="small" />
    </div>
  );
}
