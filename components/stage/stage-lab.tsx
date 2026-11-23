'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CITIES, CITY_IDS } from '@/lib/day-data';
import { STAGE_BOUNDS, STAGE_DIRS, clampStage, type StageCfg, type StageDir } from '@/lib/stage/config';
import { defaultDeck } from '@/lib/stage/deck';
import { createLocalDriver, type Clock } from '@/lib/stage/driver';
import { MOMENTS, atMoment, labCity } from '@/lib/stage/lab';
import { CONTENTS, type Content } from '@/lib/stage/world';
import type { Link } from '@/lib/stage/types';
import { LabPanel, useLabSave, type Group } from '@/components/admin/kit';
import { StageWall } from './wall';
import { StageRemote } from './remote';
import './stage-lab.css';

/* /lab/stage: the wall and a phone-sized remote side by side, joined by the local driver, so the whole presentation
   can be tried with no backend. The remote's presses move the wall; so do the laptop's keys while the pointer is on
   the wall. The moments set the city's times and put a scene on; Content swaps in the worst cases; Link drops the
   connection, to see what the remote does then. Hold the clock stops time (for stills). Save writes
   saved/stage.config.json, which the real wall and remote read. A second tab of this lab is a second screen. */

const LINKS: [Link, string][] = [['local', 'Connected'], ['reconnecting', 'Reconnecting'], ['off', 'Off']];
const GROUPS: Group[] = [
  { name: 'Direction', knobs: [{ k: 'dir', kind: 'select', label: 'Direction' }] },
  { name: 'The room', knobs: [{ k: 'city', kind: 'select', label: 'City' }, { k: 'content', kind: 'select', label: 'Content' }, { k: 'link', kind: 'select', label: 'Link' }, { k: 'hold', kind: 'toggle', label: 'Hold the clock' }, { k: 'speed', kind: 'select', label: 'Clock speed' }, { k: 'sup', kind: 'toggle', label: 'Signed in as a super admin' }] },
  { name: 'The screen', knobs: [{ k: 'lines', kind: 'range', label: 'Line darkness' }, { k: 'pitch', kind: 'range', label: 'Line pitch, px' }, { k: 'fringe', kind: 'range', label: 'Colour step, px' }, { k: 'grain', kind: 'range', label: 'Grain' }, { k: 'safe', kind: 'range', label: 'Safe margin' }, { k: 'ink2', kind: 'range', label: 'Second ink, lightness' }] },
  { name: 'The beam', knobs: [{ k: 'beam', kind: 'range', label: 'Spot, px' }, { k: 'bright', kind: 'range', label: 'Brightness' }] },
  { name: 'Timings, ms', knobs: [{ k: 'enterMs', kind: 'range', label: 'A step lands' }, { k: 'drawMs', kind: 'range', label: 'A line draws' }, { k: 'foldMs', kind: 'range', label: 'The seven fold' }, { k: 'lineMs', kind: 'range', label: 'Prototype to Petabyte' }, { k: 'glideMs', kind: 'range', label: 'A row overtakes' }, { k: 'spinMs', kind: 'range', label: 'The tombola spins' }] },
  { name: 'Live scenes', knobs: [{ k: 'tick', kind: 'range', label: 'Ranking re-sorts, s' }, { k: 'talkMin', kind: 'range', label: 'Talk timer, min' }, { k: 'arrivals', kind: 'range', label: 'Arrivals shown' }, { k: 'rows', kind: 'range', label: 'Ranking rows' }, { k: 'sound', kind: 'toggle', label: 'Tombola clicks' }] },
];
const DIR_LABEL: Record<string, string> = { tube: 'Tube: big type, beam drawings, flaps for numbers', board: 'Board: the whole wall is the departures board', plain: 'Plain: type only, the floor' };

export type LabStart = { cfg: StageCfg; first: number; seed: number; city: string; moment: string; step: number; content: Content; hold: boolean; speed: number; origin: string; scene: string; only: '' | 'wall' | 'remote'; qr: boolean; rt: boolean };

export function StageLab({ start }: { start: LabStart }) {
  const [cfg, setCfg] = useState<StageCfg>(start.cfg);
  const [content, setContent] = useState<Content>(start.content);
  const [hold, setHold] = useState(start.hold);
  const [link, setLinkS] = useState<Link>('local');
  const [sup, setSup] = useState(true);
  const [mi, setMi] = useState(Math.max(0, MOMENTS.findIndex((m) => m.id === start.moment)));
  const [cityId, setCityId] = useState(start.city);
  /* the lab's clock: the real time, held at an instant (for stills), or run faster (to see entries arrive and rows
     overtake within a minute) */
  const [clock] = useState(() => {
    const c = {
      held: start.hold ? start.first : 0, speed: start.speed, base: start.first, t0: 0,
      now: () => { if (c.held) return c.held; if (c.speed === 1) return Date.now(); const t = Date.now(); if (!c.t0) c.t0 = t; return c.base + (t - c.t0) * c.speed; },
      rebase: () => { const n = c.now(); c.base = n; c.t0 = Date.now(); return n; },
    };
    return c as Clock & { held: number; speed: number; base: number; t0: number; rebase: () => number };
  });
  const [speed, setSpeed] = useState(start.speed);
  const [driver] = useState(() => {
    const m = MOMENTS[mi], s = atMoment(m, defaultDeck(start.city, true), labCity(start.city, start.first), start.first);
    /* ?scene= puts any scene on at the moment's times (a hidden one is shown) */
    const pick = start.scene ? s.deck.find((x) => x.kind === start.scene) : null;
    if (pick) { pick.hidden = false; s.row.scene = pick.id; }
    if (start.step) s.row.step = start.step;
    if (start.qr) s.row.timer = { ...s.row.timer, qr: true };
    return createLocalDriver({ ...s, clock, talkMin: start.cfg.talkMin, channel: 'hackday-stage-lab' });
  });
  useEffect(() => () => driver.close(), [driver]);

  const moment = useCallback((i: number, id = cityId) => {
    const now = clock.now(), s = atMoment(MOMENTS[i], defaultDeck(id, true), labCity(id, now), now);
    if (clock.held) clock.held = now;
    driver.setDeck(s.deck); driver.setCity(s.city); driver.setRow(s.row); setMi(i);
  }, [clock, driver, cityId]);

  const set = useCallback((k: string, v: unknown) => {
    if (k === 't') return moment(Number(v));
    if (k === 'content') return setContent(v as Content);
    if (k === 'link') { setLinkS(v as Link); driver.setLink(v as Link); return; }
    if (k === 'hold') { const on = !!v; if (on) clock.held = clock.now(); else { clock.base = clock.held; clock.held = 0; clock.t0 = Date.now(); } setHold(on); return; }
    if (k === 'speed') { clock.rebase(); clock.speed = Number(v); setSpeed(Number(v)); return; }
    if (k === 'sup') { const on = !!v; setSup(on); driver.setCan({ drive: true, super: on }); return; }
    if (k === 'city') { setCityId(String(v)); moment(mi, String(v)); return; }
    setCfg((c) => clampStage({ ...c, [k]: v }));
  }, [moment, driver, clock, mi]);
  const { save, msg, rail } = useLabSave('stage', 'lab-stage-saved');
  const out = (k: string) => { const v = Number(cfg[k as keyof StageCfg]); return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, ''); };
  const name = CITIES[Math.max(0, CITY_IDS.indexOf(cityId))].name;
  const url = start.origin + '/city/' + cityId;
  const panelCfg = useMemo(() => ({ ...cfg, content, link, hold: hold ? 1 : 0, speed: String(speed), sup: sup ? 1 : 0, city: cityId, seed: start.seed }), [cfg, content, link, hold, speed, sup, cityId, start.seed]);

  /* a still of one side alone: the wall filling the window, or the remote filling a phone */
  if (start.only === 'wall') return <main className="sl-only"><StageWall driver={driver} cfg={cfg} name={name} url={url} seed={start.seed} content={content} first={start.first} keys /></main>;
  if (start.only === 'remote') return <main className="sl-only sl-only-rm"><StageRemote driver={driver} name={name} first={start.first} /></main>;
  return (
    <>
      <main className="sl">
        <header className="sl-h">
          <h1>Stage · {DIR_LABEL[cfg.dir]}</h1>
          <p>The remote drives the wall. With the pointer on the wall, the keys do too: Right or Space for next, Left for back, a number then Enter, B, Q, ?. A second tab of this page is a second screen.</p>
          <p className="sl-note">Local driver: the wall and the remote talk inside this browser. {start.rt
            ? <>Realtime is here: <a href={'/city/' + cityId + '/stage'}>the real wall</a> and <a href={'/desk/' + cityId + '/remote'}>the real remote</a> run on the <code>stage</code> and <code>scenes</code> tables.</>
            : <>Realtime is not available on this server (no backend, or its tables are not there), so <a href={'/city/' + cityId + '/stage'}>the real wall</a> falls back to the seeded day.</>}</p>
        </header>
        <div className="sl-room">
          <section className="sl-wall" aria-label="The wall, 16:9">
            <StageWall driver={driver} cfg={cfg} name={name} url={url} seed={start.seed} content={content} first={start.first} keys framed />
          </section>
          <section className="sl-phone" aria-label="The remote, 390 by 844">
            <StageRemote driver={driver} name={name} first={start.first} />
          </section>
        </div>
      </main>
      <LabPanel title="Stage lab" cfg={panelCfg} bounds={STAGE_BOUNDS}
        choices={{ dir: STAGE_DIRS.map(([d]) => d), content: CONTENTS.map(([c]) => c), link: LINKS.map(([l]) => l), city: CITY_IDS, speed: ['1', '10', '60'] }}
        optionLabel={(k, v) => (k === 'dir' ? (STAGE_DIRS.find(([d]) => d === v)?.[1] ?? v) : k === 'content' ? (CONTENTS.find(([c]) => c === v)?.[1] ?? v) : k === 'link' ? (LINKS.find(([l]) => l === v)?.[1] ?? v) : k === 'city' ? (CITIES.find((c) => c.id === v)?.name ?? v) : k === 'speed' ? (v === '1' ? 'Real time' : v + '× faster') : v)}
        groups={GROUPS} set={set} moments={MOMENTS.map((m, i) => [m.id, m.label, i])} momentIdx={mi} out={out}
        buttons={[['Save', () => save({ ...cfg }), true], ['Replay the moment', () => moment(mi)]]}
        meter={{ text: 'Seed ' + start.seed + ' · ' + cfg.dir + ' · ' + (hold ? 'clock held' : speed > 1 ? 'clock ' + speed + '× fast' : 'clock running'), bad: false }} msg={msg} rail={rail}
        railLabel={(s) => String(s.dir) + ' · lines ' + String(s.lines)} apply={(s) => setCfg(clampStage(s as Partial<StageCfg>))} />
    </>
  );
}
export type { StageDir };
