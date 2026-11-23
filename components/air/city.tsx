'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import { useSecond, type DayClock } from '@/components/board/clock';
import type { Day } from '@/components/board/day-model';
import type { Item } from '@/components/board/announce';
import { slugOf, type CityWorld, type Row } from '@/lib/city';
import type { HomeWorld } from '@/lib/home';
import { EPOCH, EVENT } from '@/lib/day-data';
import { CODE, PLACE } from '@/lib/places';
import { hhmm, ord, tz } from '@/lib/format';
import { routes } from '@/lib/routes';
import { Picture } from '@/components/pictures/picture';
import { HowItWorks, PrizeBlock } from '@/components/day/explain';
import { Ending, type EndCity } from '@/components/day/ending';
import { clampEnd, type EndCfg } from '@/components/day/ending-config';
import { lastLine } from '@/components/day/footer';
import { dayFinalOf } from '@/components/day/home-parts';
import { FoldReady } from '@/components/preview/fold/ready';
import { clampFold } from '@/components/preview/fold/config';
import { Sheet, FM_H, FM_P, useSheetId } from '@/components/forms/sheet';
import { meNow } from '@/components/forms/store';
import { tokMs } from '@/components/shared/motion';
import { LiveSegment } from '@/components/day/shared';
import partsSaved from '@/saved/parts.config.json';
import { RankTime } from '@/components/day/rank-time';
import '@/components/day/rank-view.css';
import endSaved from '@/saved/ending.config.json';
import foldSaved from '@/saved/fold.config.json';
import { AirShell } from './shell';
import { FacingGlobe } from './facing';
import { DayQuestions } from './questions';
import { Bar, Count, Delta, Dock, StateCell, Wire, useReduced } from './parts';
import { barScaleFor, MARK, MARK_WORD, markOf, trailChar, type AirParts, type MarkState } from './devices';
import { modelHidden } from './hidden';
import { Cells, Chip, FAMILY, Key, Notice } from '@/components/kit/kit';
import { bothTimes, useYourTime } from '@/components/kit/time';

/* A city's page on the day, on the preview's machine (day-revamp plan, "The city page").
   - Mix (the pick, owner 2026-11-23: "a mix of board and pylon and facing", "important to instantly see what is
     happening ranking pictures"): Board's plain black and its short first screen (the name, the cells, the segment
     countdown, the one action, the leader's picture large), the text globe small beside the name facing the city
     (large only before it opens, when there is no leader), and the ranking straight under it with the pylon beside.
   - Facing: the name at the wheel's size and place, its cells, the time left (the one ticking thing), the leader, the
     one action; the text globe on the right facing this city, its [+] in green.
   - The results page: the entries as a printout (place, picture, name and maker, the vote bar in hatch, the count,
     the change in 10 minutes, the vote key), the cut under 3rd as the globe's dotted equator, the first rows then
     "Print all" on a press. A row moves by whole rows on the tick and leaves a trail that decays.
   - Votes hidden from minute 70 (the model's W.hidden): the counts print the placeholder, the bars dim, the order is
     the one at the freeze and new entries sit at the bottom as New; one rule line says when it all appears. When
     voting closes, the reveal: counts print from the bottom up, the rows take their places, the top 3 print [3]. */

export type AirCityCfg = { first: 'mix' | 'facing' | 'board'; rank: 'print'; bars: 'hatch' | 'blocks' | 'none'; top: 'header' | 'pylon'; cut: 'equator' | 'rule'; trail: 'decay' | 'none'; gauge: 'on' | 'off'; you: 'dock' | 'row'; rowsFirst: number };
export const AIR_CITY_DEF: AirCityCfg = { first: 'mix', rank: 'print', bars: 'hatch', top: 'pylon', cut: 'equator', trail: 'decay', gauge: 'on', you: 'dock', rowsFirst: 10 };
export const AIR_CITY_CHOICES: Record<string, string[]> = { bars: ['hatch', 'blocks', 'none'], top: ['header', 'pylon'], cut: ['equator', 'rule'], trail: ['decay', 'none'], gauge: ['on', 'off'], you: ['dock', 'row'] };

const mmss = (min: number) => { const s = Math.max(0, Math.round(min * 60)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
/* a shuffle that holds while the reader looks (Board's deal): the same seed deals the same order */
const deal = (id: number, seed: number) => { let x = (id * 2654435761 + seed * 40503) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x; };
const short = (name: string) => name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '···';

type Act = { words: string; short: string; href?: string; press?: () => void };
type Ctx = {
  W: CityWorld; W10: CityWorld; H: HomeWorld; day: Day; clock: DayClock; first: number; bm: number; real: boolean;
  vote: (id: number) => void; show: (r: Row) => void; open: Row | null; close: () => void;
  remind: () => void; reminded: boolean; submit?: () => void;
  pick: { id: number; name: string; place: number } | null; elsewhere: { name: string; city: string } | null;
  homeHref: string; href: (id: string) => string; wheel: WheelCfg; air: AirParts; cfg: AirCityCfg; wire: Item[]; live: boolean;
  /* the lab: show the reveal again */
  replay?: number; children?: ReactNode;
};

/* who may vote now: the builders on the city's list from the start, everyone else (the judges too) from publicAt */
function useGate(W: CityWorld) {
  const me = meNow(), peer = me?.pass?.city === W.city.id;
  return { can: W.voting && (W.publicOpen || peer), peer, early: W.voting && !W.publicOpen, from: hhmm(W.publicAt + W.off) };
}

export function AirCity(c: Ctx) {
  const { W, H, wheel, air, cfg, href } = c, me = meNow();
  const hidden = modelHidden(W).hidden, code = CODE[W.city.id], [lat, lon] = PLACE[W.city.id];
  const mine = me?.pass?.city === W.city.id, gate = useGate(W);
  const scrollTo = (id: string) => () => document.getElementById(id)?.scrollIntoView({ block: 'start' });
  /* the one thing to do now (rule 1: always something the visitor can do; a time or a rule is a Notice, never a Key).
     Before the vote gate a visitor not on the list watches the entries; the header's action cell follows the same table. */
  const entered = mine && !!me?.entry;
  const action: Act = W.state === 'next' ? (mine ? { words: 'Your place in ' + W.city.name, short: 'You · ' + code, href: '#ready' } : { words: c.reminded ? 'Reminder set' : 'Remind me', short: 'Remind', press: c.remind })
    : W.state === 'build' && mine && c.submit ? { words: entered ? 'Edit your project' : 'Submit your project', short: entered ? 'Edit' : 'Submit', press: c.submit }
    : W.voting ? (gate.can ? { words: 'Vote in ' + W.city.name, short: 'Vote ' + code, href: '#ranking' } : { words: 'See the entries', short: 'Entries', href: '#ranking' })
    : { words: 'See the final', short: 'Final', href: c.homeHref + '#final' };
  const top3 = (hidden ? W.ranked.filter((o) => !o.late) : W.ranked).slice(0, 3);
  const aside = top3.length ? <><b>{code}</b> · {top3.map((o, k) => <span key={o.p.id}>{k ? ' · ' : ''}{k + 1} {short(o.p.name)} {o.votes == null ? '··' : o.votes}</span>)}</> : null;

  const wireLabel = 'The wire in ' + W.city.name, wireEmpty = 'Nothing yet. ' + W.city.name + ' opens at ' + hhmm(W.x.start + W.off) + ' local.';
  const fold = useMemo(() => clampFold(foldSaved), []);
  const end = useMemo(() => clampEnd(endSaved as Partial<EndCfg>), []);
  const endCities: EndCity[] = useMemo(() => H.cs.map((x) => ({ id: x.id, name: x.name, code: CODE[x.id], lat: PLACE[x.id][0], lon: PLACE[x.id][1], opens: EPOCH + x.start * 60000, href: x.id === W.city.id ? c.homeHref : href(x.id), action: x.id === W.city.id ? 'All ' + H.cs.length + ' cities' : 'Open ' + x.name })), [H, href, W.city.id, c.homeHref]);
  const states = useMemo(() => H.cs.map((x) => { const s = markOf(x.state, x.entries, modelHidden(x).hidden); return { mark: MARK[s], ink: s === 'next' || s === 'done' ? air.markDim : 1 }; }), [H, air.markDim]);
  const parts = [{ id: 'ranking', label: 'Ranking' }, ...(W.state === 'next' ? [{ id: 'ready', label: 'Get ready' }] : []), { id: 'how', label: 'How it works' }, { id: 'prizes', label: 'Prizes' }, { id: 'questions', label: 'Questions' }];

  return (
    <AirShell plain={cfg.first === 'mix'} wire={air.wireAt !== 'page' ? { items: c.wire, rate: air.wireRate, hold: air.wireHold, at: air.wireAt, ch: air.wireCh, label: wireLabel, empty: wireEmpty, paused: !c.live } : null} wheel={wheel} parts={parts} action={action} near={{ lat, lon }} aside={cfg.top === 'header' ? aside : null} label={W.city.name + ', ' + EVENT.name}
      foot={<Ending cfg={end} wheel={wheel} cities={endCities} start={W.i} last={lastLine(H)} date={EVENT.date} sound links={{ how: '#how', prizes: '#prizes', questions: '#questions' }} markMode={wheel.mark} states={states} label="Open a city" />}>
      {cfg.first === 'mix' ? <Mix {...c} hidden={hidden} action={action} gate={gate} /> : <Facing {...c} hidden={hidden} action={action} onVote={scrollTo('ranking')} />}
      <Results {...c} hidden={hidden} />
      {W.state === 'next' ? <div id="ready" className="pf-part" data-part="ready"><FoldReady city={W.city.name} cityId={W.city.id} mode={fold.ready} auto={false} step={fold.dryStep} hold={fold.dryHold} /></div> : null}
      {air.wireAt === 'page' ? <div className="pf-part"><Wire items={c.wire} rate={air.wireRate} hold={air.wireHold} label={wireLabel} empty={wireEmpty} paused={!c.live} /></div> : null}
      <div className="pf-part" data-part="how"><HowItWorks f={c.day} id="how" day={{ ...dayFinalOf(H), city: W.city.id }} /></div>
      <div className="pf-part pf-prize" data-part="prizes"><PrizeBlock id="prizes" text={wheel.globe === 'ascii' ? wheel : undefined} day={dayFinalOf(H)} winner={H.picked ? H.final.p.name + ', ' + H.final.city.name : null} /></div>
      <DayQuestions finalists={dayFinalOf(H).finalists} />
      <ProjectPass {...c} hidden={hidden} />
      {c.children}
    </AirShell>
  );
}

/* ---------- the first screen ---------- */
function Facing({ W, H, clock, first, wheel, pick, elsewhere, hidden, action, onVote }: Ctx & { hidden: boolean; action: { words: string; href?: string; press?: () => void }; onVote: () => void }) {
  const gate = useGate(W);
  const s = useSecond(clock, first) / 60;
  const code = CODE[W.city.id], lead = W.lead && !(hidden && W.lead.late) ? W.lead : null;
  const left = W.state === 'build' ? W.x.buildEnd - s : W.state === 'vote' ? W.x.end - s : 0;
  const time = W.state === 'next' ? `Opens at ${hhmm(W.x.start + W.off)} local` : W.state === 'build' ? `${mmss(left)} left to build` : W.state === 'vote' ? `${mmss(left)} of votes left` : `Closed at ${hhmm(W.x.end + W.off)} local`;
  const mk: MarkState = markOf(W.state, W.sd.entries, hidden);
  const word = hidden ? 'Hidden' : MARK_WORD[mk];
  const cities = useMemo(() => H.cs.map((x) => ({ lat: PLACE[x.id][0], lon: PLACE[x.id][1], code: CODE[x.id] })), [H]);
  const n = W.arrived.length;
  return (
    <section className="oa-face" aria-labelledby="oa-city-h">
      <div className="oa-face-l">
        <p className="oa-face-k">{code} · {EVENT.date} · {hhmm(W.x.start + W.off)}–{hhmm(W.x.end + W.off)} {tz(W.off)}</p>
        <h1 id="oa-city-h" className="oa-face-n" data-long={W.city.name.length > 10 ? '' : undefined}>{W.city.name}</h1>
        <dl className="oa-cells">
          <div><dt>State</dt><dd><StateCell s={hidden ? 'hidden' : mk} word={word} /></dd></div>
          <div><dt>Entries</dt><dd className="oa-tab">{W.state === 'next' ? '–' : n}</dd></div>
          <div><dt>Votes</dt><dd className="oa-tab">{hidden ? 'Hidden' : W.votesOn ? W.total : '–'}</dd></div>
          <div><dt>Local time</dt><dd className="oa-tab">{hhmm(s + W.off)}</dd></div>
        </dl>
        <p className="oa-face-t" aria-live="off">{time}</p>
        {pick ? <p className="oa-face-lead"><b>{EVENT.pickers} picked {pick.name}</b>, {ord(pick.place)} here.</p>
          : lead ? (
            <p className="oa-face-lead"><Picture p={lead.p} cls="oa-pic" /><span>{W.state === 'done' ? '1st' : hidden ? 'Leading at ' + ((W.hideAt ?? W.x.start) - W.x.start) + ' min' : 'Leading'}: <b>{lead.p.name}</b>{hidden || lead.votes == null ? null : <span className="oa-tab">, {lead.votes} votes</span>}</span></p>
          ) : <p className="oa-face-lead">{W.state === 'next' ? 'No entries until it opens.' : 'No entries yet.'}</p>}
        {elsewhere ? <p className="oa-face-lead">The pick went to {elsewhere.name}, {elsewhere.city}.</p> : null}
        <div className="oa-face-acts">
          {action.press ? <button type="button" className="oa-act" onClick={action.press} aria-haspopup="dialog">{action.words}</button> : <a className="oa-act" href={action.href}>{action.words}</a>}
          {gate.can && action.href !== '#ranking' ? <button type="button" className="oa-link" onClick={onVote} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>Vote</button> : null}
        </div>
      </div>
      <div className="oa-face-r">
        <FacingGlobe wheel={wheel} cities={cities} active={W.i} minute={s} print={0} label={`The world in characters, turned to face ${W.city.name}, marked in green.`} />
      </div>
    </section>
  );
}

/* ---------- the first screen, on the family's frame: the words and the one Key on the left, the cells, the clock, the
   globe on the right facing the city (bleeding off the edge), the rule said once in a Notice ---------- */
function Mix({ W, H, clock, first, wheel, pick, elsewhere, hidden, action, gate }: Ctx & { hidden: boolean; action: Act; gate: ReturnType<typeof useGate> }) {
  const s = useSecond(clock, first) / 60, yours = useYourTime();
  const code = CODE[W.city.id], lead = W.lead && !(hidden && W.lead.late) ? W.lead : null;
  const mk: MarkState = markOf(W.state, W.sd.entries, hidden);
  const cities = useMemo(() => H.cs.map((x) => ({ lat: PLACE[x.id][0], lon: PLACE[x.id][1], code: CODE[x.id] })), [H]);
  const n = W.arrived.length, name = W.city.name;
  const at = (m: number) => bothTimes(hhmm(m + W.off), name, yours ? yours(m) : null);
  const note: ReactNode = W.state === 'next' ? <>Building and voting start at <b>{at(W.x.start)}</b>.</>
    : gate.early ? (gate.peer ? <>You vote now, as a builder here. Everyone else votes from <b>{at(W.publicAt)}</b>.</> : <>Everyone votes from <b>{at(W.publicAt)}</b>. The builders on {name}’s list vote now.</>)
    : W.state === 'build' ? <>Building until {hhmm(W.x.buildEnd + W.off)}. Votes close at <b>{at(W.x.end)}</b>.</>
    : W.state === 'vote' ? <>Entries are closed. Votes close at <b>{at(W.x.end)}</b>.</>
    : <>Closed at {hhmm(W.x.end + W.off)} local. The top {EVENT.finalists} are in the final.</>;
  const globe = <FacingGlobe wheel={wheel} cities={cities} active={W.i} minute={s} print={0} label={`The world in characters, turned to face ${name}, marked in green.`} />;
  const votes = lead && !hidden && lead.votes != null ? lead.votes : null;
  const second = gate.can && action.href !== '#ranking' ? <Key kind="second" href="#ranking">Vote in {name}</Key> : null;
  return (
    <section className="oa-mix k-frame" data-frame={FAMILY.frame} data-next={W.state === 'next' ? '' : undefined} aria-labelledby="oa-city-h">
      <div className="oa-mix-l k-frame-w">
        <div className="oa-mix-top">
          <div>
            <p className="oa-face-k">{code} · {EVENT.date} · <span className="oa-nowrap">{hhmm(W.x.start + W.off)}–{hhmm(W.x.end + W.off)} {tz(W.off)}</span></p>
            <h1 id="oa-city-h" className="oa-mix-n" data-long={name.length > 10 ? '' : undefined}>{name}</h1>
          </div>
        </div>
        <Cells label={'Now in ' + name} cells={[
          { k: 'State', v: <Chip s={hidden ? 'hidden' : mk} /> },
          { k: 'Entries', v: W.state === 'next' ? '–' : n },
          { k: 'Votes', v: hidden ? 'Hidden' : W.votesOn ? W.total : '–' },
          { k: 'Local time', v: hhmm(s + W.off), live: true },
        ]} />
        {W.state === 'done' ? null : <LiveSegment className="oa-mix-seg" clock={clock} first={first} x={{ state: W.state, start: W.x.start, buildEnd: W.x.buildEnd, end: W.x.end }} withSecs={!!partsSaved.segSecs} name={name} />}
        {/* the leader as one line, the same size as any other: a big first place would draw the votes to it */}
        {pick ? <p className="oa-mix-lead"><span className="oa-leader-k">Picked</span> <b>{pick.name}</b>, {ord(pick.place)} here</p>
          : lead ? <p className="oa-mix-lead"><span className="oa-leader-k">{W.state === 'done' ? '1st' : hidden ? 'Leading at ' + ((W.hideAt ?? W.x.start) - W.x.start) + ' min' : 'Leading'}</span> <b>{lead.p.name}</b>{votes != null ? <span className="oa-tab"> · {votes} votes</span> : null}</p> : null}
        {elsewhere ? <p className="oa-mix-lead">The pick went to {elsewhere.name}, {elsewhere.city}.</p> : null}
        <div className="oa-face-acts">
          {action.press ? <Key onClick={action.press} popup={action.words !== 'Reminder set'}>{action.words}</Key> : <Key href={action.href}>{action.words}</Key>}
          {second}
        </div>
        <Notice>{note}</Notice>
      </div>
      <div className="oa-mix-r k-frame-g">
        <div className="oa-mix-world">{globe}</div>
      </div>
    </section>
  );
}

/* the pylon: the top ten beside the ranking, sticky, the cut under 3rd; hidden, it keeps the frozen order and no counts */
function TopTen({ W, W10, hidden, show, frozen }: { W: CityWorld; W10: CityWorld; hidden: boolean; show: (r: Row) => void; frozen: string }) {
  const before = useMemo(() => new Map(W10.ranked.map((o) => [o.p.id, o.v])), [W10]);
  let list = hidden ? W.ranked.filter((o) => !o.late) : W.ranked;
  if (frozen) { const by = new Map(W.ranked.map((o) => [o.p.id, o])); list = frozen.split(',').map((id) => by.get(Number(id))!).filter(Boolean); }
  return (
    <aside className="oa-pylon" aria-label={'Top ten in ' + W.city.name}>
      <p className="oa-pylon-k">Top ten{hidden ? ' · order at ' + ((W.hideAt ?? W.x.start) - W.x.start) + ' min' : ''}</p>
      <ol>
        {list.slice(0, 10).map((o, k) => (
          <li key={o.p.id} data-cut={k === 2 ? '' : undefined}>
            <span className="oa-pylon-n">{k + 1}</span>
            <button type="button" onClick={() => show(o)} aria-haspopup="dialog">{o.p.name}</button>
            <Count v={hidden ? null : o.votes ?? o.v} w={3} hidden={hidden} />
            <Delta now={o.v} before={before.get(o.p.id)} hidden={hidden} />
          </li>
        ))}
      </ol>
    </aside>
  );
}

/* ---------- the results page ---------- */
function Results({ W, W10, bm, vote, show, pick, air, cfg, hidden, replay }: Ctx & { hidden: boolean }) {
  const gate = useGate(W), yours = useYourTime();
  const at = (m: number) => bothTimes(hhmm(m + W.off), W.city.name, yours ? yours(m) : null);
  const reduced = useReduced();
  const [all, setAll] = useState(false), [q, setQ] = useState('');
  const [order, setOrder] = useState<'ranked' | 'random' | 'newest'>('ranked'), [seed, setSeed] = useState(1);
  /* the view: the list, or the top ten's votes over time (Board's chart). Never while votes are hidden: it draws counts */
  const [view, setView] = useState<'list' | 'time'>('list'), [hot, setHot] = useState<number | null>(null);
  const time = view === 'time' && !hidden;
  /* the reveal: hidden a moment ago, real now. The frozen order is kept to print the counts over it first. */
  const frozenNow = hidden ? W.ranked.map((o) => o.p.id).join(',') : null;
  const [frozen, setFrozen] = useState(frozenNow ?? '');
  if (frozenNow !== null && frozenNow !== frozen) setFrozen(frozenNow);
  const [phase, setPhase] = useState<'idle' | 'counts' | 'order' | 'final'>('idle'), [run, setRun] = useState(0);
  const [was, setWas] = useState(hidden), [seenReplay, setSeenReplay] = useState(replay ?? 0);
  /* told: the reveal ran in front of this reader, so the notice stays (with its words changed) and nothing under it jumps */
  const [told, setTold] = useState(false);
  if (was !== hidden) { setWas(hidden); if (was && !hidden) { setTold(true); if (!reduced) { setPhase('counts'); setRun((n) => n + 1); } } }
  /* the lab's replay: back to the frozen order for a moment, then the reveal */
  if ((replay ?? 0) !== seenReplay) { setSeenReplay(replay ?? 0); if (!reduced && !hidden && frozen) { setPhase('counts'); setRun((n) => n + 1); } }
  useEffect(() => {
    if (!run) return;
    const d = tokMs('--dur-air-reveal') || 1600;
    const t1 = window.setTimeout(() => setPhase('order'), d * 0.55), t2 = window.setTimeout(() => setPhase('final'), d * 0.62), t3 = window.setTimeout(() => setPhase('idle'), d);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [run]);

  /* D4: rows passed on the last tick keep a trail that decays over the next ticks */
  const [tk, setTk] = useState(() => ({ bm, prev: new Map(W.ranked.map((o) => [o.p.id, o.rank])), moved: new Map<number, number>() }));
  if (tk.bm !== bm) {
    const m = new Map<number, number>();
    if (!hidden && cfg.trail !== 'none') {
      tk.moved.forEach((age, id) => { if (age + 1 < air.trail) m.set(id, age + 1); });
      W.ranked.forEach((o) => { const p = tk.prev.get(o.p.id); if (p != null && p < o.rank) m.set(o.p.id, 0); });
    }
    setTk({ bm, prev: new Map(W.ranked.map((o) => [o.p.id, o.rank])), moved: m });
  }
  const moved = tk.moved;

  const rows = useMemo(() => {
    let r = W.ranked;
    if (phase === 'counts' && frozen) { const by = new Map(W.ranked.map((o) => [o.p.id, o])); r = frozen.split(',').map((id) => by.get(Number(id))!).filter(Boolean); }
    if (order === 'newest') r = r.slice().sort((a, b) => b.arrive - a.arrive);
    if (order === 'random') r = r.slice().sort((a, b) => deal(a.p.id, seed) - deal(b.p.id, seed));
    if (q.trim()) { const s = q.trim().toLowerCase(); r = r.filter((o) => o.p.name.toLowerCase().includes(s) || o.p.handle.toLowerCase().includes(s)); }
    return r;
  }, [W.ranked, phase, order, q, frozen, seed]);
  const filtered = q.trim() !== '' || order !== 'ranked';
  const shown = all || filtered ? rows : rows.slice(0, cfg.rowsFirst);
  const before = useMemo(() => new Map(W10.ranked.map((o) => [o.p.id, o.v])), [W10]);
  const top = W.ranked[0]?.v ?? 0, scale = barScaleFor(air.barScale, hidden ? Math.max(...W.ranked.map((o) => o.v), 0) : top, air.barCells);
  const third = W.ranked[2], fourth = W.ranked[3];
  const voted = W.rows.filter((o) => o.mine > 0).length;

  /* idea 20: the docked line while your own entry's row is off screen */
  const youRow = useRef<HTMLLIElement>(null), [dock, setDock] = useState(false);
  useEffect(() => {
    const el = youRow.current; if (!el || cfg.you !== 'dock') { setDock(false); return; }
    const io = new IntersectionObserver(([e]) => setDock(!e.isIntersecting)); io.observe(el);
    return () => io.disconnect();
  }, [cfg.you, W.you, all]);
  const y = W.you && W.arrived.includes(W.you) ? W.you : null;
  const dockText = y ? (hidden ? `You · votes hidden · ${voted} of yours in` : `You, ${ord(y.rank)} · ${third && y.rank > 3 ? third.v - y.v + 1 + ' votes to the final' : 'in the top 3'}`) : '';
  const rank = W.state === 'next' ? null : (
    <>
      {hidden ? <Notice className="oa-notice">Votes are hidden until <b>{at(W.x.end)}</b>, when all the counts appear. Voting goes on.</Notice>
        : told ? <Notice className="oa-notice" live>Votes were hidden from {hhmm((W.hideAt ?? W.x.start) + W.off)}. The counts are in.</Notice>
        : null}
      <div className="oa-tools">
        <div className="oa-ctrl" role="group" aria-label="Order and search">
          <button type="button" aria-pressed={order === 'ranked'} disabled={time} onClick={() => setOrder('ranked')}>Ranked</button>
          <button type="button" aria-pressed={order === 'random'} disabled={time} onClick={() => { setSeed((n) => n + 1); setOrder('random'); }}>Random</button>
          <button type="button" aria-pressed={order === 'newest'} disabled={time} onClick={() => setOrder('newest')}>Newest</button>
          <input type="search" placeholder="Search entries" aria-label="Search entries" value={q} disabled={time} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="oa-ctrl" role="group" aria-label="View">
          <button type="button" aria-pressed={!time} onClick={() => setView('list')}>List</button>
          <button type="button" aria-pressed={time} disabled={hidden} onClick={() => setView('time')}>{hidden ? 'Over time · hidden with the votes' : 'Over time'}</button>
        </div>
      </div>
      {W.state === 'done' && W.ranked.some((o) => o.tie === 'open') ? <p className="oa-told">A tie on votes decides a top-{EVENT.finalists} place. The host settles it here soon.</p>
        : W.state === 'done' && W.ranked.some((o) => o.tie === 'settled') ? <p className="oa-rule">A tie on votes for a top-{EVENT.finalists} place was settled by the host.</p> : null}
      {order === 'random' && !time ? <p className="oa-rule">Shuffled, so every entry gets a look. Press Random to shuffle again.</p> : null}
      {time ? <RankTime W={W} open={show} hot={hot} setHot={setHot} draw n={10} tall={760} pic={112} /> : W.arrived.length === 0 ? <p className="oa-empty">No entries yet. They show up here as they come in.</p> : (
        <ol className="oa-rank" data-reveal={phase === 'idle' ? undefined : phase} aria-label="Entries, ranked by votes" style={{ ['--oa-step' as string]: Math.min(40, 900 / Math.max(1, shown.length)) + 'ms' } as CSSProperties}>
          {shown.map((o, k) => {
            const isPick = pick?.id === o.p.id, isYou = y?.p.id === o.p.id, age = moved.get(o.p.id);
            const tr = age != null ? trailChar(age, air.trail) : '';
            const cutAfter = !filtered && k === 2 && W.ranked.length > 3;
            const need = cfg.gauge === 'on' && !hidden && !filtered && fourth && third && o === fourth && W.voting ? third.v - fourth.v + 1 : null;
            return (
              <RowLi key={o.p.id} li={isYou ? youRow : undefined} o={o} k={k} up={shown.length - 1 - k} tr={tr} isPick={isPick} isNew={hidden && o.late} hidden={hidden || o.votes == null}
                v10={before.get(o.p.id)} scale={scale} air={air} bars={cfg.bars} voting={gate.can} vote={vote} rest={!filtered && k >= 3} show={show} need={need} three={!filtered && o.rank <= 3 && W.state === 'done' && phase !== 'counts' && phase !== 'order'}
                cut={cutAfter ? (cfg.cut === 'equator' ? 'equator' : 'rule') : null} done={W.state === 'done'} />
            );
          })}
        </ol>
      )}
      {!time && !all && !filtered && rows.length > cfg.rowsFirst ? <Key kind="second" className="oa-more" onClick={() => setAll(true)}>Print all {rows.length}</Key> : null}
      {W.voting ? <p className="oa-rule" style={{ marginTop: 16 }}>A judge’s vote counts {W.judgeWeight}. One vote per entry. Your votes count at once; press again to take one back. Votes close at {hhmm(W.x.end + W.off)} local.{voted ? ` You have voted for ${voted}.` : ''}</p> : null}
      {y ? <Dock show={dock && W.state !== 'done'} text={dockText} onPress={() => youRow.current?.scrollIntoView({ block: 'center' })} /> : null}
    </>
  );
  const pylon = cfg.top === 'pylon' && W.arrived.length > 0 && !time ? <TopTen W={W} W10={W10} hidden={hidden} show={show} frozen={phase === 'counts' ? frozen : ''} /> : null;
  return (
    <section id="ranking" className="pf-part oa-part" data-part="ranking" data-pylon={pylon ? '' : undefined} aria-labelledby="ranking-h">
      <div className="oa-rank-main">
        <h2 id="ranking-h" className="pf-h">{W.state === 'done' ? 'The results' : 'The ranking'}</h2>
        <p className="pf-lede">{W.state === 'next' ? `Entries show up here from ${hhmm(W.x.start + W.off)} local. Voting opens then too.` : `The top ${EVENT.finalists} by votes go to the final.${W.state === 'done' ? '' : ' Voting closes at ' + hhmm(W.x.end + W.off) + ' local.'}`}</p>
        {rank}
      </div>
      {pylon}
    </section>
  );
}

function RowLi({ li, o, k, up, tr, isPick, isNew, hidden, v10, scale, air, bars, voting, rest, vote, show, need, three, cut, done }: {
  li?: React.Ref<HTMLLIElement>; o: Row; k: number; up: number; tr: string; isPick: boolean; isNew: boolean; hidden: boolean; v10: number | undefined; scale: number; air: AirParts; bars: AirCityCfg['bars'];
  voting: boolean; rest: boolean; vote: (id: number) => void; show: (r: Row) => void; need: number | null; three: boolean; cut: 'equator' | 'rule' | null; done?: boolean;
}) {
  const joined = FAMILY.voteBox === 'joined';
  const count = <Count v={hidden ? null : o.votes ?? o.v} hidden={hidden} />;
  /* joined: the count and the Vote key are one box at the far right (count over key, a fixed width); your vote fills it */
  const box = joined
    ? (voting
      ? <button type="button" className="oa-vb" aria-pressed={o.mine > 0} onClick={() => vote(o.p.id)} aria-label={(o.mine ? 'Take back your vote for ' : 'Vote for ') + o.p.name}>{count}<span className="oa-vb-k" aria-hidden="true">{o.mine ? 'Voted' : 'Vote'}</span></button>
      : <span className="oa-vb" data-still="">{count}<span className="oa-vb-k" aria-hidden="true">votes</span></span>)
    : null;
  return (
    <>
      <li ref={li} className="oa-row" data-box={joined ? '' : undefined} data-rest={rest ? '' : undefined} data-pick={isPick ? '' : undefined} style={{ ['--up' as string]: up, ['--k' as string]: k } as CSSProperties}>
        <span className="oa-trail" aria-hidden="true">{tr || ' '}</span>
        <span className="oa-place">{isNew ? <span className="oa-new">New</span> : <>{ord(o.rank).padStart(4, ' ')}{o.mine ? <><i aria-hidden="true">[+]</i><span className="sr-only">, your vote</span></> : three ? <span className="sr-only">, in the final</span> : null}</>}</span>
        <Picture p={o.p} cls="oa-pic" />
        <span className="oa-row-n">
          <button type="button" onClick={() => show(o)} aria-haspopup="dialog" title={o.p.name}>{o.p.name}</button>
          <span>@{o.p.handle}</span>
          {need ? <span className="oa-need">{need} vote{need === 1 ? '' : 's'} to the final</span> : null}
        </span>
        <Bar v={o.v} scale={scale} cells={air.barCells} mode={bars} dim={hidden} />
        {joined ? null : count}
        {voting ? <Delta now={o.v} before={v10} hidden={hidden} /> : <span className="oa-d" />}
        {joined ? box : voting ? <button type="button" className="oa-vote" aria-pressed={o.mine > 0} onClick={() => vote(o.p.id)} aria-label={(o.mine ? 'Take back your vote for ' : 'Vote for ') + o.p.name}>{o.mine ? 'Voted' : 'Vote'}</button> : <span />}
      </li>
      {cut ? <li className="oa-cut" aria-hidden="true">{cut === 'equator' ? (done ? 'The top 3 went to the final' : 'The top 3 go to the final') : ''}</li> : null}
    </>
  );
}

/* ---------- the project sheet: the sheet art's pass (place and city code), its own address ---------- */
function ProjectPass({ W, open, close, vote, hidden }: Ctx & { hidden: boolean }) {
  if (!open) return null;
  const o = W.ranked.find((r) => r.p.id === open.p.id) ?? open;
  const place = o.late && hidden ? 'NEW' : ord(o.rank).toUpperCase();
  return (
    <Sheet label={W.city.name} art={{ word: place, city: CODE[W.city.id], lines: [o.p.name, '@' + o.p.handle, 'Entered ' + hhmm(o.arrive + W.off), hidden || o.votes == null ? 'Votes hidden' : o.votes + ' votes'] }} onDone={close}>
      <PassBody o={o} W={W} vote={vote} hidden={hidden} />
    </Sheet>
  );
}
function PassBody({ o, W, vote, hidden }: { o: Row; W: CityWorld; vote: (id: number) => void; hidden: boolean }) {
  const id = useSheetId(), [copied, setCopied] = useState(false), gate = useGate(W);
  const link = typeof location !== 'undefined' ? location.origin + routes.project(W.city.id, slugOf(o.p)) : '';
  return (
    <div className="oa-pass">
      <h2 id={id ? id + '-h' : undefined} className={FM_H} tabIndex={-1}>{o.p.name}</h2>
      <p className={FM_P}>{o.p.pitch}</p>
      <Picture p={o.p} cls="oa-pass-pic" />
      <dl className="oa-cells" style={{ marginTop: 16 }}>
        <div><dt>Place</dt><dd>{o.late && hidden ? 'New' : ord(o.rank)}</dd></div>
        <div><dt>Votes</dt><dd className="oa-tab">{hidden || o.votes == null ? 'Hidden' : o.votes}</dd></div>
        <div><dt>Maker</dt><dd>@{o.p.handle}</dd></div>
        <div><dt>Entered</dt><dd className="oa-tab">{hhmm(o.arrive + W.off)}</dd></div>
      </dl>
      <div className="oa-face-acts" style={{ marginTop: 20 }}>
        {gate.can ? <button type="button" className="oa-vote" aria-pressed={o.mine > 0} onClick={() => vote(o.p.id)}>{o.mine ? 'Voted · take it back' : 'Vote'}</button> : gate.early ? <span className="oa-from">Everyone votes from {gate.from}</span> : null}
        <button type="button" className="oa-vote" onClick={() => { navigator.clipboard?.writeText(link).then(() => setCopied(true), () => setCopied(false)); }}>{copied ? 'Link copied' : 'Copy the link'}</button>
      </div>
    </div>
  );
}
