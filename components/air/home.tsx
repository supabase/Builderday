'use client';
import { Fragment, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import type { DayClock } from '@/components/board/clock';
import { useSecond } from '@/components/board/clock';
import type { Day } from '@/components/board/day-model';
import type { HomeCity, HomeWorld } from '@/lib/home';
import { EPOCH, EVENT } from '@/lib/day-data';
import { slugOf } from '@/lib/city';
import { CODE, PLACE } from '@/lib/places';
import { hhmm, ord } from '@/lib/format';
import { routes } from '@/lib/routes';
import { Picture } from '@/components/pictures/picture';
import { HowItWorks, PrizeBlock } from '@/components/day/explain';
import { Ending, type EndCity } from '@/components/day/ending';
import { clampEnd, type EndCfg } from '@/components/day/ending-config';
import { lastLine } from '@/components/day/footer';
import { dayFinalOf } from '@/components/day/home-parts';
import { meNow } from '@/components/forms/store';
import endSaved from '@/saved/ending.config.json';
import { AirShell } from './shell';
import { DayQuestions } from './questions';
import { Chip, FAMILY } from '@/components/kit/kit';
import { finalCount } from '@/components/home/final-parts';
import { SpinGlobe, type SpinCfg, type SpinCity } from './spin-globe';
import { LiveMap, type LiveCity } from './live-map';
import { StateCell, Wire } from './parts';
import { MARK, MARK_WORD, markOf, type AirParts, type MarkState } from './devices';
import { forcedHidden, modelHidden } from './hidden';
import type { Item } from '@/components/board/announce';

/* The home on the day, on the preview's machine (day-revamp plan, "The home on the day").
   First screen (`flat`): the preview's header; the words; the world opened flat and live (marks as states, the start
   line, the night); one Now cell under it for the city under the brackets. Under the fold: Now (the cities live now),
   Cities (the board, east to west), The final (the printout), How it works, Prizes, the ending (its map left out: the
   page opens on it). With `order: live` the final moves up once every city has closed, and first after the pick. */

export type AirHomeCfg = {
  first: 'flat' | 'wheel' | 'board' | 'unroll'; order: 'live' | 'fixed'; marks: 'state' | 'plain'; startLine: 'on' | 'off';
  final: 'print' | 'thirty' | 'diagram'; how: 'real' | 'sample'; wire: 'typed' | 'flip' | 'off'; night: 'on' | 'off';
};
export const AIR_HOME_DEF: AirHomeCfg = { first: 'flat', order: 'live', marks: 'state', startLine: 'on', final: 'print', how: 'real', wire: 'typed', night: 'on' };
export const AIR_HOME_CHOICES: Record<keyof AirHomeCfg, string[]> = {
  first: ['flat', 'wheel', 'board', 'unroll'], order: ['live', 'fixed'], marks: ['state', 'plain'], startLine: ['on', 'off'], final: ['print', 'thirty', 'diagram'], how: ['real', 'sample'], wire: ['typed', 'flip', 'off'], night: ['on', 'off'],
};

const WIRE_EMPTY = 'Nothing yet. The first city opens the wire.';
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen'];
const words = (n: number) => WORDS[n] ?? String(n);
const never = () => () => {};
const useOffset = () => useSyncExternalStore(never, () => -new Date().getTimezoneOffset(), () => null);
const useZone = () => useSyncExternalStore(never, () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', () => '');
/* a minute of the day in a zone, as 18:00 */
const inZone = (m: number, zone: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(new Date(EPOCH + m * 60000));
const leadOf = (x: HomeCity) => (x.state === 'done' ? (x.top[0] ? { p: x.top[0].p, v: x.top[0].v } : null) : x.lead ?? null);
const entriesOf = (x: HomeCity) => (x.state === 'next' ? 0 : x.state === 'build' ? x.n ?? 0 : x.entries);
const leftOf = (x: HomeCity, now: number) => Math.max(0, Math.ceil((x.state === 'build' ? x.buildEnd : x.end) - now));
const mmss = (min: number) => { const s = Math.max(0, Math.round(min * 60)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

/* who is live, in one sentence: "Rosario is building now.", "Rosario and Santiago are building now.",
   "Lima is building and Quito is in its last votes." */
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
function liveSentence(live: HomeCity[]) {
  const b = live.filter((x) => x.state === 'build').map((x) => x.name), v = live.filter((x) => x.state === 'vote').map((x) => x.name);
  const bs = b.length ? `${andList(b)} ${b.length > 1 ? 'are' : 'is'} building` : '', vs = v.length ? `${andList(v)} ${v.length > 1 ? 'are in their' : 'is in its'} last votes` : '';
  return (bs && vs ? `${bs}, and ${vs}` : bs || vs) + (bs && !vs ? ' now.' : '.');
}

/* each city's state, as the marks and the cells read it; hidden: the model's flag, or the lab's forced rule */
function cityView(x: HomeCity, now: number, forceHidden: boolean | null) {
  const hidden = forceHidden === true ? forcedHidden(x, now) : forceHidden === false ? false : modelHidden(x).hidden;
  const s: MarkState = markOf(x.state, x.entries, hidden);
  return { s, hidden, word: s === 'hidden' ? (x.state === 'vote' ? 'Last votes' : 'Building') : MARK_WORD[s] };
}

/* the mix with the departures board: the board's own opening and its table, drawn by the board's parts and handed in */
export type BoardMix = {
  hero: ReactNode; table: ReactNode; focus: string;
  /* globe: the text globe on the right facing the opening's city; side, band: the day's map beside or under it;
     flat: Opened flat's first screen */
  mode: 'globe' | 'side' | 'band' | 'flat';
  /* Cities: Opened flat's list with the board's state chips, or the departures board's own table */
  list: 'flat' | 'board';
  /* the globe in the opening: how it turns */
  spin: SpinCfg;
};

export function AirHome({ W, day, clock, first, bm, href, cfg, air, wheel, live, forceHidden, wire, board, children }: {
  W: HomeWorld; day: Day; clock: DayClock; first: number; bm: number; href: (id: string) => string; cfg: AirHomeCfg; air: AirParts; wheel: WheelCfg;
  /* the clock runs (the wire types only then) */
  live: boolean; forceHidden: boolean | null; wire: Item[];
  /* the departures board mixed in: its opening beside or over the map, its table as Cities */
  board?: BoardMix | null;
  /* the lab's own over the page */
  children?: ReactNode;
}) {
  const off = useOffset(), zone = useZone(), me = meNow();
  const views = useMemo(() => W.cs.map((x) => cityView(x, W.now, forceHidden)), [W, forceHidden]);
  /* D9: the visitor's city: their place, else the live city nearest their time, else the next to open */
  const you = useMemo(() => {
    const mine = me?.pass ? W.cs.findIndex((x) => x.id === me.pass!.city) : -1;
    if (mine >= 0) return mine;
    const pool = W.live.length ? W.live : W.cs.filter((x) => x.state === 'next').sort((a, b) => a.start - b.start).slice(0, 1);
    if (!pool.length) return W.picked ? W.final.city.i : W.cs.length - 1;
    let best = pool[0];
    if (off !== null) pool.forEach((x) => { if (Math.abs(x.city.offset - off) < Math.abs(best.city.offset - off)) best = x; });
    return best.i;
  }, [W, off, me]);
  const focusI = board && board.mode !== 'flat' ? W.cs.findIndex((x) => x.id === board.focus) : -1;
  const [pointed, setPointed] = useState<number | null>(null), aim = pointed ?? (focusI >= 0 ? focusI : you), ax = W.cs[aim], av = views[aim];

  const cities: LiveCity[] = useMemo(() => W.cs.map((x, i) => {
    const v = views[i], [lat, lon] = PLACE[x.id];
    const state = cfg.marks === 'state' ? v.s : 'next';
    const ink = v.s === 'build' || v.s === 'vote' || v.s === 'hidden' ? 1 : v.s === 'final' ? 0.85 : air.markDim;
    return { id: x.id, name: x.name, code: CODE[x.id], lat, lon, href: href(x.id), mark: MARK[state], ink, said: v.word };
  }), [W, views, cfg.marks, air.markDim, href]);

  /* the globe's cities, each with one line on what it is doing now, and the tour: the live cities (the opening's first),
     then the next to open, then the closed, each by start */
  const spinCities: SpinCity[] = useMemo(() => W.cs.map((x, i) => {
    const v = views[i], lead = leadOf(x), [lat, lon] = PLACE[x.id];
    const said = x.state === 'next' ? `opens ${hhmm(x.start + x.city.offset)} local`
      : x.state === 'build' ? `${v.word.toLowerCase()} · ${mmss(leftOf(x, W.now))} left${lead ? ' · ' + lead.p.name + ' leads' : ''}`
      : x.state === 'vote' ? `last votes · ${mmss(leftOf(x, W.now))} left${lead && !v.hidden ? ' · ' + lead.p.name + ' leads' : ''}`
      : x.top.length ? `finalists in · 1st ${x.top[0].p.name}` : 'closed, no entries';
    return { lat, lon, code: CODE[x.id], name: x.name, href: href(x.id), mark: MARK[v.s], said };
  }), [W, views, href]);
  const tourKey = useMemo(() => {
    const rank = (x: HomeCity) => (x.state === 'build' || x.state === 'vote' ? 0 : x.state === 'next' ? 1 : 2);
    const xs = [...W.cs].sort((a, b) => rank(a) - rank(b) || a.start - b.start).map((x) => x.i);
    const f = board ? W.cs.findIndex((x) => x.id === board.focus) : -1;
    return (f >= 0 ? [f, ...xs.filter((i) => i !== f)] : xs).join(',');
  }, [W, board]);
  const tourOrder = useMemo(() => tourKey.split(',').map(Number), [tourKey]);

  /* the action: what the visitor can do now, for the city under the brackets */
  const actionFor = (x: HomeCity) => {
    const mine = me?.pass?.city === x.id;
    /* before the public may vote, only the city's own builders get Vote; everyone else watches */
    if ((x.state === 'build' || x.state === 'vote') && !mine && x.publicAt != null && W.now < x.publicAt) return { words: 'Watch ' + x.name, short: 'Watch ' + CODE[x.id], href: href(x.id) };
    if (x.state === 'build' || x.state === 'vote') return { words: 'Vote in ' + x.name, short: 'Vote ' + CODE[x.id], href: href(x.id) };
    if (x.state === 'next') return mine ? { words: 'Your place in ' + x.name, short: 'You · ' + CODE[x.id], href: href(x.id) } : { words: 'Watch ' + x.name, short: 'Watch ' + CODE[x.id], href: href(x.id) };
    return { words: 'See ' + x.name + '’s finalists', short: 'Final ' + CODE[x.id], href: href(x.id) };
  };
  const action = W.allDone ? { words: W.picked ? 'See the pick' : 'Watch the final', short: 'Final', href: '#final' } : actionFor(W.cs[you]);

  /* the lede: one sentence true now */
  const live0 = W.live[0], nextUp = W.cs.filter((x) => x.state === 'next').sort((a, b) => a.start - b.start)[0];
  const now1 = W.picked ? `${EVENT.pickers} picked ${W.final.p.name}, from ${W.final.city.name}.`
    : W.allDone ? 'Every city has closed. The final is next.'
    : live0 ? liveSentence(W.live)
    : nextUp ? `${nextUp.name} opens first, at ${hhmm(nextUp.start + nextUp.city.offset)} local.` : '';

  const finalUp = cfg.order === 'live' && (W.picked || W.allDone);
  const order: string[] = cfg.order === 'live' && W.picked ? ['final', 'cities', 'how', 'prizes', 'questions'] : finalUp ? ['cities', 'final', 'how', 'prizes', 'questions'] : ['cities', 'final', 'how', 'prizes', 'questions'];
  const shown = order.filter((id) => id !== 'now' || !W.allDone);
  const LABEL: Record<string, string> = { cities: 'Cities', final: 'The final', how: 'How it works', prizes: 'Prizes', questions: 'Questions' };
  const parts = shown.filter((id) => LABEL[id]).map((id) => ({ id, label: LABEL[id] }));

  const end = useMemo(() => clampEnd(endSaved as Partial<EndCfg>), []);
  const endCities: EndCity[] = useMemo(() => W.cs.map((x) => ({ id: x.id, name: x.name, code: CODE[x.id], lat: PLACE[x.id][0], lon: PLACE[x.id][1], opens: EPOCH + x.start * 60000, href: href(x.id), action: actionFor(x).words })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [W, href, me]);

  const sections: Record<string, ReactNode> = {
    cities: board && board.list === 'board' ? <div key="cities" id="cities" className="pf-part oa-part oa-db" data-part="cities">{board.table}</div> : <CitiesPart key="cities" W={W} views={views} href={href} zone={zone} you={you} chips={board ? day : null} />,
    final: <FinalGrid key="final" W={W} />,
    how: <div key="how" className="pf-part" data-part="how"><HowItWorks f={day} id="how" day={cfg.how === 'real' ? dayFinalOf(W) : undefined} /></div>,
    questions: <DayQuestions key="questions" finalists={dayFinalOf(W).finalists} />,
    prizes: <div key="prizes" className="pf-part pf-prize" data-part="prizes"><PrizeBlock id="prizes" text={wheel.globe === 'ascii' ? wheel : undefined} day={dayFinalOf(W)} winner={W.picked ? W.final.p.name + ', ' + W.final.city.name : null} /></div>,
  };

  /* the start line only while a city has still to start: after the last one it has nothing left to say */
  const lineOn = cfg.startLine === 'on' && W.cs.some((x) => W.now < x.start);

  return (
    <AirShell plain wheel={wheel} parts={parts} action={action}
      wire={cfg.wire !== 'off' && air.wireAt !== 'page' ? { items: wire, rate: air.wireRate, hold: air.wireHold, at: air.wireAt, ch: air.wireCh, label: 'The day’s wire', empty: WIRE_EMPTY, paused: !live } : null} near={{ lat: PLACE[W.cs[you].id][0], lon: PLACE[W.cs[you].id][1] }} label={EVENT.name + ' on the day'}
      foot={<Ending cfg={end} wheel={wheel} cities={endCities} start={you} last={lastLine(W)} date={EVENT.date} sound links={{ how: '#how', prizes: '#prizes', questions: '#questions' }} markMode={wheel.mark} map={false} label="Open a city" />}>
      {board && board.mode !== 'flat' ? (
        /* the board's opening (the name, the city now, its clock, the one action) with the day's map beside it (side) or
           under it (band); the map's brackets follow the city the opening is about */
        <section className="oa-bmix k-frame" data-frame={FAMILY.frame} data-mode={board.mode} aria-label="Now" style={{ ['--g-size' as string]: board.spin.size, ['--g-bleed' as string]: board.spin.bleed } as CSSProperties}>
          <div className="oa-bmix-h k-frame-w">{board.hero}</div>
          {board.mode === 'globe' ? (
            <div className="oa-bmix-g k-frame-g">
              <SpinGlobe wheel={wheel} cities={spinCities} order={tourOrder} minute={bm} cfg={board.spin} label={`The world in characters, turning from city to city; the ${W.cs.length} cities are marked and open on a press.`} />
            </div>
          ) : (
          <div className="oa-bmix-m">
            <LiveMap cities={cities} aim={aim} point={setPointed} wheel={wheel} minute={bm} label={`A map of the world in characters, with the ${W.cs.length} cities marked by their state: ${W.live.length} live now.`}
              look={{ rows: end.rows, north: end.north, south: end.south, tag: end.tag, rate: end.rate, seed: end.seed, night: cfg.night === 'on', line: { on: lineOn, hour: air.lineHour, char: air.lineChar, ink: air.lineInk } }} />
            <MapKey line={lineOn ? air.lineHour : null} />
          </div>
          )}
        </section>
      ) : (
      <section className="oa-first" aria-labelledby="oa-h">
          <div className="oa-words">
            <h1 id="oa-h" className="oa-h"><span>{words(W.cs.length)} cities, one day.</span> <span>{now1}</span></h1>
            <Cells clock={clock} first={first} W={W} />
          </div>
          <LiveMap cities={cities} aim={aim} point={setPointed} wheel={wheel} minute={bm} label={`A map of the world in characters, with the ${W.cs.length} cities marked by their state: ${W.live.length} live now.`}
            look={{ rows: end.rows, north: end.north, south: end.south, tag: end.tag, rate: end.rate, seed: end.seed, night: cfg.night === 'on', line: { on: lineOn, hour: air.lineHour, char: air.lineChar, ink: air.lineInk } }} />
          <MapKey line={lineOn ? air.lineHour : null} />
          <NowCell x={ax} v={av} now={W.now} action={actionFor(ax)} zone={zone} />
          {cfg.wire !== 'off' && air.wireAt === 'page' ? <Wire items={wire} rate={air.wireRate} hold={air.wireHold} label="The day’s wire" empty={WIRE_EMPTY} paused={!live} /> : null}
        </section>
      )}
      {shown.map((id) => sections[id])}
      {children}
    </AirShell>
  );
}

/* the first screen's cells: the date, the cities live, the entries in all, the time in UTC (the one ticking thing) */
function Cells({ clock, first, W }: { clock: DayClock; first: number; W: HomeWorld }) {
  const s = useSecond(clock, first), m = Math.floor(s / 60), sec = Math.floor(s % 60);
  const t = hhmm(m) + ':' + String(sec).padStart(2, '0');
  return (
    <dl className="oa-cells">
      <div><dt>Date</dt><dd>{EVENT.date}</dd></div>
      <div><dt>Live now</dt><dd>{W.live.length} of {W.cs.length}</dd></div>
      <div><dt>Entries</dt><dd>{W.cs.reduce((a, x) => a + entriesOf(x), 0)}</dd></div>
      <div><dt>UTC</dt><dd className="oa-tab"><time>{t}</time></dd></div>
    </dl>
  );
}

function MapKey({ line }: { line: number | null }) {
  const ks: MarkState[] = ['next', 'build', 'vote', 'final'];
  return (
    <p className="oa-key">
      {ks.map((k) => <span key={k}><b aria-hidden="true">{MARK[k]}</b> {MARK_WORD[k]}</span>)}
      {line !== null ? <span><b aria-hidden="true">|</b> {String(line).padStart(2, '0')}:00 local now: cities east of it have started</span> : null}
    </p>
  );
}

/* one wide cell under the map: the city under the brackets */
function NowCell({ x, v, now, action, zone }: { x: HomeCity; v: ReturnType<typeof cityView>; now: number; action: { words: string; href: string }; zone: string }) {
  const lead = leadOf(x);
  const when = x.state === 'next' ? `Opens ${hhmm(x.start + x.city.offset)} local${zone ? ', ' + inZone(x.start, zone) + ' your time' : ''}`
    : x.state === 'build' ? `${mmss(leftOf(x, now))} left to build${x.publicAt != null && now < x.publicAt ? ` · everyone votes from ${hhmm(x.publicAt + x.city.offset)}` : ''}` : x.state === 'vote' ? `${mmss(leftOf(x, now))} of votes left` : `Closed at ${hhmm(x.end + x.city.offset)} local`;
  return (
    <div className="oa-now" aria-live="polite" aria-atomic="true">
      <p className="oa-now-c"><span className="oa-code">{CODE[x.id]}</span> <span className="oa-now-n">{x.name}</span></p>
      <StateCell s={v.s} word={v.word} />
      <p className="oa-now-l">{lead ? <>{x.state === 'done' ? '1st' : 'Leading'}: <b>{lead.p.name}</b>{v.hidden ? null : <span className="oa-tab"> · {lead.v} votes</span>}</> : x.state === 'next' ? 'No entries yet' : 'No entries'}</p>
      <p className="oa-now-l oa-tab">{entriesOf(x)} entries · {when}</p>
      <a className="oa-act" href={action.href}>{action.words}</a>
    </div>
  );
}

/* Cities: the board, east to west, a fixed order; only the cells change */
function CitiesPart({ W, views, href, zone, you }: { W: HomeWorld; views: ReturnType<typeof cityView>[]; href: (id: string) => string; zone: string; you: number;
  chips?: Day | null }) {
  /* the now line (family): the day read as a list, the line under the last city that has started */
  const nowAt = FAMILY.nowLine === 'on' && W.cs.some((x) => W.now < x.start) && W.cs.some((x) => W.now >= x.start) ? W.cs.findIndex((x) => W.now < x.start) : -1;
  return (
    <section id="cities" className="pf-part oa-part" data-part="cities" aria-labelledby="cities-h">
      <h2 id="cities-h" className="k-h2 pf-h">{W.cs.length} cities, east to west</h2>
      <table className="k-table oa-board">
        <caption className="sr-only">Each city’s start, state, leader and entries</caption>
        <thead><tr><th scope="col">City</th><th scope="col">Starts</th><th scope="col">State</th><th scope="col">Leading</th><th scope="col" className="k-r">Entries</th></tr></thead>
        <tbody>
          {W.cs.map((x, i) => {
            const v = views[i], lead = leadOf(x);
            const live = x.state === 'build' || x.state === 'vote';
            return (
              <Fragment key={x.id}>
                {i === nowAt ? <tr className="k-now" aria-hidden="true"><td colSpan={5}><span className="k-now-l">Now · {hhmm(W.now)} UTC</span></td></tr> : null}
                <tr data-you={i === you ? '' : undefined}>
                  <th scope="row"><a href={href(x.id)}><span className="oa-code">{CODE[x.id]}</span> {x.name}</a></th>
                  <td className="oa-tab">{hhmm(x.start + x.city.offset)}<span className="oa-muted">{zone ? ' · ' + inZone(x.start, zone) + ' yours' : ''}</span></td>
                  <td><Chip s={v.s} word={v.word} />{live ? <span className="oa-muted oa-tab oa-left"> {mmss(leftOf(x, W.now))} left</span> : null}</td>
                  <td className="oa-lead">{lead ? <a className="oa-lead-row" href={routes.project(x.id, slugOf(lead.p))}><Picture p={lead.p} cls="oa-pic oa-pic-s" /><span className="oa-lead-n">{lead.p.name}</span>{v.hidden ? null : <span className="oa-muted oa-tab oa-lead-v">· {lead.v}</span>}</a> : <span className="oa-muted">–</span>}</td>
                  <td className="k-r oa-tab">{x.state === 'next' ? <span className="oa-muted">–</span> : entriesOf(x)}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/* The final: each closed city a row, its three finalists side by side at one picture size, each one opening its
   project. Cities still to close are one line under them. Once Ant and Copple pick, the picked one is marked. */
function FinalGrid({ W }: { W: HomeWorld }) {
  const done = W.cs.filter((x) => x.state === 'done').sort((a, b) => (W.picked ? +(b.i === W.final.city.i) - +(a.i === W.final.city.i) : 0)), open = W.cs.filter((x) => x.state !== 'done');
  const total = finalCount(W).of, inN = W.finalists.length;
  return (
    <section id="final" className="pf-part oa-part" data-part="final" aria-labelledby="final-h">
      <h2 id="final-h" className="k-h2 pf-h">The final</h2>
      <p className="pf-lede">{W.picked ? `${EVENT.pickers} picked ${W.final.p.name}, from ${W.final.city.name}.` : `The top ${EVENT.finalists} in each city make the final. ${inN} of ${total} are in. ${EVENT.pickers} pick one winner.`}</p>
      {done.length ? (
        <ul className="oa-fin">
          {done.map((x) => (
            <li key={x.id} className="oa-fin-c">
              <p className="oa-fin-h"><span className="oa-code">{CODE[x.id]}</span> <a href={routes.city(x.id)}>{x.name}</a> <span className="oa-muted">closed {hhmm(x.end + x.city.offset)} local</span></p>
              {x.top.length ? (
                <ol className="oa-fin-r">
                  {x.top.map((t) => {
                    const picked = W.picked && W.final.city.i === x.i && W.final.p.id === t.p.id;
                    return (
                      <li key={t.p.id} data-picked={picked ? '' : undefined}>
                        <a href={routes.project(x.id, slugOf(t.p))}>
                          <Picture p={t.p} cls="oa-just-pic" />
                          <span className="oa-just-n">{picked ? <b className="oa-fin-pick">Picked · </b> : null}{t.p.name}</span>
                          <span className="oa-just-k">{ord(t.place)} · {t.v} votes · @{t.p.handle}</span>
                        </a>
                      </li>
                    );
                  })}
                </ol>
              ) : <p className="oa-muted">No entries came in.</p>}
            </li>
          ))}
        </ul>
      ) : null}
      {open.length ? <p className="oa-fin-wait">{done.length ? 'Still to close: ' : 'No city has closed yet. Closing times: '}{open.map((x, k) => <span key={x.id}>{k ? ' · ' : ''}<span className="oa-code">{CODE[x.id]}</span> {hhmm(x.end + x.city.offset)}</span>)} <span className="oa-muted">(local times)</span></p> : null}
    </section>
  );
}

