'use client';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { stageVars, type StageCfg } from '@/lib/stage/config';
import { TO_SUBMIT, TO_VOTE, visible } from '@/lib/stage/deck';
import { BD_WALL, hasVote, type WallEvent } from '@/lib/stage/event';
import { worldAt, type Content, type World } from '@/lib/stage/world';
import type { StageDriver } from '@/lib/stage/driver';
import type { CityLive, SceneKind, StageAction } from '@/lib/stage/types';
import { placeTime } from '@/lib/stage/rows';
import { clampParts, partsVars } from '@/components/board/config';
import partsSaved from '@/saved/parts.config.json';
import { Deadline, DeadlineCtx, Doors, LinkSlide, Line, Needs, Prizes, Question, Questions, Rules, Say, ProductSlide, Speaker, Submit, Tour, Welcome, WordsSlide, type SceneProps } from './intro';
import { Building, Final, Showcase, Tombola, Top3, Voting, wakeSound, type LiveProps } from './live';
import { Door } from './parts';
import { Wall as WallCtx, useArrival, useReduced, useSecond, useSnap, useAwake } from './use';
import { useStageKeys } from './keys';
import '@/components/board/board.css';
import '@/components/day/explain.css';
import './stage.css';

/* The wall: one 16:9 screen, designed at 1920 by 1080 and scaled to whatever shows it (every size is in its own
   pixels, --px). It shows the scene the stage row names, at its step, over the screen's lines and grain; glass objects
   (pictures, the QR, the prize drawings) sit above the lines. Blank and the QR are cuts over any scene. With `keys`, a
   laptop drives it (keys.ts); F for full screen works for anyone. */

const PARTS = partsVars(clampParts(partsSaved));
const SCENES: Record<SceneKind, (p: SceneProps & LiveProps) => ReactNode> = {
  doors: Doors, welcome: Welcome, speaker: Speaker, words: WordsSlide, link: LinkSlide, product: ProductSlide, question: Question, needs: Needs, tour: Tour, say: Say,
  line: Line, deadline: Deadline, rules: Rules, prizes: Prizes, submit: Submit, questions: Questions,
  building: Building, voting: Voting, showcase: Showcase, top3: Top3, tombola: Tombola, final: Final,
};

export type WallProps = {
  driver: StageDriver; cfg: StageCfg; name: string; url: string; seed: number; content: Content; first: number;
  /* a laptop driving with keys (the host's own, or the lab) */
  keys?: boolean;
  /* the lab's wall is framed: no full screen, keys only while the pointer or focus is in the lab */
  framed?: boolean;
  className?: string;
  /* the place's event: Builder Day unless the page says otherwise */
  event?: WallEvent;
  /* the numbers behind the live scenes: the seeded world by default; the real pages pass the snapshots' */
  source?: (o: { city: CityLive; now: number; rows: number; arrivals: number }) => World;
};

export function StageWall({ driver, cfg, name, url, seed, content, first, keys = false, framed = false, className, source, event = BD_WALL }: WallProps) {
  const snap = useSnap(driver), now = useSecond(driver, first), reduced = useReduced();
  const deck = visible(snap.deck), s = deck.find((x) => x.id === snap.row.scene) ?? deck[0], step = s ? snap.row.step : 0;
  const base = useArrival(s?.id ?? '', step);
  /* the ranking moves on the board tick; counts and the countdown on the second */
  const tickMs = cfg.tick * 1000, tick = Math.floor(now / tickMs) * tickMs;
  const make = useMemo(() => source ?? ((x: { city: CityLive; now: number; rows: number; arrivals: number }) => worldAt({ seed, content, ...x })), [source, seed, content]);
  const world = useMemo(() => make({ city: snap.city, now, rows: cfg.rows, arrivals: cfg.arrivals }), [make, snap.city, now, cfg.rows, cfg.arrivals]);
  const ranked = useMemo(() => make({ city: snap.city, now: tick, rows: cfg.rows, arrivals: cfg.arrivals }), [make, snap.city, tick, cfg.rows, cfg.arrivals]);
  useEffect(() => driver.attach(), [driver]);
  useAwake(!framed);
  const [ask, setAsk] = useState<{ q: string; a: StageAction } | null>(null);
  const [list, setList] = useState(false);
  const [num, setNum] = useState('');
  useStageKeys({ on: keys && snap.can.drive, framed, deck, onAction: (a) => {
    wakeSound();
    const q = driver.ask(a, name, (ms) => placeTime(snap.city, ms));
    if (q) setAsk({ q, a }); else void driver.send(a);
  }, onList: () => setList((v) => !v), ask, onConfirm: () => { if (ask) void driver.send(ask.a); setAsk(null); }, onCancel: () => { setAsk(null); setList(false); }, onNum: setNum });
  const style = { ...stageVars(cfg), ...PARTS } as CSSProperties;
  const ctx = useMemo(() => ({ cfg, name, ev: event, fresh: (i: number) => i > base, reduced, now: driver.now }), [cfg, name, event, base, reduced, driver]);
  const Scene = s ? SCENES[s.kind] : null;
  const props = s ? { s, step, city: snap.city, world, now, url, ranked, chart: snap.row.chart_on, talkEnds: snap.row.timer.ends_at ?? null, spin: snap.row.timer.spin ?? null } : null;
  return (
    <div className={'sw bd' + (className ? ' ' + className : '')} data-dir={cfg.dir} style={style} role="region" aria-roledescription="stage" aria-label={'Stage for ' + name + (s ? ': ' + s.title : '')}>
      <WallCtx.Provider value={ctx}>
        <DeadlineCtx.Provider value={{ deadline: snap.row.timer.deadline ?? null }}>
          <div className="sw-in" data-kind={s?.kind}>
            {Scene && props ? <Scene key={s!.id} {...props} /> : <div className="st-sc st-mid"><p className="st-h st-2">The deck is empty.</p></div>}
            {snap.row.timer.qr ? <div className="sw-qr"><p className="st-h">To submit</p><Door url={url} code={snap.city.room_code} /><p className="st-l st-key">{TO_SUBMIT.replace(/^To submit, s/, 'S')}</p>{hasVote(event) ? <p className="st-l st-2">{TO_VOTE}</p> : null}</div> : null}
            {list ? <ol className="sw-list">{deck.map((x, i) => <li key={x.id} data-on={x.id === s?.id ? '' : undefined}><span>{i + 1}</span>{x.title}</li>)}</ol> : null}
            {num ? <p className="sw-num st-k">Scene {num}, Enter to go</p> : null}
            {ask ? <div className="sw-ask" role="alertdialog" aria-label={ask.q}><p>{ask.q}</p><p className="st-2">Enter to go ahead, Esc or Back to cancel.</p></div> : null}
          </div>
          <div className="sw-lines" aria-hidden="true" />
          {snap.row.blank ? <div className="sw-blank" role="img" aria-label="The wall is blank" /> : null}
        </DeadlineCtx.Provider>
      </WallCtx.Provider>
    </div>
  );
}
