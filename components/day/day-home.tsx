'use client';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { nowOf, sched } from '@/lib/day-data';
import { moments as homeMoments, pageVars, DEF as HOME_DEF, type HomeCfg } from '@/lib/home';
import { realMinute } from '@/lib/clock';
import { FRAME } from '@/components/shared/page-parts';
import { hhmm } from '@/lib/format';
import { clampParts, partsVars, type PartsCfg } from '@/components/board/config';
import { HeaderRow } from '@/components/board/header-row';
import { AccountCell } from '@/components/account/account';
import { Announce } from '@/components/board/announce';
import { SoundKey, step } from '@/components/board/prefs';
import { useTick } from '@/components/board/clock';
import { dayWord, homeAt, wireItems } from '@/components/board/day-model';
import { DayProvider } from '@/components/home/day-context';
import { Diagram } from '@/components/home/final';
import { LabPanel, LayoutPicker, togglePanel, useLabSave, type Group } from '@/components/admin/kit';
import { measure, type Contrast } from '@/components/admin/contrast';
import lookCfg from '@/saved/lab-home.config.json';
import screenCfg from '@/saved/screen.config.json';
import { clampScreen } from '@/components/screen/config';
import { DayScreen, dayOf, useLabClock } from './shared';
import { HowItWorks, PrizeBlock } from './explain';
import { dayFinalOf, Board, Fastext, Hero, Prizes, Thirty, Wall, homeKeys, type Href, type Look } from './home-parts';
import { DayFooter } from './footer';
import { clampFoot, type FootCfg } from './footer-config';
import footSaved from '@/saved/footer.config.json';
import { useRealClock, pageQuery } from './page-clock';
import { liveHome, useSnapshots } from '@/lib/source';
import type { DaySnap } from '@/lib/event/snapshot';
import '@/components/board/board.css';
import '@/components/home/day.css';
import '@/components/home/sheet.css';
import './day-home.css';
import './rank-pictures.css';
import './explain.css';
import { EVENT } from '@/lib/day-data';
import { DEMO } from '@/lib/demo';
import { HomeHero } from '@/components/air/home-hero';
import { AirHome, AIR_HOME_CHOICES, AIR_HOME_DEF, type AirHomeCfg, type BoardMix } from '@/components/air/home';
import type { SpinCfg } from '@/components/air/spin-globe';
import { focusCity } from '@/components/board/day-model';
import { meNow } from '@/components/forms/store';
import { clampAir, type AirParts } from '@/components/air/devices';
import { clampWheel } from '@/components/wheel/config';
import wheelSaved from '@/saved/wheel.config.json';
import partsSaved from '@/saved/parts.config.json';

const WHEEL = clampWheel(wheelSaved);
const AIR = clampAir((partsSaved as { air?: Partial<AirParts> }).air);

/* The home on the day: the header row, the wire, the opening, the departures board, the final, how it works and the
   prizes. It follows the real clock (the server's time draws the first frame); ?moment=, ?m= or ?t= move it,
   ?still=1 stops it, and ?admin shows the panel (moments, the clock, the look, Save).
   Every number is the home's world at the board's minute, the same world a city page draws, so the two agree. The
   look comes from saved/day-home.config.json and saved/parts.config.json. Keys with the panel: \ panel, S save. */

export type HomeDir = 'mix' | 'flat' | 'board' | 'wall' | 'strips';
export type DayHomeCfg = { dir: HomeDir; mix: BoardMix['mode']; list: BoardMix['list']; gMode: SpinCfg['mode']; gSpeed: number; gDwell: number; gTurn: number; gWake: number; gSize: number; gBleed: number; final: 'print' | 'thirty' | 'diagram'; fastext: number; leaderPic: number; how: number }
  & Pick<AirHomeCfg, 'order' | 'marks' | 'startLine' | 'wire' | 'night'> & { howFeed: AirHomeCfg['how'] };
type State = DayHomeCfg & { t: number; live: number; speed: number; worst: number; hidden: 'auto' | 'on' | 'off' };
const DIRS_ALL: [string, string][] = [['mix', 'Board and map'], ['flat', 'Opened flat'], ['board', 'Departures board'], ['wall', 'Control wall'], ['strips', 'Board and strips']];
const GROUPS: Group[] = [
  { name: 'Time', knobs: [{ k: 't', kind: 'range', label: 'Time' }, { k: 'live', kind: 'toggle', label: 'Clock runs' }, { k: 'speed', kind: 'range', label: 'Seconds a second' }, { k: 'worst', kind: 'toggle', label: 'Worst content' }] },
  { name: 'Direction', knobs: [{ k: 'dir', kind: 'select', label: 'First screen' }, { k: 'mix', kind: 'select', label: 'Board and map: beside the opening' }, { k: 'list', kind: 'select', label: 'Board and map: the cities list' }, { k: 'final', kind: 'select', label: 'The final' }, { k: 'fastext', kind: 'toggle', label: 'Fastext row (board)' }, { k: 'leaderPic', kind: 'toggle', label: 'Leader’s picture on the board' }, { k: 'how', kind: 'toggle', label: 'How it works and the prize block (board)' }] },
  { name: 'The globe (Board and map)', knobs: [{ k: 'gMode', kind: 'select', label: 'How it turns' }, { k: 'gSpeed', kind: 'range', label: 'Spin, degrees a second' }, { k: 'gTurn', kind: 'range', label: 'Tour, a turn (ms)' }, { k: 'gDwell', kind: 'range', label: 'Tour, the hold (s)' }, { k: 'gWake', kind: 'range', label: 'Wake (steps)' }, { k: 'gSize', kind: 'range', label: 'Size (share of the screen’s height)' }, { k: 'gBleed', kind: 'range', label: 'Off the right edge (share of the globe)' }] },
  { name: 'On air (Opened flat)', knobs: [{ k: 'order', kind: 'select', label: 'Order of the parts' }, { k: 'marks', kind: 'select', label: 'Marks on the map' }, { k: 'startLine', kind: 'select', label: 'Start line' }, { k: 'night', kind: 'select', label: 'Night on the map' }, { k: 'wire', kind: 'select', label: 'The wire' }, { k: 'howFeed', kind: 'select', label: 'How it works fed' }, { k: 'hidden', kind: 'select', label: 'Votes hidden (lab)' }] },
];
const L = lookCfg as { finRh: number; curve: number };

/* page: the server's time, so the first frame is drawn at the real minute */
export function DayHome({ saved, parts, q, page, live }: {
  saved: Partial<DayHomeCfg>; parts: Partial<PartsCfg>; q: Record<string, string | undefined>; page: { nowMs: number };
  /* the event's own data, when a backend is set up: the first snapshot from the server, then read again every few
     seconds. Without it the page draws the seeded day. */
  live?: { day: DaySnap | null };
}) {
  /* demo: the sample day (lib/demo.ts); the page draws the seeded day, opens the panel and keeps the switch on its links */
  const P = clampParts(parts), demo = q[DEMO] !== undefined, admin = demo || q.admin !== undefined;
  const DIRS = DIRS_ALL, CHOICES: Record<string, string[]> = { dir: DIRS.map(([d]) => d), mix: ['globe', 'side', 'band', 'flat'], list: ['flat', 'board'], gMode: ['tour', 'spin', 'face'], final: AIR_HOME_CHOICES.final, order: AIR_HOME_CHOICES.order, marks: AIR_HOME_CHOICES.marks, startLine: AIR_HOME_CHOICES.startLine, night: AIR_HOME_CHOICES.night, wire: ['typed', 'off'], howFeed: AIR_HOME_CHOICES.how, hidden: ['auto', 'on', 'off'] };
  const MIXL: Record<string, string> = { globe: 'The text globe', side: 'The map beside it', band: 'The map under it', flat: 'Opened flat (no opening)' };
  const GML: Record<string, string> = { tour: 'Tour: city to city', spin: 'Spin at one speed', face: 'Face the opening’s city' };
  const LISTL: Record<string, string> = { flat: 'Opened flat’s list, the board’s chips', board: 'The departures board' };
  const LABELS: Record<string, string> = { ...Object.fromEntries(DIRS_ALL), print: 'The printout', thirty: 'Thirty board', diagram: 'One diagram (today’s)', live: 'Live (the final moves up)', fixed: 'Fixed', state: 'States', plain: 'Plain +', on: 'On', off: 'Off', typed: 'Typed', real: 'The real day', sample: 'The sample', auto: 'From the model' };
  const [cfg, setCfg] = useState<State>(() => {
    const c: State = { dir: 'mix', mix: 'globe', list: 'flat', gMode: 'spin', gSpeed: 6, gDwell: 4, gTurn: 1400, gWake: 3, gSize: 1.15, gBleed: 0.24, final: 'print', fastext: P.fastext, leaderPic: 1, how: 1, order: AIR_HOME_DEF.order, marks: AIR_HOME_DEF.marks, startLine: AIR_HOME_DEF.startLine, wire: AIR_HOME_DEF.wire, night: AIR_HOME_DEF.night, howFeed: AIR_HOME_DEF.how, ...saved, t: 0, live: 1, speed: 1, worst: 0, hidden: 'auto' };
    if (!CHOICES.dir.includes(c.dir)) c.dir = 'mix';
    if (!CHOICES.mix.includes(c.mix)) c.mix = 'globe';
    if (!CHOICES.list.includes(c.list)) c.list = 'flat';
    if (!CHOICES.gMode.includes(c.gMode)) c.gMode = 'spin';
    if (q.gMode && CHOICES.gMode.includes(q.gMode)) c.gMode = q.gMode as SpinCfg['mode'];
    if (q.list && CHOICES.list.includes(q.list)) c.list = q.list as BoardMix['list'];
    if (q.mix && CHOICES.mix.includes(q.mix)) c.mix = q.mix as BoardMix['mode'];
    if (q.hidden === '1') c.hidden = 'on'; else if (q.hidden === '0') c.hidden = 'off';
    for (const k of ['order', 'marks', 'startLine', 'night', 'wire'] as const) if (q[k] && CHOICES[k].includes(q[k]!)) (c as Record<string, unknown>)[k] = q[k];
    if (q.dir && CHOICES.dir.includes(q.dir)) c.dir = q.dir as HomeDir;
    if (q.final && CHOICES.final.includes(q.final)) c.final = q.final as State['final'];
    if (q.worst === '0') c.worst = 0; else if (q.worst === '1') c.worst = 1;
    if (q.fastext) c.fastext = q.fastext === '1' ? 1 : 0;
    const S0 = sched(dayOf(c.worst)), ms = homeMoments({ ...HOME_DEF, ...dayOf(c.worst) } as HomeCfg);
    /* the sample day opens at mid-day, with cities building, voting and closed at once */
    c.t = !demo ? realMinute(page.nowMs) : nowOf(ms[2][2], S0);
    if (q.t) c.t = nowOf(+q.t, S0);
    if (q.m && isFinite(+q.m)) c.t = +q.m;
    if (q.moment) { const m = ms.find((x) => x[0] === q.moment); if (m) c.t = nowOf(m[2], S0); }
    if (q.still === '1') c.live = 0;
    if (q.speed && +q.speed >= 1 && +q.speed <= 120) c.speed = Math.round(+q.speed);
    return c;
  });
  const bare = !admin;
  const set = useCallback((k: string, v: unknown) => setCfg((c) => ({ ...c, [k]: v })), []);
  const day = dayOf(cfg.worst), S = sched(day);
  const ms = homeMoments({ ...HOME_DEF, ...day } as HomeCfg).map(([id, label, t]) => [id, label, nowOf(t, S)] as [string, string, number]);
  const clock = useLabClock(cfg.t, !!cfg.live, cfg.speed), bm = useTick(clock, cfg.t, P.tick), W0 = homeAt(day, bm), snaps = useSnapshots(!!live, null), dSnap = snaps.day || live?.day || null;
  const W = live && dSnap ? liveHome(W0, dSnap, bm) : W0, dayFinal = dayFinalOf(W);
  const moved = useRealClock(clock, !demo, q);
  const { save, msg, rail } = useLabSave('day-home', 'lab-day-home-saved');
  const doSave = useCallback(() => save({ dir: cfg.dir, mix: cfg.mix, list: cfg.list, gMode: cfg.gMode, gSpeed: cfg.gSpeed, gDwell: cfg.gDwell, gTurn: cfg.gTurn, gWake: cfg.gWake, gSize: cfg.gSize, gBleed: cfg.gBleed, final: cfg.final, fastext: cfg.fastext, leaderPic: cfg.leaderPic, how: cfg.how, order: cfg.order, marks: cfg.marks, startLine: cfg.startLine, wire: cfg.wire, night: cfg.night, howFeed: cfg.howFeed }), [cfg, save]);
  const [res, setRes] = useState<Contrast | null>(null);

  useEffect(() => {
    if (bare) return;
    const on = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (e.metaKey || e.ctrlKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return; if (e.key === '\\') togglePanel(); else if (e.key === 's' || e.key === 'S') doSave(); };
    document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on);
  }, [doSave, bare]);
  /* the meter: small text against the ground with the lines on, as the admin panel's meter measures it */
  useEffect(() => {
    if (bare) return;
    const id = window.setTimeout(() => setRes(measure(document, clampScreen(screenCfg))), 700);
    return () => window.clearTimeout(id);
  }, [cfg.dir, cfg.worst, cfg.final, cfg.fastext, bare]);

  /* links carry the moment only when the clock was moved, and the panel only when it is open */
  const carry = (m: number) => pageQuery({ m: moved || admin || !cfg.live ? m.toFixed(2) : null, still: cfg.live ? null : '1', worst: cfg.worst ? '1' : null, admin: admin && !demo ? '' : null, [DEMO]: demo ? '' : null });
  const href: Href = (id) => '/city/' + id + carry(bm);
  const flap = { flipMs: P.flipMs, flaps: P.flaps, stagger: P.stagger, mode: P.flap, onStep: () => step(P.sound === 'steps') };
  const look: Look = { mark: P.mark, cardBars: P.cardBars, cardPalette: P.cardPalette, cards: P.cards, segSecs: P.segSecs, bugCorner: P.bugCorner, flap };
  const mine = meNow()?.pass?.city ?? null;
  let cur = -1; ms.forEach((m, i) => { if (Math.abs(cfg.t - m[2]) < 0.6) cur = i; });
  const out = (k: string) => k === 't' ? hhmm(cfg.t) + ' UTC' + (cfg.t > S.winEnd ? ' (+7 d)' : '') : k === 'speed' ? cfg.speed + '×' : String((cfg as Record<string, unknown>)[k]);
  const bounds = { t: [Math.min(S.winStart, Math.floor(cfg.t)), Math.max(S.winEnd + 7 * 1440, Math.ceil(cfg.t)), 1] as [number, number, number], speed: [1, 120, 1] as [number, number, number], gSpeed: [1, 30, 1] as [number, number, number], gTurn: [400, 4000, 100] as [number, number, number], gDwell: [1, 12, 0.5] as [number, number, number], gWake: [0, 8, 1] as [number, number, number], gSize: [0.5, 1.6, 0.05] as [number, number, number], gBleed: [0, 0.45, 0.01] as [number, number, number] };
  const meter = res ? { text: `Small text: ${res.n} pieces, lowest ${res.min.toFixed(1)}:1, ${res.under} under 7:1 with the lines on${res.under ? ': ' + res.worst.filter((w) => w.ratio < 7).slice(0, 4).map((w) => '“' + w.text.slice(0, 24) + '” ' + w.ratio.toFixed(1)).join(', ') : ''}.`, bad: res.under > 0 } : { text: 'Measuring…', bad: false };

  const final = cfg.final === 'diagram'
    ? <div className={'dl-diagram ' + FRAME} data-mode="sheet"><div className="dl-page" style={pageVars({ ...HOME_DEF, ...day } as HomeCfg) as CSSProperties}><DayProvider cfg={{ ...HOME_DEF, ...day, now: bm } as HomeCfg} clock={{ at: bm, preview: true, still: true }} carry={{ preview: true, still: true }} live={false}><Diagram finRh={L.finRh} curve={L.curve} /></DayProvider></div></div>
    : <Thirty W={W} href={href} />;
  /* today's board directions keep the thirty board for the printout, which only the flat page draws */

  return (
    <>
      {cfg.dir === 'flat' || cfg.dir === 'mix' ? (
        <AirHome W={W} day={day} clock={clock} first={cfg.t} bm={bm} href={href} wheel={WHEEL} air={AIR} live={!!cfg.live} forceHidden={cfg.hidden === 'on' ? true : cfg.hidden === 'off' ? false : null} wire={wireItems(W, 12)}
          board={cfg.dir === 'mix' ? {
            mode: cfg.mix, list: cfg.list, focus: focusCity(W).id, spin: { mode: cfg.gMode, speed: cfg.gSpeed, dwell: cfg.gDwell, turn: cfg.gTurn, wake: cfg.gWake, size: cfg.gSize, bleed: cfg.gBleed },
            hero: <HomeHero W={W} clock={clock} first={cfg.t} href={href} segSecs={!!P.segSecs} mine={mine} />,
            table: <div className="bd dl dl-mix" style={partsVars(P) as CSSProperties} data-face={P.face}><Board W={W} day={day} look={look} href={href} tick={P.tick} pic={!!cfg.leaderPic} /></div>,
          } : null}
          cfg={{ first: 'flat', order: cfg.order, marks: cfg.marks, startLine: cfg.startLine, final: cfg.final, how: cfg.howFeed, wire: cfg.wire, night: cfg.night }} />
      ) : (
        <>
          <DayScreen />
          <main className="bd dl" style={partsVars(P) as CSSProperties} data-face={P.face} data-dir={cfg.dir} data-fastext={cfg.fastext ? '' : undefined}>
            <HeaderRow title={EVENT.name} state={dayWord(W, day)} clock={clock} first={cfg.t} zone="UTC" homeHref={'/' + carry(bm)} right={<><AccountCell /><span className="hr-keys">{P.sound === 'steps' ? <SoundKey /> : null}</span></>} />
            <Announce items={wireItems(W, 12)} mode={P.announce} dwell={P.dwell} crawl={P.crawl} flap={flap} startPaused={!cfg.live} />
            <Hero W={W} day={day} clock={clock} first={cfg.t} href={href} segSecs={!!P.segSecs} globe="edge" />
            {cfg.dir === 'wall' ? <Wall W={W} day={day} look={look} href={href} /> : <Board W={W} day={day} look={look} href={href} tick={P.tick} strips={cfg.dir === 'strips'} pic={!!cfg.leaderPic} />}
            {final}
            {cfg.how ? <div className="dl-ex"><HowItWorks f={day} id="dl-how" day={dayFinal} /><PrizeBlock id="day-prizes" day={dayFinal} winner={W.picked ? W.final.p.name + ', ' + W.final.city.name : null} /></div> : <Prizes W={W} />}
            {cfg.fastext ? <Fastext keys={homeKeys(W, href)} /> : null}
          </main>
          <DayFooter W={W} day={day} href={href} sound={P.sound === 'steps'} cfg={clampFoot(footSaved as Partial<FootCfg>)} minute={bm} fastext={!!cfg.fastext}
            sections={{ how: cfg.how ? '#dl-how' : '/preview#how', prizes: '#day-prizes' }} style={partsVars(P) as CSSProperties} face={P.face} />
        </>
      )}
      {bare ? null : (
        <>
          <LabPanel closed={demo} tab={demo ? 'Sample day' : 'Admin'} title={demo ? 'Home: sample day' : 'Home: admin'} cfg={{ ...cfg, seed: day.seed }} bounds={bounds} choices={CHOICES} groups={GROUPS} set={set} moments={ms} momentIdx={cur} out={out}
            optionLabel={(k, v) => (k === 'mix' ? MIXL[v] : k === 'gMode' ? GML[v] : k === 'list' ? LISTL[v] : LABELS[v]) || v} meter={meter} msg={msg} rail={rail} railLabel={(s) => LABELS[String(s.dir)] + ', ' + String(s.final)}
            apply={(s) => setCfg((c) => ({ ...c, ...(s as Partial<DayHomeCfg>) }))} buttons={demo ? [] : [['Now', () => set('t', realMinute(Date.now()))], ['Save', doSave, true]]} />
          {demo ? null : <LayoutPicker modes={DIRS} mode={cfg.dir} setMode={(m) => set('dir', m)} replay={() => clock.set(cfg.t)} />}
        </>
      )}
    </>
  );
}
