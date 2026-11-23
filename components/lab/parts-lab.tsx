'use client';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { CITIES, sched, nowOf } from '@/lib/day-data';
import { moments as homeMoments, type HomeCfg, DEF as HOME_DEF } from '@/lib/home';
import { hhmm, ord, fmtN, tz } from '@/lib/format';
import { slugOf, projectPath } from '@/lib/city';
import { PARTS_BOUNDS, PARTS_CHOICES, PARTS_DEF, clampParts, partsVars, type PartsCfg } from '@/components/board/config';
import { HeaderRow } from '@/components/board/header-row';
import { Announce } from '@/components/board/announce';
import { FlapText } from '@/components/board/flap';
import { TestCard, seedOf } from '@/components/board/test-card';
import { BoardingPass } from '@/components/board/pass';
import { Bug } from '@/components/board/bug';
import { DayGlobe } from '@/components/board/day-globe';
import { Switches, step } from '@/components/board/prefs';
import { StateChip, STATE_ORDER } from '@/components/screen/chip';
import { Flash, countDelta } from '@/components/screen/flash';
import { Picture } from '@/components/pictures/picture';
import { CODE, cityAt, cityWord, dayWord, focusCity, globeLabel, homeAt, lights, wireItems } from '@/components/board/day-model';
import { useMinute } from '@/components/board/clock';
import { LabPanel, togglePanel, useLabSave, type Group } from './lab-kit';
import { DayScreen, LiveSegment, dayOf, useLabClock } from '@/components/day/shared';
import '@/components/board/board.css';
import './day/day-lab.css';
import { EVENT } from '@/lib/day-data';
import { AIR_BOUNDS, AIR_CHOICES, AIR_DEF, clampAir, MARK, MARK_WORD, type AirParts, type MarkState } from '@/components/air/devices';
import { Bar, Count, Delta, StateCell, Wire } from '@/components/air/parts';
import '@/components/air/air.css';

/* The parts lab: every new part of the day pages alone, fed by the model at a moment of the day,
   with every value on a knob. Save writes saved/parts.config.json, which the day labs read.
   The lab clock runs live from the moment (speed: seconds a second), so flips and flashes happen as they would on the
   day. Keys: \ panel, S save. */

type LabState = PartsCfg & AirParts & { t: number; live: number; speed: number; worst: number; closedown: number };
const LAB_DEF = { t: 0.5, live: 1, speed: 1, worst: 1, closedown: 0 };
const LAB_BOUNDS = { ...PARTS_BOUNDS, ...AIR_BOUNDS, t: [0, 1, 0.001] as [number, number, number], speed: [1, 120, 1] as [number, number, number] };
const GROUPS: Group[] = [
  { name: 'Time', knobs: [{ k: 't', kind: 'range', label: 'Time' }, { k: 'live', kind: 'toggle', label: 'Clock runs' }, { k: 'speed', kind: 'range', label: 'Seconds a second' }, { k: 'worst', kind: 'toggle', label: 'Worst content' }] },
  { name: 'Grid and face', knobs: [{ k: 'grid', kind: 'range', label: 'Grid unit, px' }, { k: 'face', kind: 'select', label: 'Labels and numbers' }] },
  { name: 'Announcement line', knobs: [{ k: 'announce', kind: 'select', label: 'Mode on the pages' }, { k: 'dwell', kind: 'range', label: 'Flipper dwell, s' }, { k: 'crawl', kind: 'range', label: 'Crawl, px a second' }] },
  { name: 'Split-flap', knobs: [{ k: 'flap', kind: 'select', label: 'Flaps hold' }, { k: 'flipMs', kind: 'range', label: 'Flap, ms' }, { k: 'flaps', kind: 'range', label: 'Flaps passed' }, { k: 'stagger', kind: 'range', label: 'Stagger, ms' }, { k: 'tick', kind: 'range', label: 'Board tick, s (day labs)' }] },
  { name: 'Change', knobs: [{ k: 'mark', kind: 'select', label: 'Change mark' }, { k: 'lit', kind: 'select', label: 'Lit with' }, { k: 'hold', kind: 'range', label: 'Hold, ms' }, { k: 'fade', kind: 'range', label: 'Fade, ms' }] },
  { name: 'Segment', knobs: [{ k: 'segH', kind: 'range', label: 'Digit height, px' }, { k: 'segGap', kind: 'range', label: 'Gap, px' }, { k: 'segSecs', kind: 'toggle', label: 'Seconds' }] },
  { name: 'Test cards', knobs: [{ k: 'cardBars', kind: 'range', label: 'Bars' }, { k: 'cardPalette', kind: 'select', label: 'Palette' }, { k: 'closedown', kind: 'toggle', label: 'Show closedown' }] },
  { name: 'The day on air', knobs: [{ k: 'bar', kind: 'select', label: 'Vote bar' }, { k: 'barCells', kind: 'range', label: 'Bar cells' }, { k: 'barScale', kind: 'range', label: 'Votes a cell (0: leader fills)' }, { k: 'wireRate', kind: 'range', label: 'Wire, characters a second' }, { k: 'wireHold', kind: 'range', label: 'Wire hold, s' }, { k: 'wireAt', kind: 'select', label: 'Wire, where (home and city)' }, { k: 'wireCh', kind: 'range', label: 'Wire in the header, widest line (ch)' }, { k: 'trail', kind: 'range', label: 'Trail after a move, ticks' }, { k: 'printRate', kind: 'range', label: 'Print, characters a second' }, { k: 'lineHour', kind: 'range', label: 'Start line, local hour' }, { k: 'lineChar', kind: 'select', label: 'Start line character' }, { k: 'lineInk', kind: 'range', label: 'Start line ink' }, { k: 'markDim', kind: 'range', label: 'Mark ink, not live' }] },
  { name: 'Bug, sound, keys', knobs: [{ k: 'bugCorner', kind: 'select', label: 'Bug corner' }, { k: 'bugSize', kind: 'range', label: 'Bug size, px' }, { k: 'sound', kind: 'select', label: 'Sound' }, { k: 'fastext', kind: 'toggle', label: 'Fastext row (day labs)' }] },
];
/* the live-device knobs out of the lab's flat state */
const airOf = (c: Record<string, unknown>): Partial<AirParts> => Object.fromEntries(Object.keys(AIR_DEF).map((k) => [k, c[k]])) as Partial<AirParts>;
const LABELS: Record<string, string> = { hatch: 'Hatch ::|', blocks: 'Blocks', none: 'None', wheel: "The wheel's mono", geist: 'Geist Mono', pixel: 'Departure Mono (pixel)', flipper: 'Flipper', crawl: 'Crawl', rail: 'Static rail', char: 'Characters', word: 'Whole words', flash: 'Flash', delta: 'Delta', both: 'Both', ink: 'Ink', blue: 'Blue light', broadcast: 'Broadcast', mono: 'Greys', tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right', off: 'Off', steps: 'Steps only' };

export function PartsLab({ saved, q }: { saved: Partial<PartsCfg> & { air?: Partial<AirParts> }; q: Record<string, string | undefined> }) {
  const [cfg, setCfg] = useState<LabState>(() => {
    const c = { ...clampParts(saved), ...clampAir(saved.air), ...LAB_DEF } as LabState;
    if (q.t) c.t = Math.min(1, Math.max(0, +q.t));
    if (q.moment) { const m = homeMoments({ ...HOME_DEF, ...dayOf(1) } as HomeCfg).find((x) => x[0] === q.moment); if (m) c.t = m[2]; }
    if (q.still === '1') c.live = 0;
    if (q.face && PARTS_CHOICES.face.includes(q.face)) c.face = q.face as PartsCfg['face'];
    return c;
  });
  const bare = q.bare !== undefined;
  const set = useCallback((k: string, v: unknown) => setCfg((c) => { const n = { ...c, [k]: v }; return { ...n, ...clampParts(n), ...clampAir(airOf(n)) } as LabState; }), []);
  const day = dayOf(cfg.worst), S = sched(day);
  const m0 = nowOf(cfg.t, S), clock = useLabClock(m0, !!cfg.live, cfg.speed), minute = useMinute(clock, m0);
  const W = homeAt(day, minute);
  const { save, msg, rail } = useLabSave('parts', 'lab-parts-saved');
  const doSave = useCallback(() => { const o = clampParts(cfg); return save({ ...o, air: clampAir(airOf(cfg)) }); }, [cfg, save]);
  useEffect(() => { if (bare) document.documentElement.classList.add('lab-closed', 'no-lab'); }, [bare]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (e.metaKey || e.ctrlKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return; if (e.key === '\\') togglePanel(); else if (e.key === 's' || e.key === 'S') doSave(); };
    document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on);
  }, [doSave]);

  const flap = { flipMs: cfg.flipMs, flaps: cfg.flaps, stagger: cfg.stagger, mode: cfg.flap, onStep: () => step(cfg.sound === 'steps') };
  const items = wireItems(W, 12), fx = focusCity(W);
  /* the pass and the bug follow the first city with a leader, so they show at every moment that has one */
  const berlin = CITIES.map((c) => cityAt(day, c.id, minute)).find((w) => w.lead) ?? cityAt(day, fx.id, minute), top = berlin.ranked.slice(0, 5), lead = berlin.lead;
  const cardCity = (i: number) => { const c = CITIES[i]; return { id: c.id, name: c.name, code: CODE[c.id], opens: S.cs[i].start, offset: c.offset }; };
  const ms = homeMoments({ ...HOME_DEF, ...day } as HomeCfg); let cur = -1; ms.forEach((m, i) => { if (Math.abs(cfg.t - m[2]) < 0.0006) cur = i; });
  const out = (k: string) => k === 't' ? hhmm(W.now) + ' UTC' : k === 'speed' ? cfg.speed + '×' : String((cfg as Record<string, unknown>)[k]);

  return (
    <>
      <DayScreen />
      <main className="bd pl" style={partsVars(cfg) as CSSProperties} data-face={cfg.face}>
        <HeaderRow title={EVENT.name} state={dayWord(W, day)} clock={clock} first={m0} zone="UTC" homeHref="/lab/day-home" />
        <Announce items={items} mode={cfg.announce} dwell={cfg.dwell} crawl={cfg.crawl} flap={flap} startPaused={!cfg.live} />

        <section className="pl-sec" aria-labelledby="pl-an">
          <h2 id="pl-an" className="pl-h">The announcement line, three ways</h2>
          <p className="pl-note">The day&rsquo;s wire, newest first. The flipper has pause, previous and next, the crawl pause, the rail previous and next, and every mode the log; nothing moves under the pointer or while focus is on it. The mode on the pages is the knob.</p>
          {(['flipper', 'crawl', 'rail'] as const).map((m) => <div key={m} className="pl-an"><span className="bd-k">{LABELS[m]}</span><Announce items={items} mode={m} dwell={cfg.dwell} crawl={cfg.crawl} flap={flap} label={'Announcements, ' + LABELS[m]} startPaused={!cfg.live} /></div>)}
        </section>

        <section className="pl-sec" aria-labelledby="pl-fp">
          <h2 id="pl-fp" className="pl-h">A split-flap row</h2>
          <p className="pl-note">{berlin.city.name}&rsquo;s top five at {hhmm(W.now)} UTC. A new leader turns the name; a new count lights up. Run the clock faster to see the board work.</p>
          <table className="pl-board">
            <thead><tr><th scope="col">Place</th><th scope="col">Project</th><th scope="col">Votes</th><th scope="col">Builder</th></tr></thead>
            <tbody>{Array.from({ length: 5 }, (_, i) => { const o = top[i]; return (
              <tr key={i}><td className="bd-k">{ord(i + 1)}</td><td title={o ? o.p.name : undefined}><FlapText text={o ? o.p.name : '–'} opts={flap} className="fp-clip" /></td><td><Flash value={o ? o.v : 0} mark={cfg.mark} delta={countDelta}>{o ? fmtN(o.v) : '–'}</Flash></td><td className="pl-mute">{o ? '@' + o.p.handle : ''}</td></tr>
            ); })}</tbody>
          </table>
        </section>

        <section className="pl-sec" aria-labelledby="pl-air">
          <h2 id="pl-air" className="pl-h">The day on air</h2>
          <p className="pl-note">The live devices of the home and the city pages, at the knobs: the vote bar at the leader and at a third of it, the change glyph, the placeholder while votes are hidden, the six state marks, and the wire.</p>
          <div className="pl-air">
            {[[cfg.barScale > 0 ? cfg.barScale * cfg.barCells : 120, 96], [40, 52], [0, 0]].map(([v, b], i) => (
              <p key={i} className="pl-air-row"><Bar v={v} scale={cfg.barScale > 0 ? cfg.barScale : Math.max(1, Math.ceil(120 / cfg.barCells))} cells={cfg.barCells} mode={cfg.bar} /> <Count v={v} /> <Delta now={v} before={b} /></p>
            ))}
            <p className="pl-air-row"><Bar v={40} scale={Math.max(1, Math.ceil(120 / cfg.barCells))} cells={cfg.barCells} mode={cfg.bar} dim /> <Count v={null} hidden /> <Delta now={0} before={null} hidden /> <span className="bd-k">hidden</span></p>
            <p className="pl-air-row">{(Object.keys(MARK) as MarkState[]).map((k) => <span key={k} className="pl-inline"><StateCell s={k} word={MARK_WORD[k]} /></span>)}</p>
            <Wire items={wireItems(W, 6)} rate={cfg.wireRate} hold={cfg.wireHold} label="The wire" empty="Nothing on the wire yet." />
          </div>
        </section>

        <section className="pl-sec pl-two" aria-labelledby="pl-sg">
          <div>
            <h2 id="pl-sg" className="pl-h">The segment countdown</h2>
            <p className="pl-note">{fx.name}: the city the home points at. Legends light up; the time is always the same width.</p>
            <LiveSegment clock={clock} first={m0} x={fx} withSecs={!!cfg.segSecs} name={fx.name} />
          </div>
          <div>
            <h2 className="pl-h">The six state chips</h2>
            <p className="pl-note">One word from six, each with a shape, so a state reads without colour.</p>
            <div className="pl-chips">{STATE_ORDER.map((s) => <StateChip key={s} s={s} />)}</div>
            <p className="pl-note">Now: {W.cs.map((x) => <span key={x.id} className="pl-inline"><span className="bd-k">{CODE[x.id]}</span> <StateChip s={cityWord(x, W, day)} /></span>)}</p>
          </div>
        </section>

        <section className="pl-sec" aria-labelledby="pl-tc">
          <h2 id="pl-tc" className="pl-h">Test cards</h2>
          <p className="pl-note">Each city&rsquo;s own, from its seed; the hands stand at its real opening time. Click a card for a new one; Save keeps the seeds you see.</p>
          <div className="pl-cards">
            {CITIES.map((c, i) => { const seed = cfg.cards[c.id] ?? seedOf(c.id), x = W.cs[i]; return (
              <button key={c.id} type="button" className="pl-card" onClick={() => set('cards', { ...cfg.cards, [c.id]: 1 + Math.floor(Math.random() * 9999) })} aria-label={'New test card for ' + c.name}>
                <TestCard city={cardCity(i)} seed={seed} bars={cfg.cardBars} palette={cfg.cardPalette} closedown={!!cfg.closedown} finalists={x.top.map((t) => ({ place: t.place, name: t.p.name, votes: t.v }))} />
                <span className="bd-k">Seed {seed}{cfg.cards[c.id] != null ? ', kept' : ''}</span>
              </button>
            ); })}
          </div>
        </section>

        <section className="pl-sec pl-two" aria-labelledby="pl-bp">
          <div>
            <h2 id="pl-bp" className="pl-h">The boarding pass</h2>
            <p className="pl-note">{lead ? berlin.city.name + '’s leader, as its share card.' : 'The leader’s share card.'} Every field is the project&rsquo;s own.</p>
            {lead ? <BoardingPass d={{ project: lead.p.name, pitch: lead.p.pitch, city: berlin.city.name, code: CODE[berlin.city.id], builder: '@' + lead.p.handle, entered: hhmm(lead.arrive + berlin.off) + ' ' + tz(berlin.off), place: ord(lead.rank), votes: fmtN(lead.v), link: projectPath(berlin.city.id, slugOf(lead.p)), date: '10 Dec 2026' }} />
              : <p className="pl-note">No city has an entry at this moment. Move the time on.</p>}
          </div>
          <div>
            <h2 className="pl-h">The bug</h2>
            <p className="pl-note">The corner mark on a project&rsquo;s picture: city, place, votes, time left.</p>
            <div className="pl-bugbox">
              <Picture p={lead?.p} cls="pl-pic" />
              {lead ? <Bug code={CODE[berlin.city.id]} place={ord(lead.rank)} votes={fmtN(lead.v)} left={berlin.voting ? Math.max(1, Math.round((berlin.state === 'build' ? berlin.x.buildEnd : berlin.x.end) - berlin.now)) + ' min' : berlin.state === 'done' ? 'Closed' : 'Opens ' + hhmm(berlin.x.start + berlin.off)} corner={cfg.bugCorner} /> : <p className="pl-bugnone bd-k">No leader anywhere yet: the bug shows once the first entry is in.</p>}
            </div>
          </div>
        </section>

        <section className="pl-sec pl-two" aria-labelledby="pl-gl">
          <div>
            <h2 id="pl-gl" className="pl-h">The globe as the day&rsquo;s clock</h2>
            <p className="pl-note">Turned so ten in the morning faces the page; the night side in shade; live cities lit, closed ones dots. It draws when the minute changes.</p>
            <div className="pl-globe"><DayGlobe lights={lights(W)} minute={W.now} face={0} label={globeLabel(W)} /></div>
          </div>
          <div>
            <h2 className="pl-h">Sound and screen</h2>
            <p className="pl-note">In the footer of every day page, remembered per browser. Screen off gives the same page plain.</p>
            <Switches sound={cfg.sound === 'steps'} />
          </div>
        </section>
      </main>
      {bare ? null : (
        <LabPanel title="Parts lab" cfg={{ ...cfg, seed: 'from day' }} bounds={LAB_BOUNDS} choices={{ ...PARTS_CHOICES, ...AIR_CHOICES }} groups={GROUPS} set={set} moments={ms} momentIdx={cur} out={out}
          optionLabel={(_k, v) => LABELS[v] || v} meter={{ text: 'Board tick ' + cfg.tick + ' s · flash ' + cfg.hold + ' + ' + cfg.fade + ' ms', bad: false }} msg={msg} rail={rail}
          railLabel={(s) => String(s.announce) + ', ' + String(s.face) + ', ' + String(s.mark)} apply={(s) => setCfg((c) => ({ ...c, ...clampParts(s), ...clampAir({ ...airOf(c), ...((s as { air?: Partial<AirParts> }).air ?? {}) }) }))}
          buttons={[['Defaults', () => setCfg((c) => ({ ...c, ...PARTS_DEF, ...AIR_DEF }))], ['Save', doSave, true]]} />
      )}
    </>
  );
}
