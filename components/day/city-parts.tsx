'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { EVENT, votesAtMin } from '@/lib/day-data';
import type { CityWorld, Row } from '@/lib/city';
import { slugOf, projectPath } from '@/lib/city';
import type { HomeCity } from '@/lib/home';
import { fmtN, hhmm, ord, tz } from '@/lib/format';
import { Flash, countDelta } from '@/components/screen/flash';
import { FlapText, type FlapOpts } from '@/components/board/flap';
import { TestCard, seedOf } from '@/components/board/test-card';
import { Bug } from '@/components/board/bug';
import { BoardingPass } from '@/components/board/pass';
import { useHold } from '@/components/board/hold';
import type { DayClock } from '@/components/board/clock';
import { CODE } from '@/components/board/day-model';
import type { PartsCfg } from '@/components/board/config';
import { Picture } from '@/components/pictures/picture';
import { LiveSegment } from './shared';
import { PIC_DEF, Thumb, type PicCfg } from './rank-pictures';
import { RankTime, lineOf } from './rank-time';
import { DATE, cardCity, fmtLeft } from './home-parts';
import { at } from '@/lib/routes';

/* A city's page on the day, as parts the three directions share: the opening (name, local time, the time left and
   the one thing to do now, beside the city's monitor), the ranking rows with vote cells, the pylon, the cut, and the
   project sheet (the boarding pass and the bug). Every number is the city's world at the board's minute. Prefixes:
   ch2 opening, cr rows, cp pylon, cs scope, cw wall, ps project sheet. */

export type CLook = Pick<PartsCfg, 'mark' | 'cardBars' | 'cardPalette' | 'cards' | 'segSecs' | 'bugCorner'> & { flap: FlapOpts };
export type VoteFn = (id: number) => void;
const q = (n: number) => Math.round(n * 100) / 100;

/* minutes to the city's next change, or null once it has closed */
export function leftOf(W: CityWorld): number | null {
  if (W.state === 'next') return W.x.start - W.now;
  if (W.state === 'build') return W.x.buildEnd - W.now;
  if (W.state === 'vote') return W.x.end - W.now;
  return null;
}
/* how close 4th is: within this many votes of 3rd, while voting is on, it is "catching" */
export function catching(W: CityWorld): { row: Row; gap: number } | null {
  const a = W.ranked[2], b = W.ranked[3];
  if (!W.voting || !a || !b) return null;
  const gap = a.v - b.v;
  return gap <= Math.max(3, Math.round(a.v * 0.05)) ? { row: b, gap } : null;
}

/* the page's host, read after hydration (the server has none) */
const noSub = () => () => {};

/* ---------- the opening ---------- */
export function CityHero({ W, hx, clock, first, look, onRemind, reminded, onSubmit, mon = true, pick, elsewhere }: {
  W: CityWorld; hx: HomeCity; clock: DayClock; first: number; look: CLook; onRemind: () => void; reminded: boolean; onSubmit?: () => void; mon?: boolean; pick?: { id: number; name: string; place: number } | null; elsewhere?: { name: string; city: string } | null;
}) {
  const c = W.city, seed = look.cards[c.id] ?? seedOf(c.id), lead = W.lead, left = leftOf(W), jump = mon ? '#rank' : '#top';
  const doing = W.state === 'next' ? <><button type="button" className="ch2-btn ch2-remind" onClick={onRemind} aria-pressed={reminded}><span className="ch2-tick" aria-hidden="true">{reminded ? '✓ ' : ''}</span>Remind me</button><span className="bd-k">Opens {hhmm(W.x.start + W.off)} local</span></>
    : W.state === 'build' ? <>{onSubmit ? <button type="button" className="ch2-btn" onClick={onSubmit}>Submit your project</button> : null}{W.arrived.length ? <a className="ch2-btn" href={at(jump)}>Vote below</a> : null}<span className="bd-k">Building is on: submit your project before {hhmm(W.x.buildEnd + W.off)}</span></>
    : W.state === 'vote' ? (W.arrived.length ? <><a className="ch2-btn" href={at(jump)}>Vote below</a><span className="bd-k">Entries are closed; votes close at {hhmm(W.x.end + W.off)}</span></> : <span className="bd-k">Entries are closed. No projects came in.</span>)
    : pick ? <span className="ch2-pick">{EVENT.pickers} picked {pick.name}, {ord(pick.place)} here, from the {EVENT.finalists * 10} finalists.</span>
    : <span className="bd-k">{W.ranked.length ? (elsewhere ? 'Voting has closed and the top ' + EVENT.finalists + ' went to the final. ' + EVENT.pickers + ' picked ' + elsewhere.name + ', from ' + elsewhere.city + '.' : 'Voting has closed. The top ' + EVENT.finalists + ' go to the final.') : 'No projects came in.'}</span>;
  return (
    <section className="ch2" aria-labelledby="ch2-h" data-mon={mon ? undefined : 'none'}>
      <div className="ch2-text">
        <p className="bd-k">{CODE[c.id]} · {DATE} · {tz(W.off)}</p>
        <h1 id="ch2-h" className="ch2-h">{c.name}</h1>
        <p className="ch2-facts">{W.state === 'next' ? null : <><span>{fmtN(W.arrived.length)} {W.arrived.length === 1 ? 'entry' : 'entries'}</span><span>{fmtN(W.total)} votes</span></>}<span>Builds {hhmm(W.x.start + W.off)} to {hhmm(W.x.buildEnd + W.off)}, votes to {hhmm(W.x.end + W.off)}</span></p>
        {W.state === 'done' || (W.state === 'vote' && !W.arrived.length) ? null : <LiveSegment clock={clock} first={first} x={hx} withSecs={!!look.segSecs} name={c.name} />}
        <p className="ch2-do">{doing}</p>
      </div>
      {mon || !(W.state === 'build' || W.state === 'vote') || !lead ? <div className="ch2-mon" aria-label={W.state === 'next' ? c.name + '’s test card' : W.state === 'done' ? c.name + '’s closedown card' : 'The leader in ' + c.name}>
        {(W.state === 'build' || W.state === 'vote') && lead ? (
          <>
            <Picture p={lead.p} cls="ch2-pic" />
            <Bug code={CODE[c.id]} place="1st" votes={fmtN(lead.v)} left={left != null ? fmtLeft(left) : ''} corner={look.bugCorner} />
            <span className="ch2-cap"><span className="bd-k">Leading</span> {lead.p.name}</span>
          </>
        ) : <TestCard city={cardCity(hx)} seed={seed} bars={look.cardBars} palette={look.cardPalette} closedown={W.state === 'done'} finalists={hx.top.map((t) => ({ place: t.place, name: t.p.name, votes: t.v }))}
              line={W.state === 'build' ? 'Building · no entries yet' : W.state === 'vote' ? 'No entries came in' : undefined} />}
      </div> : null}
    </section>
  );
}

/* ---------- a vote cell: one press; it fills ---------- */
export function VoteCell({ o, W, vote, name }: { o: Row; W: CityWorld; vote: VoteFn; name: string }) {
  const on = !!o.mine;
  if (!W.voting) return null;
  return (
    <button type="button" className="cr-vote" aria-pressed={on} onClick={() => vote(o.p.id)} aria-label={(on ? 'Voted for ' : 'Vote for ') + name}>
      <i className="cr-fill" aria-hidden="true" /><span>{on ? 'Voted' : 'Vote'}</span>
    </button>
  );
}

/* the votes a row gained in the last ten minutes, from the shared curves */
export function gained(o: Row, W: CityWorld): number { return Math.max(0, votesAtMin(o.r, W.x, W.now) - votesAtMin(o.r, W.x, W.now - 10)); }

/* a spark: the row's votes since it arrived, on the city's shared scale */
function Spark({ o, W, w = 96, h = 20, big }: { o: Row; W: CityWorld; w?: number; h?: number; big?: boolean }) {
  const a = Math.max(W.x.start, o.arrive), b = Math.min(W.now, W.x.end), n = big ? 60 : 24, pts: string[] = [];
  if (b <= a) return <svg className={big ? 'cs-trace' : 'cr-spark'} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" />;
  const X = (m: number) => q(((m - W.x.start) / (W.x.end - W.x.start)) * w), Y = (v: number) => q(h - (v / W.scaleV) * (h - 2) - 1);
  for (let k = 0; k <= n; k++) { const m = a + ((b - a) * k) / n; pts.push(X(m) + ',' + Y(votesAtMin(o.r, W.x, m))); }
  return (
    <svg className={big ? 'cs-trace' : 'cr-spark'} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      {big ? <g className="cs-grat">{[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={w} y1={q(h * f)} y2={q(h * f)} />)}{Array.from({ length: 9 }, (_, k) => <line key={'v' + k} y1={0} y2={h} x1={q((w * k) / 8)} x2={q((w * k) / 8)} />)}<line className="cs-be" y1={0} y2={h} x1={X(W.x.buildEnd)} x2={X(W.x.buildEnd)} /></g> : null}
      <polyline points={pts.join(' ')} vectorEffect="non-scaling-stroke" />
      <circle cx={X(b)} cy={Y(votesAtMin(o.r, W.x, b))} r={big ? 2.5 : 1.8} />
    </svg>
  );
}

/* ---------- the ranking ---------- */
export type RankMode = 'board' | 'scope' | 'rest';
/* The order the rows stand in: the world's order at the board's last tick. A vote of your own changes the counts at
   once and the order at the next tick, so the row you just pressed never jumps out from under your finger. While the
   pointer or focus is in the list, the order waits longer still (counts and vote cells stay live). */
function useTickOrder(W: CityWorld): string {
  const cur = W.ranked.map((o) => o.p.id).join(',');
  const [snap, setSnap] = useState({ now: W.now, n: W.ranked.length, order: cur });
  if (snap.now !== W.now || snap.n !== W.ranked.length) { setSnap({ now: W.now, n: W.ranked.length, order: cur }); return cur; }
  return snap.order;
}
/* rows in a held order, each with the place it stands in, so places, the leader's lamp and the cut move with the rows
   (counts stay live) */
function inOrder(ids: number[], byId: Map<number, Row>): Row[] {
  const out: Row[] = [];
  ids.forEach((id) => { const o = byId.get(id); if (o) out.push(o.rank === out.length + 1 ? o : { ...o, rank: out.length + 1 }); });
  return out;
}
const tallyOf = (o: Row, P: PicCfg) => !P.tally ? undefined : o.mine ? 'you' : undefined;

/* a row's picture: a button for the pointer and touch (the name is the same action for the keyboard) */
function RowPic({ o, P, open }: { o: Row; P: PicCfg; open: (o: Row) => void }) {
  return <span className="cr-pic">{o.rank <= P.picRows ? <button type="button" className="cr-picb" tabIndex={-1} aria-hidden="true" onClick={(e) => { /* the sheet hands focus back to the row's name, which screen readers can reach */ (e.currentTarget.closest('li')?.querySelector('.cr-open') as HTMLElement | null)?.focus(); open(o); }}><Thumb p={o.p} w={P.thumbW} /></button> : null}</span>;
}
/* the label strip under a monitor: place, name, votes */
function Umd({ o, W, look, open, pick }: { o: Row; W: CityWorld; look: CLook; open: (o: Row) => void; pick?: number }) {
  return (
    <span className="rp-umd">
      <span className="rp-pl">{ord(o.rank)}</span>
      <button type="button" className="cr-open rp-nmb" onClick={() => open(o)} title={o.p.name}><span className="cr-nm">{o.p.name}</span></button>
      <span className="rp-v"><Flash value={o.v} mark={look.mark} delta={countDelta}>{fmtN(o.v)}</Flash></span>
      <span className="rp-by bd-k">{pick === o.p.id ? <span className="cr-picked">Picked</span> : null}{W.voting ? '+' + gained(o, W) + ' in 10 min' : 'votes'}{o.j ? ' · ' + o.j + ' from judges' : ''}</span>
    </span>
  );
}
/* a monitor on the multiviewer: the picture, its label strip, the vote cell */
function Tile({ o, W, look, vote, open, pick, P, big }: { o: Row; W: CityWorld; look: CLook; vote: VoteFn; open: (o: Row) => void; pick?: number; P: PicCfg; big?: boolean }) {
  return (
    <li className="rp-tile" data-tally={tallyOf(o, P)} data-big={big ? '' : undefined}>
      <button type="button" className="rp-mon" tabIndex={-1} aria-hidden="true" onClick={() => open(o)}><Thumb p={o.p} w={big ? 480 : 320} /></button>
      <Umd o={o} W={W} look={look} open={open} pick={pick} />
      <VoteCell o={o} W={W} vote={vote} name={o.p.name} />
    </li>
  );
}

/* The order and the view the reader picks: ranked by votes (the board's order, held at the tick), a shuffle (so the
   entries at the bottom get seen too; pressing it again deals again) or the newest first; a search over name, handle
   and pitch; and the view, the list or the votes over time. */
export type RankSort = 'ranked' | 'random' | 'newest';
export type RankView = 'list' | 'time';
const SORTS: [RankSort, string][] = [['ranked', 'Ranked'], ['random', 'Random'], ['newest', 'Newest']];
const VIEWS: [RankView, string][] = [['list', 'List'], ['time', 'Over time']];
const deal = (id: number, seed: number) => { let x = (id * 2654435761 + seed * 40503) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x; };
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The rows, in the order of the last board tick. The cut sits under 3rd. `pics` draws the entries' pictures in one of
   the gallery's ways (rank-pictures.tsx). Switching the view fades the old one out (--dur-slide, a little faster) and
   the new one in; the over-time view draws its lines as it comes in. */
export function Ranking({ W, look, vote, open, mode, spark, from = 0, rows, more, setMore, title, pick, pics, view = 'list', setView, hot = null, setHot }: {
  W: CityWorld; look: CLook; vote: VoteFn; open: (o: Row) => void; mode: RankMode; spark: boolean; from?: number; rows: number; more: boolean; setMore: (b: boolean) => void; title: string; pick?: number; pics?: PicCfg;
  view?: RankView; setView?: (v: RankView) => void; hot?: number | null; setHot?: (id: number | null) => void;
}) {
  const P = pics ?? { ...PIC_DEF, pics: 'none' as const };
  const h = useHold(useTickOrder(W)), ids = h.shown ? h.shown.split(',').map(Number) : [];
  const byId = new Map(W.ranked.map((o) => [o.p.id, o])), ranked = inOrder(ids, byId);
  const [sort, setSort] = useState<RankSort>('ranked'), [seed, setSeed] = useState(1), [query, setQuery] = useState('');
  const [shownView, setShownView] = useState<RankView>(view), [leaving, setLeaving] = useState(false), [switched, setSwitched] = useState(false);
  /* nothing plays on the page's first paint; only a switch the reader makes moves */
  if (view !== shownView && !leaving) { setSwitched(true); if (reduced()) setShownView(view); else setLeaving(true); }
  const ql = query.trim().toLowerCase();
  let list = sort === 'random' ? [...ranked].sort((p, q) => deal(p.p.id, seed) - deal(q.p.id, seed)) : sort === 'newest' ? [...ranked].sort((p, q) => q.arrive - p.arrive) : ranked;
  if (ql) list = list.filter((o) => (o.p.name + ' ' + o.p.handle + ' ' + (o.p.pitch ?? '')).toLowerCase().includes(ql));
  const byVotes = sort === 'ranked' && !ql, shown = list.slice(byVotes ? from : 0, more ? list.length : Math.max(byVotes ? from : 0, rows)), ct = catching(W);
  const [pipId, setPip] = useState<number | null>(null), pipRow = (pipId != null && byId.get(pipId)) || list[0];
  const cutWord = W.state === 'done' ? 'Finalists above the line' : 'The top ' + EVENT.finalists + ' go to the final';
  if (!W.votesOn || !W.ranked.length) return (
    <section className="cr" id="rank" aria-labelledby="cr-h">
      <div className="db-top"><h2 id="cr-h" className="db-h">{title}</h2></div>
      <p className="cr-empty">{W.state === 'next' ? 'Entries arrive from ' + hhmm(W.x.start + W.off) + ' local, and you can vote on each one as it comes in.' : W.state === 'build' ? 'No entries yet. The first ones arrive in the first minutes.' : 'No projects came in.'}</p>
    </section>
  );
  const time = shownView === 'time';
  const what = time ? 'The top ten’s votes since ' + W.city.name + ' opened.'
    : ql ? fmtN(list.length) + ' of ' + fmtN(W.ranked.length) + ' match “' + query.trim() + '”.'
    : sort === 'random' ? fmtN(W.ranked.length) + ' entries, shuffled; press Random again to deal again.'
    : sort === 'newest' ? fmtN(W.ranked.length) + ' entries, newest first.'
    : from ? fmtN(Math.max(0, W.ranked.length - from)) + ' more, from ' + ord(from + 1) + '.' : fmtN(W.ranked.length) + ' entries, by votes.';
  const hint = time || (ql && !list.length) ? '' : W.voting ? 'One vote per entry; press a cell.' : 'Voting has closed.';
  /* the hold hint keeps its place when it is not shown, so the header does not grow under the pointer; a search's count
     is read out on its own, never the ticking totals */
  const note = <span className="bd-k db-note">{what} {hint}{byVotes && !time ? <span className="cr-held" data-on={h.held ? '' : undefined}> Held while you read.</span> : null}<span className="sr-only" aria-live="polite">{ql ? what : ''}</span></span>;
  const tools = (
    <div className="rk-tools">
      <div className="rk-seg" role="group" aria-label="Order" data-off={view === 'time' ? '' : undefined}>{SORTS.map(([k, t]) => <button key={k} type="button" aria-pressed={sort === k} disabled={view === 'time'} onClick={() => { if (k === 'random') setSeed((n) => n + 1); setSort(k); }}>{t}</button>)}</div>
      <label className="rk-search" data-off={view === 'time' ? '' : undefined}><span className="sr-only">Search the entries</span>
        <input type="search" placeholder="Search" value={query} disabled={view === 'time'} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery(''); } }} autoComplete="off" spellCheck={false} />
      </label>
      {setView ? <div className="rk-seg" role="group" aria-label="View">{VIEWS.map(([k, t]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>{t}</button>)}</div> : null}
    </div>
  );
  const moreBtn = !time && list.length > rows && (byVotes ? from : 0) < list.length ? <p className="cr-more"><button type="button" className="ch2-btn cr-mbtn" aria-expanded={more} onClick={(e) => { const b = e.currentTarget; setMore(!more); if (more) requestAnimationFrame(() => b.scrollIntoView({ block: 'nearest' })); }}>{more ? 'Show the first ' + rows : 'Show all ' + fmtN(list.length)}</button></p> : null;
  const vars = { '--rp-w': P.thumbW + 'px', '--rp-cols': P.cols, '--rp-dim': P.dim } as CSSProperties;
  const swap = (body: ReactNode) => (
    <div className="rv" key={shownView} data-phase={leaving ? 'out' : switched ? 'in' : undefined} onAnimationEnd={(e) => { if (e.target !== e.currentTarget || !leaving) return; setLeaving(false); setShownView(view); }}>{body}</div>
  );
  const top = (
    <div className="db-top rk-top"><h2 id="cr-h" className="db-h">{title}</h2>{note}{tools}</div>
  );
  if (!list.length) return (
    <section className="cr" id="rank" aria-labelledby="cr-h" style={vars}>
      {top}
      {swap(<p className="cr-empty">No entry matches “{query.trim()}”. <button type="button" className="rk-clear" onClick={() => setQuery('')}>Clear the search</button></p>)}
    </section>
  );
  if (time) return (
    <section className="cr" id="rank" aria-labelledby="cr-h" data-view="time" style={vars}>
      {top}
      {swap(<RankTime W={W} open={open} hot={hot} setHot={setHot ?? (() => {})} draw={switched} />)}
    </section>
  );

  /* the multiviewer: the finalists' places as three big monitors, the cut, then the rest as a wall of small ones */
  if (P.pics === 'multiview') {
    const fin = byVotes && from < EVENT.finalists ? shown.filter((o) => o.rank <= EVENT.finalists) : [], rest = byVotes ? shown.filter((o) => o.rank > EVENT.finalists) : shown;
    return (
      <section className="cr" id="rank" aria-labelledby="cr-h" data-pics="multiview" style={vars} {...h.props}>
        {top}
        {swap(<>
          {fin.length ? <ol className="rp-wall rp-fin" start={from + 1}>{fin.map((o) => <Tile key={o.p.id} o={o} W={W} look={look} vote={vote} open={open} pick={pick} P={P} big />)}</ol> : null}
          {fin.length && rest.length ? <p className="rp-cut"><span>{cutWord}</span></p> : null}
          {rest.length ? <ol className="rp-wall">{rest.map((o) => <Tile key={o.p.id} o={o} W={W} look={look} vote={vote} open={open} pick={pick} P={P} />)}</ol> : null}
        </>)}
        {moreBtn}
      </section>
    );
  }

  const rowPics = P.pics === 'thumbs' || P.pics === 'pip';
  const listEl = (
    <ol className="cr-list" start={byVotes ? from + 1 : undefined}>
      {shown.map((o) => {
        const cut = byVotes && o.rank === EVENT.finalists && W.ranked.length > EVENT.finalists, isCt = ct && ct.row.p.id === o.p.id;
        const pipProps = P.pics === 'pip' ? { onPointerEnter: (e: ReactPointerEvent) => { if (e.pointerType !== 'touch') setPip(o.p.id); }, onFocus: () => setPip(o.p.id) } : {};
        return (
          <li key={o.p.id} className="cr-row" data-top={o.rank <= EVENT.finalists ? '' : undefined} data-catching={isCt && byVotes ? '' : undefined} data-cut={cut ? cutWord : undefined} data-tally={rowPics ? tallyOf(o, P) : undefined} data-pip={P.pics === 'pip' && pipRow?.p.id === o.p.id ? '' : undefined} {...pipProps}>
            <span className="cr-pl">{ord(o.rank)}</span>
            {rowPics ? <RowPic o={o} P={P} open={open} /> : null}
            <span className="cr-name">
              <button type="button" className="cr-open" onClick={() => open(o)} title={o.p.name}>{mode === 'board' ? <FlapText text={o.p.name} opts={look.flap} className="fp-clip" /> : <span className="cr-nm">{o.p.name}</span>}</button>
              <span className="cr-by bd-k">{pick === o.p.id ? <span className="cr-picked">Picked</span> : null}@{o.p.handle}{o.j ? ' · ' + o.j + ' from judges' : ''}{sort === 'newest' ? ' · in at ' + hhmm(o.arrive + W.off) : ''}{isCt && byVotes ? ' · catching 3rd, ' + (ct!.gap ? ct!.gap + ' behind' : 'level') : ''}</span>
            </span>
            {mode === 'scope' ? <span className="cr-tr"><Spark o={o} W={W} w={480} h={56} big /></span> : spark ? <span className="cr-sp"><Spark o={o} W={W} /></span> : null}
            <span className="cr-v"><Flash value={o.v} mark={look.mark} delta={countDelta}>{fmtN(o.v)}</Flash><span className="cr-g bd-k">{W.voting ? '+' + gained(o, W) + ' in 10 min' : 'votes'}</span></span>
            <VoteCell o={o} W={W} vote={vote} name={o.p.name} />
          </li>
        );
      })}
    </ol>
  );
  /* the contact strip: the leaders as a row of frames over the list */
  const strip = P.pics === 'strip' ? (
    <ol className="rp-strip" aria-label={'Pictures of the first ' + Math.min(P.picRows, shown.length)}>
      {shown.slice(0, P.picRows).map((o) => (
        <li key={o.p.id} className="rp-frame" data-tally={tallyOf(o, P)}>
          <button type="button" className="rp-mon" onClick={() => open(o)} aria-label={'Open ' + o.p.name + ', ' + ord(o.rank)}><Thumb p={o.p} w={P.thumbW} /></button>
          <span className="rp-cap bd-k"><span>{ord(o.rank)}</span> {o.p.name}</span>
        </li>
      ))}
    </ol>
  ) : null;
  return (
    <section className="cr" id="rank" aria-labelledby="cr-h" data-mode={mode} data-pics={P.pics} data-closed={W.voting ? undefined : ''} style={vars} {...h.props}>
      {top}
      {swap(<>
        {strip}
        {P.pics === 'pip' && pipRow ? (
          <div className="rp-pipwrap">
            {listEl}
            <aside className="rp-pip" aria-hidden="true" data-tally={tallyOf(pipRow, P)}>
              <Thumb p={pipRow.p} w={480} />
              <span className="rp-umd rp-pipumd"><span className="rp-pl">{ord(pipRow.rank)}</span><span className="cr-nm">{pipRow.p.name}</span><span className="rp-v">{fmtN(pipRow.v)}</span><span className="rp-by bd-k">{pipRow.p.pitch}</span></span>
            </aside>
          </div>
        ) : listEl}
      </>)}
      {moreBtn}
    </section>
  );
}

/* ---------- the pylon: the top ten, with places gained or lost in ten minutes ---------- */
/* In the over-time view the top ten doubles as the chart's key: each row gets its line's colour, and pointing at a row
   lights its line (and the other way round). */
export function Pylon({ W, W10, hot = null, setHot, swatch = false }: { W: CityWorld; W10: CityWorld; hot?: number | null; setHot?: (id: number | null) => void; swatch?: boolean }) {
  /* the same tick order as the ranking, so a vote of your own moves both on the next tick, together */
  const order = useTickOrder(W), byId = new Map(W.ranked.map((o) => [o.p.id, o]));
  const was = new Map(W10.ranked.map((o) => [o.p.id, o.rank])), top = inOrder(order ? order.split(',').map(Number) : [], byId).slice(0, 10);
  if (!W.votesOn || !top.length) return null;
  return (
    <aside className="cp" aria-label={'The top ten in ' + W.city.name}>
      <p className="bd-k cp-h">Top ten</p>
      <ol className="cp-list" data-closed={W.voting ? undefined : ''}>{top.map((o) => {
        const r0 = was.get(o.p.id), d = r0 == null ? null : r0 - o.rank;
        const mv = d == null ? <span className="cp-mv" data-mv="new">New</span> : d > 0 ? <span className="cp-mv" data-mv="up"><span aria-hidden="true">▲</span>{d}<span className="sr-only"> up</span></span> : d < 0 ? <span className="cp-mv" data-mv="down"><span aria-hidden="true">▼</span>{-d}<span className="sr-only"> down</span></span> : <span className="cp-mv"><span aria-hidden="true">–</span><span className="sr-only">no change</span></span>;
        return <li key={o.p.id} data-top={o.rank <= EVENT.finalists ? '' : undefined} data-dim={swatch && hot != null && hot !== o.p.id ? '' : undefined} onPointerEnter={(e) => { if (swatch && e.pointerType !== 'touch') setHot?.(o.p.id); }} onPointerLeave={() => { if (swatch) setHot?.(null); }}><span className="cp-pl">{swatch ? <i className="cp-sw" style={{ background: lineOf(o.rank) }} aria-hidden="true" /> : null}{o.rank}</span><span className="cp-nm" title={o.p.name}>{o.p.name}</span><Flash value={o.v} mark="flash" className="cp-v">{fmtN(o.v)}</Flash>{W.voting ? mv : null}</li>;
      })}</ol>
    </aside>
  );
}

/* ---------- the wall: the top three as monitors ---------- */
export function TopWall({ W, look, vote, open, pick }: { W: CityWorld; look: CLook; vote: VoteFn; open: (o: Row) => void; pick?: number }) {
  const left = leftOf(W), top = W.ranked.slice(0, 3);
  if (!W.votesOn || !top.length) return null;
  return (
    <section className="cw" id="top" aria-label={W.state === 'done' ? 'The finalists' : 'The top three now'}>
      {top.map((o) => (
        <article key={o.p.id} className="cw-mon" data-place={o.rank}>
          <header className="dw-bar"><span className="cw-pl">{ord(o.rank)}</span><span className="dw-name">{pick === o.p.id ? 'Picked' : W.state === 'done' ? 'Finalist' : 'In the final now'}</span><Flash value={o.v} mark={look.mark} delta={countDelta} className="cw-v">{fmtN(o.v)}</Flash></header>
          <button type="button" className="cw-screen" onClick={() => open(o)} aria-label={'Open ' + o.p.name}>
            <Picture p={o.p} cls="dw-pic" />
            <Bug code={CODE[W.city.id]} place={ord(o.rank)} votes={fmtN(o.v)} left={left != null ? fmtLeft(left) : 'Closed'} corner={look.bugCorner} />
          </button>
          <div className="cw-foot">
            <h3 className="cw-name"><button type="button" className="cr-open" onClick={() => open(o)}><span className="cr-nm">{o.p.name}</span></button></h3>
            <p className="cw-pitch">{o.p.pitch}</p>
            <p className="cw-act" data-off={W.voting ? undefined : ''}><span className="bd-k">@{o.p.handle}{o.j ? ' · ' + o.j + ' from judges' : ''}</span><VoteCell o={o} W={W} vote={vote} name={o.p.name} /></p>
          </div>
        </article>
      ))}
    </section>
  );
}

/* ---------- the project sheet: the boarding pass and the bug, over the page ---------- */
export function ProjectSheet({ o, W, look, vote, close }: { o: Row | null; W: CityWorld; look: CLook; vote: VoteFn; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), [copied, setCopied] = useState<number | null>(null);
  /* the sheet keeps its last project while it slides out (--dur-panel-exit, which is 0 under reduced motion) */
  const [kept, setKept] = useState(o); if (o && o !== kept) setKept(o);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (o && !d.open) { delete d.dataset.closing; d.showModal(); }
    if (!o && d.open && d.dataset.closing == null) {
      d.dataset.closing = '';
      let t = 0; const done = () => { window.clearTimeout(t); if (d.dataset.closing == null) return; delete d.dataset.closing; d.close(); };
      d.addEventListener('animationend', done, { once: true }); t = window.setTimeout(done, 600);
    }
  }, [o]);
  const shownO = o ?? kept, left = leftOf(W), live = shownO ? W.ranked.find((r) => r.p.id === shownO.p.id) ?? shownO : null;
  const host = useSyncExternalStore(noSub, () => location.host, () => ''), link = live ? host + projectPath(W.city.id, slugOf(live.p)) : '';
  return (
    <dialog ref={ref} className="ps bd" onClose={close} onCancel={(e) => { e.preventDefault(); close(); }} aria-labelledby="ps-h">
      {live ? (
        <div className="ps-in">
          <div className="ps-top"><span className="bd-k">{CODE[W.city.id]} · {W.city.name}</span><button type="button" className="ps-x" onClick={close} aria-label="Close">Close</button></div>
          <h2 id="ps-h" className="sr-only">{live.p.name}</h2>
          <div className="ps-pic"><Picture p={live.p} cls="dw-pic" /><Bug code={CODE[W.city.id]} place={ord(live.rank)} votes={fmtN(live.v)} left={left != null ? fmtLeft(left) : 'Closed'} corner={look.bugCorner} /></div>
          <p className="ps-act">
            {W.voting ? <VoteCell o={live} W={W} vote={vote} name={live.p.name} /> : null}
            <button type="button" className="ch2-btn ps-copy" onClick={() => { navigator.clipboard?.writeText(location.protocol + '//' + link).then(() => setCopied(live.p.id), () => setCopied(null)); }}>{copied === live.p.id ? 'Link copied' : 'Copy the link'}</button>
          </p>
          <BoardingPass d={{ project: live.p.name, pitch: live.p.pitch, city: W.city.name, code: CODE[W.city.id], builder: '@' + live.p.handle, entered: hhmm(live.arrive + W.off) + ' ' + tz(W.off), place: ord(live.rank), votes: fmtN(live.v), link, date: DATE }} />
        </div>
      ) : null}
    </dialog>
  );
}

export function Two({ main, side }: { main: ReactNode; side: ReactNode }) {
  return <div className="c2">{main}{side ? <div className="c2-side">{side}</div> : null}</div>;
}
